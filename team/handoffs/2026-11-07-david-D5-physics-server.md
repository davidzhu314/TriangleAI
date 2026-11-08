# Handoff — David D5: physics server, case serving, wire sources, select.ts (plus three.js)

What landed:
- `physics/server/` (`python -m server`): the §5.2 socket and HTTP case serving on one localhost port.
- `client/src/wire/`:
  - `select.ts`;
  - `physics-source.ts` (`PhysicsWireSource`);
  - `replay-source.ts` (`ReplayWireSource`);
  - `physics-track.ts` (s, edge and events from tip positions).
- `three` 0.187.0 and `@types/three` 0.187.0, pinned.
- `metrics/david/d5/`.

How to use:
- **Run the server:** `cd physics && MUJOCO_GL=disable .venv/bin/python -m server`.
- **In the app:** `import { selectWireSource } from '../../wire/select'`, then `const wire = await selectWireSource(loadedCase)`.

Who switches:
- **Aroovee:**
  - set `PHYSICS_CASES_URL = 'http://127.0.0.1:8765/cases/index.json'` in `ui/physics-probe.ts`;
  - Drive now finds `select.ts`, so bundled cases drive on rail in the plain app;
  - update two A5 e2e tests (request filed);
  - `three` is available for `client/src/render/`.
- **Vaibhav:** nothing to change. Physics-mode logs use your `FORCE_SPIKE_THRESHOLD_N` and the same `EventLog` shape.

Mock replaced: the "no select.ts" gap in Drive. `mock-source.ts` is not reachable from select.ts, even under `VITE_ENGINE=mock`.
Contracts version after this handoff: unchanged (1)
Tests: all green.
- `pnpm test`: physics source, select fallback (including a real socket to a closed port with no server running), and replay.
- `pytest physics`: protocol messages, simulation-time pacing, force averaging, case serving and the unavailable path, with a fake simulator.
- A live check, `PHYSICS_LIVE=1 pnpm vitest run client/src/wire/physics-live.test.ts`, passed against the real server.

New dependencies:
- `three` 0.187.0 (runtime) and `@types/three` 0.187.0 (dev);
- `websockets==13.1` added to `physics/requirements-test.txt`, already pinned in the sim requirements.

Decisions logged: "D5 physics process"; "Fallback behaviour (select.ts)".
Known gaps:
- **No recorded replays:** `ReplayWireSource` refuses, and select.ts never offers replay.
- **Prolapse:** not detected in physics mode.
- **Unreached targets:** live drives also didn't reach a target in latency tests (as in D4). Rehearse a phantom drive before the demo leads with physics.

## Index URL and shape (for `PHYSICS_CASES_URL`)

`http://127.0.0.1:8765/cases/index.json` → `{"cases":[{"id":"low_tort","path":"low_tort/"},{"id":"phantom2","path":"phantom2/"},{"id":"phantom3","path":"phantom3/"},{"id":"phantom4","path":"phantom4/"}]}`
- `path` is relative to the list, so `new URL(path, url)` gives the `baseUrl`. Load with `loadCase({ kind: 'url', baseUrl, origin: 'physics' })`.
- Each package serves `case.json`, `centerlines.json`, `vessels.glb` and `LICENSE.md`. CORS is open.
- No health endpoint. If the process is down, the fetch fails and no phantom card shows.

## select.ts

- **Export:** `selectWireSource(c: LoadedCase, options?): Promise<WireSource>`; the options are for tests only.
- **Which source:** cases with `origin: 'physics'` and `physics.available` drive on physics. Everything else drives on `RailWireSource`.
- **When it falls back:**
  - `socket_failed`: no process, or the socket errors or closes;
  - `server_unavailable`: the server closes with 1013 because CathSim is missing;
  - `socket_stalled`: no state for 2 s once states flow. The first state gets 10 s, because building a drive takes up to 3.5 s.
- **What happens:**
  - `onFallback` fires once with `{ from: 'physics', to: 'rail', reason, t }`, and `mode` becomes `'rail'`;
  - existing `onState` listeners keep receiving;
  - **rail restarts the drive from the entry**, and `stop()` returns rail's log.

## Force rule and frame

- **Force:** `contact_force_n` sums the `mj_contactForce` normal over every contact between a wire geom and a non-wire geom (phantom geoms are `<phantom>//unnamed_geom_N`). There is no distance filter, because CathSim's margin is 4 mm. The value sent is the mean over each 1/30 s frame's control steps, never a raw step.
- **Spikes:** per-frame values still reach 1–2 kN at times (metrics/david/d5/SUMMARY.md).
- **Frame:** positions are CathSim world metres, sent unchanged; that is the case package's Y-up frame (D3a). On phantom3 the t=0 tip lies 1.1 mm from the package centerline. The D1 probe's RAS conversion is not used.

## No recorded replays

D4 recorded nothing, so `physics/recorded-runs.json` does not exist and `/recorded-runs.json` returns 404. `ReplayWireSource` plays only files the server lists there (a JSON array of `state` messages). Until real runs exist, it rejects with `server_unavailable`. Nothing is made up.

## Requests handled

- **three.js:** done.
- **select.ts:** done.
- **physics index:** URL above.
- **to-all hands/voice:** David's line filled with the hand-input decision only (after the demo).
