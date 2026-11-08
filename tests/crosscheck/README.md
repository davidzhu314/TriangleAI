# tests/crosscheck — NumPy reference measures (owner: Gibran; written by Vaibhav in V0)

Independent NumPy implementation of the spec §4.2 per-edge measures. The closed-form answers in `tests/fixtures/synthetic/*/expected.json` are the truth. This code and the app's TypeScript (V2) are both tested against them. On real anatomy, where no closed form exists, the TypeScript is cross-checked against this code within 0.1 mm and 0.5° (spec §4.9).

## Run

```bash
python -m venv tests/crosscheck/.venv
tests/crosscheck/.venv/Scripts/python -m pip install -r tests/crosscheck/requirements.txt   # bin/python on macOS/Linux
tests/crosscheck/.venv/Scripts/python -m pytest tests/crosscheck -q
```

Regenerate the fixtures after changing `tests/fixtures/synthetic/generate.py`:

```bash
tests/crosscheck/.venv/Scripts/python tests/fixtures/synthetic/generate.py
```

A test fails if the committed fixtures differ byte-for-byte from a fresh run.

## Definitions the TypeScript port must match

Inputs are one edge from `centerlines.json`: `points` (mm, RAS) and `radii_mm`, which have the same length. Constants: window w = 5 mm, sample step 0.25 mm.

| Measure | Definition |
| --- | --- |
| `L_mm` | Σ ‖pᵢ − pᵢ₋₁‖ over the polyline |
| `p(s)` | Position at arc length s, by linear interpolation along the polyline, with s clamped to [0, L] |
| `θ_w(s)` | Angle between chords p(s) − p(s − w) and p(s + w) − p(s), computed as `atan2(‖u×v‖, u·v)`, and 0 if either chord has zero length. Sampled at `n+1` evenly spaced s in [w, L − w], where n = max(1, ceil((L − 2w)/0.25)). If L < 2w, w becomes L/2 and there is one sample. If L = 0 or the edge has fewer than 3 points, the result is 0. |
| `theta_max_deg` | max θ_w(s) |
| `theta_sum_deg` | (1/w)·trapz(θ_w, s) + θ_w(first sample) + θ_w(last sample). This sums the window angles over consecutive w-long windows, with each end window held constant. On a circular arc it gives exactly L/R. |
| `r_min_mm` | min radii_mm |
| `overlapping_zones` | Sorted ids of risk zones of any tier where `zone.edge == edge.id` and [from_mm, to_mm] overlaps [0, L] |
| `proximity_clearance_mm` | Minimum exact segment-to-segment distance from this edge's polyline to each proximity-tier zone's polyline, where a zone's polyline is its edge's points between from_mm and to_mm. This is centerline to centerline, with no radius subtracted. It is 0 when the zone is on this edge, and `null` when the case has no proximity zones. |

### Route level (windows span branch points)

| Measure | Definition |
| --- | --- |
| join | Take the route's edges in travel order, reversing each one whose `reversed` flag is set, and concatenate their points. When an edge starts within 1e-6 mm of the previous edge's end, that shared junction point appears once; a larger gap is kept as a straight connecting segment. `junction_s` is the arc length where each edge after the first starts. |
| `theta_max_deg`, `theta_sum_deg` | The per-edge algorithm above, run on the joined polyline. The `junction_s` values strictly inside (w, L − w) are merged into the sample grid (sorted, exact duplicates removed), so a corner's peak is sampled wherever the 0.25 mm grid falls. |
| `L_mm` | L of the joined polyline |

A corner of deflection δ between two straight legs, each at least w long, reads Θmax = ΘΣ = δ. Θmax = δ because the peak sits at the corner; ΘΣ = δ because the window averages δ/2 on each side (see `junction()` in `generate.py`). For a route of one edge, the result equals the per-edge measures exactly.

### Route costs (spec §4.6, preset-independent)

