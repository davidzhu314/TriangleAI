# Request — to David from Vaibhav: more real CT cases, finer meshes and body context

What I need, in order of value (your call on what's worth it):
1. **More real CT cases.** `ts-s1404-cta` is the only case from a real scan; the other bundled cases are generated tubes. Run `slicer/` on a few more TotalSegmentator subjects (CC BY 4.0), ideally ones with a real Type I, Type II and Type III arch, a bovine arch, and visible plaque, so each ladder tier has real anatomy.
2. **Finer meshes near the arch.** The export decimates to under 90k triangles in total (`slicer/README.md`, step 5). If load time allows, keep more detail around the arch and the target, and less in the iliacs.
3. **Body context for the 3D view.** TotalSegmentator also segments bones and organs. A light, decimated mesh of the spine, ribs, sternum and heart would let Aroovee draw faint context behind the arteries (`to-aroovee-from-vaibhav-richer-3d-view.md`). If that needs a new field in the case package (for example a separate context GLB that never enters the vessel graph), it's a contract change, so please treat it as one. The engine must keep ignoring it.
4. **Later:** risk zones from the CT itself (calcified plaque) instead of markup points; smaller vessels (ICA, ECA, vertebrals) with SlicerVMTK vesselness and level sets (spec §3).
Why: so the 3D view and the Scale step show real anatomy, not generated tubes. On my side, every new real case goes through my sweep (optimize, steer, rail drive, score), and `cannot_steer` (`to-all-from-vaibhav-contract-steerability.md`) is what makes real routes reliably drivable.
Where: `slicer/`, `client/public/cases/`, `THIRD_PARTY.md` (yours); any case-format change through `client/src/contracts/`.
Needed by: not blocking. Item 1 helps S5's Scale step if cheap; the rest is after the demo.
Meanwhile: the demo uses `ts-s1404-cta` as the real-anatomy case.

## Answer

David: 1 is done: two more real CTA planning cases, `ts-s1336-cta` and `ts-s0727-cta` (TotalSegmentator s1336 and s0727, arterial masks only, CC BY 4.0), placed after `ts-s1404-cta`. Neither has an arch-type, bovine or plaque label, because the masks alone don't show one honestly; five other subjects failed the pipeline (`slicer/README.md`). 2 is done as weighted decimation: arch branches and carotids ×4, subclavians ×2, aorta ×1, iliacs ×½, under the same 90k cap. It only changes cases over the cap (s1336); detail is bounded by the masks' 1.5 mm voxels. 3 is parked: a context GLB is a new case-package field, so it's a contract change and needs a request to all. 4 stays Later. For your sweep: s1336 → lcca and s0727 → rcca/lcca have no steerable frontier route (takeoffs 85–98° vs a 45° tip). They're Cathy findings now, and `no_safe_route` once `cannot_steer` lands.
