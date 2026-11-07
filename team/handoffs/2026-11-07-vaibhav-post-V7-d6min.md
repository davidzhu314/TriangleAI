# Handoff — Vaibhav post-V7: steerability check and D6-min drivability

What landed:
- **`client/src/optimize/steerability.ts`:** the §5.3 branch-entry maths in one place (tip direction, best roll, the 25° pick, `steerRoll`).
  - `steerableAt(graph, path, presetId, startNode?)` → `{ ok, failures: [{ node, edge, takeoffDeg, tipDeg, entered }] }`.
  - `wire/rail.ts` now calls the same code, so the maths isn't duplicated.
- **Autopilot fix:** for a branch it can't point into, the rail autopilot now uses `steerRoll`, rolling the tip away from the other branches so the wire continues the straightest way. Before, it aimed at a direction it could never point at and could catch a side branch. No existing drive changed: every V4 frontier route already entered by aiming. The golden replays are byte-identical, and so are the golden scoring results, whose gentleness reference comes from the autopilot.
- **Tests:** diamond route B (38°) passes with soft angled and standard J. A 30° side branch passes with soft angled and fails with standard J. The 25° boundary is checked at 84° and 86°. There's also a property test: on every template case, each candidate route is steerable exactly when the autopilot enters no wrong branch.
- **`client/src/optimize/d6min-drivability.test.ts`:** skipped unless `D6_DIR` names a folder with the generated cases. It drives every frontier route and writes `metrics/vaibhav/d6min-drivability.md`.
- **Requests filed:** `team/requests/to-david-from-vaibhav-type-iii-drivability.md` and `team/requests/to-all-from-vaibhav-contract-steerability.md`.

## Drivability of David's D6-min cases (origin/lane/david, PR #13, head 937c67d; not committed here)

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

The Python estimate that started this was right in substance. The real engine confirms that all five type-iii frontier routes fail: rcca from rad_r, rad_l and fem_l, and lcca from rad_l and fem_l, all soft angled, with takeoffs of 84–98° against a 45° tip. Low-tort also has one undrivable frontier route: fem_r, soft angled, to lcca, a 77° takeoff.

Who switches:
- **David:** please answer the drivability request. The fix is to add `steerableAt` to the type-iii seed search, so every frontier route to rcca is drivable with soft angled (takeoffs of about 20–70°), and to decide on low-tort's lcca. Once you've retuned, the contract request (`cannot_steer`) can go ahead.
- **Aroovee:** nothing yet. The contract request needs your one-line answer; the Plan screen would show a new violation kind.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 517 green and 1 skipped (the D6 check), twice in a row. `python -m pytest tests/crosscheck -q` gives 164 green. The build is clean, with no mock markers.
New dependencies: none
Decisions logged: "Steerability check".
Waiting on others:
- **Aroovee's voice review:** unanswered, so no wording change this session.
- **D6-min (PR #13) isn't merged.** Not done yet:
  - adding type-iii and low-tort to the NumPy cross-checks;
  - adding them to rail acceptance (type-iii marked `it.fails` with a link to the request until the retune);
  - adding them to the timings and `v7-summary.md`;
  - real-metadata progression tests;
  - a type-iii golden demo drive.
- **`cannot_steer`** waits on David's retune, then the contract bump.
Known gaps: the §4.4 arch constraint and simulated measures (need D4 real runs); ladder tier 4 (needs a whole-body marker).
