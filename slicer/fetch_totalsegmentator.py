"""Fetch one subject's arterial masks from the TotalSegmentator dataset (small subset v2.0.1, CC BY 4.0).

    python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404
    python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404-context --context

`--context` fetches the body-context masks instead: the vertebrae C7 to L5, the ribs (left and right 1 to 12),
the sternum and the heart, and the major veins (venae cavae, iliac and brachiocephalic veins), for the faint
background mesh (`slicer/export_context.py`). A class missing from the subject's folder is skipped and named.

Reads only the needed members of the 3.2 GB Zenodo zip with HTTP range requests. Only the arterial
masks are written. The CT image (`ct.nii.gz`) and the dataset's `meta.csv` (age, sex, scanner) are
never downloaded, so nothing but vessel geometry reaches the export.
Dataset: https://doi.org/10.5281/zenodo.10047263 (THIRD_PARTY.md, D3c).
"""
import io
import os
import sys
import urllib.request
import zipfile

URL = "https://zenodo.org/api/records/10047263/files/Totalsegmentator_dataset_small_v201.zip/content"

# TotalSegmentator class -> ThreadSim vessel id (spec §3.1: arterial classes only).
MASKS = {
    "aorta": "aorta",
    "brachiocephalic_trunk": "bca",
    "common_carotid_artery_right": "rcca",
    "common_carotid_artery_left": "lcca",
    "subclavian_artery_right": "r_subclavian",
    "subclavian_artery_left": "l_subclavian",
    "iliac_artery_right": "r_iliac",
    "iliac_artery_left": "l_iliac",
}


# Body context (bones and heart), same subject, same dataset and license. File name = class name.
CONTEXT = (
    ["vertebrae_C7"] + [f"vertebrae_T{i}" for i in range(1, 13)] + [f"vertebrae_L{i}" for i in range(1, 6)]
    + [f"rib_{side}_{i}" for side in ("left", "right") for i in range(1, 13)]
    + ["sternum", "heart"]
)

# Major veins for the body context: TotalSegmentator v2 class -> node id in context.glb. File name = class name.
VEINS = {
    "inferior_vena_cava": "inferior_vena_cava",
    "superior_vena_cava": "superior_vena_cava",
    "iliac_vena_left": "l_iliac_vein",
    "iliac_vena_right": "r_iliac_vein",
    "brachiocephalic_vein_left": "l_brachiocephalic_vein",
    "brachiocephalic_vein_right": "r_brachiocephalic_vein",
}


class HttpFile(io.RawIOBase):
    """A seekable read-only file over HTTP range requests."""

    def __init__(self, url):
        self.url = urllib.request.urlopen(urllib.request.Request(url, method="HEAD")).geturl()
        with urllib.request.urlopen(urllib.request.Request(self.url, headers={"Range": "bytes=0-0"})) as r:
            self.size = int(r.headers["Content-Range"].split("/")[1])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size:
            return 0
        end = min(self.size, self.pos + len(b)) - 1
        with urllib.request.urlopen(urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})) as r:
            data = r.read()
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


def main(subject, out_dir, context=False):
    os.makedirs(out_dir, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(HttpFile(URL), buffer_size=1 << 20))
    wanted = {c: c for c in [*CONTEXT, *VEINS]} if context else MASKS
    members = set(z.namelist())
    for cls, name in wanted.items():
        member = f"{subject}/segmentations/{cls}.nii.gz"
        if context and member not in members:
            print("SKIPPED", cls, "(not in this subject's segmentations)")
            continue
        data = z.read(member)
        with open(os.path.join(out_dir, f"{name}.nii.gz"), "wb") as f:
            f.write(data)
        print(name, len(data), "bytes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], context="--context" in sys.argv[3:])
