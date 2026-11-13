"""Transapical planner geometry for a real CT case: `apex.json` beside the case's `case.json`.

Run inside 3D Slicer (no GUI needed):
    Slicer --no-main-window --no-splash --python-script slicer/export_apex.py -- \
        --masks /tmp/ts-s1404-apex --landmarks slicer/cases/ts-s1404-cta/apex-landmarks.mrk.json \
        --out client/public/cases/ts-s1404-cta/apex.json

Inputs:
- `--masks`: the subject's heart, rib, costal cartilage, sternum and lung masks
  (`slicer/fetch_totalsegmentator.py <subject> <dir> --apex`).
- `--landmarks`: four hand-marked points (`slicer/mark_apex.py`): `hinge:1`, `hinge:2`, `hinge:3` (the lowest points
  of the three aortic cusps, which define the valve plane) and `apex` (the left ventricle's apex). A person marks
  these on the CT: this dataset labels the heart as one piece, so neither the valve plane nor the true apex can be
  found from the masks alone (DECISIONS.md, 2026-11-12).

Geometry, all in RAS millimetres:
- valve centre = mean of the three hinges; valve axis = the hinge plane's normal, pointing into the ventricle.
- candidates = heart-surface points within CANDIDATE_RADIUS_MM of the marked apex that face outward (a sheath from
  there to the valve leaves the heart straight away), thinned to one per GRID_MM cube.
- per candidate, the sheath line runs from the candidate to the valve centre:
  - coaxial_deg: angle between that line and the valve axis (0 = perfectly coaxial);
  - from_apex_mm, to_valve_mm;
  - outward, the same line beyond the candidate: wall_depth_mm to where it leaves the rib cage (the convex hull of the
    ribs, costal cartilages and sternum), lung_mm of lung it crosses on the way, bone_clearance_mm (closest approach
    to any bone, up to 5 mm past the hull), the nearest bone's name, and the intercostal space it leaves through when
    the two nearest left ribs are consecutive (space k lies between ribs k and k + 1).
Nothing about the coronary arteries, the myocardium's thickness or the skin is measured: the dataset has none of them.
"""
import argparse
import json
import os
import sys

import numpy as np
import slicer
import vtk
from scipy.spatial import Delaunay, cKDTree

SCHEMA = "threadsim.apex/1"
CANDIDATE_RADIUS_MM = 30.0
GRID_MM = 3.0
STEP_MM = 0.5
MAX_OUT_MM = 150.0
PAST_HULL_MM = 5.0
LUNGS = ["lung_upper_lobe_left", "lung_lower_lobe_left", "lung_upper_lobe_right", "lung_middle_lobe_right", "lung_lower_lobe_right"]
BONES = [f"rib_{side}_{i}" for side in ("left", "right") for i in range(1, 13)] + ["costal_cartilages", "sternum"]
LABELS = ["hinge:1", "hinge:2", "hinge:3", "apex"]


class Mask:
    """A NIfTI mask as a boolean array (K, J, I as Slicer stores it) with its IJK<->RAS maps."""

    def __init__(self, path):
        node = slicer.util.loadLabelVolume(path)
        self.array = slicer.util.arrayFromVolume(node) > 0
        mat = vtk.vtkMatrix4x4()
        node.GetIJKToRASMatrix(mat)
        m = vtk_to_np(mat)
        self.ijk_to_ras = m
        self.ras_to_ijk = np.linalg.inv(m)
        slicer.mrmlScene.RemoveNode(node)

    def points(self, where=None):
        kji = np.argwhere(self.array if where is None else where)
        ijk = kji[:, ::-1]
        return (self.ijk_to_ras @ np.c_[ijk, np.ones(len(ijk))].T).T[:, :3]

    def contains(self, p):
        i, j, k = np.round(self.ras_to_ijk @ np.r_[p, 1.0])[:3].astype(int)
        a = self.array
        return 0 <= k < a.shape[0] and 0 <= j < a.shape[1] and 0 <= i < a.shape[2] and bool(a[k, j, i])


def vtk_to_np(m):
    return np.array([[m.GetElement(r, c) for c in range(4)] for r in range(4)])


def unit(v):
    return v / np.linalg.norm(v)


def read_landmarks(path):
    node = slicer.util.loadMarkups(path)
    out = {}
    for i in range(node.GetNumberOfControlPoints()):
        if node.GetNthControlPointPositionStatus(i) != node.PositionDefined:
            continue
        p = [0.0, 0.0, 0.0]
        node.GetNthControlPointPositionWorld(i, p)
        out[node.GetNthControlPointLabel(i)] = np.array(p)
    missing = [k for k in LABELS if k not in out]
    if missing:
        raise SystemExit(f"landmarks missing: {', '.join(missing)} (mark them with slicer/mark_apex.py)")
    # A point described "draft" was placed by a script to exercise the pipeline, not by a person on the CT.
    draft = any(node.GetNthControlPointDescription(i).strip().lower() == "draft" for i in range(node.GetNumberOfControlPoints()))
    slicer.mrmlScene.RemoveNode(node)
    return out, draft


