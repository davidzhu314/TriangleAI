"""
D3a: convert the four CathSim phantoms into ThreadSim case packages (spec §3.2, §3.3).

Run in the physics environment (CathSim cloned into physics/vendor/cathsim):

    physics/.venv/bin/python physics/cases/convert_phantoms.py

Writes physics/cases/<phantom>/{case.json, centerlines.json, vessels.glb, LICENSE.md} and
metrics/david/d3a/SUMMARY.md. CathSim is CC BY-NC-SA 4.0: these packages stay in physics/ and reach
the browser only through the physics process (D5). Nothing here is copied into client/.

What comes from CathSim: the phantom surface (visual.stl, a thick-walled shell), the guidewire
insertion point (the world origin, heading +y) and the target sites `bca` and `lcca` (phantom XML).
CathSim ships no centerlines, and neither VMTK nor Slicer is available, so centerlines are computed
from the mesh (DECISIONS.md, "D3a centerlines"):
  1. Voxelise the wall at PITCH and seal it by one voxel.
  2. Lumen = voxels not in the wall that have wall somewhere along at least five of the six axis
     directions (one may look out of an open vessel end; outside space escapes in several),
     connected to the two target sites.
  3. Inscribed radius estimate = distance to the wall (Euclidean distance transform).
  4. Minimal path from the inlet (the most central lumen voxel within 6 mm of CathSim's insertion
     point) to each site, cost
     step / r^2, so paths keep to the middle of the vessel (as VMTK's minimal-path centerlines do).
  5. The shared start of the two paths is the aorta up to the left common carotid origin. The
     brachiocephalic origin is where the radius on the BCA path drops below the midpoint between
     the arch radius and the radius at the site.
  6. Smooth, resample about 1 mm apart, radius = distance from each point to the mesh surface.
  7. Check: every centerline point must be enclosed by the wall: of 14 rays, any that leave the
     phantom must all leave through one opening (within a 60° cone; open boundary loops are also
     capped for the test). Space outside the phantom escapes in spread-out directions.
"""

import json
import re
import struct
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE.parent))
from wire_protocol import cathsim_m_to_ras_mm  # noqa: E402

CATHSIM = REPO / "physics/vendor/cathsim"
ASSETS = CATHSIM / "src/cathsim/dm/components/phantom_assets"
CATHSIM_COMMIT = "adfabb2"
PHANTOMS = ["low_tort", "phantom2", "phantom3", "phantom4"]

PITCH = 0.0006  # m
SAMPLE_SEED = 0  # surface sampling for the voxel wall; fixed so the output is reproducible
# Lumen voxels have wall in at least this many of the six axis directions: one may look out of an
# open vessel end; space outside the phantom escapes in several.
MIN_WALLED_DIRECTIONS = 5
# CathSim inserts the guidewire at the world origin, heading +y (components/guidewire.py).
INSERTION_POINT = np.zeros(3)
INLET_SEARCH = 0.006  # m: the entry is the most central lumen voxel within this of the insertion point
INLET_DEPTH = 0.002  # m
SMOOTH_ITERS = 40
STEP_MM = 1.0
TRIANGLE_CAP = 60_000  # spec §3.3
TRIANGLE_TARGET = 58_000
# Larger than any phantom: a ray that travels this far has left the phantom.
ENCLOSURE_MM = 300.0
# Rays that leave the phantom must all leave through one opening: within this cone (cos 60°).
ESCAPE_CONE_COS = 0.5
DECIMALS = 4

NAMES = {
    "aorta": "Aorta",
    "bca": "Brachiocephalic artery",
    "lcca": "Left common carotid",
}


# ---------------------------------------------------------------------------- inputs


def load_phantom(name):
    mesh = trimesh.load(ASSETS / "meshes" / name / "visual.stl", process=True)
    xml = (ASSETS / f"{name}.xml").read_text()
    sites = {n: np.array([float(c) for c in v.split()]) for n, v in re.findall(r'<site name="(\w+)" pos="([^"]+)"', xml)}
    body = re.search(r'<body name="phantom"([^>]*)>', xml).group(1)
    if "pos=" in body or "quat=" in body or "euler=" in body:
        raise SystemExit(f"{name}: the phantom body has a transform; handle it before converting")
    return mesh, {k: sites[k] for k in ("bca", "lcca")}


