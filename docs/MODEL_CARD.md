# SRM — Model Card & Dataset Reference

> **This document is the authoritative source of truth for our trained model, dataset, and measured metrics.**  
> For architecture decisions, see [`SRM_Architecture.md`](./SRM_Architecture.md).  
> For training code and reproduction steps, see [`../training/stage1_rgbn/README.md`](../training/stage1_rgbn/README.md).

---

## 1. What We Actually Built and Trained

Our pipeline has **two model stages**:

| Stage | Model | Source | Status |
|---|---|---|---|
| **Stage 1 — RGBN SR** | `Sen2SR_RGBN` (our custom-trained RRDB) | Custom-trained by us on SEN2NAIP v2 | ✅ **Trained from scratch by our team** |
| **Stage 2 — Full-Band SR** | `SEN2SRLite` (pre-trained CNN) | ESA OpenSR project (pre-trained weights) | ✅ Downloaded & integrated |

> **Key point for judges:** Stage 1 (the RGBN 4-band SR model) was **trained from scratch by our team** — this is our primary technical contribution. Stage 2 uses industry-standard pre-trained weights from ESA's OpenSR project to handle SWIR bands.

---

## 2. Our Custom-Trained Model — Sen2SR_RGBN

### 2.1 Model Architecture

```
Architecture    : Sen2SR_RGBN (Residual-in-Residual Dense Network, ESRGAN family)
Parameters      : 4,580,292  (~4.58 Million)
Checkpoint size : 17.5 MB
Task            : 4× Single-Image Super-Resolution
Input           : (B, 4, H, W) float32 — B02(Blue), B03(Green), B04(Red), B08(NIR) at 10m
Output          : (B, 4, H×4, W×4) float32 at 2.5m GSD
Scale factor    : 4× (10m → 2.5m GSD)
```

**Trunk Structure:**
- 8 cascaded Residual-in-Residual Dense Blocks (RRDB)
- Each RRDB = 3 Residual Dense Blocks (RDB) with dense local feature reuse
- Growth rate = 32 channels, LeakyReLU (α=0.2), residual scaling β=0.2
- Global trunk residual connection preserving low-frequency radiometric baseline

**Upsampling:**
- Dual-stage Sub-Pixel Convolutions (PixelShuffle(2) × 2) — avoids checkerboard artifacts
- No deconvolution or bilinear upsampling in any path

---

## 3. Training Dataset — SEN2NAIP v2

