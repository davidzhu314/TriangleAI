# D5: physics process latency (spec §5.7)

What was measured: `physics/server/measure_latency.py` against `python -m server`. Setup:
- MacBook (Apple silicon), `MUJOCO_GL=disable`, Euler, CathSim `adfabb2`;
- a 20 s drive per row, a push of 0.5 or 1 with a slow rotation sweep, controls sent at 30 Hz.

Raw lines: `latency.jsonl`. Gate: frame-to-frame under 100 ms.

| Phantom · target · preset | Frame-to-frame p50 / p95 / max (ms) | Control → next state p50 / p95 (ms) | Sim s per wall s | First state after `start` (ms) |
| --- | --- | --- | --- | --- |
| phantom3 · lcca · standard_j | 33.2 / 38.2 / 45.9 | 12.4 / 13.7 | 0.998 | 3475 |
| phantom2 · bca · stiff_straight (push 1) | 33.2 / 38.5 / 41.4 | 13.2 / 14.4 | 0.998 | 2540 |
| phantom4 · lcca · soft_angled | 33.2 / 37.9 / 40.6 | 11.0 / 12.9 | 0.998 | 2587 |
| low_tort · lcca · standard_j | 33.2 / 38.3 / 41.1 | 12.8 / 14.0 | 0.998 | 759 |

- **Gate:** passes on every phantom. The sim keeps real time, and each frame's compute is about 12 ms (p95 14 ms, server-side).
- **Start time:** building a CathSim drive takes 0.8–3.5 s, longer than the 2 s stall rule. The client gives the first state 10 s (`PHYSICS_START_TIMEOUT_MS`); the 2 s rule applies once states flow.
- **Contact force** (per-frame mean of the summed wire-to-wall normal force):
  - medians are 0.07–1.14 N;
  - per-frame peaks still reach 1–2 kN on two drives (phantom2 at full push, low_tort). They come from CathSim's 4 mm contact margin; averaging over a frame does not remove them.
- **Not reached:** no drive reached a target, which is expected from D4. These are latency drives, not recorded runs.
