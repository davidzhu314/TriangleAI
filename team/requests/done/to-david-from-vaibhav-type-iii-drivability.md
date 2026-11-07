# Request — to David from Vaibhav: Type III frontier routes can't be driven on rail

What I need: a retune of the type-iii seed (and the low-tort lcca branch) so that every frontier route can be steered under the §5.3 branch-entry rule. Today none of the five type-iii frontier routes can be driven: the rail autopilot enters a wrong branch on each one, so the demo's rail Drive beat would end in a wrong branch.
Why: the S2/S3 Drive beat and S5 rehearsal. The Type III route has to be drivable on rail, the demo's fallback.
Where: `tools/generator/` (seed search, `analyze.ts`), `client/public/cases/type-iii/`, `client/public/cases/low-tort/` on `lane/david` (PR #13).
Needed by: S3 (Drive beat), and before PR #13 merges if possible.
Meanwhile: I checked your cases from `origin/lane/david` (head 937c67d) without committing them. Nothing on main depends on them yet.

## What I found (real engine: loadCase → optimizeCase → rail autopilot)

| Case | Target | Route (entry · preset · edges) | Reached | Wrong branch into | Prolapses | Where steering fails |
| --- | --- | --- | --- | --- | --- | --- |
| type-iii | rcca | `rad_r · soft_angled · e_r_arm,e_rcca` | no | e_bca | — | n_bca_bif: into e_rcca takeoff 84° vs tip 45° (enters e_bca) |
| type-iii | rcca | `rad_l · soft_angled · e_l_arm,e_arch_distal,e_arch_proximal,e_bca,e_rcca` | no | e_aorta_desc | — | n_lsca_o: into e_arch_distal takeoff 93° vs tip 45° (enters e_aorta_desc); n_bca_o: into e_bca takeoff 98° vs tip 45° (enters e_aorta_asc) |
| type-iii | rcca | `fem_l · soft_angled · e_l_iliac,e_aorta_desc,e_arch_distal,e_arch_proximal,e_bca,e_rcca` | no | e_aorta_asc | — | n_bca_o: into e_bca takeoff 98° vs tip 45° (enters e_aorta_asc) |
| type-iii | lcca | `rad_l · soft_angled · e_l_arm,e_arch_distal,e_lcca` | no | e_aorta_desc | — | n_lsca_o: into e_arch_distal takeoff 93° vs tip 45° (enters e_aorta_desc); n_lcca_o: into e_lcca takeoff 96° vs tip 45° (enters e_arch_proximal) |
| type-iii | lcca | `fem_l · soft_angled · e_l_iliac,e_aorta_desc,e_arch_distal,e_lcca` | no | e_arch_proximal | — | n_lcca_o: into e_lcca takeoff 96° vs tip 45° (enters e_arch_proximal) |
| low-tort | rcca | `fem_r · soft_angled · e_r_iliac,e_aorta_desc,e_arch_distal,e_arch_proximal,e_bca,e_rcca` | yes | — | — | steerable |
| low-tort | rcca | `fem_r · standard_j · e_r_iliac,e_aorta_desc,e_arch_distal,e_arch_proximal,e_bca,e_rcca` | yes | — | — | steerable |
| low-tort | lcca | `fem_r · soft_angled · e_r_iliac,e_aorta_desc,e_arch_distal,e_lcca` | no | e_arch_proximal | — | n_lcca_o: into e_lcca takeoff 77° vs tip 45° (enters e_arch_proximal) |
| low-tort | lcca | `fem_r · standard_j · e_r_iliac,e_aorta_desc,e_arch_distal,e_lcca` | yes | — | — | steerable |

Summary: all 5 type-iii frontier routes fail (rcca: rad_r, rad_l, fem_l; lcca: rad_l, fem_l). Every one is soft angled; standard J fails the 80° turn limit there, so it isn't on the frontier. In low-tort, fem_r · soft_angled → lcca fails too (a 77° takeoff), while standard J → lcca and both rcca routes are fine. Full table: `metrics/vaibhav/d6min-drivability.md`.

## The rule

A route is rail-drivable when, at every branch point it passes, the branch it enters either:
- has a takeoff (the deflection from the incoming 5 mm heading into the branch's first 5 mm) within 25° of the preset's tip angle (soft angled 45°, standard J 60°, stiff straight 0°), so the tip can be rolled to point into it; or
- is the straightest way on, and the tip can be rolled away from the other branches.

For a soft angled route that means takeoffs between about 20° and 70°.

## Recommended fix

- **Add this rule to the type-iii seed search**, alongside the ~120° fem_r turn and the "≥ 3 frontier routes" check, so that every frontier route to rcca can be driven with soft angled.
- **Low-tort:** either retune the lcca origin so soft angled can enter it, or accept that only standard J drives lcca there (it's still on the frontier, so the Plan screen offers an undrivable route).
- **You don't need to copy the maths.** `steerableAt(graph, path, presetId, startNode?)` in `client/src/optimize/steerability.ts` (on main once my post-V7 PR merges) is the exact check: pure, a function of the route graph and the preset, and the rail wire uses the same code. Call it from `tools/generator/analyze.ts` (`buildGraph(loadedCase)`, then `steerableAt` for each frontier route) and reject seeds where any frontier route fails. Its `failures` list gives the node, edge, takeoff and tip angle.
- **Alternative, if a steep arch matters more than drivability with today's presets:** a fourth, reverse-curve preset (about a 95° tip). That changes `WirePresetId`, a contract change, so it would come as a to-all contract request rather than a retune.

Related: `team/requests/to-all-from-vaibhav-contract-steerability.md` adds a `cannot_steer` violation so the optimizer marks such routes infeasible. It should land after this retune; otherwise type-iii becomes "no safe route" everywhere.

## Answer

David: Yes. Retuning type-iii so every frontier route is steerable under the §5.3 branch-entry rule, while keeping the ~120° right-iliac turn and at least three frontier routes to rcca. Also retuning the low-tort lcca origin so the soft angled wire can enter it.
