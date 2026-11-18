"""Chest meshes for a CT case: chest.glb beside the case's case.json, for the access module.

    python -I tools/chestgen/build_chest.py <masks dir> <case dir> <subject>

<masks dir> holds the subject's TotalSegmentator masks, fetched with
    python -I slicer/fetch_totalsegmentator.py <subject> <masks dir> --apex
(lungs by lobe, each rib, the costal cartilages, the sternum, the heart and the aorta; CC BY 4.0, THIRD_PARTY.md).
The masks never enter the repo; only the meshes do.

Output: <case dir>/chest.glb, millimetres RAS in the vertices (no node transforms), like context.glb. Nodes:
    lung_left, lung_right                    lobes merged per side
    rib_left_1..12, rib_right_1..12          one node per rib, so intercostal spaces can be found between them
    costal_cartilages, sternum
Each node's extras: {kind: "chest", group, label, voxels}. The root's extras: source, subject, tool, and an
alignment check against the case's own heart (context.glb), so a frame mistake shows up in the file itself.

Surfaces: specks dropped (see keep_pieces), each mask cropped, smoothed with a Gaussian (sigma in voxels below), then
marching cubes at half height, which places the surface where the mask's edge is, then simplified by vertex
clustering (cell sizes below). No AI model; the masks are the dataset's own.
"""
from __future__ import annotations

import json
import pathlib
import struct
import sys

import nibabel as nib
import numpy as np
from scipy import ndimage
from skimage import measure

# part -> (mask classes, group, label, smoothing sigma in voxels, vertex-cluster cell in mm, pieces kept)
# Pieces kept: "largest" keeps the biggest connected piece (a rib, a lung side); a number keeps every piece of at least
# that share of the biggest (the costal cartilages are several separate pieces). Specks are segmentation noise.
LUNG_LEFT = ["lung_upper_lobe_left", "lung_lower_lobe_left"]
LUNG_RIGHT = ["lung_upper_lobe_right", "lung_middle_lobe_right", "lung_lower_lobe_right"]
PARTS: list[tuple[str, list[str], str, str, float, float, object]] = [
    ("lung_left", LUNG_LEFT, "lung", "Left lung", 1.0, 5.0, "largest"),
    ("lung_right", LUNG_RIGHT, "lung", "Right lung", 1.0, 5.0, "largest"),
    *[(f"rib_{side}_{i}", [f"rib_{side}_{i}"], "rib", f"{side.capitalize()} rib {i}", 0.6, 2.5, "largest") for side in ("left", "right") for i in range(1, 13)],
    ("costal_cartilages", ["costal_cartilages"], "cartilage", "Costal cartilages", 0.6, 3.0, 0.02),
    ("sternum", ["sternum"], "sternum", "Sternum", 0.6, 3.0, "largest"),
]


def keep_pieces(vol: np.ndarray, rule: object) -> tuple[np.ndarray, int]:
    """The mask with specks removed, and how many voxels were dropped."""
    lab, n = ndimage.label(vol, structure=np.ones((3, 3, 3)))
    if n <= 1:
        return vol, 0
    sizes = np.bincount(lab.ravel())[1:]
    if rule == "largest":
        keep = np.zeros(n + 1, bool)
        keep[1 + int(np.argmax(sizes))] = True
    else:
        keep = np.concatenate([[False], sizes >= float(rule) * sizes.max()])
    out = keep[lab]
    return out, int(vol.sum() - out.sum())


def cluster(v: np.ndarray, f: np.ndarray, cell: float) -> tuple[np.ndarray, np.ndarray]:
    """Vertex clustering: vertices in one cell of a `cell` mm grid merge to their mean; collapsed triangles go."""
    key = np.floor(v / cell).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel()
    k = inv.max() + 1
    nv = np.zeros((k, 3))
    np.add.at(nv, inv, v)
    nv /= np.bincount(inv, minlength=k)[:, None]
    nf = inv[f]
    ok = (nf[:, 0] != nf[:, 1]) & (nf[:, 1] != nf[:, 2]) & (nf[:, 0] != nf[:, 2])
    nf = nf[ok]
    nf = np.unique(np.sort(nf, axis=1), axis=0, return_index=True)[1]
    nf = inv[f][ok][np.sort(nf)]
    used = np.unique(nf)
    remap = -np.ones(k, np.int64)
    remap[used] = np.arange(len(used))
    return nv[used].astype(np.float32), remap[nf].astype(np.uint32)


