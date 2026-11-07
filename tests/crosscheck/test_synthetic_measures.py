"""NumPy measures vs closed-form answers on the synthetic fixtures.

The closed-form values in expected.json are the truth (DECISIONS.md).
Tolerances are spec 4.9: 0.1 mm and 0.5 deg. Never loosen them without a
DECISIONS.md line.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest

import numpy_measures as nm

REPO = Path(__file__).resolve().parents[2]
SYNTH = REPO / "tests" / "fixtures" / "synthetic"
REQUIRED = ["straight", "arc90", "helix", "y-branch"]
FIXTURES = sorted(p.name for p in SYNTH.iterdir() if (p / "expected.json").is_file())

MM = 0.1
DEG = 0.5


def load(name):
    d = SYNTH / name
    read = lambda f: json.loads((d / f).read_text(encoding="utf-8"))
    return read("case.json"), read("centerlines.json"), read("expected.json")


def test_required_fixtures_exist():
    for name in REQUIRED:
        assert name in FIXTURES, f"missing synthetic fixture {name}"


def test_fixtures_are_regenerated_byte_for_byte(tmp_path):
    """Committed fixtures equal a fresh run of generate.py (deterministic output)."""
    spec = importlib.util.spec_from_file_location("synthetic_generate", SYNTH / "generate.py")
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)
    for rel, text in gen.render().items():
        committed = (SYNTH / rel).read_bytes()
        assert committed == text.encode("utf-8"), f"{rel} is stale: run python tests/fixtures/synthetic/generate.py"


def test_tolerances_match_spec():
    for name in FIXTURES:
        _, _, exp = load(name)
        assert exp["tolerance"] == {"mm": MM, "deg": DEG}
        assert exp["window_mm"] == nm.WINDOW_MM


def cases():
    for name in FIXTURES:
        _, _, exp = load(name)
        for eid in sorted(exp["edges"]):
            yield pytest.param(name, eid, id=f"{name}:{eid}")


@pytest.fixture(scope="module")
def measured():
    out = {}
    for name in FIXTURES:
        case, cl, _ = load(name)
        out[name] = nm.measure_case(cl, case)
    return out


@pytest.mark.parametrize("name,eid", list(cases()))
def test_length(measured, name, eid):
    want = load(name)[2]["edges"][eid]["L_mm"]
    assert measured[name][eid].L_mm == pytest.approx(want, abs=MM)


@pytest.mark.parametrize("name,eid", list(cases()))
def test_theta_max(measured, name, eid):
    want = load(name)[2]["edges"][eid]["theta_max_deg"]
    assert measured[name][eid].theta_max_deg == pytest.approx(want, abs=DEG)


@pytest.mark.parametrize("name,eid", list(cases()))
def test_theta_sum(measured, name, eid):
    want = load(name)[2]["edges"][eid]["theta_sum_deg"]
    assert measured[name][eid].theta_sum_deg == pytest.approx(want, abs=DEG)


@pytest.mark.parametrize("name,eid", list(cases()))
def test_r_min(measured, name, eid):
    want = load(name)[2]["edges"][eid]["r_min_mm"]
    assert measured[name][eid].r_min_mm == pytest.approx(want, abs=MM)


@pytest.mark.parametrize("name,eid", list(cases()))
def test_proximity_clearance(measured, name, eid):
    want = load(name)[2]["edges"][eid]["proximity_clearance_mm"]
    got = measured[name][eid].proximity_clearance_mm
    if want is None:
        assert got is None
    else:
        assert got == pytest.approx(want, abs=MM)


@pytest.mark.parametrize("name,eid", list(cases()))
def test_overlapping_zones(measured, name, eid):
    want = load(name)[2]["edges"][eid]["overlapping_zones"]
    assert measured[name][eid].overlapping_zones == want


# ---------------------------------------------------------------- properties


@pytest.mark.parametrize("name,eid", list(cases()))
def test_reversal_invariance(name, eid):
    """Walking an edge backwards changes no measure."""
    case, cl, _ = load(name)
    edge = next(e for e in cl["edges"] if e["id"] == eid)
    P = np.asarray(edge["points"])
    fwd = nm.turning_measures(P)
    bwd = nm.turning_measures(P[::-1])
    assert nm.length_mm(P[::-1]) == pytest.approx(nm.length_mm(P), abs=1e-9)
    assert bwd[0] == pytest.approx(fwd[0], abs=1e-6)
    assert bwd[1] == pytest.approx(fwd[1], abs=1e-6)


def test_window_suppresses_single_point_noise():
    """A 0.3 mm kink at one 1 mm sample must not read as a sharp turn."""
    P = np.array([[0.0, 0.0, float(z)] for z in range(101)])
    P[50, 0] = 0.3
    raw = np.degrees(nm._angle_between(P[50] - P[49], P[51] - P[50]))
    tmax, _ = nm.turning_measures(P)
    assert raw > 30.0
    assert tmax < 7.0


def test_short_edge_uses_half_length_window():
    """L < 2w: window shrinks to L/2 and an arc still totals L/R."""
    R = 20.0
    phi = 6.0 / R  # 6 mm of arc
    t = np.linspace(0, phi, 7)
    P = np.stack([R * (1 - np.cos(t)), np.zeros_like(t), R * np.sin(t)], 1)
    tmax, tsum = nm.turning_measures(P)
    assert tsum == pytest.approx(np.degrees(phi), abs=DEG)
    assert tmax == pytest.approx(np.degrees(3.0 / R), abs=DEG)


def test_degenerate_edges():
    assert nm.turning_measures([[0, 0, 0], [0, 0, 1]]) == (0.0, 0.0)
    assert nm.turning_measures([[0, 0, 0], [0, 0, 0], [0, 0, 0]]) == (0.0, 0.0)


def test_polyline_distance_matches_dense_sampling():
    rng = np.random.default_rng(20261107)
    for _ in range(200):
        P = rng.normal(size=(rng.integers(2, 6), 3)) * 10
        Q = rng.normal(size=(rng.integers(2, 6), 3)) * 10
        exact = nm.polyline_distance(P, Q)
        dense = lambda X: nm.point_at(X, np.linspace(0, nm.length_mm(X), 400))
        brute = np.min(np.linalg.norm(dense(P)[:, None] - dense(Q)[None], axis=-1))
        assert exact <= brute + 1e-9
        assert brute - exact < 0.5  # sampling resolution bound on these sizes


def test_polyline_distance_point_segments():
    assert nm.polyline_distance([[0, 0, 0]], [[3, 4, 0]]) == pytest.approx(5.0)
    assert nm.polyline_distance([[0, 0, 0], [10, 0, 0]], [[5, 2, 0]]) == pytest.approx(2.0)
    assert nm.polyline_distance([[5, 2, 0]], [[0, 0, 0], [10, 0, 0]]) == pytest.approx(2.0)
    # parallel segments
    assert nm.polyline_distance([[0, 0, 0], [10, 0, 0]], [[2, 7, 0], [8, 7, 0]]) == pytest.approx(7.0)


# ---------------------------------------------------------------- routes


def route_cases():
    for name in FIXTURES:
        _, _, exp = load(name)
        for r in exp.get("routes", []):
            yield pytest.param(name, r["id"], id=f"{name}:{r['id']}")


def run_route(name, rid):
    _, cl, exp = load(name)
    r = next(x for x in exp["routes"] if x["id"] == rid)
    by_id = {e["id"]: e for e in cl["edges"]}
    polys = [by_id[e]["points"] for e in r["edges"]]
    tmax, tsum = nm.route_turning_measures(polys, r["reversed"])
    return r, nm.route_length_mm(polys, r["reversed"]), tmax, tsum


def test_junction_fixture_has_routes():
    assert "junction" in FIXTURES
    assert any(r["junction_deg"] == [120.0] for r in load("junction")[2]["routes"])


@pytest.mark.parametrize("name,rid", list(route_cases()))
def test_route_measures(name, rid):
    r, L, tmax, tsum = run_route(name, rid)
    assert L == pytest.approx(r["L_mm"], abs=MM)
    assert tmax == pytest.approx(r["theta_max_deg"], abs=DEG)
    assert tsum == pytest.approx(r["theta_sum_deg"], abs=DEG)


@pytest.mark.parametrize("step", [0.25, 0.3, 0.37, 0.5])
def test_route_corner_peak_is_grid_independent(step):
    """With the junction sampled, the 120 deg corner reads 120 deg for any grid step."""
    _, cl, _ = load("junction")
    by_id = {e["id"]: e for e in cl["edges"]}
    tmax, tsum = nm.route_turning_measures([by_id["e0"]["points"], by_id["e1"]["points"]], [False, False], step_mm=step)
    assert tmax == pytest.approx(120.0, abs=1e-6)
    assert tsum == pytest.approx(120.0, abs=DEG)


def test_route_of_one_edge_equals_edge_measures():
    for name in FIXTURES:
        _, cl, _ = load(name)
        for e in cl["edges"]:
            assert nm.route_turning_measures([e["points"]], [False]) == nm.turning_measures(e["points"])


def test_join_route_gap_becomes_segment():
    P, starts = nm.join_route([[[0, 0, 0], [0, 0, 10]], [[0, 1, 10], [0, 1, 20]]], [False, False])
    assert len(P) == 4
    assert starts == [pytest.approx(11.0)]
    assert nm.length_mm(P) == pytest.approx(21.0)


def test_numpy_dump_is_current():
    """numpy-synthetic.json (read by the TypeScript tests) matches a fresh NumPy run."""
    import dump_numpy

    assert dump_numpy.OUT.read_text(encoding="utf-8") == dump_numpy.render(), "run python tests/crosscheck/dump_numpy.py"