# ---------------------------------------------------------------------------- lumen and paths


def lumen(mesh, sites):
    lo = mesh.bounds[0] - 3 * PITCH
    shape = np.ceil((mesh.bounds[1] - lo) / PITCH).astype(int) + 4
    pts, _ = trimesh.sample.sample_surface(mesh, int(mesh.area / PITCH**2 * 8), seed=SAMPLE_SEED)
    ijk = np.floor((pts - lo) / PITCH).astype(int)
    shell = np.zeros(shape, bool)
    shell[ijk[:, 0], ijk[:, 1], ijk[:, 2]] = True
    shell = ndimage.binary_dilation(shell)

    walled = np.zeros(shape, np.int8)
    big = 10**6
    for ax in range(3):
        idx = np.arange(shape[ax]).reshape([-1 if a == ax else 1 for a in range(3)])
        nxt = np.flip(np.minimum.accumulate(np.flip(np.where(shell, idx, big), ax), axis=ax), ax)
        prv = np.maximum.accumulate(np.where(shell, idx, -big), axis=ax)
        walled += (nxt < big).astype(np.int8) + (prv > -big).astype(np.int8)
    enclosed = walled >= MIN_WALLED_DIRECTIONS
    cand = enclosed & ~shell
    lab, _ = ndimage.label(cand, structure=np.ones((3, 3, 3)))

    def snap(q):
        i = np.floor((q - lo) / PITCH).astype(int)
        r = 8
        sl = tuple(slice(max(0, i[a] - r), i[a] + r + 1) for a in range(3))
        sub = np.argwhere(cand[sl]) + np.array([s.start for s in sl])
        return tuple(sub[np.argmin(np.linalg.norm(sub - i, axis=1))])

    site_vox = {n: snap(q) for n, q in sites.items()}
    labels = {lab[v] for v in site_vox.values()}
    if len(labels) != 1:
        raise SystemExit("the two target sites are not in one lumen")
    comp = lab == labels.pop()
    edt = ndimage.distance_transform_edt(~shell) * PITCH
    return comp, edt, lo, site_vox


def inlet_voxel(comp, edt, lo):
    """The most central lumen voxel (largest inscribed radius) near CathSim's insertion point."""
    vv = np.argwhere(comp)
    w = vv * PITCH + lo + PITCH / 2
    # Within reach of the insertion point and at least INLET_DEPTH inside it (the wire heads +y).
    near = (np.linalg.norm(w - INSERTION_POINT, axis=1) <= INLET_SEARCH) & (w[:, 1] >= INSERTION_POINT[1] + INLET_DEPTH)
    if not near.any():
        raise SystemExit("no lumen near the insertion point")
    cand = vv[near]
    return tuple(cand[np.argmax(edt[tuple(cand.T)])])


def min_paths(comp, edt, start, goals):
    ids = -np.ones(comp.shape, np.int64)
    vv = np.argwhere(comp)
    ids[comp] = np.arange(len(vv))
    rows, cols, w = [], [], []
    for o in [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1) if (a, b, c) > (0, 0, 0)]:
        q = vv + np.array(o)
        ok = (q >= 0).all(1) & (q < np.array(comp.shape)).all(1)
        a = np.where(ok)[0]
        j = ids[tuple(q[ok].T)]
        good = j >= 0
        a, j = a[good], j[good]
        r = (edt[tuple(vv[a].T)] + edt[tuple(vv[j].T)]) / 2
        rows.append(a)
        cols.append(j)
        w.append(np.linalg.norm(o) * PITCH / r**2)
    g = coo_matrix((np.concatenate(w), (np.concatenate(rows), np.concatenate(cols))), shape=(len(vv), len(vv))).tocsr()
    s = ids[start]
    _, pred = dijkstra(g, directed=False, indices=s, return_predecessors=True)
    out = {}
    for name, goal in goals.items():
        k = ids[goal]
        path = []
        while k != s:
            if k < 0:
                raise SystemExit(f"no path to {name}")
            path.append(k)
            k = pred[k]
        path.append(s)
        out[name] = vv[path[::-1]]
    return out