def normals(v: np.ndarray, f: np.ndarray) -> np.ndarray:
    n = np.zeros_like(v, dtype=np.float64)
    tri = v[f]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return n.astype(np.float32)


def load_mask(masks: pathlib.Path, classes: list[str]) -> tuple[np.ndarray, np.ndarray]:
    affine = None
    vol = None
    for c in classes:
        img = nib.load(str(masks / f"{c}.nii.gz"))
        a = np.asarray(img.dataobj) > 0
        if vol is None:
            vol, affine = a, img.affine
        else:
            if not np.allclose(img.affine, affine):
                raise SystemExit(f"{c}: affine differs from the other masks")
            vol |= a
    return vol, affine


def surface(vol: np.ndarray, affine: np.ndarray, sigma: float, step: int = 1) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Vertices (mm RAS), normals and triangles of a mask's surface."""
    idx = np.argwhere(vol)
    lo = np.maximum(idx.min(0) - 3, 0)
    hi = np.minimum(idx.max(0) + 4, vol.shape)
    crop = vol[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]].astype(np.float32)
    crop = np.pad(crop, 2)
    if sigma > 0:
        crop = ndimage.gaussian_filter(crop, sigma)
    verts, faces, _, _ = measure.marching_cubes(crop, level=0.5, step_size=step, allow_degenerate=False)
    ijk = verts + lo - 2
    xyz = nib.affines.apply_affine(affine, ijk)
    # A mirroring affine would flip the winding; keep outward faces.
    if np.linalg.det(affine[:3, :3]) < 0:
        faces = faces[:, ::-1]
    n = np.zeros_like(xyz)
    tri = xyz[faces]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    for k in range(3):
        np.add.at(n, faces[:, k], fn)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return xyz.astype(np.float32), n.astype(np.float32), faces.astype(np.uint32)


def read_glb_mesh(path: pathlib.Path, name: str) -> np.ndarray:
    b = path.read_bytes()
    jl = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    binoff = 20 + jl + 8
    node = next(n for n in j["nodes"] if n.get("name") == name)
    acc = j["accessors"][j["meshes"][node["mesh"]]["primitives"][0]["attributes"]["POSITION"]]
    bv = j["bufferViews"][acc["bufferView"]]
    return np.frombuffer(b, dtype="<f4", count=acc["count"] * 3, offset=binoff + bv.get("byteOffset", 0) + acc.get("byteOffset", 0)).reshape(-1, 3)


def write_glb(path: pathlib.Path, meshes: list[dict], root_extras: dict) -> None:
    blob = bytearray()
    views, accessors, gmeshes, nodes = [], [], [], []

    def add(data: np.ndarray, target: int, kind: str, comp: int, bounds: bool = False) -> int:
        while len(blob) % 4:
            blob.append(0)
        raw = np.ascontiguousarray(data).tobytes()
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(raw), "target": target})
        blob.extend(raw)
        acc = {"bufferView": len(views) - 1, "componentType": comp, "count": int(data.shape[0] if kind != "SCALAR" else data.size), "type": kind}
        if bounds:
            acc["min"] = [float(x) for x in data.min(0)]
            acc["max"] = [float(x) for x in data.max(0)]
        accessors.append(acc)
        return len(accessors) - 1

    for m in meshes:
        pos = add(m["v"].astype("<f4"), 34962, "VEC3", 5126, True)
        nor = add(m["n"].astype("<f4"), 34962, "VEC3", 5126)
        ind = add(m["f"].astype("<u4").reshape(-1), 34963, "SCALAR", 5125)
        gmeshes.append({"name": m["name"], "primitives": [{"attributes": {"POSITION": pos, "NORMAL": nor}, "indices": ind, "material": 0}]})
        nodes.append({"name": m["name"], "mesh": len(gmeshes) - 1, "extras": m["extras"]})
    nodes.append({"name": "chest", "children": list(range(len(meshes))), "extras": root_extras})
    doc = {
        "asset": {"version": "2.0", "generator": "cathy tools/chestgen"},
        "scene": 0,
        "scenes": [{"nodes": [len(nodes) - 1]}],
        "nodes": nodes,
        "meshes": gmeshes,
        "materials": [{"name": "untinted", "pbrMetallicRoughness": {"baseColorFactor": [0.8, 0.8, 0.8, 1], "metallicFactor": 0, "roughnessFactor": 0.8}, "doubleSided": True}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    while len(blob) % 4:
        blob.append(0)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + 8 + len(blob)))
        f.write(struct.pack("<I4s", len(text), b"JSON"))
        f.write(text)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
        f.write(bytes(blob))