| Measure | Definition |
| --- | --- |
| `r_min_mm` | Smallest r_min over the route's edges |
| `heavy_crossings` | Number of distinct heavy-tier zones lying on a route edge |
| `proximity_penalty` | Σ over proximity-tier zones of max(0, 1 − clearance / 10 mm), where clearance runs from the route to the zone. NumPy measures it from the joined polyline; the TypeScript takes the smallest per-edge clearance. The two are equal. |

The `routes` in `expected.json` carry these closed forms. `y-branch` has a 30°, a 45° and a 105° takeoff, one heavy zone, and a proximity penalty of 1 − sin 75° on the trunk→right route.

## Bundled cases

`numpy-cases.json` holds NumPy's measures of the bundled cases, within 0.1 mm / 0.5° (spec §4.9):
- **fixture-y:** its three edges, and its routes: the trunk alone, entry → left and entry → right. `client/src/optimize/measure-route.test.ts` checks the TypeScript against it.
- **type-iii and low-tort (G1):** every edge, and every simple path from each entry to each target (`"routes": "auto"` in `CASES`; ids are `<entry>-to-<target>`). Both cases are trees, so each pair has one path. `tests/engine/crosscheck-generated.test.ts` checks the TypeScript (loadCase → buildGraph → measureRoute) against them, and checks that every frontier route the optimizer offers is among the routes NumPy measured.

To add a bundled case, add it to `CASES` in `dump_numpy.py` and to `G1_CASES` in `tests/engine/engine.testutil.ts`, then rerun `dump_numpy.py`.

## TypeScript port

`client/src/optimize/measures/` (and `graph.ts` / `measure-route.ts` on top of it) follows this file and is tested by `measures.test.ts` in two ways. It must match the closed forms within 0.1 mm / 0.5°, and it must match NumPy's own outputs within 1e-6. NumPy's outputs are in `numpy-synthetic.json`, which `dump_numpy.py` writes; a pytest fails if that file is stale. After changing either implementation or a fixture, run:

```bash
tests/crosscheck/.venv/Scripts/python tests/fixtures/synthetic/generate.py
tests/crosscheck/.venv/Scripts/python tests/crosscheck/dump_numpy.py
```

## Fixtures (`tests/fixtures/synthetic/`)

| Fixture | What it pins down |
| --- | --- |
| `straight` | L = 100; zero turning; taper r_min = 8; a proximity zone on the same edge, so clearance = 0 |
| `arc90` | R = 20: L = 10π, θmax = w/R = 14.324°, ΘΣ = 90°, r_min = 3.5 |
| `helix` | a = 15, pitch 40, 2 turns: exact 5 mm chord angle θ_w = 16.164°, ΘΣ = (L/w)·θ_w = 661.977° (κL = 662.78° is noted for reference) |
| `y-branch` | Trunk and two straight daughters at +30° and −45°: clearance to a zone 10 mm up the left daughter = 10 from the trunk and 10·sin 75° from the right daughter; zone overlaps; tapers |
| `bend` (extra) | Straight, then a 90° arc, then straight: the window neither loses nor invents turning at the transitions (ΘΣ = 90°) |
| `diamond` | Four paths from one entry to one target, for the V3 optimizer. A: wide, 45° then 90°. B: shorter, 38° then 76°, but narrow and through a proximity zone. C: straight, but 0.8 mm (too narrow). D: straight, but crossing a forbidden zone. The closed-form frontier is soft-A, soft-B and J-B (see `client/src/optimize/optimizer.test.ts`). |
| `junction` | A straight parent and two straight children with takeoff (deflection) angles of 120° and 45°, the 45° one out of plane. Routes: parent→retro (120°, the flagged turn), parent→side (45°), retro walked backwards→side (acos(cos 45°/2) = 69.295°), and parent alone (0°). Every edge on its own has 0 turning. |

The closed-form derivations are in `generate.py` and in each `expected.json` `notes` field.
