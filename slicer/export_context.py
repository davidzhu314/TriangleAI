"""Body context for a real CT case: one faint `context.glb` with the same subject's bones and heart.

Run inside 3D Slicer (no GUI needed), in two steps like the vessels:
    # 1. Masks -> context.seg.nrrd (committed): two segments, "bone" (vertebrae C7-L5, ribs 1-12, sternum) and "heart".
    Slicer --no-main-window --no-splash --python-script slicer/export_context.py -- \\
        --masks /tmp/ts-s1404-context --segmentation slicer/cases/ts-s1404-cta/context.seg.nrrd
    # 2. context.seg.nrrd -> context.glb, next to the case's vessels.glb.
    Slicer --no-main-window --no-splash --python-script slicer/export_context.py -- \\
        --segmentation slicer/cases/ts-s1404-cta/context.seg.nrrd --out client/public/cases/ts-s1404-cta/context.glb

The masks come from `fetch_totalsegmentator.py <subject> <dir> --context` (same TotalSegmentator subject, CC BY 4.0).
The GLB is in millimetres and RAS, the frame of `vessels.glb`, so the case's `mesh.toWorld` places both. Nodes are
named "bone" and "heart", with extras {kind: "context", label}. It is background only: the case package, the loader,
the validator and the engine never read it (DECISIONS.md 2026-11-08). Never hand-edit the output.
"""
import argparse
import os
import sys

import numpy as np
import slicer
import vtk

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_case import write_glb  # noqa: E402  (same GLB layout as vessels.glb)
from fetch_totalsegmentator import CONTEXT  # noqa: E402

SEGMENTS = {"bone": [c for c in CONTEXT if c != "heart"], "heart": ["heart"]}
LABELS = {"bone": "Bones", "heart": "Heart"}
COLORS = {"bone": (0.85, 0.82, 0.75), "heart": (0.75, 0.35, 0.35)}  # Slicer display only; the app colours by token
# Faint background, not anatomy to study: smooth, then decimate hard. About 30 bytes per triangle in the GLB.
TRIANGLES = {"bone": 34_000, "heart": 8_000}
SMOOTHING = "0.8"


def build_segmentation(masks, out):
    """Union each group's masks into one segment; only mask geometry is kept (no CT image, no NIfTI header text)."""
    groups, ref = {}, None
    for name, classes in SEGMENTS.items():
        acc = None
        for cls in classes:
            path = os.path.join(masks, cls + ".nii.gz")
            if not os.path.exists(path):
                continue
            label = slicer.util.loadLabelVolume(path)
            a = slicer.util.arrayFromVolume(label) > 0
            if ref is None:
                ref = label
            else:
                slicer.mrmlScene.RemoveNode(label)
            acc = a if acc is None else acc | a
        if acc is not None and acc.any():
            groups[name] = acc
    seg = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLSegmentationNode", "context")
    for name, a in groups.items():
        vol = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLLabelMapVolumeNode", name)
        vol.CopyOrientation(ref)
        slicer.util.updateVolumeFromArray(vol, a.astype(np.uint8))
        before = seg.GetSegmentation().GetNumberOfSegments()
        slicer.modules.segmentations.logic().ImportLabelmapToSegmentationNode(vol, seg)
        s = seg.GetSegmentation().GetNthSegment(before)
        s.SetName(name)
        s.SetColor(*COLORS[name])
        slicer.mrmlScene.RemoveNode(vol)
    slicer.util.saveNode(seg, out)
    print("SEGMENTATION", out, sorted(groups))


def mesh(poly, target):
    tri = vtk.vtkTriangleFilter()
    tri.SetInputData(poly)
    tri.Update()
    n = tri.GetOutput().GetNumberOfPolys()
    src = tri
    if n > target:
        dec = vtk.vtkQuadricDecimation()
        dec.SetInputConnection(tri.GetOutputPort())
        dec.SetTargetReduction(1.0 - target / n)
        dec.VolumePreservationOn()
        src = dec
    nrm = vtk.vtkPolyDataNormals()
    nrm.SetInputConnection(src.GetOutputPort())
    nrm.SplittingOff()
    nrm.ConsistencyOn()
    nrm.AutoOrientNormalsOn()
    nrm.ComputePointNormalsOn()
    nrm.Update()
    out = nrm.GetOutput()
    pts = np.array([out.GetPoint(i) for i in range(out.GetNumberOfPoints())], dtype=np.float32)
    nr = out.GetPointData().GetNormals()
    nrms = np.array([nr.GetTuple3(i) for i in range(out.GetNumberOfPoints())], dtype=np.float32)
    idx = []
    for c in range(out.GetNumberOfCells()):
        ids = out.GetCell(c).GetPointIds()
        if ids.GetNumberOfIds() == 3:
            idx.extend(ids.GetId(k) for k in range(3))
    return pts, nrms, np.array(idx, dtype=np.uint32)


def export(segmentation, out):
    seg = slicer.util.loadSegmentation(segmentation)
    seg.GetSegmentation().SetConversionParameter("Smoothing factor", SMOOTHING)
    seg.CreateClosedSurfaceRepresentation()
    meshes = []
    for name in SEGMENTS:
        sid = seg.GetSegmentation().GetSegmentIdBySegmentName(name)
        if not sid:
            continue
        poly = vtk.vtkPolyData()
        seg.GetClosedSurfaceRepresentation(sid, poly)
        pts, nrms, idx = mesh(poly, TRIANGLES[name])
        meshes.append((name, pts, nrms, idx))
    extras = {name: {"kind": "context", "label": LABELS[name]} for name in SEGMENTS}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_glb(meshes, out, extras)
    print("EXPORTED", out, os.path.getsize(out), "bytes", [(m[0], len(m[3]) // 3) for m in meshes])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--masks")
    ap.add_argument("--segmentation", required=True)
    ap.add_argument("--out")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    try:
        a = ap.parse_args(argv)
        a.segmentation = os.path.abspath(a.segmentation)
        if a.masks:
            build_segmentation(os.path.abspath(a.masks), a.segmentation)
        if a.out:
            export(a.segmentation, os.path.abspath(a.out))
        code = 0
    except Exception:
        import traceback

        traceback.print_exc()
        code = 1
    sys.stdout.flush()
    slicer.app.exit(code)
