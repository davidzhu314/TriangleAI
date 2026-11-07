# V0 — NumPy measures vs closed form (2026-11-07)

`pytest tests/crosscheck`: 57 passed. Tolerances: 0.1 mm, 0.5° (spec §4.9).

The largest absolute differences are 0.048° (θmax on the arc, from sampling the arc as a 1 mm polygon) and 0.032 mm (L on the helix and arc, from the inscribed polygon).

| fixture:edge | L mm (closed / NumPy) | θmax ° | ΘΣ ° | r_min mm | clearance mm |
| --- | --- | --- | --- | --- | --- |
| straight:e0 | 100 / 100.0000 | 0 / 0 | 0 / 0 | 8 / 8 | 0 / 0 |
| arc90:e0 | 31.4159 / 31.4128 | 14.3239 / 14.3719 | 90 / 89.9863 | 3.5 / 3.5 | — |
| helix:e0 | 204.7696 / 204.7424 | 16.1640 / 16.1660 | 661.9774 / 661.9455 | 4 / 4 | — |
| y-branch:e0 | 60 / 60 | 0 / 0 | 0 / 0 | 10 / 10 | 10 / 10 |
| y-branch:e1 | 40 / 40 | 0 / 0 | 0 / 0 | 4 / 4 | 9.6593 / 9.6593 |
| y-branch:e2 | 50 / 50 | 0 / 0 | 0 / 0 | 5 / 5 | 0 / 0 |
| bend:e0 | 71.4159 / 71.4128 | 14.3239 / 14.3719 | 90 / 90.0002 | 6 / 6 | — |
