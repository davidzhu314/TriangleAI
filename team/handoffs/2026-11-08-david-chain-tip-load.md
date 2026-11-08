# Handoff — David, chain simulation: a turned tip pushed into the wall is flagged

What landed (PR into `integration/hands-voice`):
- `client/src/wire/physics-chain.ts`:
  - New `ChainState.tipForced`: how far the wall holds the leading shaped tip away from its shape, as a share 0..1.
  - New tip load while pushing: `tipPushN` (1.6 N) × push × the share beyond `glideShare` (0.25) × (0.5 + 0.5 × stall). Stall is the part of the push that did not become progress.
  - That load appears in `contacts`, `peakLoadN` (the HUD wall force), the risk index and `force_spike`. It is not in the solver's `state.load`, so the device moves exactly as before.
- `client/src/wire/physics-chain.test.ts`: a new test checks that a turned tip pushed into the wall loads it at more than 0.35 N and more than 2.5× what turning a free tip does.

Probe on low-tort:

| Move | Before | After |
| --- | --- | --- |
| Turn 90° then push (iliac) | 0.09 N | 0.33 N |
| Turn 90° then push (aorta) | 0.08 N | 0.64 N, force spike |
| Worst roll, pushed into the wall | 0.11 N | 0.42–0.48 N |
| Blind push through bends | — | peaks 0.67–0.77 N |
| Turning a free tip | 0.07–0.11 N | 0.07–0.11 N, unchanged on purpose |

How to use: Drive → Physics (beta) (or `?wire=chain`). Watch Wall force while pushing a turned tip.
Who switches:
- Aroovee: draw the tip direction (`team/requests/to-aroovee-from-david-chain-tip-direction.md`). The "tip is just a circle" is the renderer.
- Vaibhav: hand twist as an angle, not a spin rate (`team/requests/to-vaibhav-from-david-hand-twist-angle.md`).

Mock replaced: none.
Contracts version after this handoff: unchanged (3 on the integration branch).
Tests: `pnpm test`: 1157 passed; build green.
New dependencies: none.
Decisions logged: DECISIONS.md 2026-11-08 "Chain simulation: pushing a turned tip into the wall loads the wall".

Known gaps:
- Calibration by feel: the thresholds may flag too much or too little.
- No torque or over-twist hazard. A pinned-tip model was tried and dropped (see DECISIONS).
