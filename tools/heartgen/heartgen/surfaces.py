"""Surfaces from a labelled tetrahedral mesh: the boundary of the cells that carry a set of labels."""
from __future__ import annotations

import numpy as np

# Each tet face with the vertex opposite it, so the face can be wound to point away from the tet.
_FACES = np.array([[0, 1, 2, 3], [0, 3, 1, 2], [1, 3, 2, 0], [0, 2, 3, 1]])


def label_surface(points: np.ndarray, tets: np.ndarray, ids: np.ndarray, labels: list[int]) -> tuple[np.ndarray, np.ndarray]:
    """Outer surface of the cells whose id is in `labels`: (vertices, triangles), wound outward."""
    t = tets[np.isin(ids, labels)]
    faces = t[:, _FACES].reshape(-1, 4)  # (4n, 4): three face vertices, then the opposite vertex
    key = np.sort(faces[:, :3], axis=1)
    _, first, counts = np.unique(key, axis=0, return_index=True, return_counts=True)
    f = faces[first[counts == 1]]  # a face used by one cell only is on the boundary
    a, b, c, d = (points[f[:, i]].astype(np.float64) for i in range(4))
    inward = np.einsum("ij,ij->i", np.cross(b - a, c - a), d - a) > 0
    tri = f[:, :3].copy()
    tri[inward] = tri[inward][:, [0, 2, 1]]
    used, inv = np.unique(tri, return_inverse=True)
    return points[used].astype(np.float64), inv.reshape(-1, 3).astype(np.int32)


def vertex_normals(v: np.ndarray, tri: np.ndarray) -> np.ndarray:
    """Area-weighted vertex normals."""
    fn = np.cross(v[tri[:, 1]] - v[tri[:, 0]], v[tri[:, 2]] - v[tri[:, 0]])
    n = np.zeros_like(v)
    for i in range(3):
        np.add.at(n, tri[:, i], fn)
    length = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.where(length > 0, length, 1)
