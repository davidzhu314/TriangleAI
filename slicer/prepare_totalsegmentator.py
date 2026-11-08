"""Build the inputs of the Slicer export from TotalSegmentator arterial masks (spec §3.1 "Segment" and "Tag").

Run inside 3D Slicer (no GUI needed):
    Slicer --no-main-window --no-splash --python-script slicer/prepare_totalsegmentator.py -- \
        --masks /tmp/ts-s1404 --out slicer/cases/ts-s1404-cta

Writes:
- `vessels.seg.nrrd`: one segment per ThreadSim vessel id (aorta, bca, rcca, lcca, r_subclavian,
  l_subclavian, r_iliac, l_iliac). Only mask geometry is kept. The CT image is never loaded, and NIfTI
  header text does not reach the NRRD.
- `endpoints.mrk.json`: markup points labelled `entry:<id>`, `target:<id>` or `end:<id>`. Each point is
  placed where the vessel is furthest along its own lumen from the vessel it leaves (a breadth-first
  walk through the mask's voxels). The aortic root is the aortic voxel furthest from the iliacs. A person
  can move any point in Slicer before exporting; the export script only reads the labels and positions.
  The first point (`entry:fem_r`) is unselected, which makes it the Extract Centerline source.
"""
import argparse
import collections
import os
import sys

import numpy as np
import slicer
import vtk

VESSELS = ["aorta", "bca", "rcca", "lcca", "r_subclavian", "l_subclavian", "r_iliac", "l_iliac"]
COLORS = {
    "aorta": (0.85, 0.25, 0.25), "bca": (0.9, 0.5, 0.3), "rcca": (0.95, 0.7, 0.3), "lcca": (0.95, 0.8, 0.4),
    "r_subclavian": (0.7, 0.4, 0.6), "l_subclavian": (0.6, 0.4, 0.7), "r_iliac": (0.4, 0.6, 0.85), "l_iliac": (0.4, 0.7, 0.8),
}
# label -> (vessel whose far end it marks, vessels it leaves from). The first is the source.
ENDPOINTS = [
    ("entry:fem_r", "r_iliac", ["aorta"]),
    ("entry:fem_l", "l_iliac", ["aorta"]),
    ("target:rcca", "rcca", ["bca"]),
    ("target:lcca", "lcca", ["aorta"]),
    ("end:r_subclavian", "r_subclavian", ["bca"]),
    ("end:l_subclavian", "l_subclavian", ["aorta"]),
    ("end:aortic_root", "aorta", ["r_iliac", "l_iliac"]),
]
TIP_VOXELS = 2  # the endpoint is the centroid of voxels within this many steps of the furthest one

OFFSETS = [(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1) if (i, j, k) != (0, 0, 0)]


def far_end(mask, seeds):
    """Breadth-first distance (26-connected steps) through `mask` from `seeds`; centroid of the far tip."""
    dist = np.full(mask.shape, -1, dtype=np.int32)
    q = collections.deque()
    for s in map(tuple, np.argwhere(seeds & mask)):
        dist[s] = 0
        q.append(s)
    if not q:
        raise RuntimeError("vessel does not touch its parent")
    shape = mask.shape
    while q:
        p = q.popleft()
        d = dist[p] + 1
        for o in OFFSETS:
            n = (p[0] + o[0], p[1] + o[1], p[2] + o[2])
            if 0 <= n[0] < shape[0] and 0 <= n[1] < shape[1] and 0 <= n[2] < shape[2] and mask[n] and dist[n] < 0:
                dist[n] = d
                q.append(n)
    far = dist.max()
    return np.argwhere(dist >= far - TIP_VOXELS).mean(axis=0)


def dilate(mask):
    out = mask.copy()
    for o in OFFSETS:
        out |= np.roll(mask, o, axis=(0, 1, 2))
    return out


def main(args):
    # Slicer resolves relative paths against its own working directory, so make them absolute.
    args.masks, args.out = os.path.abspath(args.masks), os.path.abspath(args.out)
    os.makedirs(args.out, exist_ok=True)
    seg = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLSegmentationNode", "vessels")
    arrays, ijk_to_ras = {}, None
    for v in VESSELS:
        label = slicer.util.loadLabelVolume(os.path.join(args.masks, v + ".nii.gz"))
        a = slicer.util.arrayFromVolume(label) > 0  # KJI order
        arrays[v] = a
        if ijk_to_ras is None:
            m = vtk.vtkMatrix4x4()
            label.GetIJKToRASMatrix(m)
            ijk_to_ras = np.array([[m.GetElement(r, c) for c in range(4)] for r in range(4)])
        before = seg.GetSegmentation().GetNumberOfSegments()
        slicer.modules.segmentations.logic().ImportLabelmapToSegmentationNode(label, seg)
        s = seg.GetSegmentation().GetNthSegment(before)
        s.SetName(v)
        s.SetColor(*COLORS[v])
        slicer.mrmlScene.RemoveNode(label)
    slicer.util.saveNode(seg, os.path.join(args.out, "vessels.seg.nrrd"))

    pts = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLMarkupsFiducialNode", "endpoints")
    for i, (label, vessel, parents) in enumerate(ENDPOINTS):
        touching = np.zeros_like(arrays[vessel])
        for p in parents:
            touching |= dilate(arrays[p])
        kji = far_end(arrays[vessel], touching)
        ras = ijk_to_ras @ np.array([kji[2], kji[1], kji[0], 1.0])
        idx = pts.AddControlPoint(vtk.vtkVector3d(*ras[:3]), label)
        pts.SetNthControlPointSelected(idx, i != 0)
        print(label, [round(float(c), 1) for c in ras[:3]])
    slicer.util.saveNode(pts, os.path.join(args.out, "endpoints.mrk.json"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--masks", required=True)
    ap.add_argument("--out", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    try:
        main(ap.parse_args(argv))
        code = 0
    except Exception:
        import traceback

        traceback.print_exc()
        code = 1
    sys.stdout.flush()
    slicer.app.exit(code)