def main(masks_dir: str, case_dir: str, subject: str) -> None:
    masks = pathlib.Path(masks_dir)
    case = pathlib.Path(case_dir)
    out = []
    for name, classes, group, label, sigma, cell, rule in PARTS:
        vol, affine = load_mask(masks, classes)
        if int(vol.sum()) == 0:
            print(f"{name}: empty in this scan, skipped")
            continue
        vol, dropped = keep_pieces(vol, rule)
        voxels = int(vol.sum())
        v, _, f = surface(vol, affine, sigma)
        v, f = cluster(v, f, cell)
        n = normals(v, f)
        out.append({"name": name, "v": v, "n": n, "f": f, "extras": {"kind": "chest", "group": group, "label": label, "voxels": voxels, "speck_voxels_dropped": dropped}})
        print(f"{name:20s} {len(f):7d} triangles  dropped {dropped:5d} speck voxels  x {v[:, 0].min():6.0f}..{v[:, 0].max():4.0f}  y {v[:, 1].min():5.0f}..{v[:, 1].max():4.0f}  z {v[:, 2].min():6.0f}..{v[:, 2].max():5.0f}")

    # Alignment check: the downloaded heart mask against the case's own heart mesh (context.glb, made in Slicer from
    # the same dataset). Both should give the same box to within a voxel or two.
    hv, ha = load_mask(masks, ["heart"])
    hx, _, _ = surface(hv, ha, 1.0, 2)
    ctx = read_glb_mesh(case / "context.glb", "heart")
    diff = np.abs(np.concatenate([hx.min(0) - ctx.min(0), hx.max(0) - ctx.max(0)]))
    check = {"heart_box_from_masks_mm": [hx.min(0).round(1).tolist(), hx.max(0).round(1).tolist()], "heart_box_in_context_glb_mm": [ctx.min(0).round(1).tolist(), ctx.max(0).round(1).tolist()], "largest_difference_mm": round(float(diff.max()), 1)}
    print("alignment check:", json.dumps(check))
    if diff.max() > 6:
        raise SystemExit(f"the masks and context.glb disagree by {diff.max():.1f} mm: wrong subject or frame")

    root = {
        "kind": "chest",
        "units": "mm",
        "frame": "RAS (+x right, +y anterior, +z superior), as context.glb",
        "source": "TotalSegmentator dataset v2.0.1 (small subset), Zenodo 10047263, CC BY 4.0",
        "subject": subject,
        "tool": "tools/chestgen/build_chest.py: specks dropped, Gaussian-smoothed masks, marching cubes at half height (scikit-image), vertex clustering",
        "alignment": check,
        "not_for": "Research and education only. Not a clinical device.",
    }
    write_glb(case / "chest.glb", out, root)
    total = sum(len(m["f"]) for m in out)
    print(f"wrote {case / 'chest.glb'}: {len(out)} parts, {total} triangles, {(case / 'chest.glb').stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
