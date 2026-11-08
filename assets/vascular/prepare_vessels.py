"""Prepare ThreadSim's aortic vascular asset from OrganUI Vessels (BodyParts3D / Anatomography 4.3).

Input: OrganUI's vessels.glb and manifest.json at a pinned commit of https://github.com/organui/vessels-3d.
Both are checked against pinned SHA-256 hashes before anything is read.

Output (written next to this script):
- bodyparts3d-aortic.glb: the selected arteries and veins, one node per vessel and side, in millimetres
  and RAS axes (ThreadSim's case convention, spec 3.2), with no materials, extras or extensions.
- bodyparts3d-aortic.json: labels (artery/vein, side), units, scale, orientation, bounds, provenance
  and attribution.

The model data is CC BY-SA 2.1 Japan (DBCLS), separately from OrganUI's MIT code. Both outputs are
adaptations under the same license; see LICENSE.md and ATTRIBUTION.md in this folder.

Run (Python >= 3.11, numpy):
    python assets/vascular/prepare_vessels.py                    # downloads the pinned inputs
    python assets/vascular/prepare_vessels.py --source DIR       # or uses DIR/vessels.glb + DIR/manifest.json
The output is byte-identical for the same inputs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import urllib.request
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
OUT_GLB = HERE / "bodyparts3d-aortic.glb"
OUT_META = HERE / "bodyparts3d-aortic.json"

SOURCE_REPO = "https://github.com/organui/vessels-3d"
SOURCE_COMMIT = "74be339badd85f1d3d93e585ed2a5a79c7679342"
SOURCE_FILES = {
    "vessels.glb": ("public/models/vessels.glb", "d2dd99113eda9ccf39d8a9bff7d6c9d07252867cabdcaf7bc1c3454a2883701d"),
    "manifest.json": ("public/models/manifest.json", None),  # hash recorded in the output; the GLB hash inside it is checked
}

# The aortic tree and its access routes (femoral, radial), plus the great veins. Order is the output order.
# "pair": the source groups left and right in one mesh; it is split by connected component and side.
SELECTION: list[tuple[str, str, bool]] = [
    # structure id, display label, pair
    ("ascending-aorta", "Ascending aorta", False),
    ("aortic-arch", "Aortic arch", False),
    ("thoracic-aorta", "Thoracic (descending) aorta", False),
    ("abdominal-aorta", "Abdominal aorta", False),
    ("brachiocephalic-trunk", "Brachiocephalic trunk", False),
    ("carotid-arteries", "carotid arteries (common, internal, external)", True),
    ("vertebral-arteries", "vertebral artery", True),
    ("subclavian-arteries", "subclavian artery", True),
    ("axillary-arteries", "axillary artery", True),
    ("brachial-arteries", "brachial artery", True),
    ("radial-arteries", "radial artery", True),
    ("celiac-trunk", "Celiac trunk", False),
    ("superior-mesenteric-artery", "Superior mesenteric artery", False),
    ("inferior-mesenteric-artery", "Inferior mesenteric artery", False),
    ("renal-arteries", "renal artery", True),
    ("common-iliac-arteries", "common iliac artery", True),
    ("internal-iliac-arteries", "internal iliac artery", True),
    ("external-iliac-arteries", "external iliac artery", True),
    ("femoral-arteries", "femoral artery", True),
    ("deep-femoral-arteries", "deep femoral artery", True),
    ("superior-vena-cava", "Superior vena cava", False),
    ("inferior-vena-cava", "Inferior vena cava", False),
    ("brachiocephalic-veins", "brachiocephalic vein", True),
    ("jugular-veins", "jugular veins (internal; external on the right only)", True),
    ("subclavian-veins", "subclavian vein", True),
    ("axillary-veins", "axillary vein", True),
    ("renal-veins", "renal vein", True),
    ("common-iliac-veins", "common iliac vein", True),
    ("internal-iliac-veins", "internal iliac vein", True),
    ("external-iliac-veins", "external iliac vein", True),
    ("femoral-veins", "femoral vein", True),
]

# A paired structure's component must sit clearly on one side of the midline (RAS x = 0).
MIDLINE_MARGIN_MM = 5.0


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch_inputs(source: Path | None) -> dict[str, bytes]:
    out: dict[str, bytes] = {}
    for name, (path, want) in SOURCE_FILES.items():
        if source is not None:
            data = (source / name).read_bytes()
        else:
            url = f"https://raw.githubusercontent.com/organui/vessels-3d/{SOURCE_COMMIT}/{path}"
            with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310 (pinned https URL)
                data = r.read()
        if want is not None and sha256(data) != want:
            sys.exit(f"{name}: SHA-256 {sha256(data)} does not match the pinned {want}")
        out[name] = data
    manifest = json.loads(out["manifest.json"])
    if manifest["runtime"]["sha256"] != SOURCE_FILES["vessels.glb"][1]:
        sys.exit("manifest.json does not describe the pinned vessels.glb")
    return out


def read_glb(data: bytes) -> tuple[dict, bytes]:
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        sys.exit("vessels.glb is not a glTF 2.0 binary")
    jlen, jtype = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20 : 20 + jlen])
    blen, btype = struct.unpack_from("<II", data, 20 + jlen)
    if gltf.get("extensionsRequired"):
        sys.exit(f"vessels.glb requires extensions {gltf['extensionsRequired']}")
    return gltf, data[28 + jlen : 28 + jlen + blen]


def accessor(gltf: dict, binary: bytes, index: int) -> np.ndarray:
    a = gltf["accessors"][index]
    bv = gltf["bufferViews"][a["bufferView"]]
    dtype = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a["componentType"]]
    width = {"SCALAR": 1, "VEC3": 3}[a["type"]]
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    item = width * np.dtype(dtype).itemsize
    stride = bv.get("byteStride") or item
    if stride == item:
        arr = np.frombuffer(binary, dtype=dtype, count=a["count"] * width, offset=start)
        return arr.reshape(-1, width).copy() if width > 1 else arr.copy()
    # interleaved: take `width` values every `stride` bytes
    rows = [np.frombuffer(binary, dtype=dtype, count=width, offset=start + i * stride) for i in range(a["count"])]
    return np.stack(rows).copy()


def to_ras_mm(display: np.ndarray, transform: dict) -> np.ndarray:
    """OrganUI display units -> BodyParts3D millimetres -> RAS millimetres.

    OrganUI: display = (source - center) * scale, axes [x, z, -y].
    BodyParts3D source: +x patient left, +y posterior (-y anterior), +z superior (an LPS frame).
    RAS: x right, y anterior, z superior. So R = -sx, A = -sy, S = sz.
    """
    k = float(transform["scale"])
    cx, cy, cz = (float(v) for v in transform["centerMm"])
    if transform["axes"] != "[x, z, -y]":
        sys.exit(f"unexpected OrganUI axes {transform['axes']}")
    d = display.astype(np.float64)
    sx = d[:, 0] / k + cx
    sy = -d[:, 2] / k + cy
    sz = d[:, 1] / k + cz
    return np.stack([-sx, -sy, sz], axis=1)


def normals_to_ras(n: np.ndarray) -> np.ndarray:
    d = n.astype(np.float64)
    out = np.stack([-d[:, 0], d[:, 2], d[:, 1]], axis=1)  # same rotation as positions, no scale
    norm = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.where(norm == 0, 1, norm)


def weld(pos: np.ndarray, nrm: np.ndarray, idx: np.ndarray):
    """Merge vertices with identical position and normal (after RAS conversion, at 1 µm) and drop degenerate triangles."""
    key = np.concatenate([np.round(pos * 1000), np.round(nrm * 1e6)], axis=1)
    uniq, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    order = np.argsort(first)  # keep the source's first-seen vertex order (deterministic)
    remap = np.empty_like(order)
    remap[order] = np.arange(len(order))
    new_idx = remap[inverse.ravel()][idx]
    tris = new_idx.reshape(-1, 3)
    keep = (tris[:, 0] != tris[:, 1]) & (tris[:, 1] != tris[:, 2]) & (tris[:, 0] != tris[:, 2])
    return pos[first[order]], nrm[first[order]], tris[keep]


def components(pos: np.ndarray, tris: np.ndarray) -> list[np.ndarray]:
    """Connected components of triangles sharing a vertex position (union-find). Returns triangle-index arrays."""
    pkey = np.round(pos * 1000).astype(np.int64)
    _, vgroup = np.unique(pkey, axis=0, return_inverse=True)
    vgroup = vgroup.ravel()
    parent = np.arange(vgroup.max() + 1)

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for t in vgroup[tris]:
        ra, rb, rc = find(t[0]), find(t[1]), find(t[2])
        root = min(ra, rb, rc)
        parent[ra] = parent[rb] = parent[rc] = root
    roots = np.array([find(g) for g in vgroup[tris[:, 0]]])
    return [np.nonzero(roots == r)[0] for r in sorted(set(roots.tolist()))]


def submesh(pos: np.ndarray, nrm: np.ndarray, tris: np.ndarray):
    used, inv = np.unique(tris.ravel(), return_inverse=True)
    return pos[used], nrm[used], inv.reshape(-1, 3)


def write_glb(meshes: list[dict], copyright_line: str) -> bytes:
    chunks: list[bytes] = []
    views: list[dict] = []
    accessors: list[dict] = []
    offset = 0

    def add(data: bytes, target: int) -> int:
        nonlocal offset
        pad = (-len(data)) % 4
        chunks.append(data + b"\x00" * pad)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        offset += len(data) + pad
        return len(views) - 1

    gl_meshes = []
    for m in meshes:
        p = m["pos"].astype(np.float32)
        n = m["nrm"].astype(np.float32)
        t = m["tris"]
        big = int(t.max()) >= 65535
        it = t.astype(np.uint32 if big else np.uint16).ravel()
        pv = add(p.tobytes(), 34962)
        accessors.append({"bufferView": pv, "componentType": 5126, "count": len(p), "type": "VEC3",
                          "min": [round(float(v), 4) for v in p.min(axis=0)], "max": [round(float(v), 4) for v in p.max(axis=0)]})
        pa = len(accessors) - 1
        nv = add(n.tobytes(), 34962)
        accessors.append({"bufferView": nv, "componentType": 5126, "count": len(n), "type": "VEC3"})
        na = len(accessors) - 1
        iv = add(it.tobytes(), 34963)
        accessors.append({"bufferView": iv, "componentType": 5125 if big else 5123, "count": len(it), "type": "SCALAR"})
        ia = len(accessors) - 1
        gl_meshes.append({"name": m["id"], "primitives": [{"attributes": {"POSITION": pa, "NORMAL": na}, "indices": ia, "mode": 4}]})

    gltf = {
        "asset": {"version": "2.0", "generator": "threadsim assets/vascular/prepare_vessels.py", "copyright": copyright_line,
                  "extras": {"units": "mm", "axes": "RAS"}},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(meshes)))}],
        "nodes": [{"name": m["id"], "mesh": i} for i, m in enumerate(meshes)],
        "meshes": gl_meshes,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
    }
    js = json.dumps(gltf, separators=(",", ":"), sort_keys=True).encode()
    js += b" " * ((-len(js)) % 4)
    binary = b"".join(chunks)
    total = 12 + 8 + len(js) + 8 + len(binary)
    return struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--source", type=Path, help="folder with vessels.glb and manifest.json (skips the download)")
    args = ap.parse_args()

    inputs = fetch_inputs(args.source)
    manifest = json.loads(inputs["manifest.json"])
    gltf, binary = read_glb(inputs["vessels.glb"])
    structures = {s["id"]: s for s in manifest["structures"]}
    nodes = {n["name"]: n for n in gltf["nodes"]}

    meshes: list[dict] = []
    vessels: list[dict] = []
    for sid, label, pair in SELECTION:
        s, node = structures[sid], nodes[sid]
        prim = gltf["meshes"][node["mesh"]]["primitives"][0]
        if any(k in node for k in ("matrix", "translation", "rotation", "scale")):
            sys.exit(f"{sid}: node transforms are not supported")
        pos = to_ras_mm(accessor(gltf, binary, prim["attributes"]["POSITION"]), manifest["transform"])
        nrm = normals_to_ras(accessor(gltf, binary, prim["attributes"]["NORMAL"]))
        pos, nrm, tris = weld(pos, nrm, accessor(gltf, binary, prim["indices"]))

        groups: list[tuple[str, np.ndarray]]
        if pair:
            sides: dict[str, list[np.ndarray]] = {"right": [], "left": []}
            straddle = False
            for comp in components(pos, tris):
                xs = pos[np.unique(tris[comp].ravel()), 0]
                if xs.min() < -MIDLINE_MARGIN_MM and xs.max() > MIDLINE_MARGIN_MM and abs(xs.mean()) < MIDLINE_MARGIN_MM:
                    straddle = True  # e.g. the two brachiocephalic veins meet at the superior vena cava
                    break
                sides["right" if xs.mean() > 0 else "left"].append(comp)
            if straddle:
                print(f"note: {sid}: left and right touch across the midline; kept as one node (side 'both')", file=sys.stderr)
                groups = [("both", np.arange(len(tris)))]
            else:
                groups = [(side, np.concatenate(c)) for side, c in sides.items() if c]
        else:
            groups = [("midline", np.arange(len(tris)))]

        for side, sel in groups:
            p, n, t = submesh(pos, nrm, tris[np.sort(sel)])
            base = sid.replace("-", "_")
            vid = base if side in ("midline", "both") else f"{side[0]}_{base}"
            name = label if side == "midline" else (f"Right and left {label}s" if side == "both" else f"{side.capitalize()} {label}")
            meshes.append({"id": vid, "pos": p, "nrm": n, "tris": t})
            vessels.append({
                "id": vid,
                "name": name,
                "kind": s["kind"],
                "side": side,  # right | left | midline | both
                "sourceStructure": sid,
                "fma": s["fma"],
                "sourceConcepts": s["concepts"],
                "sourceElements": [e["element"] for e in s["elements"]],
                "triangles": int(len(t)),
                "boundsMm": {"min": [round(float(v), 3) for v in p.min(axis=0)], "max": [round(float(v), 3) for v in p.max(axis=0)]},
            })
        if pair and len(groups) == 1 and groups[0][0] != "both":
            print(f"note: {sid} has only {[g[0] for g in groups]} in the source", file=sys.stderr)

    glb = write_glb(meshes, manifest["credit"])
    OUT_GLB.write_bytes(glb)

    allp = np.concatenate([m["pos"] for m in meshes])
    meta = {
        "schema": "threadsim.vascular-asset/1",
        "file": OUT_GLB.name,
        "sha256": sha256(glb),
        "bytes": len(glb),
        "units": "mm",
        "axes": "RAS",
        "scale": "1 glTF unit = 1 mm (ThreadSim's loader converts to metres and Y-up once: (x, y, z) -> (-x, z, y) / 1000)",
        "orientation": "RAS: +x patient right, +y anterior, +z superior. Origin: BodyParts3D's source origin (z = 0 near the soles; x = 0 on the midline), not recentred.",
        "fromSource": "BodyParts3D source (LPS: +x left, +y posterior, +z superior, mm) -> RAS: (x, y, z) -> (-x, -y, z). OrganUI's display transform (recentre, x0.004, axes [x, z, -y]) is inverted exactly from its manifest.",
        "nodes": "One mesh node per vessel and side; node name = vessel id. No materials, extras, extensions or node transforms.",
        "boundsMm": {"min": [round(float(v), 3) for v in allp.min(axis=0)], "max": [round(float(v), 3) for v in allp.max(axis=0)]},
        "triangles": int(sum(len(m["tris"]) for m in meshes)),
        "vessels": vessels,
        "source": {
            "dataset": manifest["dataset"],
            "version": manifest["version"],
            "variant": manifest["variant"],
            "license": manifest["license"],
            "licenseUrl": manifest["licenseUrl"],
            "licenseLegalCode": "https://creativecommons.org/licenses/by-sa/2.1/jp/legalcode",
            "sourceLicenseStatement": manifest["sourceLicenseStatement"],
            "meshMirror": manifest["mirror"],
            "adaptedBy": {"repository": SOURCE_REPO, "commit": SOURCE_COMMIT, "codeLicense": "MIT (code only; does not relicense the model)",
                          "file": SOURCE_FILES["vessels.glb"][0], "sha256": SOURCE_FILES["vessels.glb"][1],
                          "manifestSha256": sha256(inputs["manifest.json"])},
            "citation": "Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37:D782-D785. doi:10.1093/nar/gkn613",
        },
        "attribution": manifest["credit"] + " Selected, split by side and converted to millimetre RAS by ThreadSim.",
        "license": "CC-BY-SA-2.1-JP (this GLB and this file are adaptations; see assets/vascular/LICENSE.md)",
        "modifications": [
            f"Selected {len(SELECTION)} of OrganUI's 52 structures: the aorta and its arch, neck, arm and pelvic branches, the visceral trunks and renal arteries, and the great veins.",
            "Split OrganUI's left-right pairs into one node per side, by connected component and the side of its centroid. A pair whose two sides touch across the midline (the brachiocephalic veins, which meet at the superior vena cava) stays one node with side 'both'.",
            "Inverted OrganUI's recentre and scale, and converted to millimetres in RAS axes.",
            "Welded identical vertices, dropped degenerate triangles, removed materials and node extras. No further simplification; no anatomy invented or reshaped.",
        ],
        "limitations": [
            "A single adult reference body (BodyParts3D), not a patient; anatomy is illustrative and unreviewed by a clinician.",
            "Surface meshes only: no centerlines or radii, so this is not a ThreadSim case package (centerlines.json and case.json are still needed).",
            "Vessels are open tubes simplified by OrganUI (meshoptimizer ratio 0.2); thin vessels keep their path but lose surface detail.",
            "The source neck is uneven: the external carotid and external jugular exist only on the right, and the left carotid has a gap at its division.",
            "OrganUI divided the descending aorta at z = 1090 mm (source); the cut is open, not capped.",
            "Share-alike: anything adapted from this mesh must stay CC BY-SA 2.1 JP with attribution.",
        ],
    }
    OUT_META.write_text(json.dumps(meta, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT_GLB.name} ({len(glb)} bytes, {meta['triangles']} triangles, {len(meshes)} nodes) and {OUT_META.name}")


if __name__ == "__main__":
    main()
