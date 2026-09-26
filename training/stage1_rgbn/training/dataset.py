"""
SEN2NAIPv2 DataLoader for Stage 1 RGBN SR training.
Reads from LMDB patch cache built by scripts/02_build_lmdb_cache.py.
"""
import os, io, json, random
import lmdb, numpy as np, torch
from torch.utils.data import Dataset, DataLoader

def _augment(lr, hr, mask):
    if random.random() < 0.5:
        lr = lr[:, :, ::-1].copy(); hr = hr[:, :, ::-1].copy(); mask = mask[:, :, ::-1].copy()
    if random.random() < 0.5:
        lr = lr[:, ::-1].copy();    hr = hr[:, ::-1].copy();    mask = mask[:, ::-1].copy()
    k = random.randint(0, 3)
    if k > 0:
        lr = np.rot90(lr, k, (1,2)).copy(); hr = np.rot90(hr, k, (1,2)).copy()
        mask = np.rot90(mask, k, (1,2)).copy()
    return lr, hr, mask

class SEN2NAIPv2Dataset(Dataset):
    def __init__(self, lmdb_path, split_json=None, augment=False, patch_size_lr=96):
        self.lmdb_path = lmdb_path
        self.augment   = augment
        self._env = None

        meta_path = lmdb_path.replace(".lmdb", "_meta.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                self.length = json.load(f)["num_patches"]
        else:
            with lmdb.open(self.lmdb_path, readonly=True, lock=False) as env:
                with env.begin() as txn:
                    self.length = txn.stat()["entries"]

    def _env_(self):
        if self._env is None:
            self._env = lmdb.open(self.lmdb_path, readonly=True, lock=False,
                                  readahead=True, meminit=False)
        return self._env

    def __len__(self):
        return self.length

    def __getitem__(self, i):
        key = f"idx_{i:07d}".encode()
        with self._env_().begin(write=False) as txn:
            buf = txn.get(key)
        data = np.load(io.BytesIO(buf), allow_pickle=True).item()
        lr   = data["lr"].astype(np.float32)
        hr   = data["hr"].astype(np.float32)
        mask = data["mask"].astype(np.float32)
        if self.augment:
            lr, hr, mask = _augment(lr, hr, mask)
        return {
            "lr": torch.from_numpy(lr),
            "hr": torch.from_numpy(hr),
            "mask": torch.from_numpy(mask)
        }

def build_dataloader(cfg, split="train"):
    dc, tc = cfg["data"], cfg["training"]
    lmdb_path  = os.path.join(dc["lmdb_dir"], f"{split}.lmdb")
    split_json = os.path.join(dc["splits_dir"], f"{split}.json")
    ds = SEN2NAIPv2Dataset(lmdb_path, split_json, augment=(split=="train"),
                           patch_size_lr=dc.get("patch_size_lr", 96))
    return DataLoader(
        ds,
        batch_size=tc["batch_size"],
        shuffle=(split=="train"),
        num_workers=tc.get("num_workers", 4),
        pin_memory=tc.get("pin_memory", True),
        persistent_workers=(tc.get("num_workers", 4) > 0),
        drop_last=(split=="train")
    )
