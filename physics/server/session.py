"""One physics drive, independent of CathSim so CI can test it with a fake backend.

Each frame advances simulation time to the next multiple of 1/STATE_HZ by whole control steps
(0.012 s each for CathSim), so `t` is the sum of steps, never wall-clock. The frame's
`contact_force_n` is the mean of the per-step forces inside the frame: CathSim's 4 mm contact
margin produces single-step spikes in the kN range, and the client must not see raw steps.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol, Sequence

from wire_protocol import STATE_HZ, ProtocolError, make_state

PRESETS = ("soft_angled", "standard_j", "stiff_straight")


class Backend(Protocol):
    """What a session needs from a simulator. Positions are CathSim world metres, sent unchanged."""

    control_dt: float

    def start(self, phantom: str, target: str, preset: str) -> None: ...

    def step(self, push: float, rotate: float) -> None:
        """One control step. `push` and `rotate` are the player's −1..1 values."""

    def wire(self) -> List[Sequence[float]]: ...

    def tip(self) -> Sequence[float]: ...

    def contact_force_n(self) -> float: ...

    def at_target(self) -> bool: ...


class Session:
    def __init__(self, backend: Backend) -> None:
        self.backend = backend
        self.running = False
        self.push = 0.0
        self.rotate = 0.0
        self.t = 0.0
        self.frames = 0

    def start(self, msg: Dict[str, Any]) -> Dict[str, Any]:
        if msg["preset"] not in PRESETS:
            raise ProtocolError("unknown preset")
        self.backend.start(msg["phantom"], msg["target"], msg["preset"])
        self.running = True
        self.push = self.rotate = 0.0
        self.t = 0.0
        self.frames = 0
        return self._state(self.backend.contact_force_n())

    def control(self, msg: Dict[str, Any]) -> None:
        self.push, self.rotate = msg["push"], msg["rotate"]

    def stop(self) -> None:
        self.running = False

    def frame(self) -> Optional[Dict[str, Any]]:
        """Advance one 1/STATE_HZ frame of simulation time and return its state (None when stopped)."""
        if not self.running:
            return None
        self.frames += 1
        until = self.frames / STATE_HZ
        dt = self.backend.control_dt
        forces = []
        # Whole control steps until t reaches the frame time (small tolerance for float sums).
        while self.t + 1e-9 < until:
            self.backend.step(self.push, self.rotate)
            self.t += dt
            forces.append(self.backend.contact_force_n())
        return self._state(sum(forces) / len(forces) if forces else self.backend.contact_force_n())

    def _state(self, force: float) -> Dict[str, Any]:
        b = self.backend
        return make_state(round(self.t, 6), b.wire(), force, b.at_target(), tip=b.tip())
