"""WebSocket `/wire` (spec §5.2) and HTTP case serving on one localhost port.

HTTP (GET only, CORS open so the Vite app on another localhost port can read it):
- `/cases/index.json` -> `{"cases": [{"id", "path"}]}`, `path` relative to the list, the same shape as
  client/public/cases/index.json. Lists the four phantoms only when CathSim is available.
- `/cases/<id>/{case.json, centerlines.json, vessels.glb, LICENSE.md}` from physics/cases/<id>/.
- `/recorded-runs.json` and the replay files it names, only if physics/recorded-runs.json exists.
  D4 recorded nothing (DECISIONS.md), so today both are 404 and replay fails honestly.

WebSocket `/wire`: `start` builds a CathSim drive, `control` sets push and rotate, `stop` ends it.
State is sent about every 1/30 s of wall time, each frame advancing 1/30 s of simulation time. If
CathSim is unavailable, `start` closes the socket with code 1013 and reason "server_unavailable".
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import websockets

from server.session import Backend, Session
from wire_protocol import PHANTOMS, STATE_HZ, WS_PATH, ProtocolError, parse_client_message

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
PHYSICS = pathlib.Path(__file__).resolve().parents[1]
CASES = PHYSICS / "cases"
RECORDED_RUNS = PHYSICS / "recorded-runs.json"
PACKAGE_FILES = {
    "case.json": "application/json",
    "centerlines.json": "application/json",
    "vessels.glb": "model/gltf-binary",
    "LICENSE.md": "text/markdown; charset=utf-8",
}
CLOSE_UNAVAILABLE = 1013  # "Try Again Later": the client falls back with reason server_unavailable

Response = Tuple[int, List[Tuple[str, str]], bytes]


def _respond(status: int, body: bytes, content_type: str) -> Response:
    headers = [
        ("Content-Type", content_type),
        ("Access-Control-Allow-Origin", "*"),
        ("Cache-Control", "no-store"),
    ]
    return status, headers, body


def _not_found() -> Response:
    return _respond(404, b"not found\n", "text/plain; charset=utf-8")


def case_index(sim_available: bool, cases_dir: pathlib.Path = CASES) -> Dict[str, Any]:
    if not sim_available:
        return {"cases": []}
    return {"cases": [{"id": p, "path": p + "/"} for p in PHANTOMS if (cases_dir / p / "case.json").is_file()]}


def http_route(
    path: str,
    sim_available: bool,
    cases_dir: pathlib.Path = CASES,
    recorded_runs: pathlib.Path = RECORDED_RUNS,
) -> Optional[Response]:
    """The HTTP response for a GET path, or None to let `/wire` upgrade to a WebSocket."""
    path = path.split("?", 1)[0]
    if path == WS_PATH:
        return None
    if path == "/cases/index.json":
        return _respond(200, json.dumps(case_index(sim_available, cases_dir)).encode(), "application/json")
    parts = path.strip("/").split("/")
    if len(parts) == 3 and parts[0] == "cases" and parts[1] in PHANTOMS and parts[2] in PACKAGE_FILES:
        f = cases_dir / parts[1] / parts[2]
        return _respond(200, f.read_bytes(), PACKAGE_FILES[parts[2]]) if f.is_file() else _not_found()
    if not recorded_runs.is_file():
        return _not_found()
    if path == "/recorded-runs.json":
        return _respond(200, recorded_runs.read_bytes(), "application/json")
    # Only replay files that recorded-runs.json names, so nothing else under physics/ is reachable.
    named = {r.get("file") for r in json.loads(recorded_runs.read_text()).get("replays", [])}
    rel = path.lstrip("/")
    if rel in named:
        f = recorded_runs.parent / rel
        if f.is_file():
            return _respond(200, f.read_bytes(), "application/json")
    return _not_found()


async def wire_handler(ws, backend_factory: Optional[Callable[[], Backend]], stats: Dict[str, list]) -> None:
    session: Optional[Session] = None
    pending_control: Optional[float] = None
    period = 1.0 / STATE_HZ
    next_send = time.perf_counter()

    async def send(state: Dict[str, Any]) -> None:
        nonlocal pending_control
        await ws.send(json.dumps(state))
        if pending_control is not None:
            stats["control_to_state_ms"].append((time.perf_counter() - pending_control) * 1000.0)
            pending_control = None

    try:
        while True:
            running = session is not None and session.running
            timeout = max(0.0, next_send - time.perf_counter()) if running else None
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout)
            except asyncio.TimeoutError:
                raw = None
            if raw is not None:
                try:
                    msg = parse_client_message(json.loads(raw))
                except (ProtocolError, ValueError):
                    continue  # malformed frames are ignored, as in the D1 probe
                if msg["type"] == "start":
                    if backend_factory is None:
                        await ws.close(code=CLOSE_UNAVAILABLE, reason="server_unavailable")
                        return
                    session = Session(backend_factory())
                    try:
                        first = session.start(msg)
                    except ProtocolError as e:
                        await ws.close(code=1008, reason=str(e))
                        return
                    await send(first)
                    next_send = time.perf_counter() + period
                elif msg["type"] == "control" and session is not None:
                    session.control(msg)
                    pending_control = time.perf_counter()
                elif msg["type"] == "stop" and session is not None:
                    session.stop()
                continue
            if session is not None and session.running:
                t0 = time.perf_counter()
                state = session.frame()
                stats["frame_compute_ms"].append((time.perf_counter() - t0) * 1000.0)
                if state is not None:
                    await send(state)
                # Paced to wall time; when the sim is slower than real time, frames just come later
                # (simulation time stays exact) instead of piling up.
                next_send = max(next_send + period, time.perf_counter())
    except websockets.ConnectionClosed:
        pass


async def serve(
    port: int = DEFAULT_PORT,
    backend_factory: Optional[Callable[[], Backend]] = None,
    cases_dir: pathlib.Path = CASES,
    recorded_runs: pathlib.Path = RECORDED_RUNS,
):
    """Start listening on 127.0.0.1 and return the websockets server (close it to stop)."""
    stats: Dict[str, list] = {"control_to_state_ms": [], "frame_compute_ms": []}
    sim_available = backend_factory is not None

    async def process_request(path, _headers):
        return http_route(path, sim_available, cases_dir, recorded_runs)

    server = await websockets.serve(
        lambda ws: wire_handler(ws, backend_factory, stats),
        HOST,
        port,
        process_request=process_request,
        max_size=2**20,
    )
    server.stats = stats  # type: ignore[attr-defined]
    return server
