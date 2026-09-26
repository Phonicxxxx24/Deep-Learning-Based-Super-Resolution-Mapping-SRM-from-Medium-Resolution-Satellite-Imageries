"""
Step 0: Inspect SEN2NAIPv2 dataset structure.
Run BEFORE writing the DataLoader.

Edit RAW_DIR to point to the downloaded dataset.
Then: python scripts/00_inspect_dataset.py
"""
import os, sys, glob
import numpy as np

RAW_DIR  = "data/raw"
N_SAMPLE = 5

try:
    import rasterio; HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


def inspect(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".tif", ".tiff") and HAS_RASTERIO:
        with rasterio.open(path) as src:
            arr = src.read().astype(np.float32)
            return arr, {"shape":arr.shape,"dtype":src.dtypes[0],
                         "crs":str(src.crs),"res":src.res,
                         "min":arr.min(1).min(1).tolist(),
                         "max":arr.max(1).max(1).tolist(),
                         "mean":arr.mean((1,2)).tolist(),
                         "nan":int(np.isnan(arr).sum())}
    elif ext == ".npy":
        arr = np.load(path).astype(np.float32)
        return arr, {"shape":arr.shape,"min":float(arr.min()),
                     "max":float(arr.max()),"mean":float(arr.mean())}
    return None, {"error": f"unsupported: {ext}"}


def main():
    files = sorted(glob.glob(os.path.join(RAW_DIR,"**","*"), recursive=True))
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        print(f"No files in {RAW_DIR}. Download SEN2NAIPv2 first:")
        print("  huggingface-cli download aliFerdinand/SEN2NAIPv2 --local-dir data/raw")
        sys.exit(1)
    print(f"Files found: {len(files)}")
    for f in files[:N_SAMPLE]:
        arr, meta = inspect(f)
        print(f"\n  {os.path.basename(f)}")
        for k, v in meta.items():
            print(f"    {k}: {v}")


if __name__ == "__main__":
    main()