# ---------------------------------------------------------------------------- polylines


def smooth(p, iters=SMOOTH_ITERS):
    p = p.astype(float).copy()
    for _ in range(iters):
        p[1:-1] = (p[:-2] + 2 * p[1:-1] + p[2:]) / 4
    return p


def resample(p, step):
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    cs = np.concatenate([[0], np.cumsum(seg)])
    n = max(2, int(round(cs[-1] / step)))
    s = np.linspace(0, cs[-1], n + 1)
    return np.stack([np.interp(s, cs, p[:, a]) for a in range(3)], axis=1)


def capped(mesh):
    """The mesh with each open boundary loop closed by a fan (for the enclosure check only): a ray
    from inside a vessel can leave through an open vessel end, which is still inside the phantom."""
    loops = mesh.outline().discrete if len(trimesh.grouping.group_rows(mesh.edges_sorted, require_count=1)) else []
    v, f = [mesh.vertices], [mesh.faces]
    n = len(mesh.vertices)
    for loop in loops:
        loop = np.asarray(loop)
        c = loop.mean(axis=0)
        k = len(loop)
        v.append(np.vstack([loop, c]))
        f.append(np.array([[n + i, n + (i + 1) % k, n + k] for i in range(k)]))
        n += k + 1
    return trimesh.Trimesh(np.vstack(v), np.vstack(f), process=False)


def enclosed_points(mesh, pts):
    d = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
                 + [[a, b, c] for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)], float)
    d /= np.linalg.norm(d, axis=1)[:, None]
    o = np.repeat(pts, len(d), 0)
    dd = np.tile(d, (len(pts), 1))
    loc, ri, _ = mesh.ray.intersects_location(o, dd, multiple_hits=False)
    dist = np.full(len(o), np.inf)
    dist[ri] = np.linalg.norm(loc - o[ri], axis=1)
    escaped = dist.reshape(len(pts), len(d)) > ENCLOSURE_MM / 1000
    ok = np.ones(len(pts), bool)
    for i in np.where(escaped.any(1))[0]:
        e = d[escaped[i]]
        mean = e.sum(0)
        mean /= np.linalg.norm(mean) if np.linalg.norm(mean) > 0 else 1
        # Escaping rays must leave through one opening: all within one cone around their mean.
        ok[i] = (e @ mean >= ESCAPE_CONE_COS).all()
    return ok


# ---------------------------------------------------------------------------- mesh


def decimate(vertices, faces, normals, target):
    """Vertex clustering on one grid; vertices merge only when their normals share an octant, so
    the inner and outer walls never fuse. Cell size bisected to just under `target` triangles."""
    octant = ((normals[:, 0] > 0).astype(np.int64) | ((normals[:, 1] > 0) << 1) | ((normals[:, 2] > 0) << 2))
    lo = vertices.min(axis=0)
    size = vertices.max(axis=0) - lo

    def cluster(cell):
        g = np.floor((vertices - lo) / cell).astype(np.int64)
        dims = np.floor(size / cell).astype(np.int64) + 1
        key = ((g[:, 0] * dims[1] + g[:, 1]) * dims[2] + g[:, 2]) * 8 + octant
        _, inv = np.unique(key, return_inverse=True)
        f = inv[faces]
        f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])]
        f = np.unique(f, axis=0)
        return inv, f

    if len(faces) <= target:
        return vertices, faces
    lo_c, hi_c = 1e-6, float(np.linalg.norm(size))
    for _ in range(30):
        mid = (lo_c + hi_c) / 2
        if len(cluster(mid)[1]) <= target:
            hi_c = mid
        else:
            lo_c = mid
    inv, f = cluster(hi_c)
    n = inv.max() + 1
    sums = np.zeros((n, 3))
    np.add.at(sums, inv, vertices)
    counts = np.bincount(inv, minlength=n)[:, None]
    v = sums / counts
    used, f = np.unique(f, return_inverse=True)
    return v[used], f.reshape(-1, 3)