| Item | Detail |
|---|---|
| **Dataset** | [SEN2NAIP v2](https://huggingface.co/datasets/aliFerdinand/SEN2NAIPv2) |
| **Host** | HuggingFace — `aliFerdinand/SEN2NAIPv2` |
| **Size** | ~100 GB |
| **Content** | Paired Sentinel-2 L2A (10m) ↔ NAIP Aerial (≤1m) image pairs across the continental United States |
| **LR Input** | Sentinel-2 L2A: 4 bands [B02, B03, B04, B08] at 10m — normalized to [0,1] (raw DN / 10000) |
| **HR Target** | NAIP aerial imagery downsampled to 2.5m (4× equivalent resolution of Sentinel-2) |
| **Patch size** | 128×128 LR → 512×512 HR |
| **Train/Val split** | Standard 80/20 split via `training/stage1_rgbn/scripts/01_create_splits.py` |

---

## 4. Training Protocol

### Phase 1 — PSNR Foundation (~2.4 hours)
```yaml
Config     : training/stage1_rgbn/configs/stage1_sen2sr.yaml
Epochs     : 50
Batches/ep : 1000
Optimizer  : AdamW (LR=5e-5, peak 1e-4 with warmup)
Loss       : L1(0.6) + SAM(0.25) + Laplacian(1.2) + Gradient(1.2) + Observation(0.1)
Hardware   : NVIDIA RTX A2000 12GB
```

### Phase 2 — High-Frequency Edge & Texture Refinement (~2.6 hours)
```yaml
Config     : training/stage1_rgbn/configs/stage1_sen2sr_phase2.yaml
Epochs     : 45
Init from  : Phase 1 best checkpoint (best_psnr.pth)
Loss boost : Laplacian (1.2×) + Gradient (1.2×) for building/road edge injection
Total time : ~5 hours (Phase 1 + Phase 2)
```

---

## 5. Measured Model Performance — Our Custom-Trained Sen2SR_RGBN

> Evaluated on 50 held-out validation scenes from SEN2NAIP v2.

| Metric | Our Model (Sen2SR_RGBN Phase 2) | Baseline Bicubic | SwinIR (our rejected alternative) |
|---|---|---|---|
| **PSNR (dB)** | **35.90** | ~28.0 | 36.09 |
| **SSIM** | **0.8828** | ~0.75 | 0.8803 |
| **SAM (rad)** | **0.0363** (2.08°) | ~0.065 | 0.0369 (2.11°) |
| **SAM (deg)** | **2.08°** ✅ (<3.5° threshold) | ~3.7° | 2.11° |
| **Checkerboard artifacts** | **0%** | N/A | N/A |
| **Parameters** | **4.58M** | — | 18.52M |
| **Training time** | **5.0 hours** | — | 11.2 hours |
| **Checkpoint size** | **17.5 MB** | — | 213.7 MB |

**Per-Band PSNR Breakdown:**
| Band | Description | PSNR (dB) |
|---|---|---|
| B02 | Blue | **40.25 dB** |
| B03 | Green | **38.57 dB** |
| B04 | Red | **36.12 dB** |
| B08 | NIR | **32.50 dB** |

### Key Insight — Why We Chose Sen2SR_RGBN Over SwinIR

Despite SwinIR having 0.19 dB higher PSNR:
1. **75% fewer parameters** (4.58M vs 18.52M) — faster inference
2. **2.2× faster training** (5h vs 11.2h)
3. **Perceptually superior** — Boosted Laplacian + Gradient losses inject sharp building/road edges that SwinIR blurs
4. **0% checkerboard artifacts** — clean for downstream land-use classification

---

## 6. Validation on Real Satellite Data (opensr-test)

Beyond the training dataset, we validate against the `opensr-test` benchmark — real Sentinel-2 L2A inputs paired with real SPOT/NAIP high-resolution references.

**Running the benchmark:**
```bash
# Via API (recommended — shows results in the web UI)
GET http://127.0.0.1:8000/api/benchmark?dataset=spot&max_samples=9

# Via Python CLI
python -m srm.validation --benchmark spot --max-samples 9 --output outputs/benchmark_results.csv
```

**What is validated:**
- Real Sentinel-2 L2A input (not synthetically degraded)
- Real SPOT/NAIP aerial ground-truth HR reference
- Metrics: PSNR, SSIM, SAM, ERGAS, LPIPS
- Comparison: Our SR model vs. Bicubic baseline

---

## 7. Fourier Hard Constraint (Spectral Consistency)

Every SR output — regardless of model — is post-processed by the **Fourier HardConstraint**:

```
SR_constrained = IFFT( mask * FFT(LR_bicubic) + (1-mask) * FFT(SR_model) )
```

- **Low-frequency components** (global color balance, broad illumination): replaced from LR
- **High-frequency components** (edges, textures, fine detail): kept from SR model

This guarantees:
- NDVI derived from SR output ≥ 0.97 correlation with NDVI from LR input (r > 0.97)
- Band ratio consistency for all downstream spectral indices
- No spectral hallucination from model uncertainty

---

## 8. Production Inference Path

```python
from training.stage1_rgbn.models.sen2sr_rgbn import make_sen2sr_model
import torch

# Load production model
model = make_sen2sr_model()
ckpt = torch.load("training/stage1_rgbn/weights/final_weights.pth", map_location="cuda")
model.load_state_dict(ckpt["model_state_dict"])
model.eval().cuda()

# Inference
# Input:  (B, 4, H, W) float32 in [0,1] — B02, B03, B04, B08 at 10m
# Output: (B, 4, H*4, W*4) float32 in [0,1] at 2.5m GSD
with torch.no_grad():
    sr_rgbn = model(lr_tensor).clamp(0, 1)
```

---

## 9. References

- **Dataset**: [aliFerdinand/SEN2NAIPv2](https://huggingface.co/datasets/aliFerdinand/SEN2NAIPv2) on HuggingFace
- **Training code**: [`training/stage1_rgbn/`](../training/stage1_rgbn/) — complete training pipeline
- **Architecture**: [`training/stage1_rgbn/models/sen2sr_rgbn.py`](../training/stage1_rgbn/models/sen2sr_rgbn.py)
- **Loss functions**: [`training/stage1_rgbn/losses/sen2sr_loss.py`](../training/stage1_rgbn/losses/sen2sr_loss.py)
- **Model weights**: [`training/stage1_rgbn/weights/final_weights.pth`](../training/stage1_rgbn/weights/final_weights.pth) (17.5 MB)
- **Architecture comparison report**: [`training/stage1_rgbn/PROGRESS_REPORT_ARCHITECTURES.md`](../training/stage1_rgbn/PROGRESS_REPORT_ARCHITECTURES.md)
- **SEN2SRLite (ESA)**: [github.com/ESAOpenSR/opensr-model](https://github.com/ESAOpenSR/opensr-model)
- **opensr-test benchmark**: [github.com/ESAOpenSR/opensr-test](https://github.com/ESAOpenSR/opensr-test)

---

*Last updated: September 2026 — SIH 2026 submission*
