"""heartgen command line.

  python -m heartgen template <source.vtk> --case <id> --title "<title>"   build out/<id>/ from a KCL four-chamber mesh
  python -m heartgen publish <id>                                           copy the client files to client/public/hearts/

M0 builds the template's raw label surfaces. Later milestones add repair, landmarks and the generated valves.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

from . import glb, kcl, parts, surfaces

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
OUT = HERE / "out"
PUBLIC = REPO / "client" / "public" / "hearts"

# KCL labels (Strocchi et al. 2020, Rodero et al. 2021). Vein and appendage rings join their atrium; the flat caps
# that close the veins and the appendage (11 to 17) are left out, so the stubs stay open.
KCL_PARTS = {
    "lv_myocardium": [1],
    "rv_wall": [2],
    "la": [3, 18, 19, 20, 21, 22],
    "ra": [4, 23, 24],
    "aorta": [5],
    "pulmonary_trunk": [6],
    "mv_plane": [7],
    "tv_plane": [8],
    "av_plane": [9],
    "pv_plane": [10],
}

# The KCL meshes are in scanner coordinates, millimetres, LPS: +x patient left, +y posterior, +z superior. Checked on
# the average heart: the right atrium is at -x, the left atrium at +y, the great arteries at +z (DECISIONS.md).
LPS_TO_RAS = np.diag([-1.0, -1.0, 1.0])
# Cathy's map from RAS millimetres to the viewer's metres, Y-up (client/src/contracts/case.ts RAS_MM_TO_YUP_M).
RAS_MM_TO_YUP_M = np.array([[-0.001, 0, 0], [0, 0, 0.001], [0, 0.001, 0]])

GLTF_TRANSFORM = "@gltf-transform/cli@4.2.1"


def pnpm() -> list[str]:
    """pnpm itself, or the repo's pinned pnpm through npx where it is not installed globally."""
    return ["pnpm"] if shutil.which("pnpm") else ["npx", "-y", "pnpm@9.15.9"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_template(source: Path, case: str, title: str, source_note: dict) -> None:
    out = OUT / case
    out.mkdir(parents=True, exist_ok=True)
    data = kcl.read_kcl_vtk(source)
    points, tets, ids = data["points"], data["tets"], data["cell:ID"].astype(int)
    to_view = RAS_MM_TO_YUP_M @ LPS_TO_RAS

    groups: dict[str, list[dict]] = {g: [] for g in parts.GROUPS}
    counts = {}
    for name, labels in KCL_PARTS.items():
        part = parts.PARTS[name]
        v_mm, tri = surfaces.label_surface(points, tets, ids, labels)
        v = v_mm @ to_view.T
        groups[part.group].append({
            "name": name,
            "vertices": v,
            "normals": surfaces.vertex_normals(v, tri),
            "triangles": tri,
            "extras": {"display_name": part.display_name, "description": part.description, "group": part.group, "measurements": []},
        })
        counts[name] = int(len(tri))
    groups = {g: m for g, m in groups.items() if m}

    raw = out / "heart.raw.glb"
    triangles = glb.write_glb(raw, "heart", groups, {"case": case, "title": title, "stage": "M0 raw template surfaces"})
    final = out / "heart.glb"
    # Meshopt compression (glTF Transform, MIT). Geometry is only quantised and reordered: names and extras stay.
    subprocess.run([*pnpm(), "dlx", GLTF_TRANSFORM, "meshopt", str(raw), str(final), "--level", "medium"], check=True, cwd=REPO)

    provenance = {
        "schema": "heartgen.provenance/1",
        "case": case,
        "title": title,
        "input": {"type": "template", **source_note, "file": source.name, "sha256": sha256(source)},
        "stage": "M0: raw label surfaces of the template. No repair, remeshing, landmarks or generated valves yet.",
        "tools": {"heartgen": "M0", "python": sys.version.split()[0], "numpy": np.__version__, "gltf-transform": GLTF_TRANSFORM},
        "source_frame": "LPS, millimetres (scanner coordinates of the template)",
        "pipeline_frame": "RAS, millimetres (+x right, +y anterior, +z superior), as Cathy's case packages",
        "export_frame": "metres, Y-up (+x patient left, +y superior, +z anterior), baked into the vertices",
        "matrices": {"lps_mm_to_ras_mm": LPS_TO_RAS.tolist(), "ras_mm_to_view_m": RAS_MM_TO_YUP_M.tolist()},
        "parts": {name: {"kcl_labels": KCL_PARTS[name], "triangles": counts[name]} for name in KCL_PARTS},
        "triangles": triangles,
        "parameters": {},
        "manual_edits": [],
        "not_for": "Education only. Not a clinical device; measurements are illustrative, never diagnostic.",
    }
    (out / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"{case}: {triangles} triangles, {raw.stat().st_size} -> {final.stat().st_size} bytes")


def publish(case: str) -> None:
    src, dst = OUT / case, PUBLIC / case
    dst.mkdir(parents=True, exist_ok=True)
    for name in ["heart.glb", "provenance.json"]:
        shutil.copyfile(src / name, dst / name)
    prov = json.loads((src / "provenance.json").read_text())
    index_path = PUBLIC / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"schema": "heartgen.index/1", "hearts": []}
    entry = {"id": case, "title": prov["title"], "source": prov["input"]["citation_short"], "license": prov["input"]["license"], "triangles": prov["triangles"], "glb": f"{case}/heart.glb"}
    index["hearts"] = [h for h in index["hearts"] if h["id"] != case] + [entry]
    index_path.write_text(json.dumps(index, indent=2) + "\n")
    print(f"published {case} to {dst.relative_to(REPO)}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="heartgen")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("template")
    t.add_argument("source", type=Path)
    t.add_argument("--case", required=True)
    t.add_argument("--title", required=True)
    t.add_argument("--source-note", type=Path, required=True, help="JSON: dataset, url, license, citation, citation_short")
    p = sub.add_parser("publish")
    p.add_argument("case")
    a = ap.parse_args()
    if a.cmd == "template":
        build_template(a.source, a.case, a.title, json.loads(a.source_note.read_text()))
    else:
        publish(a.case)
