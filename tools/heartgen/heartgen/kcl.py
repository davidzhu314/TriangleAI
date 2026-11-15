"""Read a KCL four-chamber heart (ASCII legacy VTK, tetrahedra, mm) without executing anything from the dataset.

The files put CELL_TYPES before CELLS, which VTK's legacy reader does not accept, so sections are parsed by hand.
The parsed arrays are cached beside the source as .npz, because parsing 10 M text lines takes a while.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np


def read_kcl_vtk(path: Path) -> dict:
    cache = path.with_suffix(".npz")
    if cache.exists() and cache.stat().st_mtime >= path.stat().st_mtime:
        with np.load(cache) as z:
            return {k: z[k] for k in z.files}
    out: dict = {}
    with open(path, "r", encoding="ascii", errors="replace") as f:
        line = f.readline()
        while line:
            head = line.split()
            if not head:
                pass
            elif head[0] == "POINTS":
                n = int(head[1])
                out["points"] = np.loadtxt(f, dtype=np.float32, max_rows=n).reshape(n, 3)
            elif head[0] == "CELL_TYPES":
                n = int(head[1])
                types = np.loadtxt(f, dtype=np.int32, max_rows=n)
                if not np.all(types == 10):
                    raise ValueError("expected tetrahedra only (VTK cell type 10)")
            elif head[0] == "CELLS":
                n = int(head[1])
                cells = np.loadtxt(f, dtype=np.int64, max_rows=n)
                if cells.shape[1] != 5 or not np.all(cells[:, 0] == 4):
                    raise ValueError("expected 4-node cells")
                out["tets"] = cells[:, 1:].astype(np.int32)
            elif head[0] == "CELL_DATA":
                out["_mode"] = "cell"
            elif head[0] == "POINT_DATA":
                out["_mode"] = "point"
            elif head[0] == "SCALARS":
                name = head[1]
                f.readline()  # LOOKUP_TABLE
                n = len(out["tets"]) if out.get("_mode") == "cell" else len(out["points"])
                out[f"{out['_mode']}:{name}"] = np.loadtxt(f, dtype=np.float32, max_rows=n)
            elif head[0] == "VECTORS":
                n = len(out["tets"]) if out.get("_mode") == "cell" else len(out["points"])
                for _ in range(n):  # fibres and sheets: not used
                    f.readline()
            line = f.readline()
    out.pop("_mode", None)
    np.savez(cache, **out)
    return out
