"""WebSocket message shapes for /wire, mirroring client/src/contracts/physics-protocol.ts (spec 5.2).

D0a stub: message validation only. The server itself lands in D5. Python 3.9 compatible.
CathSim is never imported here; the server wraps it in its own module.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Sequence

WS_PATH = "/wire"
STATE_HZ = 30
WIRE_POINTS = 80
PHANTOMS = ("low_tort", "phantom2", "phantom3", "phantom4")
TARGETS = ("bca", "lcca")


class ProtocolError(ValueError):
    """A client message does not match spec 5.2."""


def _finite(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def clamp_control(x: float) -> float:
    if not _finite(x):
        return 0.0
    return max(-1.0, min(1.0, float(x)))


def parse_client_message(msg: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a decoded client message; return it normalised (controls clamped)."""
    kind = msg.get("type")
    if kind == "start":
        if msg.get("phantom") not in PHANTOMS:
            raise ProtocolError("unknown phantom")
        if msg.get("target") not in TARGETS:
            raise ProtocolError("unknown target")
        if not isinstance(msg.get("preset"), str) or not msg["preset"]:
            raise ProtocolError("preset must be a non-empty string")
        return {"type": "start", "phantom": msg["phantom"], "target": msg["target"], "preset": msg["preset"]}
    if kind == "control":
        return {"type": "control", "push": clamp_control(msg.get("push")), "rotate": clamp_control(msg.get("rotate"))}
    if kind == "stop":
        return {"type": "stop"}
    raise ProtocolError("unknown message type")


def ras_mm_to_yup_m(p: Sequence[float]) -> List[float]:
    """Same map as rasMmToYupM in client/src/contracts/case.ts: (x, y, z)_RAS mm -> (-x, z, y) / 1000.

    The server applies it to every position before sending, so the wire overlays the loaded mesh.
    """
    x, y, z = (float(c) for c in p)
    return [-x / 1000.0, z / 1000.0, y / 1000.0]


def cathsim_m_to_ras_mm(p: Sequence[float]) -> List[float]:
    """CathSim world metres -> case-package RAS millimetres: (x, y, z) -> (-x, z, y) * 1000 (D3a).

    CathSim's phantoms are +y superior, +x patient left and +z anterior, so this is a proper rotation.
    The phantom packages in physics/cases/ are written in this frame. D5 sends wire positions as
    ras_mm_to_yup_m(cathsim_m_to_ras_mm(p)), which equals p: CathSim's world is already the client's
    Y-up frame.
    """
    x, y, z = (float(c) for c in p)
    return [-x * 1000.0, z * 1000.0, y * 1000.0]


def make_state(
    t: float,
    wire: Sequence[Sequence[float]],
    contact_force_n: float,
    at_target: bool,
) -> Dict[str, Any]:
    """Build a state message. `t` is simulation time in seconds; the tip is the last wire point."""
    points: List[List[float]] = [[float(c) for c in p] for p in wire]
    if not points or any(len(p) != 3 for p in points):
        raise ProtocolError("wire must be a non-empty list of 3D points")
    return {
        "type": "state",
        "t": float(t),
        "wire": points,
        "tip": list(points[-1]),
        "contact_force_n": float(contact_force_n),
        "at_target": bool(at_target),
    }
