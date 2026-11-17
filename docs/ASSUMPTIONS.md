# Assumptions for the access module

Every default the access module uses that is not measured from a scan or given by the client. Each row says where it is used and what would replace it. Keep this current: a number marked `[ASSUMPTION]` in code must have a row here.

Nothing in this module is a clinical claim. Outputs are engineering and training measures for research and education only.

Status 2026-11-17: only row 13 is in use (the heart fit). The rest are the assumptions the brief names, recorded before they are coded.

| # | Assumption | Starting value | Where it will be used | What would replace it |
| --- | --- | --- | --- | --- |
| 1 | Coronary clearance for an apical puncture | at least 10 mm from `lad` and `diagonals` | Apical access zone (Phase 1) | The client's planning rule, or a clinician-reviewed value |
| 2 | Minimum LV wall thickness at the puncture | 8 mm | Apical access zone (Phase 1) | The client's rule; measured thickness from a real case |
| 3 | LAD and diagonal course | A 3 mm tube swept along the anterior interventricular groove to near the apex | `lad`, `diagonals` meshes (Phase 1) | Coronaries segmented from a CTA |
| 4 | Pericardium | The epicardium offset outward by a few mm | `pericardium` mesh (Phase 1) | A segmented pericardium |
| 5 | Chordae and papillary muscles | Generated from the mitral annulus and two papillary landmarks | Collision bodies for Scenarios A and B (Phase 1) | Parts from David's heartgen, or segmented from CT or echo |
| 6 | Valve leaflets and their open and closed states | Generated from the flat valve planes in the template | Scenarios A, B, E (Phases 1, 3) | Leaflets from heartgen or a scan |
| 7 | PFO tunnel | Two overlapping flaps with set length, width and angle; septal excursion a case option | Scenario E (Phases 1, 4) | Echo measurements of a real septum |
| 8 | Steerable device | Tendon-driven tip with 1 or 2 constant-curvature segments on a straight shaft | `ConstantCurvatureCatheter` (Phase 2) | Swift CV's device parameters (private config, never in the repo) |
| 9 | Apical sheath size | Not set. For scale only: published transapical mitral systems use sheaths around 34 Fr | Apical port, access-site fit (Phases 2, 6) | Swift CV's sheath size |
| 10 | Tissue contact stiffness and force limits | Not set | Penalty contact, safety supervisor (Phases 2, 5) | Measured tissue properties; the client's limits |
| 11 | Circulatory-support inflow target | Cannula axis toward the mitral orifice with clearance from septum and free wall | Scenario C (Phase 3) | The client's device and placement rule |
| 12 | Cardiac motion | None: one static phase | All scenarios | A second phase from heartgen, then interpolation |
| 13 | Heart and body are one patient | The template heart, placed and uniformly scaled into a CT case (`heart-fit.json`). Its chamber sizes, wall thickness and valves stay the template's, not the patient's | Everything inside the heart, on the CT cases (from Phase 1) | A heart segmented with chamber labels from the same CT |
| 14 | Access-zone coaxial limit and every performance target marked "starting" in the brief | As in the brief | Phases 1 to 5 | Tuning against the client's cases |

## Sources named in the brief and not yet checked

The brief cites clinical and patent sources for its design choices (transapical access reviews, the Tendyne protocol, PFO closure protocols, Fagogenis et al. 2019, SCAI axillary guidance). None has been read or verified in this repo yet. Until one is, a statement that rests on it is an assumption, and nothing from them may appear on screen as a fact.
