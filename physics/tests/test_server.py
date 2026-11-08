"""D5 server: protocol messages, pacing in simulation time, force averaging, case serving and the
unavailable path. CathSim is never imported: a fake backend stands in for the simulator, so these
run in CI (python:3.9-slim) and with no physics process running."""
import asyncio
import json
import socket
import urllib.request

import pytest
import websockets

from server.app import CLOSE_UNAVAILABLE, case_index, http_route, serve
from server.session import Session
from wire_protocol import PHANTOMS, STATE_HZ, WIRE_POINTS, ProtocolError, parse_client_message

START = {"type": "start", "phantom": "phantom3", "target": "bca", "preset": "standard_j"}


class FakeBackend:
    """A straight 80-point wire that advances 1 mm per unit push per step. Force is scripted per step."""

    control_dt = 0.012

    def __init__(self, forces=None):
        self.forces = list(forces or [])
        self.started = None
        self.s = 0.0
        self.steps = []
        self.force = 0.0

    def start(self, phantom, target, preset):
        self.started = (phantom, target, preset)

    def step(self, push, rotate):
        self.steps.append((push, rotate))
        self.s += 0.001 * push
        self.force = self.forces.pop(0) if self.forces else 0.0

    def wire(self):
        return [[0.0, self.s + i * 0.001, 0.0] for i in range(WIRE_POINTS)]

    def tip(self):
        return [0.0, self.s + WIRE_POINTS * 0.001 + 0.002, 0.0]

    def contact_force_n(self):
        return self.force

    def at_target(self):
        return self.s > 0.01


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ---------------------------------------------------------------- session


def test_start_returns_a_spec_state_at_t0():
    b = FakeBackend()
    st = Session(b).start(parse_client_message(dict(START)))
    assert b.started == ("phantom3", "bca", "standard_j")
    assert set(st) == {"type", "t", "wire", "tip", "contact_force_n", "at_target"}
    assert st["type"] == "state" and st["t"] == 0.0 and len(st["wire"]) == WIRE_POINTS
    assert st["tip"] == b.tip()  # the head, not the last wire body
    json.dumps(st)


def test_unknown_preset_is_rejected():
    with pytest.raises(ProtocolError):
        Session(FakeBackend()).start({**START, "preset": "floppy"})


def test_frames_advance_simulation_time_in_whole_control_steps():
    b = FakeBackend()
    s = Session(b)
    s.start(dict(START))
    ts = [s.frame()["t"] for _ in range(STATE_HZ)]
    # Every frame lands on the first control step at or past k/30 s; one second is 84 steps (1.008 s).
    assert all(b > a for a, b in zip(ts, ts[1:]))
    for k, t in enumerate(ts, 1):
        assert k / STATE_HZ - 1e-9 <= t < k / STATE_HZ + 0.012
    assert len(b.steps) == 84 and ts[-1] == pytest.approx(84 * 0.012)


def test_frame_force_is_the_mean_of_its_steps_not_a_single_step_spike():
    b = FakeBackend(forces=[1.0, 1.0, 3001.0])  # frame 1 is three 0.012 s steps
    s = Session(b)
    s.start(dict(START))
    assert s.frame()["contact_force_n"] == pytest.approx(1001.0)


def test_controls_are_applied_and_stop_halts_stepping():
    b = FakeBackend()
    s = Session(b)
    s.start(dict(START))
    s.control(parse_client_message({"type": "control", "push": 5, "rotate": -0.25}))
    s.frame()
    assert b.steps[-1] == (1.0, -0.25)
    s.stop()
    n = len(b.steps)
    assert s.frame() is None and len(b.steps) == n


# ---------------------------------------------------------------- HTTP


def test_case_index_shape_matches_the_bundled_index():
    idx = case_index(True)
    assert idx == {"cases": [{"id": p, "path": p + "/"} for p in PHANTOMS]}
    assert case_index(False) == {"cases": []}  # phantoms are listed only when CathSim can run


