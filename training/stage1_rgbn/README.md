# Stage 1 — RGBN Super-Resolution Model (Sen2SR_RGBN)

> **4-Band Multi-Spectral 4× Super-Resolution** · Sentinel-2 10m → 2.5m  
> **Team**: Deep Learning SRM · SIH 2026  
> **Status**: ✅ Production-Ready — Selected for Integration

---

## What This Is

This directory contains the **complete training pipeline** for the custom-trained
`Sen2SR_RGBN` model — our Stage 1 super-resolution backbone. It takes raw 4-band
Sentinel-2 imagery (B02 Blue, B03 Green, B04 Red, B08 NIR at 10 m) and outputs
crisp 4-band imagery at **2.5 m Ground Sampling Distance (GSD)** — a **4× spatial
resolution boost**.

The model was trained by [@DhruvGohel46](https://github.com/DhruvGohel46) and is
the result of a systematic comparison of **3 architectures** over 5+ hours of GPU
training on an NVIDIA RTX A2000 12 GB.

---

## Final Selected Model — Quick Numbers

| Metric | Value |
|---|---|
| Architecture | `Sen2SR_RGBN` — 8-block RRDB + Dual PixelShuffle |
| Parameters | **4.58 M** (75% smaller than SwinIR) |
| Checkpoint Size | **17.5 MB** |
| Validation PSNR | **35.90 dB** |
| Validation SSIM | **0.8828** |
| Spectral SAM | **0.0363 rad (2.08°)** — well within 3.5° science threshold |
| Checkerboard Artifacts | **0%** (Nyquist power = 0.125, clean) |
| Training Time | **~5 hours** (Phase 1 + Phase 2) on RTX A2000 |
| Input | `(B, 4, H, W)` float32 in `[0, 1]` (raw DN / 10000) |
| Output | `(B, 4, H×4, W×4)` float32 in `[0, 1]` at 2.5 m GSD |

---

## Directory Structure

```
training/stage1_rgbn/
│
├── weights/
│   ├── final_weights.pth              ← Production checkpoint (17.5 MB)
│   ├── final_pipeline_verification.png ← Visual proof of output quality
│   └── HOW_TO_USE.txt                 ← Quick load reference
│
├── models/
│   ├── sen2sr_rgbn.py                 ← SELECTED: 4.58M RRDB architecture
│   └── swinir_rgbn.py                 ← Replaced: 18.52M SwinIR (kept for reference)
│
├── losses/
│   ├── sen2sr_loss.py                 ← Phase 2 combined loss (L1+SAM+Lap+Grad+Obs)
│   ├── combined.py                    ← Phase 1 combined loss
│   ├── charbonnier.py                 ← Charbonnier L1 loss
│   ├── sam.py                         ← Spectral Angle Mapper loss
│   ├── frequency.py                   ← Fourier frequency loss
│   └── observation.py                 ← LR consistency constraint
│
├── training/
│   ├── train_sen2sr.py                ← Phase 1 PSNR foundation training
│   ├── train_sen2sr_phase2.py         ← Phase 2 edge & texture refinement
│   ├── train.py                       ← SwinIR training (reference only)
│   ├── dataset.py                     ← SEN2NAIP LMDB dataloader
│   └── validate.py                    ← Standalone validation runner
│
├── evaluation/
│   ├── metrics.py                     ← PSNR, SSIM, SAM computations
│   ├── ndvi.py                        ← NDVI fidelity evaluation
│   └── per_band.py                    ← Per-band PSNR breakdown
│
├── configs/
│   ├── stage1_sen2sr.yaml             ← Phase 1 config
│   ├── stage1_sen2sr_phase2.yaml      ← Phase 2 config (production training run)
│   └── stage1_swinir.yaml             ← SwinIR reference config
│
├── scripts/
│   ├── 00_inspect_dataset.py          ← Dataset inspection
│   ├── 01_create_splits.py            ← Train/val split creation
│   ├── 02_build_lmdb_cache.py         ← LMDB cache builder (~45 min)
│   ├── 03_overfit_test.py             ← Must-pass sanity check
│   ├── 04_smoke_test.py               ← Quick inference smoke test
│   ├── 05_run_ablation.py             ← Architecture ablation runner
│   ├── 06_evaluate_final.py           ← Final evaluation with visualizations
│   ├── run_inference.py               ← Inference on new Sentinel-2 tiles
│   ├── check_sen2sr_results.py        ← Sen2SR output quality check
│   └── monitor.py / live_stream*.py   ← Live training monitors
│
├── requirements.txt                   ← Python deps for training environment
├── watch_epochs.py                    ← Real-time epoch watcher
├── PROGRESS_REPORT_ARCHITECTURES.md  ← Full architecture comparison report
└── README.md                          ← This file
```

---

## Load & Inference (Production)

```python
import torch
from training.stage1_rgbn.models.sen2sr_rgbn import make_sen2sr_model

# 1. Initialize 4-band Sen2SR architecture (4.58M params)
model = make_sen2sr_model()

# 2. Load production-verified Phase 2 weights
ckpt = torch.load("training/stage1_rgbn/weights/final_weights.pth", map_location="cuda")
model.load_state_dict(ckpt["model_state_dict"])
model.eval().cuda()

# 3. Super-resolve a Sentinel-2 tile
# Input:  (B, 4, H, W) float32  — raw Sentinel-2 DN / 10000.0, range [0, 1]
# Output: (B, 4, H*4, W*4) float32 at 2.5m GSD
with torch.no_grad():
    sr_2_5m = model(lr_sentinel2_tensor).clamp(0, 1)
```

---

## Why This Model Was Selected Over Two Alternatives

See [`PROGRESS_REPORT_ARCHITECTURES.md`](./PROGRESS_REPORT_ARCHITECTURES.md) for the
full systematic comparison. Summary:

| Approach | PSNR | Training Time | Result |
|---|---|---|---|
| 1. SwinIR Transformer (18.52M) | 36.09 dB | 11.2 h | ❌ Over-smoothed, blurred edges |
| **2. Sen2SR_RGBN (4.58M)** | **35.90 dB** | **5.0 h** | ✅ **Selected — crisp boundaries, 0% artifacts** |
| 3. Adversarial GAN | 34.75 dB | 1.1 h | ❌ Severe checkerboard artifacts |

The Sen2SR_RGBN model achieves near-identical PSNR to the much heavier SwinIR while
training **2.2× faster**, using **75% fewer parameters**, and producing perceptually
**superior** crisp building boundaries and road edges — critical for downstream
land-use classification (Stage 2 SRM).

---

## Training Pipeline (To Reproduce)

> **Note**: Requires ~100 GB of SEN2NAIP v2 dataset from HuggingFace.

```bash
cd training/stage1_rgbn
pip install -r requirements.txt

# 1. Download dataset (~100 GB)
huggingface-cli download aliFerdinand/SEN2NAIPv2 --local-dir data/raw

# 2. Inspect & create splits
python scripts/00_inspect_dataset.py
python scripts/01_create_splits.py

# 3. Build LMDB cache (run once, ~45 min)
python scripts/02_build_lmdb_cache.py

# 4. Run sanity checks
python scripts/03_overfit_test.py
python scripts/04_smoke_test.py

# 5. Phase 1: PSNR foundation training (~2.4 hours)
python training/train_sen2sr.py --config configs/stage1_sen2sr.yaml

# 6. Phase 2: High-frequency edge refinement (~2.6 hours)
python training/train_sen2sr_phase2.py --config configs/stage1_sen2sr_phase2.yaml

# 7. Evaluate final model
python scripts/06_evaluate_final.py
```

---

## Loss Function (Phase 2)

$$\mathcal{L} = 0.6 \cdot \mathcal{L}_{L1} + 0.25 \cdot \mathcal{L}_{SAM} + 1.2 \cdot \mathcal{L}_{Lap} + 1.2 \cdot \mathcal{L}_{Grad} + 0.1 \cdot \mathcal{L}_{Obs}$$

- **L1 (0.6×)** — Pixel-wise reconstruction fidelity
- **SAM (0.25×)** — Spectral Angle Mapper preserves NDVI/MNDWI band ratios
- **Laplacian (1.2×)** — Forces sharp high-frequency building/rooftop edges
- **Gradient (1.2×)** — Preserves horizontal/vertical linear contours (roads, runways)
- **Observation (0.1×)** — LR consistency: downsampled SR must match original LR input

---

*Model trained by [@DhruvGohel46](https://github.com/DhruvGohel46) · Integrated into SRM pipeline by the SIH 2026 team.*
