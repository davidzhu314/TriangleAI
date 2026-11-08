"""ThreadSim case export from 3D Slicer (spec §3.6). First cut, run headless or from Slicer's Python console:

    Slicer --no-main-window --no-splash --python-script slicer/export_case.py -- \
        --segmentation slicer/cases/ts-s1404-cta/vessels.seg.nrrd \
        --endpoints slicer/cases/ts-s1404-cta/endpoints.mrk.json \
        --meta slicer/cases/ts-s1404-cta/case-meta.json \
        --out client/public/cases/ts-s1404-cta [--zip /tmp/ts-s1404-cta.zip]

Inputs:
- a segmentation with one segment per vessel, named by vessel id;
- markup points labelled `entry:<id>`, `target:<id>` or `end:<id>`. The unselected point is the
  centerline source;
- `case-meta.json` for the words: title, source, scenario, names.

Steps, all in Slicer and SlicerVMTK:
1. Union the segments into one tree surface (Slicer closed surface, smoothing 0.5).
2. SlicerVMTK Extract Centerline (ExtractCenterlineLogic.preprocess and .extractCenterline: VMTK's
   vtkvmtkPolyDataCenterlines, cost 1/R) from the source point to every other point.
3. Split it into branches with VMTK's vtkvmtkCenterlineBranchExtractor and vtkvmtkMergeCenterlines,
   as Extract Centerline's own "curve tree" does. Branches that meet share a point, and that point
   becomes a graph node.
4. Snap each markup to the nearest end node; its label gives the node kind and id.
5. Name each edge by the segment most of its points lie in. Resample it to equal steps of about 1 mm.
   Radii are VMTK's maximum inscribed sphere radius.
6. Export each segment's closed surface to one GLB node named by vessel id, decimated to under 90k
   triangles in total, weighted to keep more detail in the arch branches and carotids and less in the
   iliacs (DETAIL_WEIGHT).
7. Write case.json, centerlines.json and vessels.glb (millimetres, RAS), and optionally zip them.
"""
import argparse
import json
import math
import os
import struct
import sys
import zipfile

import numpy as np
import slicer
import vtk

TRIANGLE_TARGET = 90_000  # under the 100k import budget (spec §3.1)
# Decimation weight per vessel: more detail near the arch and the targets, less in the iliacs. A vessel keeps
# min(1, k * weight) of its triangles, with k chosen so the total stays under TRIANGLE_TARGET. Unlisted: 1.
DETAIL_WEIGHT = {"bca": 4.0, "rcca": 4.0, "lcca": 4.0, "r_subclavian": 2.0, "l_subclavian": 2.0, "r_iliac": 0.5, "l_iliac": 0.5}
SNAP_MAX_MM = 20.0
DECIMALS = 4


def r4(x):
    v = round(float(x), DECIMALS)
    return 0.0 if v == 0 else v


# ---------------------------------------------------------------- surfaces


def tree_surface(seg):
    """One closed surface for the whole vessel tree, for centerline extraction."""
    label = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLLabelMapVolumeNode", "all_vessels")
    slicer.modules.segmentations.logic().ExportAllSegmentsToLabelmapNode(seg, label, slicer.vtkSegmentation.EXTENT_UNION_OF_EFFECTIVE_SEGMENTS)
    labels = slicer.util.arrayFromVolume(label).copy()  # KJI, values 1..N in segment order
    binary = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLLabelMapVolumeNode", "tree_binary")
    binary.CopyOrientation(label)
    slicer.util.updateVolumeFromArray(binary, (labels > 0).astype(np.uint8))
    tree = slicer.mrmlScene.AddNewNodeByClass("vtkMRMLSegmentationNode", "tree")
    slicer.modules.segmentations.logic().ImportLabelmapToSegmentationNode(binary, tree)
    tree.CreateClosedSurfaceRepresentation()
    poly = vtk.vtkPolyData()
    tree.GetClosedSurfaceRepresentation(tree.GetSegmentation().GetNthSegmentID(0), poly)
    m = vtk.vtkMatrix4x4()
    label.GetRASToIJKMatrix(m)
    ras_to_ijk = np.array([[m.GetElement(r, c) for c in range(4)] for r in range(4)])
    return poly, labels, ras_to_ijk


