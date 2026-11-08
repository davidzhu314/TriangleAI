"""Latency of the running D5 server, measured from a client (spec §5.7: frame-to-frame under 100 ms).

    MUJOCO_GL=disable .venv/bin/python -m server &          # from physics/
    .venv/bin/python -m server.measure_latency --phantom phantom3 --target lcca --seconds 30

Sends a gentle push (with a slow back-and-forth rotation) at 30 Hz and prints one JSON line:
frame-to-frame arrival intervals, control-to-next-state time, simulated seconds per wall second, and
the per-frame contact force the server sent. It reports what happened; it is not a recorded run.
"""
import argparse
import asyncio
import json
import math
import time

import websockets


def pct(v, q):
    v = sorted(v)
    return round(v[min(len(v) - 1, int(len(v) * q))], 2) if v else None


async def main(a):
    async with websockets.connect(f"ws://127.0.0.1:{a.port}/wire", max_size=None) as ws:
        t_start = time.perf_counter()
        await ws.send(json.dumps({"type": "start", "phantom": a.phantom, "target": a.target, "preset": a.preset}))
        first = json.loads(await ws.recv())
        start_ms = (time.perf_counter() - t_start) * 1000.0
        arrivals, ctrl_ms, forces, states = [], [], [], [first]
        pending = None
        wall0 = time.perf_counter()
        next_ctrl = wall0
        while time.perf_counter() - wall0 < a.seconds:
            now = time.perf_counter()
            if now >= next_ctrl:
                el = now - wall0
                await ws.send(json.dumps({"type": "control", "push": a.push, "rotate": 0.3 * math.sin(el)}))
                if pending is None:
                    pending = now
                next_ctrl += 1.0 / 30
            try:
                raw = await asyncio.wait_for(ws.recv(), max(0.001, next_ctrl - time.perf_counter()))
            except asyncio.TimeoutError:
                continue
            got = time.perf_counter()
            arrivals.append(got)
            if pending is not None:
                ctrl_ms.append((got - pending) * 1000.0)
                pending = None
            s = json.loads(raw)
            states.append(s)
            forces.append(s["contact_force_n"])
        await ws.send(json.dumps({"type": "stop"}))
        wall = time.perf_counter() - wall0
    gaps = [(b - a_) * 1000.0 for a_, b in zip(arrivals, arrivals[1:])]
    tip0, tip1 = first["tip"], states[-1]["tip"]
    print(json.dumps({
        "phantom": a.phantom, "target": a.target, "preset": a.preset, "push": a.push,
        "wall_s": round(wall, 2), "frames": len(arrivals),
        "start_to_first_state_ms": round(start_ms, 1),
        "frame_to_frame_ms": {"p50": pct(gaps, 0.5), "p95": pct(gaps, 0.95), "max": pct(gaps, 1.0)},
        "control_to_next_state_ms": {"p50": pct(ctrl_ms, 0.5), "p95": pct(ctrl_ms, 0.95), "max": pct(ctrl_ms, 1.0)},
        "sim_s_per_wall_s": round(states[-1]["t"] / wall, 3),
        "contact_force_n": {"p50": pct(forces, 0.5), "p95": pct(forces, 0.95), "max": pct(forces, 1.0)},
        "tip_moved_mm": round(1000 * math.dist(tip0, tip1), 1),
        "wire_points": len(first["wire"]),
        "at_target": states[-1]["at_target"],
    }))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--phantom", default="phantom3")
    ap.add_argument("--target", default="lcca")
    ap.add_argument("--preset", default="standard_j")
    ap.add_argument("--push", type=float, default=0.5)
    ap.add_argument("--seconds", type=float, default=30)
    asyncio.run(main(ap.parse_args()))
