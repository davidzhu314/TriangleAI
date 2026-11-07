"""Generate the synthetic centerline fixtures and their closed-form answers.

Run:  python tests/fixtures/synthetic/generate.py

Each fixture folder gets:
  case.json         minimal threadsim.case/1 metadata (spec 3.2) with risk zones
  centerlines.json  nodes + edges, millimetres, RAS axes, points ~1 mm apart
  expected.json     per-edge answers computed from closed-form formulas ONLY

The expected values never come from the measure code under test
(tests/crosscheck/numpy_measures.py). They are the source of truth
(DECISIONS.md, "Source of truth for measures").

Output is deterministic: sorted keys, floats rounded to 1e-6, LF line endings.
These are test fixtures, not app case packages (no vessels.glb).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

WINDOW_MM = 5.0  # spec 4.2: turning angles over a 5 mm window
TOL = {"mm": 0.1, "deg": 0.5}  # spec 4.9

DEG = 180.0 / math.pi


def r6(x: float) -> float:
    v = round(float(x), 6)
    return 0.0 if v == 0 else v  # no "-0.0"


def pts(seq):
    return [[r6(c) for c in p] for p in seq]


def case_json(fid, title, entries, targets, zones, vessels):
    return {
        "schema": "threadsim.case/1",
        "id": fid,
        "title": title,
        "units": "mm",
        "axes": "RAS",
        "source": {"kind": "parametric", "dataset": "threadsim-synthetic-test-fixture", "license": "own work"},
        "physics": {"available": False},
        "vessels": [{"id": v, "name": v, "kind": "artery"} for v in vessels],
        "entries": entries,
        "targets": targets,
        "riskZones": zones,
    }


def edge_expect(L, tmax, tsum, rmin, clearance, overlaps, notes=None):
    d = {
        "L_mm": r6(L),
        "theta_max_deg": r6(tmax),
        "theta_sum_deg": r6(tsum),
        "r_min_mm": r6(rmin),
        "proximity_clearance_mm": None if clearance is None else r6(clearance),
        "overlapping_zones": sorted(overlaps),
    }
    if notes:
        d["notes"] = notes
    return d


# ---------------------------------------------------------------- fixtures


def straight():
    """100 mm straight line along +S, radius tapering 12 -> 8 mm."""
    n = 100
    P = [(0.0, 0.0, float(i)) for i in range(n + 1)]
    R = [12.0 - 4.0 * i / n for i in range(n + 1)]
    zones = [{"id": "prox_self", "kind": "critical_branch", "tier": "proximity", "edge": "e0", "from_mm": 40, "to_mm": 60}]
    cl = {
        "nodes": [
            {"id": "n0", "pos": list(P[0]), "kind": "entry"},
            {"id": "n1", "pos": list(P[-1]), "kind": "target"},
        ],
        "edges": [{"id": "e0", "from": "n0", "to": "n1", "vessel": "aorta", "points": pts(P), "radii_mm": [r6(r) for r in R]}],
    }
    exp = {
        "e0": edge_expect(
            L=100.0, tmax=0.0, tsum=0.0, rmin=8.0, clearance=0.0, overlaps=["prox_self"],
            notes="Straight: L = 100; every turning angle is 0; r_min = 12 - 4 = 8; the proximity zone lies on this edge, so clearance = 0.",
        )
    }
    case = case_json("synthetic-straight", "Synthetic: straight line", [{"id": "in", "name": "Entry", "node": "n0"}],
                     [{"id": "out", "name": "Target", "node": "n1"}], zones, ["aorta"])
    return case, cl, exp


def arc90():
    """90 degree circular arc, radius 20 mm, in the R-S plane."""
    Rc = 20.0
    n = math.ceil(Rc * math.pi / 2)  # 32 segments, ~0.98 mm apart
    phis = [k * (math.pi / 2) / n for k in range(n + 1)]
    P = [(Rc * (1 - math.cos(p)), 0.0, Rc * math.sin(p)) for p in phis]
    R = [5.0 + 1.5 * math.cos(4 * p) for p in phis]  # min 3.5 at phi = pi/4 (k = 16, sampled exactly)
    cl = {
        "nodes": [
            {"id": "n0", "pos": pts([P[0]])[0], "kind": "entry"},
            {"id": "n1", "pos": pts([P[-1]])[0], "kind": "target"},
        ],
        "edges": [{"id": "e0", "from": "n0", "to": "n1", "vessel": "arch", "points": pts(P), "radii_mm": [r6(r) for r in R]}],
    }
    exp = {
        "e0": edge_expect(
            L=Rc * math.pi / 2,
            tmax=(WINDOW_MM / Rc) * DEG,
            tsum=90.0,
            rmin=3.5,
            clearance=None,
            overlaps=[],
            notes="Arc radius R = 20: L = R*pi/2; chords over w = 5 mm meet at angle w/R everywhere, so theta_max = w/R rad; total turning = 90 deg; r = 5 + 1.5 cos(4 phi) has min 3.5.",
        )
    }
    case = case_json("synthetic-arc90", "Synthetic: 90 degree arc, R = 20 mm", [{"id": "in", "name": "Entry", "node": "n0"}],
                     [{"id": "out", "name": "Target", "node": "n1"}], [], ["arch"])
    return case, cl, exp


def helix():
    """Helix radius a = 15 mm, pitch 40 mm, two turns about +S."""
    a = 15.0
    pitch = 40.0
    c = pitch / (2 * math.pi)
    turns = 2
    m = math.hypot(a, c)  # ds/dt
    T = turns * 2 * math.pi
    L = T * m
    n = math.ceil(L)
    ts = [T * k / n for k in range(n + 1)]
    P = [(a * math.cos(t), a * math.sin(t), c * t) for t in ts]
    R = [4.0] * (n + 1)

    # Angle between the chord over arc length w ending at s and the one starting at s.
    # By the helix's screw symmetry this is the same at every s. With tau = w / m:
    #   back = (a(1 - cos tau), a sin tau, c tau), fwd = (a(cos tau - 1), a sin tau, c tau)
    tau = WINDOW_MM / m
    num = a * a * (math.sin(tau) ** 2 - (1 - math.cos(tau)) ** 2) + c * c * tau * tau
    den = 2 * a * a * (1 - math.cos(tau)) + c * c * tau * tau
    theta_w = math.acos(num / den)
    kappa = a / (m * m)

    cl = {
        "nodes": [
            {"id": "n0", "pos": pts([P[0]])[0], "kind": "entry"},
            {"id": "n1", "pos": pts([P[-1]])[0], "kind": "target"},
        ],
        "edges": [{"id": "e0", "from": "n0", "to": "n1", "vessel": "coil", "points": pts(P), "radii_mm": [r6(r) for r in R]}],
    }
    exp = {
        "e0": edge_expect(
            L=L,
            tmax=theta_w * DEG,
            tsum=(L / WINDOW_MM) * theta_w * DEG,
            rmin=4.0,
            clearance=None,
            overlaps=[],
            notes=(
                "Helix a = 15, pitch 40, 2 turns: L = 2*pi*turns*sqrt(a^2 + c^2), c = pitch/(2 pi). "
                "theta_w = acos(num/den) is the exact 5 mm chord angle (constant along a helix). "
                "theta_sum = (L / w) * theta_w, the spec 4.2 sum of 5 mm-window angles. "
                f"For reference, the continuous total curvature kappa*L = {r6(kappa * L * DEG)} deg differs by "
                f"{r6(kappa * L * DEG - (L / WINDOW_MM) * theta_w * DEG)} deg: that is the window's own smoothing, not error."
            ),
        )
    }
    case = case_json("synthetic-helix", "Synthetic: helix, 2 turns", [{"id": "in", "name": "Entry", "node": "n0"}],
                     [{"id": "out", "name": "Target", "node": "n1"}], [], ["coil"])
    return case, cl, exp


def y_branch():
    """Straight trunk up +S into a junction at the origin; two straight daughters."""
    trunk_len = 60
    a1 = math.radians(30.0)  # e1 leans 30 deg toward +R
    a2 = math.radians(45.0)  # e2 leans 45 deg toward -R
    len1, len2 = 40, 50
    u1 = (math.sin(a1), 0.0, math.cos(a1))
    u2 = (-math.sin(a2), 0.0, math.cos(a2))

    P0 = [(0.0, 0.0, float(-trunk_len + i)) for i in range(trunk_len + 1)]
    P1 = [(u1[0] * i, 0.0, u1[2] * i) for i in range(len1 + 1)]
    P2 = [(u2[0] * i, 0.0, u2[2] * i) for i in range(len2 + 1)]
    R0 = [10.0] * (trunk_len + 1)
    R1 = [6.0 - 2.0 * i / len1 for i in range(len1 + 1)]
    R2 = [7.0 - 2.0 * i / len2 for i in range(len2 + 1)]

    zones = [
        {"id": "prox_e2", "kind": "critical_branch", "tier": "proximity", "edge": "e2", "from_mm": 10, "to_mm": 30},
        {"id": "heavy_e1", "kind": "plaque", "tier": "heavy", "edge": "e1", "from_mm": 5, "to_mm": 15},
    ]
    cl = {
        "nodes": [
            {"id": "n0", "pos": pts([P0[0]])[0], "kind": "entry"},
            {"id": "n1", "pos": [0.0, 0.0, 0.0], "kind": "branch"},
            {"id": "n2", "pos": pts([P1[-1]])[0], "kind": "target"},
            {"id": "n3", "pos": pts([P2[-1]])[0], "kind": "target"},
        ],
        "edges": [
            {"id": "e0", "from": "n0", "to": "n1", "vessel": "trunk", "points": pts(P0), "radii_mm": [r6(r) for r in R0]},
            {"id": "e1", "from": "n1", "to": "n2", "vessel": "right", "points": pts(P1), "radii_mm": [r6(r) for r in R1]},
            {"id": "e2", "from": "n1", "to": "n3", "vessel": "left", "points": pts(P2), "radii_mm": [r6(r) for r in R2]},
        ],
    }
    # Clearance to prox_e2 (points s*u2, s in [10, 30]):
    #  e1: angle between u1 and u2 is 75 deg (< 90), the projection 10 cos 75 = 2.59 lies on e1,
    #      so the minimum is at s = 10: 10 sin 75.
    #  e0: the trunk runs along -S from the junction; angle(u2, -S) = 135 deg (> 90), so the
    #      nearest trunk point is the junction itself: distance 10.
    #  e2: contains the zone: 0.
    between = a1 + a2
    exp = {
        "e0": edge_expect(trunk_len, 0.0, 0.0, 10.0, 10.0, [],
                          notes="Trunk: nearest point to prox_e2 is the junction; zone starts 10 mm up e2, so clearance 10."),
        "e1": edge_expect(len1, 0.0, 0.0, 4.0, 10.0 * math.sin(between), ["heavy_e1"],
                          notes="Daughter at 30 deg; angle to e2 is 75 deg, clearance = 10 sin 75 deg; r tapers 6 -> 4."),
        "e2": edge_expect(len2, 0.0, 0.0, 5.0, 0.0, ["prox_e2"],
                          notes="Daughter at 45 deg carrying the proximity zone: clearance 0; r tapers 7 -> 5."),
    }
    case = case_json(
        "synthetic-y-branch", "Synthetic: Y-branch",
        [{"id": "in", "name": "Entry", "node": "n0"}],
        [{"id": "right", "name": "Right daughter", "node": "n2"}, {"id": "left", "name": "Left daughter", "node": "n3"}],
        zones, ["trunk", "right", "left"],
    )
    return case, cl, exp


def bend():
    """Extra: 20 mm straight, 90 deg arc R = 20 mm, 20 mm straight, as one edge.

    Checks that the 5 mm window does not lose or invent turning at the
    straight-to-curve transitions, which real arches have everywhere.
    """
    Rc = 20.0
    n = math.ceil(Rc * math.pi / 2)
    P = [(0.0, 0.0, float(z)) for z in range(-20, 0)]
    P += [(Rc * (1 - math.cos(k * (math.pi / 2) / n)), 0.0, Rc * math.sin(k * (math.pi / 2) / n)) for k in range(n + 1)]
    P += [(Rc + float(x), 0.0, Rc) for x in range(1, 21)]
    R = [6.0] * len(P)
    cl = {
        "nodes": [
            {"id": "n0", "pos": pts([P[0]])[0], "kind": "entry"},
            {"id": "n1", "pos": pts([P[-1]])[0], "kind": "target"},
        ],
        "edges": [{"id": "e0", "from": "n0", "to": "n1", "vessel": "arch", "points": pts(P), "radii_mm": [r6(r) for r in R]}],
    }
    exp = {
        "e0": edge_expect(
            L=40.0 + Rc * math.pi / 2,
            tmax=(WINDOW_MM / Rc) * DEG,
            tsum=90.0,
            rmin=6.0,
            clearance=None,
            overlaps=[],
            notes="Straight-arc-straight: L = 40 + R*pi/2; the arc is longer than 2w so the peak window angle is w/R; total turning 90 deg.",
        )
    }
    case = case_json("synthetic-bend", "Synthetic: straight-arc-straight bend", [{"id": "in", "name": "Entry", "node": "n0"}],
                     [{"id": "out", "name": "Target", "node": "n1"}], [], ["arch"])
    return case, cl, exp


FIXTURES = {
    "straight": straight,
    "arc90": arc90,
    "helix": helix,
    "y-branch": y_branch,
    "bend": bend,
}


def dump(obj) -> str:
    return json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=True) + "\n"


def render() -> dict[str, str]:
    """Return {relative path: file text} for every fixture file."""
    out = {}
    for name, fn in FIXTURES.items():
        case, cl, exp = fn()
        out[f"{name}/case.json"] = dump(case)
        out[f"{name}/centerlines.json"] = dump(cl)
        out[f"{name}/expected.json"] = dump({
            "window_mm": WINDOW_MM,
            "tolerance": TOL,
            "edges": exp,
        })
    return out


def main(root: Path = HERE) -> None:
    for rel, text in render().items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print(f"wrote {p.relative_to(root)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE)
