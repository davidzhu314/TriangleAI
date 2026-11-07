"""D1 probe: stock CathSim (implicitfast) vs the same model with MuJoCo's Euler integrator.

Same scripted controls for both; reports speed, stability and how far the tip paths diverge.
Integrator is switched at runtime on the compiled model; CathSim's files are not edited.
"""
import json, math, sys, time
import numpy as np


def run(integrator, steps, phantom):
    import mujoco
    from cathsim.dm import make_dm_env
    env = make_dm_env(phantom=phantom, use_pixels=False, use_segment=False, target="bca")
    env.reset()
    p = env.physics
    if integrator == "euler":
        p.model.opt.integrator = mujoco.mjtIntegrator.mjINT_EULER
    names = [p.model.body(i).name for i in range(p.model.nbody)]
    ids = [i for i, n in enumerate(names) if n.startswith("guidewire/guidewire_body_")]
    tips, seg_max, t0 = [], 0.0, time.perf_counter()
    for k in range(steps):
        env.step(np.array([0.6 + 0.4 * math.sin(k / 50.0), 0.5 * math.sin(k / 23.0)]))
        tips.append(np.array(env.task.get_head_pos(p)))
        w = p.data.xpos[ids]
        seg_max = max(seg_max, float(np.linalg.norm(np.diff(w, axis=0), axis=1).max()))
    wall = time.perf_counter() - t0
    tips = np.array(tips)
    seg0 = None
    return {
        "integrator": integrator,
        "steps_per_s": round(steps / wall, 1),
        "finite": bool(np.isfinite(tips).all()),
        "max_link_length_m": round(seg_max, 5),
        "tip_travel_m": round(float(np.linalg.norm(np.diff(tips, axis=0), axis=1).sum()), 4),
    }, tips


if __name__ == "__main__":
    phantom = sys.argv[1] if len(sys.argv) > 1 else "phantom3"
    steps = 400
    a, ta = run("implicitfast", steps, phantom)
    b, tb = run("euler", steps, phantom)
    d = np.linalg.norm(ta - tb, axis=1)
    print(json.dumps({"phantom": phantom, "control_steps": steps, "stock": a, "euler": b,
                      "tip_divergence_m": {"mean": round(float(d.mean()), 4), "p95": round(float(np.percentile(d, 95)), 4), "max": round(float(d.max()), 4)},
                      "final_tip_stock": [round(x, 4) for x in ta[-1]], "final_tip_euler": [round(x, 4) for x in tb[-1]]}))
