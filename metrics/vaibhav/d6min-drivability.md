# D6-min drivability — rail autopilot on every frontier route

Written by `D6_DIR=<folder> pnpm exec vitest run client/src/optimize/d6min-drivability.test.ts`, run against the generated cases on `origin/lane/david` (PR #13, head 937c67d) before they merge.

Each frontier route from the real optimizer, driven by the rail autopilot with the V4 acceptance logic. The drive stops at the first wrong branch or prolapse. The last column is `steerableAt` (§5.3: the tip enters a branch within 25° of its tip direction, else the straightest way on).

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

Routes that do not reach the target: 6.
