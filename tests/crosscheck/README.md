# tests/crosscheck — NumPy reference measures (owner: Vaibhav)

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

Junction angles between consecutive edges are not part of these per-edge measures. They belong to route measures (V2).

## Fixtures (`tests/fixtures/synthetic/`)

| Fixture | What it pins down |
| --- | --- |
| `straight` | L = 100; zero turning; taper r_min = 8; a proximity zone on the same edge, so clearance = 0 |
| `arc90` | R = 20: L = 10π, θmax = w/R = 14.324°, ΘΣ = 90°, r_min = 3.5 |
| `helix` | a = 15, pitch 40, 2 turns: exact 5 mm chord angle θ_w = 16.164°, ΘΣ = (L/w)·θ_w = 661.977° (κL = 662.78° is noted for reference) |
| `y-branch` | Trunk and two straight daughters at +30° and −45°: clearance to a zone 10 mm up the left daughter = 10 from the trunk and 10·sin 75° from the right daughter; zone overlaps; tapers |
| `bend` (extra) | Straight, then a 90° arc, then straight: the window neither loses nor invents turning at the transitions (ΘΣ = 90°) |

The closed-form derivations are in `generate.py` and in each `expected.json` `notes` field.
