"""Mark the transapical planner's landmarks on a CT by hand: three aortic valve hinge points and the LV apex.

Run 3D Slicer with its window (this step needs a person):
    Slicer --python-script slicer/mark_apex.py -- \
        --ct /tmp/ts-s1404-apex/ct.nii.gz --masks /tmp/ts-s1404-apex \
        --landmarks slicer/cases/ts-s1404-cta/apex-landmarks.mrk.json

It loads the CT with an angiography window, outlines the heart and the aorta from the masks, and opens the Markups
module on a point list with four named points, unplaced (or as saved last time, to move):
- `hinge:1`, `hinge:2`, `hinge:3`: the lowest point of each aortic cusp's attachment (the "hinge points" that define
  the annulus plane, as in TAVR sizing). Easiest in a double-oblique view across the aortic root (Reformat module, or
  Ctrl+Alt drag to rotate a slice).
- `apex`: the left ventricle's apex, the thinnest, most distal point of the LV, where a transapical puncture aims.
Place each with the Markups module's place button beside it, then press "Save landmarks" in the small window. That
writes the `.mrk.json` (positions only; nothing from the CT image) and marks every point as placed by a person.
Then export the geometry with `slicer/export_apex.py`.

`--save-now` loads and saves without waiting for a person, keeping each point's description as it is (a "draft" point
stays draft). It exists so the load and save path can be tested headless.
"""
import argparse
import os
import sys

import numpy as np
import slicer
import vtk

LABELS = ["hinge:1", "hinge:2", "hinge:3", "apex"]
HELP = {
    "hinge:1": "Hinge point of the first aortic cusp (lowest point of its attachment)",
    "hinge:2": "Hinge point of the second aortic cusp",
    "hinge:3": "Hinge point of the third aortic cusp",
    "apex": "Apex of the left ventricle",
}
WINDOW, LEVEL = 700, 150  # CT angiography: contrast-filled blood bright, myocardium mid-grey


def point_list(path):
    """The saved list when there is one, with any missing label added unplaced; else a new list of four unplaced points."""
    node = slicer.util.loadMarkups(path) if os.path.exists(path) else slicer.mrmlScene.AddNewNodeByClass("vtkMRMLMarkupsFiducialNode")
    node.SetName("apex-landmarks")
    have = {node.GetNthControlPointLabel(i) for i in range(node.GetNumberOfControlPoints())}
    for label in LABELS:
        if label in have:
            continue
        i = node.AddControlPoint(vtk.vtkVector3d(0, 0, 0), label)
        node.UnsetNthControlPointPosition(i)
    for i in range(node.GetNumberOfControlPoints()):
        node.SetNthControlPointLocked(i, False)
    return node


def save(node, path, by_person):
    if by_person:
        for i in range(node.GetNumberOfControlPoints()):
            node.SetNthControlPointDescription(i, "")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if not slicer.util.saveNode(node, path):
        raise RuntimeError(f"could not save {path}")
    placed = sum(node.GetNthControlPointPositionStatus(i) == node.PositionDefined for i in range(node.GetNumberOfControlPoints()))
    print(f"saved {path}: {placed} of {len(LABELS)} points placed")
    return placed


def outline(masks_dir, ct):
    seg = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLSegmentationNode")
    seg.SetName("heart and aorta")
    seg.SetReferenceImageGeometryParameterFromVolumeNode(ct)
    logic = slicer.modules.segmentations.logic()
    for name, rgb in (("heart", (0.75, 0.35, 0.35)), ("aorta", (0.85, 0.25, 0.25))):
        path = os.path.join(masks_dir, f"{name}.nii.gz")
        if not os.path.exists(path):
            continue
        label = slicer.util.loadLabelVolume(path)
        before = seg.GetSegmentation().GetNumberOfSegments()
        logic.ImportLabelmapToSegmentationNode(label, seg)
        for k in range(before, seg.GetSegmentation().GetNumberOfSegments()):
            s = seg.GetSegmentation().GetNthSegment(k)
            s.SetName(name)
            s.SetColor(*rgb)
        slicer.mrmlScene.RemoveNode(label)
    seg.CreateDefaultDisplayNodes()
    d = seg.GetDisplayNode()
    d.SetVisibility2DFill(False)
    d.SetVisibility2DOutline(True)
    return seg


def centre_on_heart(masks_dir):
    path = os.path.join(masks_dir, "heart.nii.gz")
    if not os.path.exists(path):
        return
    label = slicer.util.loadLabelVolume(path)
    kji = np.argwhere(slicer.util.arrayFromVolume(label) > 0)
    m = vtk.vtkMatrix4x4()
    label.GetIJKToRASMatrix(m)
    ijk = kji.mean(axis=0)[::-1]
    ras = m.MultiplyPoint([*ijk, 1.0])[:3]
    slicer.mrmlScene.RemoveNode(label)
    slicer.modules.markups.logic().JumpSlicesToLocation(*ras, True)


def expand_control_points():
    """Open the Markups module's "Control Points" section, where each unplaced point has its place button."""
    import ctk

    for button in slicer.modules.markups.widgetRepresentation().findChildren(ctk.ctkCollapsibleButton):
        if button.text == "Control Points":
            button.collapsed = False


def panel(node, path):
    import qt

    w = qt.QWidget()
    w.setMinimumWidth(360)
    lay = qt.QVBoxLayout(w)
    text = qt.QLabel(
        "Place each point with the place button beside it in the Markups module:\n\n"
        + "\n".join(f"• {k}: {v}" for k, v in HELP.items())
        + "\n\nRotate a slice with Ctrl+Alt drag (or the Reformat module) to see the valve's three cusps."
    )
    text.wordWrap = True
    lay.addWidget(text)
    status = qt.QLabel("")
    lay.addWidget(status)
    button = qt.QPushButton("Save landmarks")
    lay.addWidget(button)

    def on_save():
        try:
            placed = save(node, path, by_person=True)
            status.text = f"Saved: {placed} of {len(LABELS)} placed → {path}"
        except Exception as e:  # shown in the window; the person can retry
            status.text = f"Not saved: {e}"

    button.connect("clicked()", on_save)
    lay.addStretch(1)
    # Docked in the main window, so it can't fall behind it.
    dock = qt.QDockWidget("Apex landmarks", slicer.util.mainWindow())
    dock.setWidget(w)
    slicer.util.mainWindow().addDockWidget(qt.Qt.RightDockWidgetArea, dock)
    dock.show()
    slicer.apex_landmarks_panel = dock  # keep a reference so Qt doesn't close it


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--ct", required=True)
    ap.add_argument("--masks", required=True)
    ap.add_argument("--landmarks", required=True)
    ap.add_argument("--save-now", action="store_true")
    args = ap.parse_args(argv)

    node = point_list(args.landmarks)
    if args.save_now:
        save(node, args.landmarks, by_person=False)
        return 0
    ct = slicer.util.loadVolume(args.ct)
    ct.GetDisplayNode().SetAutoWindowLevel(False)
    ct.GetDisplayNode().SetWindowLevel(WINDOW, LEVEL)
    slicer.util.setSliceViewerLayers(background=ct, fit=True)
    outline(args.masks, ct)
    centre_on_heart(args.masks)
    slicer.util.selectModule("Markups")
    slicer.modules.markups.logic().SetActiveList(node)
    expand_control_points()
    panel(node, args.landmarks)
    return None  # stay open for the person


code = None
try:
    code = main(sys.argv[1:])
except SystemExit as e:
    code = e.code or 0
except Exception:
    import traceback

    traceback.print_exc()
    code = 1
if code is not None:
    slicer.app.exit(code)
