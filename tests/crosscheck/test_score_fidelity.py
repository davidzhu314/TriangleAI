"""V5 path fidelity, NumPy vs the TypeScript scorer, on the golden drive logs.

Each golden in tests/fixtures/logs/ carries the TypeScript CaseResult. The NumPy mean tip distance
to the planned centerline must match its drive.fidelity.meanDistanceM within 0.1 mm (spec 4.9).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import numpy_measures as nm

REPO = Path(__file__).resolve().parents[2]
LOGS = REPO / "tests" / "fixtures" / "logs"
MM_IN_M = 1e-4  # 0.1 mm


def goldens():
    out = []
    for f in sorted(LOGS.glob("score-*.json")):
        g = json.loads(f.read_text(encoding="utf-8"))
        out.append((f.name, g["case"], g["log"], g["result"]))
    for f in sorted(LOGS.glob("*.result.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        log = json.loads((LOGS / r["log"]).read_text(encoding="utf-8"))["log"]
        out.append((f.name, r["case"], log, r["result"]))
    return out


GOLDENS = goldens()


def test_goldens_exist():
    assert len(GOLDENS) >= 5


@pytest.mark.parametrize("name,case_dir,log,result", GOLDENS, ids=[g[0] for g in GOLDENS])
def test_fidelity_matches_typescript(name, case_dir, log, result):
    centerlines = json.loads((REPO / case_dir / "centerlines.json").read_text(encoding="utf-8"))
    edges = {e["id"]: e for e in centerlines["edges"]}
    polylines = [nm.ras_mm_to_yup_m(edges[eid]["points"]) for eid in log["path"]]
    tips = [s["tip"] for s in log["samples"]]
    got = nm.mean_tip_distance_m(tips, polylines)
    want = result["drive"]["fidelity"]["meanDistanceM"]
    assert abs(got - want) <= MM_IN_M, (name, got, want)
    # the score follows: 0 mm -> 100, >= 10 mm -> 0
    assert result["drive"]["fidelity"]["score"] == pytest.approx(100 * (1 - min(1.0, want / 0.010)), abs=1e-9)


def test_mean_tip_distance_closed_form():
    seg = [[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]]]
    assert nm.mean_tip_distance_m([[0.5, 0.002, 0.0], [2.0, 0.0, 0.0], [-0.003, 0.004, 0.0]], seg) == pytest.approx((0.002 + 1.0 + 0.005) / 3, abs=1e-15)
