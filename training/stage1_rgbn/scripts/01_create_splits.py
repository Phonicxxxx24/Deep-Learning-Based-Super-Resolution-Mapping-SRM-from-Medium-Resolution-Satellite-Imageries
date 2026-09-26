"""
Step 1: Geographic train/val/test split (80/10/10) for SEN2NAIP TACO dataset.
Splits by geographic region (rai:admin1 / scene cluster) to prevent spatial data leakage.
"""
import os, json, random
import numpy as np

SEED = 42
TRAIN_RATIO = 0.80
VAL_RATIO = 0.10
TEST_RATIO = 0.10

RAW_TACO = r"D:\stage1_rgbn\data\raw\sen2naipv2-crosssensor.taco"
OUT_DIR  = r"D:\stage1_rgbn\data\splits"

random.seed(SEED)
np.random.seed(SEED)

def main():
    import tacoreader.v1 as tr

    os.makedirs(OUT_DIR, exist_ok=True)
    taco_source = RAW_TACO if os.path.exists(RAW_TACO) else "tacofoundation:sen2naipv2-crosssensor"
    print(f"Loading dataset from: {taco_source}")
    ds = tr.load(taco_source)
    n_total = len(ds)
    print(f"Total samples: {n_total}")

    # Use administrative region or geospatial cluster for scene-disjoint split
    if "rai:admin1" in ds.columns:
        regions = ds["rai:admin1"].fillna("unknown").tolist()
    else:
        # Fallback: divide into 50 geographic tiles by index
        regions = [f"tile_{i // 160}" for i in range(n_total)]

    region_map = {}
    for idx, reg in enumerate(regions):
        region_map.setdefault(reg, []).append(idx)

    unique_regions = list(region_map.keys())
    random.shuffle(unique_regions)

    train_indices, val_indices, test_indices = [], [], []
    train_target = int(n_total * TRAIN_RATIO)
    val_target   = int(n_total * VAL_RATIO)

    for reg in unique_regions:
        idxs = region_map[reg]
        if len(train_indices) + len(idxs) <= train_target:
            train_indices.extend(idxs)
        elif len(val_indices) + len(idxs) <= val_target:
            val_indices.extend(idxs)
        else:
            test_indices.extend(idxs)

    # In case any leftovers, ensure all are partitioned
    all_assigned = set(train_indices + val_indices + test_indices)
    for i in range(n_total):
        if i not in all_assigned:
            test_indices.append(i)

    splits = {
        "train": sorted(train_indices),
        "val":   sorted(val_indices),
        "test":  sorted(test_indices)
    }

    print("\nSplit results:")
    for split_name, idx_list in splits.items():
        out_file = os.path.join(OUT_DIR, f"{split_name}.json")
        with open(out_file, "w") as f:
            json.dump({
                "indices": idx_list,
                "num_pairs": len(idx_list),
                "ratio": len(idx_list) / n_total
            }, f, indent=2)
        print(f"  {split_name:5s}: {len(idx_list):5d} pairs ({len(idx_list)/n_total*100:.1f}%) -> {out_file}")

if __name__ == "__main__":
    main()
