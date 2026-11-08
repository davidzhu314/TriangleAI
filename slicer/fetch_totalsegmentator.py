"""Fetch one subject's arterial masks from the TotalSegmentator dataset (small subset v2.0.1, CC BY 4.0).

    python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404

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


def main(subject, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(HttpFile(URL), buffer_size=1 << 20))
    for cls, vessel in MASKS.items():
        data = z.read(f"{subject}/segmentations/{cls}.nii.gz")
        with open(os.path.join(out_dir, f"{vessel}.nii.gz"), "wb") as f:
            f.write(data)
        print(vessel, len(data), "bytes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
