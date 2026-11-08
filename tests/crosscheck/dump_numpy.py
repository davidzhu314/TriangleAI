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

REPO = HERE.parents[1]
SYNTH = REPO / "tests" / "fixtures" / "synthetic"
OUT = HERE / "numpy-synthetic.json"
OUT_CASES = HERE / "numpy-cases.json"

# Bundled cases cross-checked against the TypeScript (spec 4.9: 0.1 mm / 0.5 deg), with the routes
# to check. "auto" lists every simple path from every entry to every target (G1, Gibran).
CASES_DIR = REPO / "client" / "public" / "cases"
CASES = {
    "fixture-y": {
        "dir": CASES_DIR / "fixture-y",
        "routes": {
            "trunk": (["e_aorta"], [False]),
            "to-left": (["e_aorta", "e_left"], [False, False]),
            "to-right": (["e_aorta", "e_right"], [False, False]),
        },
    },
    "type-iii": {"dir": CASES_DIR / "type-iii", "routes": "auto"},
    "low-tort": {"dir": CASES_DIR / "low-tort", "routes": "auto"},
}

# Same cap as the optimizer's DFS (spec 4.5). The generated cases are trees, so each pair has one path.
PATH_CAP = 50


def entry_target_routes(cl, case):
    """Every simple path from each entry node to each target node, with edges taken in id order.

    Ids are "<entry>-to-<target>", with "-<n>" added from the second path of a pair onwards.
    `reversed` is True where an edge is walked from its `to` node to its `from` node.
    """
    adj = {}
    for e in sorted(cl["edges"], key=lambda e: e["id"]):
        adj.setdefault(e["from"], []).append((e["id"], e["to"], False))
        adj.setdefault(e["to"], []).append((e["id"], e["from"], True))
    routes = {}
    for en in case["entries"]:
        for t in case["targets"]:
            found = []

            def walk(node, edges, flags, seen):
                if len(found) >= PATH_CAP:
                    return
                if node == t["node"] and edges:
                    found.append((list(edges), list(flags)))
                    return
                for eid, nxt, rev in adj.get(node, []):
                    if nxt in seen:
                        continue
                    walk(nxt, edges + [eid], flags + [rev], seen | {nxt})

            walk(en["node"], [], [], {en["node"]})
            for i, (edges, flags) in enumerate(found):
                rid = f"{en['id']}-to-{t['id']}" + (f"-{i + 1}" if i else "")
                routes[rid] = (edges, flags)
    return routes


def r9(x):
    if x is None:
        return None
    v = round(float(x), 9)
    return 0.0 if v == 0 else v


def edges_of(cl, case):
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
    return edges


def route_of(cl, case, edge_ids, reversed_flags):
    c = nm.route_costs(cl, case, edge_ids, reversed_flags)
    return {
        "edges": list(edge_ids),
        "reversed": list(reversed_flags),
        "L_mm": r9(c.L_mm),
        "theta_max_deg": r9(c.theta_max_deg),
        "theta_sum_deg": r9(c.theta_sum_deg),
        "r_min_mm": r9(c.r_min_mm),
        "heavy_crossings": c.heavy_crossings,
        "proximity_penalty": r9(c.proximity_penalty),
    }


def render_cases() -> str:
    result = {}
    for name, spec in CASES.items():
        read = lambda f: json.loads((spec["dir"] / f).read_text(encoding="utf-8"))
        case, cl = read("case.json"), read("centerlines.json")
        listed = entry_target_routes(cl, case) if spec["routes"] == "auto" else spec["routes"]
        routes = {rid: route_of(cl, case, e, r) for rid, (e, r) in listed.items()}
        result[name] = {"edges": edges_of(cl, case), "routes": routes}
    return json.dumps(result, indent=1, sort_keys=True) + "\n"


def render() -> str:
    result = {}
    for d in sorted(p for p in SYNTH.iterdir() if (p / "expected.json").is_file()):
        read = lambda f: json.loads((d / f).read_text(encoding="utf-8"))
        case, cl, exp = read("case.json"), read("centerlines.json"), read("expected.json")
        routes = {r["id"]: route_of(cl, case, r["edges"], r["reversed"]) for r in exp.get("routes", [])}
        result[d.name] = {"edges": edges_of(cl, case), "routes": routes}
    return json.dumps(result, indent=1, sort_keys=True) + "\n"


if __name__ == "__main__":
    for out, text in ((OUT, render()), (OUT_CASES, render_cases())):
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print(f"wrote {out.name}")
