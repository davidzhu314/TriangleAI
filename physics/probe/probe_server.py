"""D1 probe server: CathSim behind the spec §5.2 WebSocket protocol, localhost only.

A spike, not the D5 server. Serves probe/index.html at / and the protocol at /wire.
    MUJOCO_GL=disable .venv/bin/python probe/probe_server.py --integrator euler
The sim is paced to real time (one 0.012 s control step per 0.012 s of wall time) and state is sent
at about 30 Hz. `t` is simulation time. Positions go through ras_mm_to_yup_m, treating CathSim's
world frame (metres) as RAS until D3a registers each phantom to its case package.
"""
import argparse
import asyncio
import json
import pathlib
import sys
import time

import numpy as np
import websockets

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from wire_protocol import STATE_HZ, WS_PATH, ProtocolError, parse_client_message, ras_mm_to_yup_m  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
HOST = "127.0.0.1"


class Sim:
    def __init__(self, integrator):
        self.integrator = integrator
        self.env = None
        self.push = 0.0
        self.rotate = 0.0
        self.t = 0.0
        self.control_rx = []  # (perf_counter at receipt, applied_at_step_perf)
        self.apply_to_send_ms = []
        self._pending_apply = None

    def start(self, phantom, target):
        from cathsim.dm import make_dm_env
        import mujoco
        self.env = make_dm_env(phantom=phantom, use_pixels=False, use_segment=False, target=target)
        self.env.reset()
        p = self.env.physics
        if self.integrator == "euler":
            p.model.opt.integrator = mujoco.mjtIntegrator.mjINT_EULER
        names = [p.model.body(i).name for i in range(p.model.nbody)]
        self.ids = [i for i, n in enumerate(names) if n.startswith("guidewire/guidewire_body_")]
        self.t = 0.0
        self.dt = self.env.control_timestep()

    def step(self):
        ts = self.env.step(np.array([self.push, self.rotate]))
        self.t += self.dt
        return ts

    def state(self):
        p = self.env.physics
        to = lambda v: ras_mm_to_yup_m([c * 1000.0 for c in v])
        wire = [to(v) for v in p.data.xpos[self.ids]]
        force = 0.0
        for i in range(p.data.ncon):
            if p.data.contact[i].dist < 0.002:
                force += abs(float(p.data.contact_force(i)[0][0]))
        return {
            "type": "state",
            "t": round(self.t, 6),
            "wire": wire,
            "tip": to(self.env.task.get_head_pos(p)),
            "contact_force_n": force,
            "at_target": bool(self.env.task.success),
        }


async def handler(ws, sim):
    if ws.path != WS_PATH:
        await ws.close(code=1008, reason="path")
        return
    running = False
    last_send = 0.0
    wall0 = 0.0
    steps = 0
    queue = asyncio.Queue()

    async def reader():
        async for raw in ws:
            await queue.put((time.perf_counter(), raw))

    rtask = asyncio.ensure_future(reader())
    try:
        while not rtask.done():
            while not queue.empty():
                rx, raw = queue.get_nowait()
                try:
                    msg = parse_client_message(json.loads(raw))
                except (ProtocolError, ValueError):
                    continue
                if msg["type"] == "start":
                    sim.start(msg["phantom"], msg["target"])
                    running, wall0, steps = True, time.perf_counter(), 0
                elif msg["type"] == "control":
                    sim.push, sim.rotate = msg["push"], msg["rotate"]
                    sim._pending_apply = rx
                elif msg["type"] == "stop":
                    running = False
            if running:
                due = int((time.perf_counter() - wall0) / sim.dt)
                if due - steps > 10:  # too slow for real time: drop the backlog instead of spiralling
                    wall0 += (due - steps) * sim.dt
                    due = steps + 1
                while steps < due:
                    sim.step()
                    steps += 1
                now = time.perf_counter()
                if now - last_send >= 1.0 / STATE_HZ:
                    await ws.send(json.dumps(sim.state()))
                    if sim._pending_apply is not None:
                        sim.apply_to_send_ms.append((time.perf_counter() - sim._pending_apply) * 1000.0)
                        sim._pending_apply = None
                    last_send = now
            await asyncio.sleep(0.001)
    except websockets.ConnectionClosed:
        pass
    finally:
        rtask.cancel()


def process_request(path, headers):
    if path.split("?", 1)[0] in ("/", "/index.html"):
        body = (HERE / "index.html").read_bytes()
        return 200, [("Content-Type", "text/html; charset=utf-8")], body
    return None


async def main(args):
    import cathsim.dm  # noqa: F401  slow first import (~20 s); do it before listening

    sim = Sim(args.integrator)
    async with websockets.serve(lambda ws: handler(ws, sim), HOST, args.port, process_request=process_request, max_size=None):
        print(json.dumps({"listening": f"http://{HOST}:{args.port}/", "integrator": args.integrator}), flush=True)
        stop = asyncio.get_event_loop().create_future()
        if args.seconds:
            asyncio.get_event_loop().call_later(args.seconds, stop.set_result, None)
        await stop
    a = sorted(sim.apply_to_send_ms)
    if a:
        print(json.dumps({"server_control_to_state_ms": {"n": len(a), "p50": round(a[len(a) // 2], 2), "p95": round(a[int(len(a) * 0.95)], 2), "max": round(a[-1], 2)}}), flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--integrator", choices=["stock", "euler"], default="euler")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--seconds", type=float, default=0, help="exit after this long (0 = run until killed)")
    asyncio.run(main(ap.parse_args()))
