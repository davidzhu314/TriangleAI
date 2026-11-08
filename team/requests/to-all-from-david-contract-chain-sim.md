# Request — to all from David: contract v3 for the chain simulation (devices, tip pose, contact, imaging)

What I need: approval to extend the wire contracts so the Drive redesign can use the new browser chain simulation. The simulation is on `lane/david-chain-sim` (draft PR, held for the merge freeze). It runs today behind the v2 interface, with the extra data on module-local types. Proposed v3, all additive, so rail, physics and replay keep working unchanged:
- **`WireMode`:** add `'chain'` (the browser chain simulation). Until then it reports `'physics'`.
- **`ControlInput`:** add optional `device?: 'wire' | 'catheter'`, `pulse?: 'continuous' | 'p15' | 'p7_5'` and `storeRoadmap?: boolean`.
- **`WireState`:** add optional fields:
  - `tip?: { tangent: Vec3; curvature: number; tipRollRad: number; hubRollRad: number; leading: 'wire' | 'catheter' }`;
  - `devices?: { wire: Vec3[]; catheter: Vec3[]; insertedM: { wire: number; catheter: number }; active: 'wire' | 'catheter' }`;
  - `contacts?: { node: number; edge: string; loadN: number }[]`;
  - `riskIndex?: number` (educational, 0..100);
  - `imaging?: { held: boolean; pulse; liveFrameT: number | null; holdImageT: number | null; holdStale: boolean; roadmapT: number | null; totals: { fluoroS; activations; frames; exposureUnits; contrastInjections; contrastUnits; roadmaps } }`.
- **`EventLog`:**
  - samples gain optional `device`, `push`, `rotate`, `tangent`, `tipRollRad`, `hubRollRad` and `riskIndex`;
  - new event kinds: `wall_contact` (`t`, `toT`, `edge`, `arcM`, `peakLoadN`, `pushedS`), `imaging_interval` (`t`, `toT`, `pulse`, `frames`), `branch_entry` (`t`, `fromEdge`, `toEdge`, `onPlan`, `tipRollRad`, `hubRollRad`) and `roadmap_stored` (`t`).

Why:
- **Imaging-dependent visibility** needs it: live frames, a frozen last-image-hold with its capture time and staleness, separate contrast, a static roadmap, and pulse-rate presets with their costs.
- **Separate device control** needs it: the guidewire versus the catheter, with insertion and rotation each.
- **The tip pose** needs it: tangent, curvature, and tip roll against hub roll, which give torsional lag and stored twist.
- **Contact along the whole device** needs it, with an educational contact-risk index, labelled as not a clinical force.
- **The post-run review** needs it: the true trajectory, imaging intervals, wall contacts and branch-entry attempts.

Each owner then picks it up:
- **Aroovee:** the screen, through `chain()` until v3 lands.
- **Vaibhav:** scoring that weighs navigation, contact, time and imaging efficiency together, so low imaging is never rewarded at safety's expense, and the review wording.
- **Gibran:** verification.

Where: `client/src/contracts/wire.ts` and `events.ts` (mine, by this request); `client/src/wire/physics-chain*.ts` (mine); `select.ts` would offer the chain source once a screen uses it.
Needed by: after the demo. Main is frozen; nothing here changes the demo.
Meanwhile: the simulation and its tests stay on the branch. `ChainWireSource.chain()` and `.trace()` expose the extra data to anyone prototyping on the branch.

## Answer

David: <one line>
Vaibhav: <one line>
Aroovee: <one line>