def keep_fractions(counts):
    """Fraction of triangles each vessel keeps: min(1, k * DETAIL_WEIGHT), summing to TRIANGLE_TARGET at most."""
    w = {v: DETAIL_WEIGHT.get(v, 1.0) for v in counts}
    if sum(counts.values()) <= TRIANGLE_TARGET:
        return {v: 1.0 for v in counts}
    lo, hi = 0.0, 1.0 / min(w.values())
    for _ in range(60):  # bisection on k; deterministic
        k = (lo + hi) / 2
        if sum(n * min(1.0, k * w[v]) for v, n in counts.items()) > TRIANGLE_TARGET:
            hi = k
        else:
            lo = k
    return {v: min(1.0, lo * w[v]) for v in counts}


def vessel_meshes(seg, vessel_ids):
    seg.CreateClosedSurfaceRepresentation()
    polys = {}
    for v in vessel_ids:
        sid = seg.GetSegmentation().GetSegmentIdBySegmentName(v)
        p = vtk.vtkPolyData()
        seg.GetClosedSurfaceRepresentation(sid, p)
        polys[v] = p
    keep = keep_fractions({v: polys[v].GetNumberOfPolys() for v in vessel_ids})
    meshes = []
    for v in vessel_ids:
        tri = vtk.vtkTriangleFilter()
        tri.SetInputData(polys[v])
        src = tri
        reduction = 1.0 - keep[v]
        if reduction > 0:
            dec = vtk.vtkQuadricDecimation()
            dec.SetInputConnection(tri.GetOutputPort())
            dec.SetTargetReduction(reduction)
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
        meshes.append((v, pts, nrms, np.array(idx, dtype=np.uint32)))
    return meshes


def write_glb(meshes, path, extras=None):
    """glTF 2.0 binary, one node and mesh per vessel (same layout as tools/lib/glb.ts). `extras`: node name -> extras."""
    chunks, views, accessors, gl_meshes = [], [], [], []
    offset = 0

    def add_view(b, target):
        nonlocal offset
        pad = (-len(b)) % 4
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(b), "target": target})
        chunks.append(b + b"\0" * pad)
        offset += len(b) + pad
        return len(views) - 1

    for name, pos, nrm, idx in meshes:
        n = len(pos)
        accessors.append({"bufferView": add_view(pos.tobytes(), 34962), "componentType": 5126, "count": n, "type": "VEC3",
                          "min": [float(x) for x in pos.min(axis=0)], "max": [float(x) for x in pos.max(axis=0)]})
        p = len(accessors) - 1
        accessors.append({"bufferView": add_view(nrm.tobytes(), 34962), "componentType": 5126, "count": n, "type": "VEC3"})
        q = len(accessors) - 1
        small = n <= 65535
        ib = (idx.astype(np.uint16) if small else idx).tobytes()
        accessors.append({"bufferView": add_view(ib, 34963), "componentType": 5123 if small else 5125, "count": int(len(idx)), "type": "SCALAR"})
        gl_meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": p, "NORMAL": q}, "indices": len(accessors) - 1, "mode": 4}]})
    doc = {
        "asset": {"version": "2.0", "generator": "threadsim slicer/export_case.py", "extras": {"axes": "RAS", "units": "mm"}},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(meshes)))}],
        "nodes": [dict({"name": m[0], "mesh": i}, **({"extras": extras[m[0]]} if extras and m[0] in extras else {})) for i, m in enumerate(meshes)],
        "meshes": gl_meshes,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
    }
    js = json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + offset
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", offset, 0x004E4942) + b"".join(chunks))


# ---------------------------------------------------------------- centerlines


