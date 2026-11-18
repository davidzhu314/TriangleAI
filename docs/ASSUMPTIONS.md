# Assumptions for the access module

Every default the access module uses that is not measured from a scan or given by the client. Each row says where it is used and what would replace it. Keep this current: a number marked `[ASSUMPTION]` in code must have a row here.

Nothing in this module is a clinical claim. Outputs are engineering and training measures for research and education only.

Status 2026-11-18 (end of Phase 1): rows 1 to 4, 7 and 13 to 20 are in use in `client/src/heart-access/`. Rows 5, 6 and 8 to 12 wait for Phases 2 and 3.

| # | Assumption | Starting value | Where it will be used | What would replace it |
| --- | --- | --- | --- | --- |
| 1 | Coronary clearance for an apical puncture | at least 10 mm from `lad` and `diagonals` | `access-zone.ts` `CORONARY_CLEARANCE_MM` | The client's planning rule, or a clinician-reviewed value |
| 2 | Minimum LV wall thickness at the puncture | 8 mm | `access-zone.ts` `MIN_WALL_MM`. On the template it rules out the region near the apex (6 to 7 mm there) | The client's rule; measured thickness from a real case |
| 3 | LAD and diagonal course | A 3 mm tube through the front junction of the RV and LV walls, stopped 15 mm short of the apex; two 2 mm diagonals 45 and 35 mm long | `coronary.ts` (`LAD_RADIUS_MM`, `LAD_STOP_SHORT_OF_APEX_MM`, `DIAGONALS`) | Coronaries segmented from a CTA |
| 4 | Pericardium | The LV outer wall offset 3 mm outward | `coronary.ts` `pericardium()`, `PERICARDIUM_OFFSET_MM` | A segmented pericardium |
| 5 | Chordae and papillary muscles | Generated from the mitral annulus and two papillary landmarks | Collision bodies for Scenarios A and B (Phases 2, 3) | Parts from David's heartgen, or segmented from CT or echo |
| 6 | Valve leaflets and their open and closed states | Generated from the flat valve planes in the template | Scenarios A, B, E (Phases 3, 4) | Leaflets from heartgen or a scan |
| 7 | PFO septum | Fossa radius 10 mm; tunnel 8 mm long, 6 mm wide, 30° off the septal plane; septal excursion 5 mm; all case options | `septum.ts` `DEFAULT_PFO` | Echo measurements of a real septum |
| 8 | Steerable device | Tendon-driven tip with 1 or 2 constant-curvature segments on a straight shaft | `ConstantCurvatureCatheter` (Phase 2) | Swift CV's device parameters (private config, never in the repo) |
| 9 | Apical sheath size | Not set. For scale only: published transapical mitral systems use sheaths around 34 Fr | Apical port, access-site fit (Phases 2, 6) | Swift CV's sheath size |
| 10 | Tissue contact stiffness and force limits | Not set | Penalty contact, safety supervisor (Phases 2, 5) | Measured tissue properties; the client's limits |
| 11 | Circulatory-support inflow target | Cannula axis toward the mitral orifice with clearance from septum and free wall | Scenario C (Phase 3) | The client's device and placement rule |
| 12 | Cardiac motion | None: one static phase | All scenarios | A second phase from heartgen, then interpolation |
| 13 | Heart and body are one patient | The template heart, placed and uniformly scaled into a CT case (`heart-fit.json`). Its chamber sizes, wall thickness and valves stay the template's, not the patient's | Everything inside the heart, on the CT cases (from Phase 1) | A heart segmented with chamber labels from the same CT |
| 14 | Access-zone coaxial limit and every performance target marked "starting" in the brief | Coaxial ≤ 30° (the Apex plan's "fair"); the rest as in the brief | `access-zone.ts` `COAXIAL_MAX_DEG`; Phases 2 to 5 | Tuning against the client's cases |
| 15 | Lung clearance along the entry line | 5 mm | `access-zone.ts` `LUNG_CLEAR_MM` | The client's rule |
| 16 | Clearance from other heart parts along the entry line | 2 mm | `access-zone.ts` `HEART_CLEAR_MM` | The client's rule |
| 17 | Bone clearance along the entry line | 5 mm (half an illustrative 8 mm sheath plus 1 mm, as the Apex plan uses) | `access-zone.ts` `BONE_CLEAR_MM` | Swift CV's sheath size (row 9) |
| 18 | Entry window | Between neighbouring left ribs, 4th to 7th intercostal space, the line passing within 25 mm of both | `access-zone.ts` `ENTRY_SPACES`, `WINDOW_REACH_MM` | The client's approach; a body outline and diaphragm from the CT |
| 19 | The septum's plane and the fossa's place | Plane fitted where the atrial walls come within 6 mm; fossa a quarter of the way toward the IVC opening | `septum.ts` | A septum seen on echo or CT |
| 20 | No diaphragm, liver or skin in the model | A line below the rib cage is treated as blocked (row 18), not as clear | Access zone | Body outline and diaphragm from the CT (TotalSegmentator has no skin class) |

## Sources named in the brief and not yet checked

The brief cites clinical and patent sources for its design choices (transapical access reviews, the Tendyne protocol, PFO closure protocols, Fagogenis et al. 2019, SCAI axillary guidance). None has been read or verified in this repo yet. Until one is, a statement that rests on it is an assumption, and nothing from them may appear on screen as a fact.