def surface(mask):
    a = mask.array
    inner = a.copy()
    for axis in range(3):
        for shift in (1, -1):
            inner &= np.roll(a, shift, axis=axis)
    return mask.points(a & ~inner)


def bone_name(key):
    if key.startswith("rib_"):
        _, side, i = key.split("_")
        return f"{side.capitalize()} rib {i}"
    return {"costal_cartilages": "Costal cartilage", "sternum": "Sternum"}[key]


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--masks", required=True)
    ap.add_argument("--landmarks", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    marks, draft = read_landmarks(args.landmarks)
    hinges = [marks["hinge:1"], marks["hinge:2"], marks["hinge:3"]]
    centre = np.mean(hinges, axis=0)
    axis = unit(np.cross(hinges[1] - hinges[0], hinges[2] - hinges[0]))
    apex = marks["apex"]
    if np.dot(apex - centre, axis) < 0:
        axis = -axis

    heart = Mask(os.path.join(args.masks, "heart.nii.gz"))
    lungs = None
    for name in LUNGS:
        path = os.path.join(args.masks, f"{name}.nii.gz")
        if not os.path.exists(path):
            continue
        m = Mask(path)
        if lungs is None:
            lungs = m
        else:
            lungs.array |= m.array
    bones = {}
    for name in BONES:
        path = os.path.join(args.masks, f"{name}.nii.gz")
        if os.path.exists(path):
            pts = Mask(path).points()
            if len(pts):
                bones[name] = cKDTree(pts)
    all_bone = np.vstack([t.data for t in bones.values()])
    hull = Delaunay(all_bone[:: max(1, len(all_bone) // 20000)])
    bone_tree = cKDTree(all_bone)
    left_ribs = {k: t for k, t in bones.items() if k.startswith("rib_left_")}

    surf = surface(heart)
    near = surf[np.linalg.norm(surf - apex, axis=1) <= CANDIDATE_RADIUS_MM]
    seen = {}
    for p in near:
        seen.setdefault(tuple(np.floor(p / GRID_MM).astype(int)), p)

    candidates = []
    for p in sorted(seen.values(), key=lambda q: tuple(np.round(q, 3))):
        to_valve = centre - p
        d = unit(to_valve)
        out = -d
        if heart.contains(p + 3.0 * out):
            continue  # the line from here to the valve runs along the heart's surface, not into it
        t, lung_mm, inside_hull = 0.0, 0.0, True
        while t < MAX_OUT_MM:
            q = p + t * out
            if hull.find_simplex(q) < 0:
                inside_hull = False
                break
            if lungs is not None and lungs.contains(q):
                lung_mm += STEP_MM
            t += STEP_MM
        exit_pt = p + t * out
        ray = [p + s * out for s in np.arange(0.0, t + PAST_HULL_MM, STEP_MM)]
        dists = bone_tree.query(np.array(ray))[0]
        nearest_idx = bone_tree.query(ray[int(np.argmin(dists))])[1]
        nearest_xyz = all_bone[nearest_idx]
        nearest = min(bones, key=lambda k: bones[k].query(nearest_xyz)[0])
        ics = None
        if left_ribs:
            two = sorted((left_ribs[k].query(exit_pt)[0], int(k.rsplit("_", 1)[1])) for k in left_ribs)[:2]
            lo, hi = sorted(n for _, n in two)
            if hi == lo + 1:
                ics = lo
        candidates.append({
            "pos": [round(float(x), 2) for x in p],
            "coaxial_deg": round(float(np.degrees(np.arccos(np.clip(np.dot(d, -axis), -1.0, 1.0)))), 1),
            "from_apex_mm": round(float(np.linalg.norm(p - apex)), 1),
            "to_valve_mm": round(float(np.linalg.norm(to_valve)), 1),
            "wall_depth_mm": round(float(t), 1) if not inside_hull else None,
            "lung_mm": round(float(lung_mm), 1),
            "bone_clearance_mm": round(float(dists.min()), 1),
            "nearest_bone": bone_name(nearest),
            "ics": ics,
        })
    for i, c in enumerate(candidates):
        c["id"] = f"c{i + 1:03d}"

    doc = {
        "schema": SCHEMA,
        "units": "mm",
        "axes": "RAS",
        "landmarks": "draft" if draft else "hand-marked",
        "valve": {"center": [round(float(x), 2) for x in centre], "axis": [round(float(x), 4) for x in axis], "hinges": [[round(float(x), 2) for x in h] for h in hinges]},
        "apex": [round(float(x), 2) for x in apex],
        "candidate_radius_mm": CANDIDATE_RADIUS_MM,
        "candidates": candidates,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(doc, f, indent=1)
        f.write("\n")
    print(f"wrote {args.out}: {len(candidates)} candidates, landmarks {doc['landmarks']}")


try:
    main(sys.argv[1:])
except SystemExit as e:
    if e.code not in (0, None):
        print(e, file=sys.stderr)
    slicer.app.exit(0 if e.code in (0, None) else 1)
except Exception:
    import traceback

    traceback.print_exc()
    slicer.app.exit(1)
else:
    slicer.app.exit(0)
