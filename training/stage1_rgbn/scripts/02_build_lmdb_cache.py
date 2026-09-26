"""
Step 2: Build LMDB patch cache from SEN2NAIPv2 TACO dataset.
Eliminates GeoTIFF / network I/O during training.
Extracts 96x96 LR -> 384x384 HR patches with valid masks.
Bands reordered to [B02(Blue), B03(Green), B04(Red), B08(NIR)].
"""
import os, io, sys, json
import lmdb
import numpy as np
import rasterio as rio
from tqdm import tqdm

RAW_TACO   = r"D:\stage1_rgbn\data\raw\sen2naipv2-crosssensor.taco"
SPLITS_DIR = r"D:\stage1_rgbn\data\splits"
LMDB_DIR   = r"D:\stage1_rgbn\data\lmdb_cache"

PATCH_LR = 96
PATCH_HR = 384
NORM = 10000.0
# TACO raw bands are [B04, B03, B02, B08] -> convert to [B02, B03, B04, B08]
BAND_PERM = [2, 1, 0, 3]

def make_mask(lr, hr):
    mlr = np.isfinite(lr).all(axis=0).repeat(4, axis=0).repeat(4, axis=1)
    mhr = np.isfinite(hr).all(axis=0)
    return (mlr & mhr).astype(np.uint8)[np.newaxis, ...]

def extract_crops(lr, hr, mask):
    """
    Extract multiple high-quality patches from a single scene.
    LR shape is (4, 130, 130), HR shape is (4, 520, 520).
    Extracts corner and center patches.
    """
    _, H, W = lr.shape
    crops = []
    offsets = [
        (0, 0),
        (0, W - PATCH_LR),
        (H - PATCH_LR, 0),
        (H - PATCH_LR, W - PATCH_LR),
        ((H - PATCH_LR) // 2, (W - PATCH_LR) // 2)
    ]
    for r, c in offsets:
        lr_crop = lr[:, r:r+PATCH_LR, c:c+PATCH_LR]
        hr_crop = hr[:, r*4:(r+PATCH_LR)*4, c*4:(c+PATCH_LR)*4]
        mask_crop = mask[:, r*4:(r+PATCH_LR)*4, c*4:(c+PATCH_LR)*4]
        # Only keep crops where at least 95% of pixels are valid
        if mask_crop.mean() >= 0.95:
            crops.append((lr_crop, hr_crop, mask_crop))
    return crops

def build_split(ds, split_name, indices, max_patches=None):
    os.makedirs(LMDB_DIR, exist_ok=True)
    out_path = os.path.join(LMDB_DIR, f"{split_name}.lmdb")
    meta_path = os.path.join(LMDB_DIR, f"{split_name}_meta.json")
    map_size = 50 * (1024 ** 3)  # 50 GB map size per split

    env = lmdb.open(out_path, map_size=map_size)
    patch_count = 0
    txn = env.begin(write=True)

    print(f"\nBuilding {split_name} LMDB from {len(indices)} scene pairs...", flush=True)
    for idx in tqdm(indices, desc=split_name):
        try:
            sample = ds.read(idx)
            lr_p = sample.read(0)
            hr_p = sample.read(1)

            with rio.open(lr_p) as s_lr, rio.open(hr_p) as s_hr:
                lr_raw = s_lr.read()[:4].astype(np.float32) / NORM
                hr_raw = s_hr.read()[:4].astype(np.float32) / NORM

            # Reorder to [B02, B03, B04, B08]
            lr_raw = lr_raw[BAND_PERM]
            hr_raw = hr_raw[BAND_PERM]

            mask = make_mask(lr_raw, hr_raw)
            crops = extract_crops(lr_raw, hr_raw, mask)

            for lr_c, hr_c, m_c in crops:
                buf = io.BytesIO()
                np.save(buf, {
                    "lr": lr_c.astype(np.float32),
                    "hr": hr_c.astype(np.float32),
                    "mask": m_c.astype(np.uint8),
                    "scene_id": str(idx)
                })
                key = f"idx_{patch_count:07d}".encode("ascii")
                txn.put(key, buf.getvalue())
                patch_count += 1

                if patch_count % 1000 == 0:
                    txn.commit()
                    txn = env.begin(write=True)

                if max_patches and patch_count >= max_patches:
                    break
        except Exception:
            continue

        if max_patches and patch_count >= max_patches:
            break

    txn.commit()
    env.close()

    with open(meta_path, "w") as f:
        json.dump({"split": split_name, "num_patches": patch_count}, f, indent=2)

    print(f"  {split_name}: {patch_count} patches cached -> {out_path}", flush=True)
    return patch_count

def main():
    import tacoreader.v1 as tr

    taco_source = RAW_TACO if os.path.exists(RAW_TACO) else "tacofoundation:sen2naipv2-crosssensor"
    print(f"Loading dataset via tacoreader from: {taco_source}", flush=True)
    ds = tr.load(taco_source)

    # Build val and test first (faster), then train
    for split in ["val", "test", "train"]:
        split_file = os.path.join(SPLITS_DIR, f"{split}.json")
        with open(split_file) as f:
            meta = json.load(f)
        indices = meta["indices"]
        build_split(ds, split, indices)

if __name__ == "__main__":
    main()
