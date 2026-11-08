"""The CathSim wire for the D5 server. The only server module that imports CathSim or MuJoCo.

Setup as in D1 (DECISIONS.md): MUJOCO_GL=disable, MuJoCo's Euler integrator, CathSim at adfabb2,
0.004 s timestep x 3 substeps = 0.012 s per control step. Positions are CathSim world metres, sent
unchanged: CathSim's world is the client's Y-up frame (D3a), so no conversion is applied.
"""
from __future__ import annotations

import math
from typing import List, Sequence

import numpy as np

# ThreadSim presets (spec §4.3, illustrative) on CathSim's wire (DECISIONS.md, D5). CathSim's tip is
# 4 bodies whose spring rest angles make a nominal 60° curve; a preset scales that rest shape by
# tip_deg / 60. Body stiffness scales CathSim's guidewire joint stiffness (20 at the base).
PRESETS = {
    "soft_angled": {"tip_deg": 45.0, "stiffness_scale": 0.5},
    "standard_j": {"tip_deg": 60.0, "stiffness_scale": 1.0},
    "stiff_straight": {"tip_deg": 0.0, "stiffness_scale": 2.0},
}
CATHSIM_TIP_DEG = 60.0
TIP_BODIES = 4
WIRE_BODIES = 80

# Player controls (−1..1) to CathSim's velocity actuators, measured on phantom3 with Euler: slider
# command 0.03 moves the wire about 2.1 cm/s (rail's full speed is 2 cm/s); rotator command 0.05
# turns it about 1 rad/s. Faster spin whips the tip into the wall and gives kN contact spikes (D4).
PUSH_FULL_CMD = 0.03
ROTATE_FULL_CMD = 0.05

SEED = 0


def contact_force_n(physics) -> float:
    """Total wall contact force on the wire, newtons: the sum of MuJoCo's normal contact force
    (mj_contactForce) over every contact between a wire geom and a non-wire geom. Phantom geoms are
    named `<phantom>//unnamed_geom_N`. CathSim's 4 mm contact margin keeps contacts active out to
    4 mm, so no distance filter (the D1 probe's `dist < 2 mm` read 0 N at about 1.5 N)."""
    import mujoco

    m, d = physics.model, physics.data
    f = np.zeros(6)
    total = 0.0
    for i in range(d.ncon):
        c = d.contact[i]
        w1 = m.geom(c.geom1).name.startswith("guidewire/")
        w2 = m.geom(c.geom2).name.startswith("guidewire/")
        if w1 != w2:
            mujoco.mj_contactForce(m.ptr, d.ptr, i, f)
            total += abs(float(f[0]))
    return total


class CathSimBackend:
    def __init__(self) -> None:
        import cathsim.dm  # noqa: F401  slow first import (about 20 s); done before listening

        self.env = None
        self.control_dt = 0.012

    def start(self, phantom: str, target: str, preset: str) -> None:
        import mujoco
        from cathsim.dm.components import Guidewire, Phantom, Tip
        from cathsim.dm.env import Navigate
        from dm_control import composer

        cfg = PRESETS[preset]
        tip = Tip(n_bodies=TIP_BODIES)
        tip.mjcf_model.default.joint.springref = math.radians(CATHSIM_TIP_DEG) / TIP_BODIES * (cfg["tip_deg"] / CATHSIM_TIP_DEG)
        wire = Guidewire(n_bodies=WIRE_BODIES)
        for j in wire.mjcf_model.find_all("joint"):
            if j.name and j.name.startswith("guidewire_J") and j.stiffness is not None:
                j.stiffness = float(j.stiffness) * cfg["stiffness_scale"]
        task = Navigate(
            phantom=Phantom(phantom + ".xml"), guidewire=wire, tip=tip, target=target, use_pixels=False, use_segment=False
        )
        env = composer.Environment(task=task, random_state=np.random.RandomState(SEED), strip_singleton_obs_buffer_dim=True)
        env.reset()
        p = env.physics
        p.model.opt.integrator = mujoco.mjtIntegrator.mjINT_EULER
        names = [p.model.body(i).name for i in range(p.model.nbody)]
        self.ids = [i for i, n in enumerate(names) if n.startswith("guidewire/guidewire_body_")]
        assert len(self.ids) == WIRE_BODIES
        self.env = env
        self.control_dt = env.control_timestep()

    def step(self, push: float, rotate: float) -> None:
        self.env.step(np.array([push * PUSH_FULL_CMD, rotate * ROTATE_FULL_CMD]))
        # Navigate ends the episode on success and composer would reset the wire on the next step.
        # The player keeps driving, so the episode never ends here.
        self.env._reset_next_step = False

    def wire(self) -> List[Sequence[float]]:
        return [[float(c) for c in v] for v in self.env.physics.data.xpos[self.ids]]

    def tip(self) -> Sequence[float]:
        return [float(c) for c in self.env.task.get_head_pos(self.env.physics)]

    def contact_force_n(self) -> float:
        return contact_force_n(self.env.physics)

    def at_target(self) -> bool:
        """CathSim's own success test: the head within Navigate.delta (4 mm) of the target site."""
        task = self.env.task
        d = np.linalg.norm(np.asarray(task.get_head_pos(self.env.physics)) - np.asarray(task.target_pos))
        return bool(d < task.delta)