def vmtk_branches(surface, endpoints):
    import ExtractCenterline
    import vtkvmtkComputationalGeometryPython as vg

    logic = ExtractCenterline.ExtractCenterlineLogic()
    pre = logic.preprocess(surface, 15000, 4.0, False)
    centerline, _voronoi = logic.extractCenterline(pre, endpoints, 1.0)
    be = vg.vtkvmtkCenterlineBranchExtractor()
    be.SetInputData(centerline)
    be.SetBlankingArrayName(logic.blankingArrayName)
    be.SetRadiusArrayName(logic.radiusArrayName)
    be.SetGroupIdsArrayName(logic.groupIdsArrayName)
    be.SetCenterlineIdsArrayName(logic.centerlineIdsArrayName)
    be.SetTractIdsArrayName(logic.tractIdsArrayName)
    be.Update()
    mc = vg.vtkvmtkMergeCenterlines()
    mc.SetInputData(be.GetOutput())
    mc.SetRadiusArrayName(logic.radiusArrayName)
    mc.SetGroupIdsArrayName(logic.groupIdsArrayName)
    mc.SetCenterlineIdsArrayName(logic.centerlineIdsArrayName)
    mc.SetTractIdsArrayName(logic.tractIdsArrayName)
    mc.SetBlankingArrayName(logic.blankingArrayName)
    mc.SetResamplingStepLength(1.0)
    mc.SetMergeBlanked(True)  # Extract Centerline's default; False drops the bifurcation regions and disconnects the graph
    mc.Update()
    merged = mc.GetOutput()
    radius = merged.GetPointData().GetArray(logic.radiusArrayName)
    cells = []
    for c in range(merged.GetNumberOfCells()):
        ids = merged.GetCell(c).GetPointIds()
        pid = [ids.GetId(k) for k in range(ids.GetNumberOfIds())]
        cells.append({"ids": pid, "pts": np.array([merged.GetPoint(i) for i in pid]), "r": np.array([radius.GetValue(i) for i in pid])})
    return cells


def resample(pts, radii, start, end):
    """Equal steps of about 1 mm; the ends are the node positions exactly."""
    pts = np.array(pts, dtype=float)
    pts[0], pts[-1] = start, end
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cs = np.concatenate([[0.0], np.cumsum(seg)])
    n = max(1, int(round(cs[-1])))
    s = np.linspace(0.0, cs[-1], n + 1)
    out = np.stack([np.interp(s, cs, pts[:, a]) for a in range(3)], axis=1)
    rr = np.interp(s, cs, radii)
    out[0], out[-1] = start, end
    return out, rr


def build_graph(cells, markups, labels, ras_to_ijk, vessel_ids):
    # Nodes are the branch end point ids; branches that meet share a point id.
    ends = {}
    for c in cells:
        for pid, p in ((c["ids"][0], c["pts"][0]), (c["ids"][-1], c["pts"][-1])):
            ends.setdefault(pid, {"pos": p, "deg": 0})["deg"] += 1
    names = {}
    used = set()
    for label, pos in markups:
        kind, ident = label.split(":", 1)
        cand = [(np.linalg.norm(e["pos"] - pos), pid) for pid, e in ends.items() if e["deg"] == 1 and pid not in used]
        d, pid = min(cand)
        if d > SNAP_MAX_MM:
            raise RuntimeError(f"{label} is {d:.1f} mm from the nearest centerline end")
        used.add(pid)
        names[pid] = (f"n_{ident}", kind)
    k = 0
    order = []
    for c in cells:
        for pid in (c["ids"][0], c["ids"][-1]):
            if pid in order:
                continue
            order.append(pid)
            if pid not in names:
                k += 1
                names[pid] = (f"n_b{k}", "branch" if ends[pid]["deg"] > 1 else "end")
    nodes = [{"id": names[pid][0], "kind": names[pid][1], "pos": [r4(x) for x in ends[pid]["pos"]]} for pid in order]
    pos_of = {names[pid][0]: np.array(n["pos"]) for pid, n in zip(order, nodes)}

    def vessel_at(p):
        i, j, kk = (ras_to_ijk @ np.array([p[0], p[1], p[2], 1.0]))[:3]
        i, j, kk = int(round(i)), int(round(j)), int(round(kk))
        if 0 <= kk < labels.shape[0] and 0 <= j < labels.shape[1] and 0 <= i < labels.shape[2]:
            return int(labels[kk, j, i])
        return 0

    edges, count = [], {}
    for c in cells:
        a, b = names[c["ids"][0]][0], names[c["ids"][-1]][0]
        votes = np.bincount([vessel_at(p) for p in c["pts"][1:-1]] or [0], minlength=len(vessel_ids) + 1)
        votes[0] = 0
        if votes.sum() == 0:
            raise RuntimeError(f"branch {a}->{b} lies outside every segment")
        vessel = vessel_ids[int(np.argmax(votes)) - 1]
        pts, rr = resample(c["pts"], c["r"], pos_of[a], pos_of[b])
        count[vessel] = count.get(vessel, 0) + 1
        edges.append({"from": a, "to": b, "vessel": vessel, "points": [[r4(x) for x in p] for p in pts], "radii_mm": [r4(x) for x in rr]})
    seen = {}
    for e in edges:
        seen[e["vessel"]] = seen.get(e["vessel"], 0) + 1
        e["id"] = f"e_{e['vessel']}" if count[e["vessel"]] == 1 else f"e_{e['vessel']}_{seen[e['vessel']]}"
    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------- package