def test_package_files_are_served_with_their_license():
    for f in ("case.json", "centerlines.json", "vessels.glb", "LICENSE.md"):
        status, headers, body = http_route(f"/cases/phantom3/{f}", True)
        assert status == 200 and body
        assert ("Access-Control-Allow-Origin", "*") in headers
    assert b"CC BY-NC-SA 4.0" in http_route("/cases/phantom3/LICENSE.md", True)[2]


def test_nothing_else_under_physics_is_reachable():
    for p in ("/cases/phantom3/../../wire_protocol.py", "/cases/phantom9/case.json", "/wire_protocol.py", "/cases/phantom3/convert_phantoms.py"):
        assert http_route(p, True)[0] == 404
    assert http_route("/wire", True) is None  # WebSocket upgrade


def test_no_recorded_runs_means_404_not_a_stand_in(tmp_path):
    assert http_route("/recorded-runs.json", True, recorded_runs=tmp_path / "recorded-runs.json")[0] == 404


# ---------------------------------------------------------------- over a real socket


async def _drive(port, msgs, n_states):
    async with websockets.connect(f"ws://127.0.0.1:{port}/wire") as ws:
        out = []
        await ws.send(json.dumps(msgs[0]))
        out.append(json.loads(await ws.recv()))
        for m in msgs[1:]:
            await ws.send(json.dumps(m))
        while len(out) < n_states:
            out.append(json.loads(await ws.recv()))
        return out


def test_wire_socket_streams_states_at_about_30hz_in_simulation_time():
    async def go():
        port = free_port()
        server = await serve(port, backend_factory=FakeBackend)
        try:
            return await _drive(port, [START, {"type": "control", "push": 1, "rotate": 0}], 10)
        finally:
            server.close()
            await server.wait_closed()

    states = asyncio.run(go())
    assert [s["type"] for s in states] == ["state"] * 10
    ts = [s["t"] for s in states]
    assert ts[0] == 0.0 and all(b > a for a, b in zip(ts, ts[1:]))
    assert ts[-1] == pytest.approx(9 / STATE_HZ, abs=0.012)
    assert states[-1]["wire"][0][1] > 0  # the push reached the sim


def test_http_and_socket_share_the_port():
    async def go():
        port = free_port()
        server = await serve(port, backend_factory=FakeBackend)
        try:
            loop = asyncio.get_running_loop()
            body = await loop.run_in_executor(None, lambda: urllib.request.urlopen(f"http://127.0.0.1:{port}/cases/index.json", timeout=5).read())
            return json.loads(body)
        finally:
            server.close()
            await server.wait_closed()

    assert [c["id"] for c in asyncio.run(go())["cases"]] == list(PHANTOMS)


# ---------------------------------------------------------------- fallback


def test_without_cathsim_start_closes_with_server_unavailable_and_no_cases_are_listed():
    async def go():
        port = free_port()
        server = await serve(port, backend_factory=None)
        try:
            async with websockets.connect(f"ws://127.0.0.1:{port}/wire") as ws:
                await ws.send(json.dumps(START))
                with pytest.raises(websockets.ConnectionClosed) as e:
                    await ws.recv()
                return e.value.rcvd.code, e.value.rcvd.reason
        finally:
            server.close()
            await server.wait_closed()

    assert asyncio.run(go()) == (CLOSE_UNAVAILABLE, "server_unavailable")
    assert http_route("/cases/index.json", False)[2] == b'{"cases": []}'


def test_with_no_physics_server_running_the_connection_is_refused():
    """What the client sees when the process is not running at all: it falls back (socket_failed)."""
    port = free_port()  # nothing listens here

    async def go():
        async with websockets.connect(f"ws://127.0.0.1:{port}/wire", open_timeout=2):
            pass

    with pytest.raises(OSError):
        asyncio.run(go())