def vertex_normals(v, f):
    """Area-weighted vertex normals. Where those cancel (a vertex whose faces fold back after
    clustering), fall back to the sum of unit face normals, then to +S, so every normal is unit."""
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    fl = np.linalg.norm(fn, axis=1)[:, None]
    fu = fn / np.where(fl > 0, fl, 1)
    n = np.zeros_like(v)
    nu = np.zeros_like(v)
    for k in range(3):
        np.add.at(n, f[:, k], fn)
        np.add.at(nu, f[:, k], fu)
    ln = np.linalg.norm(n, axis=1)
    bad = ln < 1e-9 * max(1.0, float(fl.max()))
    n[bad] = nu[bad]
    ln = np.linalg.norm(n, axis=1)
    still = ln < 1e-12
    n[still] = [0.0, 0.0, 1.0]
    ln[still] = 1.0
    return n / ln[:, None]


def write_glb(parts, path):
    """Deterministic GLB: one node and mesh per (name, vertices, faces); POSITION, NORMAL, uint32."""
    bin_chunks, views, accessors, meshes, nodes = [], [], [], [], []
    offset = 0

    def add(data, target):
        nonlocal offset
        b = data.tobytes()
        pad = (-len(b)) % 4
        views.append({"buffer": 0, "byteLength": len(b), "byteOffset": offset, "target": target})
        bin_chunks.append(b + b"\0" * pad)
        offset += len(b) + pad
        return len(views) - 1

    for i, (name, v, f) in enumerate(parts):
        v32 = v.astype("<f4")
        accessors.append({"bufferView": add(v32, 34962), "componentType": 5126, "count": len(v32), "type": "VEC3",
                          "min": [float(x) for x in v32.min(0)], "max": [float(x) for x in v32.max(0)]})
        accessors.append({"bufferView": add(vertex_normals(v, f).astype("<f4"), 34962), "componentType": 5126, "count": len(v32), "type": "VEC3"})
        accessors.append({"bufferView": add(f.astype("<u4").ravel(), 34963), "componentType": 5125, "count": int(f.size), "type": "SCALAR"})
        meshes.append({"name": name, "primitives": [{"attributes": {"NORMAL": 3 * i + 1, "POSITION": 3 * i}, "indices": 3 * i + 2, "mode": 4}]})
        nodes.append({"mesh": i, "name": name})
    gltf = {
        "accessors": accessors,
        "asset": {"extras": {"axes": "RAS", "units": "mm"}, "generator": "threadsim physics/cases/convert_phantoms.py", "version": "2.0"},
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
        "meshes": meshes,
        "nodes": nodes,
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
    }
    js = json.dumps(gltf, sort_keys=True, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    binary = b"".join(bin_chunks)
    total = 12 + 8 + len(js) + 8 + len(binary)
    out = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
    path.write_bytes(out)


# ---------------------------------------------------------------------------- package


def rnd(x):
    r = round(float(x), DECIMALS)
    return 0.0 if r == 0 else r


def to_ras(p):
    return [rnd(c) for c in cathsim_m_to_ras_mm(p)]


def convert(name):
    mesh, sites = load_phantom(name)
    comp, edt, lo, site_vox = lumen(mesh, sites)
    start = inlet_voxel(comp, edt, lo)
    vox = min_paths(comp, edt, start, site_vox)
    world = {k: v * PITCH + lo + PITCH / 2 for k, v in vox.items()}

    # Shared start = aorta to the LCCA origin.
    a, b = vox["bca"], vox["lcca"]
    k = 0
    while k < min(len(a), len(b)) and (a[k] == b[k]).all():
        k += 1
    trunk = world["bca"][:k]
    to_bca = world["bca"][k - 1:]
    to_lcca = world["lcca"][k - 1:]
    # Targets end exactly at CathSim's sites.
    to_bca = np.vstack([to_bca[:-1], sites["bca"]])
    to_lcca = np.vstack([to_lcca[:-1], sites["lcca"]])

    pq = trimesh.proximity.ProximityQuery(mesh)

    def radius(p):
        _, d, _ = pq.on_surface(p)
        return d

    # BCA origin: where the radius on the BCA path drops below the midpoint of arch and site radii.
    sm_bca = smooth(to_bca)
    r_bca = radius(sm_bca)
    thresh = (r_bca[0] + r_bca[-1]) / 2
    above = np.where(r_bca >= thresh)[0]
    j = int(above[-1]) + 1 if len(above) else 1
    j = min(max(j, 1), len(sm_bca) - 2)

    pieces = {
        "e_aorta": ("aorta", smooth(trunk)),
        "e_arch": ("aorta", sm_bca[: j + 1]),
        "e_bca": ("bca", sm_bca[j:]),
        "e_lcca": ("lcca", smooth(to_lcca)),
    }
    # Shared nodes: the junctions are exactly the ends of the pieces.
    junction = pieces["e_aorta"][1][-1]
    pieces["e_arch"] = ("aorta", np.vstack([junction, pieces["e_arch"][1][1:]]))
    pieces["e_lcca"] = ("lcca", np.vstack([junction, pieces["e_lcca"][1][1:]]))

    ends = {
        "e_aorta": ("n_inlet", "n_lcca_o"),
        "e_arch": ("n_lcca_o", "n_bca_o"),
        "e_bca": ("n_bca_o", "n_bca"),
        "e_lcca": ("n_lcca_o", "n_lcca"),
    }
    node_world = {
        "n_inlet": pieces["e_aorta"][1][0],
        "n_lcca_o": junction,
        "n_bca_o": pieces["e_arch"][1][-1],
        "n_bca": sites["bca"],
        "n_lcca": sites["lcca"],
    }
    kinds = {"n_inlet": "entry", "n_lcca_o": "branch", "n_bca_o": "branch", "n_bca": "target", "n_lcca": "target"}
    nodes = [{"id": n, "kind": kinds[n], "pos": to_ras(p)} for n, p in node_world.items()]
    node_pos = {n["id"]: n["pos"] for n in nodes}

    edges, all_pts, check = [], [], []
    for eid, (vessel, poly) in pieces.items():
        mm = resample(poly * 1000, STEP_MM) / 1000
        r = radius(mm) * 1000
        pts = [to_ras(p) for p in mm]
        f, t = ends[eid]
        pts[0], pts[-1] = node_pos[f], node_pos[t]
        edges.append({"from": f, "id": eid, "points": pts, "radii_mm": [rnd(x) for x in r], "to": t, "vessel": vessel})
        all_pts.append((vessel, mm))
        check.append(mm)
    inside = enclosed_points(capped(mesh), np.vstack(check))
    if not inside.all():
        raise SystemExit(f"{name}: {int((~inside).sum())} centerline points are not enclosed by the wall")

    # Mesh: RAS mm, simplified, split per vessel by the nearest centerline point.
    v_ras = np.array([cathsim_m_to_ras_mm(p) for p in mesh.vertices])
    faces = np.asarray(mesh.faces)
    n = np.asarray(mesh.vertex_normals)
    v_dec, f_dec = decimate(v_ras, faces, np.stack([-n[:, 0], n[:, 2], n[:, 1]], axis=1), TRIANGLE_TARGET)
    labels_pts = np.vstack([np.array([cathsim_m_to_ras_mm(p) for p in pts]) for _, pts in all_pts])
    labels = np.concatenate([[v] * len(pts) for v, pts in all_pts])
    _, nearest = cKDTree(labels_pts).query(v_dec[f_dec].mean(axis=1))
    face_vessel = labels[nearest]
    parts = []
    for vessel in ("aorta", "bca", "lcca"):
        fv = f_dec[face_vessel == vessel]
        used, inv = np.unique(fv, return_inverse=True)
        parts.append((vessel, v_dec[used], inv.reshape(-1, 3)))
    triangles = sum(len(p[2]) for p in parts)
    if triangles >= TRIANGLE_CAP:
        raise SystemExit(f"{name}: {triangles} triangles")

    case = {
        "axes": "RAS",
        "entries": [{"id": "inlet", "name": "Phantom inlet (descending aorta)", "node": "n_inlet"}],
        "id": name,
        "physics": {"available": True, "phantom": name},
        "riskZones": [],
        "scenario": f"CathSim aortic arch phantom {name}: drive the physics wire from the inlet to the brachiocephalic or left common carotid. Research and demo use only (CC BY-NC-SA 4.0).",
        "schema": "threadsim.case/1",
        "source": {"dataset": f"CathSim phantom {name} (airvlab/cathsim @ {CATHSIM_COMMIT})", "kind": "cathsim", "license": "CC BY-NC-SA 4.0"},
        "targets": [
            {"id": "bca", "name": "Brachiocephalic artery", "node": "n_bca"},
            {"id": "lcca", "name": "Left common carotid", "node": "n_lcca"},
        ],
        "title": f"CathSim phantom {name}",
        "units": "mm",
        "vessels": [{"id": v, "kind": "artery", "name": NAMES[v]} for v in ("aorta", "bca", "lcca")],
    }
    out = HERE / name
    out.mkdir(exist_ok=True)
    (out / "case.json").write_text(json.dumps(case, indent=2, sort_keys=True) + "\n")
    (out / "centerlines.json").write_text(json.dumps({"edges": edges, "nodes": nodes}, indent=2, sort_keys=True) + "\n")
    write_glb(parts, out / "vessels.glb")
    (out / "LICENSE.md").write_text(LICENSE.format(name=name, commit=CATHSIM_COMMIT))

    lengths = {e["id"]: float(np.linalg.norm(np.diff(np.array(e["points"]), axis=0), axis=1).sum()) for e in edges}
    radii = {e["id"]: (min(e["radii_mm"]), max(e["radii_mm"])) for e in edges}
    inlet_offset = float(np.linalg.norm(node_world["n_inlet"])) * 1000
    return {"name": name, "source_triangles": len(faces), "triangles": triangles, "lengths": lengths, "radii": radii,
            "points": int(sum(len(e["points"]) for e in edges)), "inlet_offset_mm": inlet_offset}


LICENSE = """# CathSim phantom `{name}` — license and attribution

This case package is an adaptation of the `{name}` phantom from **CathSim** (https://github.com/airvlab/cathsim, commit {commit}),
licensed under **CC BY-NC-SA 4.0** (https://creativecommons.org/licenses/by-nc-sa/4.0/). Research and demo use only;
no commercial use without the CathSim authors' permission. See also CathSim's TERMS.md.

Changes made by ThreadSim (`physics/cases/convert_phantoms.py`):
- coordinates converted from CathSim's world frame (metres) to RAS millimetres;
- `visual.stl` simplified to under 60,000 triangles and split into one mesh per vessel;
- centerlines and radii computed from the mesh; entry at the phantom inlet; targets at CathSim's `bca` and `lcca` sites.

This adaptation is shared under the same license (CC BY-NC-SA 4.0). It is served to the browser only by the local
physics process and is not part of the ThreadSim client bundle.
"""


def main():
    names = sys.argv[1:] or PHANTOMS
    rows = []
    for n in names:
        s = convert(n)
        rows.append(s)
        print(json.dumps(s))
    if names == PHANTOMS:
        lines = ["# D3a phantom packages", "", "Produced by `physics/cases/convert_phantoms.py`. Lengths in mm (RAS), radii min–max in mm.", "",
                 "| Phantom | Source triangles | GLB triangles | Centerline points | Inlet offset from CathSim origin (mm) | e_aorta | e_arch | e_bca | e_lcca |",
                 "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
        for s in rows:
            cell = lambda e: f"{s['lengths'][e]:.0f} mm, r {s['radii'][e][0]:.1f}–{s['radii'][e][1]:.1f}"
            lines.append(f"| {s['name']} | {s['source_triangles']:,} | {s['triangles']:,} | {s['points']} | {s['inlet_offset_mm']:.1f} | "
                         + " | ".join(cell(e) for e in ("e_aorta", "e_arch", "e_bca", "e_lcca")) + " |")
        (REPO / "metrics/david/d3a").mkdir(parents=True, exist_ok=True)
        (REPO / "metrics/david/d3a/SUMMARY.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
