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

## Run the physics process (D5)

```sh
cd physics
MUJOCO_GL=disable .venv/bin/python -m server              # port 8765; about 20 s to import CathSim, then it prints its URLs
```

One localhost port (127.0.0.1:8765) serves:

- **`GET /cases/index.json`:** `{"cases": [{"id", "path"}]}`, where `path` is relative to the list (the same shape as `client/public/cases/index.json`). It lists `low_tort`, `phantom2`, `phantom3` and `phantom4`.
- **`GET /cases/<id>/{case.json,centerlines.json,vessels.glb,LICENSE.md}`:** the D3a packages, each with its CathSim license notice. CORS is open, so the Vite app can read them.
- **`ws://127.0.0.1:8765/wire`:** the spec §5.2 messages.
  - State is sent about every 1/30 s of wall time, and each frame advances 1/30 s of simulation time in whole 0.012 s control steps.
  - Positions are CathSim world metres, sent unchanged; that is the case package's Y-up frame (D3a).
  - `contact_force_n` is the mean, over the frame's control steps, of the summed normal force (`mj_contactForce`) over every wire-to-wall contact.
  - Full push is about 2 cm/s and full rotate about 1 rad/s.
  - If CathSim cannot run, `start` is closed with code 1013 `server_unavailable`.
- **`GET /recorded-runs.json`** and the replay files it names, only if `physics/recorded-runs.json` exists. D4 recorded none, so these are 404 and replay is unavailable.

Latency from a client: start the server, then run `.venv/bin/python -m server.measure_latency --phantom phantom3 --seconds 30` from `physics/`. Results are in `metrics/david/d5/`.

Tests (CI runs these without CathSim, using a fake simulator): `pytest physics`. A live client check runs with the server up: `PHYSICS_LIVE=1 pnpm vitest run client/src/wire/physics-live.test.ts`.

## The D1 probe (spec Phase 0)

`probe/probe_server.py` is the D1 spike, **not** the D5 server; use `python -m server` above. It treated CathSim's world as RAS, and its force rule only counted contacts within 2 mm. Both are wrong for D5 (DECISIONS.md). It is kept only to reproduce the D1 numbers:

```sh
MUJOCO_GL=disable .venv/bin/python probe/cathsim_bench.py --phantom phantom3 --seconds 60 --integrator euler
MUJOCO_GL=disable .venv/bin/python probe/integrator_compare.py phantom3
MUJOCO_GL=disable .venv/bin/python probe/probe_server.py --integrator euler --seconds 80
node physics/probe/measure.mjs 40 phantom3           # in a second terminal, from the repo root
```

## When CathSim is missing

The app never needs this process. If it is not running, or the socket fails or stalls for 2 s, `client/src/wire/select.ts` (D5) falls back to rail and shows a notice; phantom cases are listed only while this process answers. CI never installs CathSim: the `physics-bridge` job runs only `pytest physics` on the server code with a fake simulator (`requirements-test.txt`, Python 3.9 container).

## Still to do

- **D3c:** a CTA case through 3D Slicer. Blocked because Slicer is not installed.
- **Recorded runs:** none. D4 found no driver that reaches a target (DECISIONS.md).
