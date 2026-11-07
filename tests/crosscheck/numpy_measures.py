"""NumPy reference implementation of the spec 4.2 per-edge measures.

Independent of the app's TypeScript (V2). Both are tested against the
closed-form answers in tests/fixtures/synthetic/*/expected.json, then
cross-checked against each other on real anatomy within 0.1 mm and 0.5 deg.

Units: millimetres and degrees, case-file axes (RAS). The algorithm below is
the definition the TypeScript port must follow; see README.md here.

Deterministic geometry only. No AI model computes any number here.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

WINDOW_MM = 5.0
SAMPLE_STEP_MM = 0.25


# ------------------------------------------------------------ polyline basics


def _as_points(points) -> np.ndarray:
    P = np.asarray(points, dtype=np.float64)
    if P.ndim != 2 or P.shape[1] != 3:
        raise ValueError("points must be an (n, 3) array")
    return P


def cumulative_arclength(points) -> np.ndarray:
    P = _as_points(points)
    if len(P) == 0:
        return np.zeros(0)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(seg)])


def length_mm(points) -> float:
    """L = sum ||p_i - p_{i-1}||."""
    s = cumulative_arclength(points)
    return float(s[-1]) if len(s) else 0.0


def point_at(points, s) -> np.ndarray:
    """Positions at arc lengths s (clamped to [0, L]) by linear interpolation along the polyline."""
    P = _as_points(points)
    cs = cumulative_arclength(P)
    s = np.clip(np.asarray(s, dtype=np.float64), 0.0, cs[-1])
    return np.stack([np.interp(s, cs, P[:, k]) for k in range(3)], axis=-1)


def _angle_between(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    nu = np.linalg.norm(u, axis=-1)
    nv = np.linalg.norm(v, axis=-1)
    ok = (nu > 1e-12) & (nv > 1e-12)
    cos = np.ones_like(nu)
    cos[ok] = np.sum(u[ok] * v[ok], axis=-1) / (nu[ok] * nv[ok])
    # atan2 form is better conditioned than arccos near 0 and pi
    cross = np.zeros_like(nu)
    cross[ok] = np.linalg.norm(np.cross(u[ok], v[ok]), axis=-1) / (nu[ok] * nv[ok])
    return np.arctan2(cross, np.clip(cos, -1.0, 1.0))


# ------------------------------------------------------------ turning


def windowed_turning(points, window_mm: float = WINDOW_MM, step_mm: float = SAMPLE_STEP_MM, extra_s=()):
    """Turning angle over a sliding window, as a function of arc length.

    theta_w(s) = angle between chord p(s) - p(s - w) and chord p(s + w) - p(s),
    for s in [w, L - w], sampled every <= step_mm. If L < 2w the window shrinks
    to w = L/2 and there is one sample at s = L/2.

    extra_s: additional arc lengths to sample (route junctions); those strictly
    inside (w, L - w) are merged into the grid. Per-edge measures pass none.

    Returns (s, theta_rad, w_used).
    """
    P = _as_points(points)
    L = length_mm(P)
    if len(P) < 3 or L <= 1e-9:
        return np.zeros(0), np.zeros(0), 0.0
    w = min(window_mm, L / 2.0)
    span = L - 2.0 * w
    n = max(1, int(np.ceil(span / step_mm - 1e-9)))
    s = np.linspace(w, L - w, n + 1)
    extra = np.asarray([x for x in extra_s if w < x < L - w], dtype=np.float64)
    if len(extra):
        s = np.unique(np.concatenate([s, extra]))
    a = point_at(P, s - w)
    b = point_at(P, s)
    c = point_at(P, s + w)
    return s, _angle_between(b - a, c - b), w


def turning_measures(points, window_mm: float = WINDOW_MM, step_mm: float = SAMPLE_STEP_MM, extra_s=()):
    """(theta_max_deg, theta_sum_deg) over the 5 mm window.

    Theta_max = max_s theta_w(s).
    Theta_sum = sum of window angles over consecutive w-long windows along the
    edge, taken as the continuous average  (1/w) * integral theta_w(s) ds  over
    [w, L - w]  (trapezoid rule), plus theta_w(w) + theta_w(L - w) for the two
    end windows, where theta_w is held constant. On an arc this is exactly L/R.
    """
    s, th, w = windowed_turning(points, window_mm, step_mm, extra_s)
    if len(th) == 0:
        return 0.0, 0.0
    total = th[0] + th[-1]
    if len(s) > 1:
        total += np.trapezoid(th, s) / w
    return float(np.degrees(th.max())), float(np.degrees(total))


# ------------------------------------------------------------ radius


def r_min_mm(radii_mm) -> float:
    r = np.asarray(radii_mm, dtype=np.float64)
    return float(r.min())


# ------------------------------------------------------------ risk zones


def sub_polyline(points, from_mm: float, to_mm: float) -> np.ndarray:
    """The part of a polyline between arc lengths from_mm and to_mm (clamped, ordered)."""
    P = _as_points(points)
    cs = cumulative_arclength(P)
    lo, hi = sorted((float(from_mm), float(to_mm)))
    lo = min(max(lo, 0.0), cs[-1])
    hi = min(max(hi, 0.0), cs[-1])
    inner = P[(cs > lo) & (cs < hi)]
    return np.vstack([point_at(P, lo)[None], inner, point_at(P, hi)[None]])


def _segment_distances(A0, A1, B0, B1) -> np.ndarray:
    """Exact minimum distance between every segment pair (A0[i],A1[i]) x (B0[j],B1[j])."""
    d1 = (A1 - A0)[:, None, :]
    d2 = (B1 - B0)[None, :, :]
    r = A0[:, None, :] - B0[None, :, :]
    a = np.sum(d1 * d1, -1)
    e = np.sum(d2 * d2, -1)
    f = np.sum(d2 * r, -1)
    c = np.sum(d1 * r, -1)
    b = np.sum(d1 * d2, -1)
    a, e, b = np.broadcast_to(a, f.shape), np.broadcast_to(e, f.shape), b
    eps = 1e-12
    denom = a * e - b * b

    safe_a = np.where(a > eps, a, 1.0)
    s = np.where(denom > eps, np.clip((b * f - c * e) / np.where(denom > eps, denom, 1.0), 0.0, 1.0), 0.0)
    # B segment is a point: nearest point on A to it
    s = np.where(e > eps, s, np.clip(-c / safe_a, 0.0, 1.0))
    t = np.where(e > eps, (b * s + f) / np.where(e > eps, e, 1.0), 0.0)

    # t outside [0, 1]: clamp and recompute s
    t_lo = t < 0.0
    t_hi = t > 1.0
    t = np.clip(t, 0.0, 1.0)
    s = np.where(t_lo, np.clip(-c / safe_a, 0.0, 1.0), s)
    s = np.where(t_hi, np.clip((b - c) / safe_a, 0.0, 1.0), s)
    s = np.where(a > eps, s, 0.0)

    pa = A0[:, None, :] + d1 * s[..., None]
    pb = B0[None, :, :] + d2 * t[..., None]
    return np.linalg.norm(pa - pb, axis=-1)


def polyline_distance(P, Q) -> float:
    """Minimum Euclidean distance between two polylines (exact, segment to segment)."""
    P = _as_points(P)
    Q = _as_points(Q)
    if len(P) == 1:
        P = np.vstack([P, P])
    if len(Q) == 1:
        Q = np.vstack([Q, Q])
    return float(_segment_distances(P[:-1], P[1:], Q[:-1], Q[1:]).min())


def overlapping_zones(edge_id: str, edge_length_mm: float, zones) -> list[str]:
    """Risk zones (any tier) lying on this edge with a non-empty overlap of [0, L]."""
    out = []
    for z in zones:
        if z.get("edge") != edge_id:
            continue
        lo, hi = sorted((float(z["from_mm"]), float(z["to_mm"])))
        if hi >= 0.0 and lo <= edge_length_mm:
            out.append(z["id"])
    return sorted(out)


def proximity_clearance_mm(edge_points, zones, edges_by_id) -> float | None:
    """Minimum distance from this edge's centerline to any proximity-tier zone.

    A zone's geometry is its own edge's centerline between from_mm and to_mm.
    Distance is centerline to centerline (no radius subtracted). None if the
    case has no proximity zones.
    """
    best = None
    for z in zones:
        if z.get("tier") != "proximity":
            continue
        zedge = edges_by_id[z["edge"]]
        zone_line = sub_polyline(zedge["points"], z["from_mm"], z["to_mm"])
        d = polyline_distance(edge_points, zone_line)
        best = d if best is None else min(best, d)
    return best


# ------------------------------------------------------------ per edge


@dataclass
class EdgeMeasures:
    edge_id: str
    L_mm: float
    theta_max_deg: float
    theta_sum_deg: float
    r_min_mm: float
    proximity_clearance_mm: float | None
    overlapping_zones: list[str] = field(default_factory=list)


def measure_edge(edge: dict, zones, edges_by_id) -> EdgeMeasures:
    P = _as_points(edge["points"])
    r = np.asarray(edge["radii_mm"], dtype=np.float64)
    if len(r) != len(P):
        raise ValueError(f"edge {edge['id']}: points and radii_mm differ in length")
    L = length_mm(P)
    tmax, tsum = turning_measures(P)
    return EdgeMeasures(
        edge_id=edge["id"],
        L_mm=L,
        theta_max_deg=tmax,
        theta_sum_deg=tsum,
        r_min_mm=r_min_mm(r),
        proximity_clearance_mm=proximity_clearance_mm(P, zones, edges_by_id),
        overlapping_zones=overlapping_zones(edge["id"], L, zones),
    )


def measure_case(centerlines: dict, case: dict) -> dict[str, EdgeMeasures]:
    """Measure every edge of a threadsim.case/1 centerlines.json (mm, RAS)."""
    edges_by_id = {e["id"]: e for e in centerlines["edges"]}
    zones = case.get("riskZones", [])
    return {eid: measure_edge(e, zones, edges_by_id) for eid, e in edges_by_id.items()}


# ------------------------------------------------------------ routes


JOIN_EPS_MM = 1e-6


def join_route(polylines, reversed_flags):
    """Join a route's edges, each walked forward or backward, into one polyline.

    Each edge is reversed when its flag is set. A shared junction point (gap at
    most JOIN_EPS_MM) appears once; a larger gap is kept as a straight connecting
    segment. Returns (points, junction_s): junction_s is the arc length, along the
    joined polyline, of the start of every edge after the first.
    """
    if len(polylines) != len(reversed_flags):
        raise ValueError("one reversed flag per edge")
    parts = []
    for P, rev in zip(polylines, reversed_flags):
        P = _as_points(P)
        parts.append(P[::-1] if rev else P)
    out = [parts[0]]
    starts = []
    for P in parts[1:]:
        prev_end = out[-1][-1]
        joined_len = length_mm(np.vstack(out))
        if np.linalg.norm(P[0] - prev_end) <= JOIN_EPS_MM:
            P = P[1:]
            starts.append(joined_len)
        else:
            starts.append(joined_len + float(np.linalg.norm(P[0] - prev_end)))
        out.append(P)
    return np.vstack(out), starts


def route_turning_measures(polylines, reversed_flags, window_mm: float = WINDOW_MM, step_mm: float = SAMPLE_STEP_MM):
    """Route-level (theta_max_deg, theta_sum_deg).

    The same 5 mm-window algorithm as the per-edge measures, run on the joined
    route polyline, so windows span branch points. Junction arc lengths are added
    to the sample grid, which makes a corner's peak exact wherever the grid falls.
    """
    P, starts = join_route(polylines, reversed_flags)
    return turning_measures(P, window_mm, step_mm, extra_s=starts)


def route_length_mm(polylines, reversed_flags) -> float:
    return length_mm(join_route(polylines, reversed_flags)[0])


PROXIMITY_SCALE_MM = 10.0  # spec 4.6


@dataclass
class RouteCosts:
    L_mm: float
    theta_max_deg: float
    theta_sum_deg: float
    r_min_mm: float
    heavy_crossings: int
    proximity_penalty: float


def route_costs(centerlines: dict, case: dict, edge_ids, reversed_flags) -> RouteCosts:
    """Route-level geometric costs (spec 4.6), independent of any preset.

    heavy_crossings: distinct heavy-tier zones lying on a route edge (overlapping it).
    proximity_penalty: sum over proximity-tier zones of max(0, 1 - clearance / 10 mm), where the
    clearance is measured from the whole joined route polyline to the zone.
    """
    by_id = {e["id"]: e for e in centerlines["edges"]}
    zones = case.get("riskZones", [])
    polys = [by_id[e]["points"] for e in edge_ids]
    joined, starts = join_route(polys, reversed_flags)
    tmax, tsum = turning_measures(joined, extra_s=starts)
    r_min = min(r_min_mm(by_id[e]["radii_mm"]) for e in edge_ids)
    heavy = set()
    for e in edge_ids:
        L = length_mm(by_id[e]["points"])
        for zid in overlapping_zones(e, L, [z for z in zones if z.get("tier") == "heavy"]):
            heavy.add(zid)
    penalty = 0.0
    for z in zones:
        if z.get("tier") != "proximity":
            continue
        line = sub_polyline(by_id[z["edge"]]["points"], z["from_mm"], z["to_mm"])
        penalty += max(0.0, 1.0 - polyline_distance(joined, line) / PROXIMITY_SCALE_MM)
    return RouteCosts(length_mm(joined), tmax, tsum, r_min, len(heavy), penalty)
