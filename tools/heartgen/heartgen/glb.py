"""A small GLB writer: named mesh nodes under group nodes, positions and normals, display words in extras."""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np


def write_glb(path: Path, root_name: str, groups: dict[str, list[dict]], extras: dict | None = None) -> int:
    """groups: group name → meshes, each {name, vertices (n,3), normals (n,3), triangles (m,3), extras}. Returns triangles."""
    blob = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def add(data: np.ndarray, target: int, kind: str, component: int, with_bounds: bool = False) -> int:
        while len(blob) % 4:
            blob.append(0)
        raw = data.tobytes()
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(raw), "target": target})
        blob.extend(raw)
        acc = {"bufferView": len(views) - 1, "componentType": component, "count": int(data.shape[0] if kind != "SCALAR" else data.size), "type": kind}
        if with_bounds:
            acc["min"] = [float(x) for x in data.min(0)]
            acc["max"] = [float(x) for x in data.max(0)]
        accessors.append(acc)
        return len(accessors) - 1

    group_nodes, triangles = [], 0
    for group, items in groups.items():
        children = []
        for m in items:
            pos = add(np.ascontiguousarray(m["vertices"], dtype="<f4"), 34962, "VEC3", 5126, True)
            nor = add(np.ascontiguousarray(m["normals"], dtype="<f4"), 34962, "VEC3", 5126)
            idx = add(np.ascontiguousarray(m["triangles"], dtype="<u4").reshape(-1), 34963, "SCALAR", 5125)
            triangles += len(m["triangles"])
            meshes.append({"name": m["name"], "primitives": [{"attributes": {"POSITION": pos, "NORMAL": nor}, "indices": idx, "material": 0}]})
            nodes.append({"name": m["name"], "mesh": len(meshes) - 1, "extras": m["extras"]})
            children.append(len(nodes) - 1)
        nodes.append({"name": group, "children": children})
        group_nodes.append(len(nodes) - 1)
    nodes.append({"name": root_name, "children": group_nodes, **({"extras": extras} if extras else {})})

    doc = {
        "asset": {"version": "2.0", "generator": "heartgen"},
        "scene": 0,
        "scenes": [{"nodes": [len(nodes) - 1]}],
        "nodes": nodes,
        "meshes": meshes,
        # One neutral material: the Heart tab colours every part from design tokens at load (DECISIONS.md).
        "materials": [{"name": "untinted", "pbrMetallicRoughness": {"baseColorFactor": [0.7, 0.7, 0.7, 1], "metallicFactor": 0, "roughnessFactor": 0.7}, "doubleSided": True}],
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
    return triangles