def main(args):
    for k in ("segmentation", "endpoints", "meta", "out"):
        setattr(args, k, os.path.abspath(getattr(args, k)))
    meta = json.load(open(args.meta))
    seg = slicer.util.loadSegmentation(args.segmentation)
    pts = slicer.util.loadMarkups(args.endpoints)
    vessel_ids = [seg.GetSegmentation().GetNthSegment(i).GetName() for i in range(seg.GetSegmentation().GetNumberOfSegments())]
    markups = []
    for i in range(pts.GetNumberOfControlPoints()):
        p = [0.0, 0.0, 0.0]
        pts.GetNthControlPointPositionWorld(i, p)  # RAS
        markups.append((pts.GetNthControlPointLabel(i), np.array(p)))

    surface, labels, ras_to_ijk = tree_surface(seg)
    cells = vmtk_branches(surface, pts)
    centerlines = build_graph(cells, markups, labels, ras_to_ijk, vessel_ids)
    node_of = {n["id"]: n for n in centerlines["nodes"]}

    def tagged(kind):
        out = []
        for label, _ in markups:
            k, ident = label.split(":", 1)
            if k == kind:
                out.append({"id": ident, "name": meta["names"][ident], "node": f"n_{ident}"})
                assert node_of[f"n_{ident}"]["kind"] == kind
        return out

    case = {
        "schema": "threadsim.case/1",
        "id": meta["id"],
        "title": meta["title"],
        "units": "mm",
        "axes": "RAS",
        "source": meta["source"],
        "physics": {"available": False},
        "scenario": meta["scenario"],
        "difficulty": meta["difficulty"],
        "fluoro_budget_s": meta["fluoro_budget_s"],
        "vessels": [{"id": v, "name": meta["names"][v], "kind": "artery"} for v in vessel_ids],
        "entries": tagged("entry"),
        "targets": tagged("target"),
        "riskZones": meta.get("riskZones", []),
    }
    os.makedirs(args.out, exist_ok=True)
    files = {
        "case.json": json.dumps(case, sort_keys=True, indent=2) + "\n",
        "centerlines.json": json.dumps(centerlines, sort_keys=True, separators=(",", ":")) + "\n",
    }
    for name, text in files.items():
        with open(os.path.join(args.out, name), "w") as f:
            f.write(text)
    write_glb(vessel_meshes(seg, vessel_ids), os.path.join(args.out, "vessels.glb"))
    if args.zip:
        with zipfile.ZipFile(os.path.abspath(args.zip), "w", zipfile.ZIP_DEFLATED) as z:
            for name in ("case.json", "centerlines.json", "vessels.glb"):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, open(os.path.join(args.out, name), "rb").read())
    print("EXPORTED", args.out, "nodes", len(centerlines["nodes"]), "edges", len(centerlines["edges"]),
          [(e["id"], e["from"], e["to"], len(e["points"])) for e in centerlines["edges"]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--segmentation", required=True)
    ap.add_argument("--endpoints", required=True)
    ap.add_argument("--meta", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--zip")
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
