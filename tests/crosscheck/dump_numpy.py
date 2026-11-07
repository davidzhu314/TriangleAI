"""Write numpy-synthetic.json: NumPy's own outputs on every synthetic fixture.

The TypeScript port (client/src/optimize/measures/) checks itself against
these to 1e-6. That is far tighter than the 0.1 mm / 0.5 deg spec tolerance, and
it proves the port follows the same algorithm, not just one that lands nearby.
The closed-form answers in expected.json stay the truth for both.

Run:  python tests/crosscheck/dump_numpy.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy_measures as nm  # noqa: E402

SYNTH = HERE.parents[1] / "tests" / "fixtures" / "synthetic"
OUT = HERE / "numpy-synthetic.json"


def r9(x):
    if x is None:
        return None
    v = round(float(x), 9)
    return 0.0 if v == 0 else v


def render() -> str:
    result = {}
    for d in sorted(p for p in SYNTH.iterdir() if (p / "expected.json").is_file()):
        read = lambda f: json.loads((d / f).read_text(encoding="utf-8"))
        case, cl, exp = read("case.json"), read("centerlines.json"), read("expected.json")
        edges = {}
        for eid, m in nm.measure_case(cl, case).items():
            edges[eid] = {
                "L_mm": r9(m.L_mm),
                "theta_max_deg": r9(m.theta_max_deg),
                "theta_sum_deg": r9(m.theta_sum_deg),
                "r_min_mm": r9(m.r_min_mm),
                "proximity_clearance_mm": r9(m.proximity_clearance_mm),
                "overlapping_zones": m.overlapping_zones,
            }
        by_id = {e["id"]: e for e in cl["edges"]}
        routes = {}
        for r in exp.get("routes", []):
            polys = [by_id[e]["points"] for e in r["edges"]]
            tmax, tsum = nm.route_turning_measures(polys, r["reversed"])
            routes[r["id"]] = {
                "L_mm": r9(nm.route_length_mm(polys, r["reversed"])),
                "theta_max_deg": r9(tmax),
                "theta_sum_deg": r9(tsum),
            }
        result[d.name] = {"edges": edges, "routes": routes}
    return json.dumps(result, indent=1, sort_keys=True) + "\n"


if __name__ == "__main__":
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(render())
    print(f"wrote {OUT.name}")
