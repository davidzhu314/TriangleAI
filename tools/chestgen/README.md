# tools/chestgen: chest meshes for a CT case

Builds `client/public/cases/<case>/chest.glb`: the lungs (lobes merged per side), each rib, the costal cartilages and the sternum, in millimetres RAS like the case's `context.glb`. The access module (`client/src/heart-access/`) reads it for the transapical entry line.

Offline only; nothing here ships in the client.

## Rebuild `ts-s1404-cta`

```sh
# A scratch Python 3.12 environment (outside the repo):
py -3.12 -m venv <scratch>/chestvenv
<scratch>/chestvenv/Scripts/python -m pip install -r tools/chestgen/requirements.txt

# 1. Fetch the subject's masks (TotalSegmentator dataset v2.0.1, CC BY 4.0; about 1.8 MB, HTTP range reads of the Zenodo zip).
#    They stay in <scratch>: masks never enter the repo.
<scratch>/chestvenv/Scripts/python -I slicer/fetch_totalsegmentator.py s1404 <scratch>/masks-s1404 --apex

# 2. Build the meshes.
<scratch>/chestvenv/Scripts/python -I tools/chestgen/build_chest.py <scratch>/masks-s1404 client/public/cases/ts-s1404-cta s1404
```

## What the builder does

1. Drops specks: each rib, lung side and the sternum keep their largest connected piece; the cartilages keep every piece at least 2% of the largest. The counts are in each node's extras.
2. Smooths each mask with a Gaussian (1 voxel for lungs, 0.6 for bone and cartilage) and runs marching cubes at half height, so the surface sits at the mask's edge.
3. Simplifies by vertex clustering (5 mm cells for lungs, 2.5 mm for ribs, 3 mm for cartilage and sternum), so a surface moves by at most about half a cell.
4. **Checks the frame:** it builds the subject's heart mask the same way and compares its box with the heart in the case's `context.glb`. It stops if they differ by more than 6 mm. The result is written into the file (`chest` root node, `alignment`). For `ts-s1404-cta` they agree to 1.0 mm.

No AI model is used: the masks are the dataset's own.
