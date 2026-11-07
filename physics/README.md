# physics/ — the CathSim physics process

CathSim (CC BY-NC-SA 4.0, research and demo only) runs here, in its own Python 3.9 environment and process. The browser talks to it only over the spec §5.2 WebSocket at `ws://127.0.0.1:<port>/wire`, localhost only. Nothing in `client/` imports or copies CathSim code or meshes.

## Environment (macOS arm64 tested; about 1 minute)

```sh
cd physics
git clone https://github.com/airvlab/cathsim vendor/cathsim      # git-ignored; never committed
git -C vendor/cathsim checkout adfabb2                              # the commit D1 measured
uv venv .venv --python cpython-3.9.25                               # not Apple's /usr/bin/python3 (3.9.6): see below
uv pip install --python .venv/bin/python --no-deps -e vendor/cathsim
uv pip install --python .venv/bin/python -r requirements-sim.txt
```

Always run with `MUJOCO_GL=disable`. The server never renders (the browser does), and MuJoCo 2.3.7's macOS OpenGL loader points at a path that does not exist (`/System/Library/OpenGL.framework`), so importing it with GL enabled fails.

Gotchas found in D1:

- Apple's Command Line Tools Python 3.9.6 hits that same OpenGL loader failure; use uv's standalone CPython 3.9.25.
- CathSim's `pyproject.toml` pulls stable-baselines3 from git and its `environment.yml` pins CUDA torch. We install CathSim with `--no-deps` plus `requirements-sim.txt`. torch is still needed because `cathsim/dm/utils.py` imports stable-baselines3 at module level.
- The first `import cathsim.dm` takes about 20 s.

## Integrator: Euler, not CathSim's implicitfast

CathSim's `env.yaml` sets `integrator: implicitfast`. With MuJoCo's fluid model on the 84 wire geoms, that runs about 14 control steps/s on every phantom, below the 40 steps/s gate. The physics process switches the compiled model to Euler at runtime (`physics.model.opt.integrator = mjINT_EULER`; CathSim's files are untouched): 190–270 steps/s. On phantom3 over 400 identical control steps, the two integrators' tip paths differ by 0.2 mm on average and 2.3 mm at most. Numbers: `metrics/david/d1/`.

## The D1 probe (spec Phase 0)

```sh
# steps/s over 60 s (prints one JSON line)
MUJOCO_GL=disable .venv/bin/python probe/cathsim_bench.py --phantom phantom3 --seconds 60 --integrator euler
# stock vs Euler: speed, stability, tip divergence
MUJOCO_GL=disable .venv/bin/python probe/integrator_compare.py phantom3
# latency: start the probe server, then measure from the repo root with Playwright's Chromium
MUJOCO_GL=disable .venv/bin/python probe/probe_server.py --integrator euler --seconds 80
node physics/probe/measure.mjs 40 phantom3           # in a second terminal, from the repo root
```

`probe_server.py` is a spike, not the D5 server. It speaks the §5.2 messages, paces the sim to real time, sends state at about 30 Hz in simulation time, and serves a blank three.js page at `/` that draws the 80 wire points. It treats CathSim's world frame (metres) as RAS until D3a registers each phantom to its case package.

## When CathSim is missing

The app never needs this process. If it is not running, or the socket fails or stalls for 2 s, `client/src/wire/select.ts` (D5) falls back to rail and shows a notice; phantom cases are listed only while this process answers. CI never installs CathSim: the `physics-bridge` job runs only `pytest physics` on the bridge code (`requirements-test.txt`, Python 3.9 container).

## Still to do

D3a: phantom case packages in `physics/cases/` (GLB under 60k triangles, VMTK centerlines, bca and lcca targets, CathSim's LICENSE and attribution in each package). D4: recorded runs. D5: the real server with case serving over HTTP and the fallback selector.
