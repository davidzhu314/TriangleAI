"""D1 probe: control steps per second for CathSim on one phantom, over a fixed wall-clock window.

Our code, not CathSim's. Run inside physics/.venv with MUJOCO_GL=disable:
    MUJOCO_GL=disable .venv/bin/python probe/cathsim_bench.py --phantom phantom3 --seconds 60 [--integrator euler]
Prints one JSON line. The control is a fixed scripted push/rotate pattern so runs are comparable.
"""
import argparse
import json
import math
import platform
import statistics
import time

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phantom", default="phantom3")
    ap.add_argument("--target", default="bca")
    ap.add_argument("--seconds", type=float, default=60.0)
    ap.add_argument("--integrator", choices=["stock", "euler"], default="stock")
    args = ap.parse_args()

    from cathsim.dm import make_dm_env

    env = make_dm_env(phantom=args.phantom, use_pixels=False, use_segment=False, target=args.target)
    env.reset()
    physics = env.physics
    if args.integrator == "euler":
        import mujoco
        physics.model.opt.integrator = mujoco.mjtIntegrator.mjINT_EULER
    names = [physics.model.body(i).name for i in range(physics.model.nbody)]
    wire_ids = [i for i, n in enumerate(names) if n.startswith("guidewire/guidewire_body_")]

    step_ms = []
    steps = 0
    resets = 0
    reached = False
    start = time.perf_counter()
    while time.perf_counter() - start < args.seconds:
        k = steps
        action = np.array([0.6 + 0.4 * math.sin(k / 50.0), 0.5 * math.sin(k / 23.0)])
        t0 = time.perf_counter()
        ts = env.step(action)
        step_ms.append((time.perf_counter() - t0) * 1000.0)
        steps += 1
        _ = physics.data.xpos[wire_ids]  # the 80 wire points the server would send
        if ts.last():
            reached = reached or bool(env.task.success)
            env.reset()
            resets += 1
    wall = time.perf_counter() - start

    step_ms.sort()
    print(json.dumps({
        "phantom": args.phantom,
        "target": args.target,
        "integrator": args.integrator,
        "wall_s": round(wall, 2),
        "control_steps": steps,
        "steps_per_s": round(steps / wall, 1),
        "sim_s_per_step": env.control_timestep(),
        "realtime_factor": round(steps * env.control_timestep() / wall, 3),
        "step_ms_p50": round(statistics.median(step_ms), 2),
        "step_ms_p95": round(step_ms[int(0.95 * len(step_ms))], 2),
        "step_ms_max": round(step_ms[-1], 2),
        "wire_points": len(wire_ids),
        "episode_resets": resets,
        "reached_target_in_window": reached,
        "python": platform.python_version(),
        "machine": platform.machine(),
    }))


if __name__ == "__main__":
    main()
