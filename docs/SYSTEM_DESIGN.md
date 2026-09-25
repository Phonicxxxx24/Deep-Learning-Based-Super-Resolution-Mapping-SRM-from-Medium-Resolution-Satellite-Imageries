# SRM Sentinel-2 Super-Resolution — System Design

> **For teammates.** This doc explains the architecture, data flow, design decisions, and trade-offs.
> Read this before picking up any task.

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Flow](#3-data-flow)
4. [Component Deep Dive](#4-component-deep-dive)
5. [API Design](#5-api-design)
6. [Data Models](#6-data-models)
7. [Caching & Performance Strategy](#7-caching--performance-strategy)
8. [Error Handling & Retry Logic](#8-error-handling--retry-logic)
9. [Scale & Hardware Requirements](#9-scale--hardware-requirements)
10. [Trade-off Analysis](#10-trade-off-analysis)
11. [What Was Improved Over the Original Plan](#11-what-was-improved-over-the-original-plan)
12. [Known Gaps & Future Work](#12-known-gaps--future-work)
13. [Getting Started for New Teammates](#13-getting-started-for-new-teammates)

---

## 1. What We're Building

**Input:** A geographic location (lat/lon), date range → Sentinel-2 satellite image at 10m resolution (free, open, ESA)
**Output:** The same area at **2.5m resolution** (4× sharper), with:
- Per-pixel uncertainty map (how confident is the model?)
- Explainability map (what parts of the LR image drove each SR output region?)
- Spectral indices: NDVI, MNDWI, built-up index — all at 2.5m
- Validation metrics if a reference HR image is provided
- Interactive web dashboard

**Why this matters:** Sentinel-2 is freely available globally with 5-day revisit, but 10m resolution misses roads < 6m, individual crop rows, and sub-building damage. Our pipeline makes it 4× more useful without needing expensive commercial imagery.

**Hackathon context:** This is for Smart India Hackathon 2026. We need a working demo within the hackathon window. Both ML models have pretrained weights available today on HuggingFace.

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        User Interface                          │
│  CLI (sr_pipeline.py --lat --lon)   Streamlit Dashboard        │
└──────────────────────┬─────────────────────┬───────────────────┘
                       │                     │
           ┌───────────▼─────────────────────▼───────────┐
           │              sr_pipeline.py                  │
           │         (Main Orchestration Layer)           │
           └──┬──────────────┬──────────────┬────────────┘
              │              │              │
    ┌─────────▼──────┐ ┌─────▼──────┐ ┌────▼──────────────┐
    │  ingestion.py  │ │ preproc.py │ │  postprocessing.py │
    │  (cubo/STAC)   │ │(mask,clamp)│ │  (Fourier, nodata) │
    └─────────┬──────┘ └─────┬──────┘ └────┬──────────────┘
              │              │              │
              └──────────────▼──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │         Dual SR Models       │
              │                              │
              │  ┌─────────────────────┐    │
              │  │ LDSR-S2 (diffusion) │    │
              │  │ RGB+NIR → 4× SR     │    │
              │  │ + uncertainty_map() │    │
              │  └─────────────────────┘    │
              │                              │
              │  ┌─────────────────────┐    │
              │  │ SEN2SRLite (CNN)    │    │
              │  │ All 10 bands → 4×   │    │
              │  │ + FourierHardConst  │    │
              │  └─────────────────────┘    │
              │                              │
              │  Band Fusion Layer           │
              │  (LDSR-S2 for RGB+NIR,       │
              │   SEN2SR for SWIR)           │
              └──────────────┬──────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
 ┌────────▼───────┐ ┌────────▼───────┐ ┌────────▼───────┐
 │ uncertainty.py │ │explainability  │ │ validation.py  │
 │ (std-dev map)  │ │  (LAM, Gini)   │ │ (PSNR/SSIM/SAM)│
 └────────┬───────┘ └────────┬───────┘ └────────┬───────┘
          │                  │                  │
          └──────────────────▼──────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │       Output Layer          │
              │  GeoTIFF (SR, Uncertainty)  │
              │  CSV (metrics report)       │
              │  PNG (LAM, indices)         │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │     Streamlit Dashboard     │
              │  Folium map, Plotly charts  │
              └─────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Tensor Shapes Through the Pipeline

```
cubo fetch
  → (time=1, band=10, y=128, x=128)  xarray DataArray
  
ingestion.py
  → (10, 128, 128)  torch.Tensor float32, values [0,1]

preprocessing.py
  → (10, 128, 128)  NaN clamped, cloud-masked
  → (10, 128+pad, 128+pad)  padded to 128-px multiple

sr_pipeline.py — Path A (LDSR-S2)
  → input:  (1, 4, 128, 128)  channels [B02,B03,B04,B08]
  → output: (1, 4, 512, 512)  4× RGB+NIR

sr_pipeline.py — Path B (SEN2SRLite)
  → input:  (1, 10, 128, 128)  all 10 bands
  → output: (1, 10, 512, 512)  4× all bands

Band Fusion
  → (10, 512, 512)  RGB+NIR from LDSR-S2, SWIR from SEN2SRLite

postprocessing.py
  → (10, 512, 512)  Fourier-constrained, nodata-masked, clamped

uncertainty.py
  → (1, 512, 512)  per-pixel std-dev across 25 stochastic runs

GeoTIFF output
  → 10-band COG at 2.5m effective resolution, original CRS preserved
```

### 3.2 Band Index Reference

| Python Index | Band ID | Native Res | Role |
|---|---|---|---|
| 0 | B02 | 10m | Blue |
| 1 | B03 | 10m | Green |
| 2 | B04 | 10m | Red |
| 3 | B05 | 20m (resampled) | Red Edge 1 |
| 4 | B06 | 20m (resampled) | Red Edge 2 |
| 5 | B07 | 20m (resampled) | Red Edge 3 |
| 6 | B08 | 10m | NIR |
| 7 | B8A | 20m (resampled) | Narrow NIR |
| 8 | B11 | 20m (resampled) | SWIR 1 |
| 9 | B12 | 20m (resampled) | SWIR 2 |

> **Note:** 20m bands are bicubic-upsampled to 10m during ingestion as model input. The SR pipeline then takes them to 2.5m.

---

## 4. Component Deep Dive

### 4.1 Ingestion (`core/ingestion.py`)

Uses `cubo` — a declarative Sentinel-2 STAC client. You give it lat/lon/date, it returns an xarray datacube. No manual download, no Copernicus Hub account required.

**Gotcha:** `cubo` returns reflectance values as integers (DN × 10,000). Divide by 10,000 to get [0,1] float. Forgetting this is the single most common silent bug — models expect [0,1] but get values like 400–2000.

**Gotcha:** `cubo` returns `(time, band, y, x)`. We slice `[0]` for the first time step. Temporal compositing (median over cloud-free scenes) is a planned improvement — not yet implemented.

### 4.2 Preprocessing (`core/preprocessing.py`)

Three operations in fixed order:
1. **Cloud/shadow masking via SCL** — Sentinel-2 L2A includes a Scene Classification Layer. Values 3, 8, 9, 10 = cloud shadow/cloud. Set those pixels to 0.
2. **NaN clamping** — `torch.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)`. Must happen before inference — diffusion cannot process NaN.
3. **Padding** — LDSR-S2 requires input dimensions divisible by 128. Use `F.pad()` and store the padding tuple for unpadding after SR.

### 4.3 Dual SR Models (`core/sr_pipeline.py`)

**Why two models instead of one?**
LDSR-S2 is the highest quality available model for RGB+NIR Sentinel-2 SR — it was trained on real Sentinel-2/Pleiades pairs. But it only handles 4 bands. SWIR bands (B11, B12) are critical for vegetation health and burned area mapping. SEN2SRLite handles all 10 bands with a deterministic CNN approach that's faster and spectrally more accurate for SWIR.

**Band fusion logic:** After both models run, we replace the RGB+NIR channels in the SEN2SRLite output with the LDSR-S2 output. This gives us diffusion-quality visual bands + CNN-quality SWIR bands in one 10-band tensor.

**LDSR-S2 inference time:** ~90 seconds per 128×128 patch on A10 GPU (100 DDIM steps). The `sampling_steps` parameter trades quality for speed — 50 steps is usable for quick demos, 100 for production.

### 4.4 Spectral Hard Constraint (`core/postprocessing.py`)

The most important postprocessing step. Applies a Fourier domain hybrid between the bicubic-upsampled LR and the SR output:
- Low spatial frequencies → from LR (preserves original radiometry)
- High spatial frequencies → from SR (adds new detail)

**Why this is non-negotiable:** Without this, the NDVI you compute from the SR image won't match the NDVI from the original LR image at the same scale. SWIR-based vegetation and moisture indices would be scientifically invalid.

`HardConstraint` is already implemented in `sen2sr/models/tricks.py`. We use it as-is.

### 4.5 Uncertainty (`core/uncertainty.py`)

Runs LDSR-S2's `uncertainty_map()` which internally performs 25 stochastic forward passes (different random seeds each time) and computes per-pixel standard deviation. High uncertainty → model was uncertain → analyst should inspect that area.

**Calibration target:** 90% of HR reference pixels should fall within the 95% confidence interval (mean ± 1.96σ). Check with `validation.check_uncertainty_calibration()`.

### 4.6 Dashboard (`dashboard/`)

Streamlit app with three main views:
1. **Map view** — Folium, side-by-side LR/SR with uncertainty overlay as heatmap
2. **Spectral view** — Click any pixel → show LR vs SR spectral profile, band comparison
3. **Metrics view** — PSNR/SSIM/LPIPS bar charts, uncertainty histogram

Dashboard never calls models directly — it reads from the `outputs/` directory (GeoTIFFs written by the pipeline). This keeps the dashboard stateless and fast.

---

## 5. API Design

### 5.1 CLI Interface

```bash
# Single patch SR
python -m core.sr_pipeline \
  --lat 28.6139 --lon 77.2090 \
  --start 2026-01-01 --end 2026-03-31 \
  --output outputs/delhi_sr.tif \
  --uncertainty \
  --lam \
  --metrics-ref /path/to/hr_reference.tif  # optional

# From existing GeoTIFF (skip cubo fetch)
python -m core.sr_pipeline \
  --input path/to/existing_lr.tif \
  --output outputs/result.tif

# HPC batch job (for full Sentinel-2 tiles)
opensr-hpc submit patch \
  --config configs/runtime.default.yaml \
  --lat 28.6139 --lon 77.2090 \
  --start-date 2026-01-01 --end-date 2026-03-31

# Dashboard
streamlit run dashboard/app.py
```

### 5.2 Python API

```python
from core.sr_pipeline import run_sr_pipeline
from core.ingestion import fetch_sentinel2

# Fetch data
X = fetch_sentinel2(lat=28.6139, lon=77.2090,
                    start_date="2026-01-01", end_date="2026-03-31")

# Run SR
result = run_sr_pipeline(X, config_path="configs/pipeline_config.yaml")

# Access results
result.sr_fused      # (10, 512, 512) all bands at 2.5m
result.uncertainty   # (1, 512, 512) uncertainty map
result.kde_map       # LAM attribution map
result.complexity    # Gini complexity index (float)
```

---

## 6. Data Models

### 6.1 `SRResult` (returned by `run_sr_pipeline`)

```python
@dataclass
class SRResult:
    sr_fused: torch.Tensor       # (10, H*4, W*4) — the main output
    sr_rgbn: torch.Tensor        # (4, H*4, W*4) — LDSR-S2 output before fusion
    sr_all10: torch.Tensor       # (10, H*4, W*4) — SEN2SRLite output before fusion
    uncertainty: torch.Tensor    # (1, H*4, W*4) — per-pixel std-dev
    kde_map: torch.Tensor        # LAM attribution map
    complexity: float            # Gini complexity index
```

### 6.2 Metrics Report (CSV)

```
patch_id, lat, lon, date_start, date_end, PSNR, SSIM, LPIPS, SAM_deg, ERGAS, uncertainty_coverage
```

### 6.3 GeoTIFF Output Metadata

Every output GeoTIFF must preserve:
- `CRS` — coordinate reference system from LR input
- `transform` — affine transform (adjusted for 4× scale)
- `nodata` — 0.0
- Custom tags: `PIPELINE_VERSION`, `LR_DATE`, `N_UNCERTAINTY_PASSES`, `SAMPLING_STEPS`

---

## 7. Caching & Performance Strategy

### 7.1 Model Weight Caching

Models are large (hundreds of MB). Cache downloaded weights at `model/` (gitignored). The `mlstac.load()` and `opensr_model.load_pretrained()` functions cache automatically on first run.

**For hackathon:** Pre-download all weights before the demo. Network access during live demo is risky.

```bash
python scripts/download_weights.py  # downloads all required weights to model/
```

### 7.2 Patch-Level Caching

For the dashboard: cache SR outputs in `outputs/` keyed by `{lat}_{lon}_{start}_{end}_sr.tif`. If the file exists, load it instead of re-running inference. This makes dashboard re-visits instant.

### 7.3 Large Tile Processing

For patches > 128px (most real-world use cases), use `sen2sr.predict_large(X, model, patch_size=128, overlap=32)`. The overlap of 32px prevents edge artefacts at patch boundaries.

**Throughput estimate:**
| Hardware | Mode | Time per 128×128 patch | Full S2 tile (110km × 110km) |
|---|---|---|---|
| A100 80GB | LDSR-S2 + uncertainty | ~60 sec | ~2–4 hours |
| A10 24GB | LDSR-S2 only | ~90 sec | ~3–6 hours |
| T4 16GB | SEN2SRLite CNN | ~45 sec | ~2–3 hours |
| CPU only | SEN2SRLite CPU | ~10 min | Not practical |

---

## 8. Error Handling & Retry Logic

### 8.1 GPU OOM

```python
try:
    result = run_sr_pipeline(X, config)
except torch.cuda.OutOfMemoryError:
    # Retry with patch-based inference
    result = run_sr_pipeline_chunked(X, config, chunk_size=64)
```

Never silently downsample the input tensor — this changes the output resolution. Always retry with smaller chunks via `predict_large()`.

### 8.2 cubo Fetch Failures

```python
try:
    da = cubo.create(lat=lat, lon=lon, ...)
except Exception as e:
    raise ValueError(f"No Sentinel-2 scenes found for lat={lat}, lon={lon}, "
                     f"dates={start_date}–{end_date}. Try widening the date range.") from e
```

### 8.3 Weight Download Failures

HuggingFace can be flaky. For the hackathon demo, all weights must be pre-downloaded. Add a pre-flight check:

```python
def check_weights_available(config) -> bool:
    """Check all required weight files exist locally before starting inference."""
```

### 8.4 Cloud-Covered Patches

If > 50% of pixels are masked (cloud/shadow), fall back to returning the bicubic-upsampled LR with a `WARNING_CLOUDY` flag in the metrics CSV. Do not run diffusion on heavily clouded patches — the uncertainty map is meaningless and the output is unreliable.

---

## 9. Scale & Hardware Requirements

### 9.1 Minimum Requirements (hackathon demo)

- NVIDIA GPU with ≥ 16GB VRAM (T4 or better)
- 16GB system RAM
- 50GB free disk (weights + outputs)
- Python 3.11, CUDA 12.1

### 9.2 Production Requirements

- NVIDIA A100 80GB or equivalent
- 128GB system RAM
- Slurm cluster for full tile processing (opensr-hpc)

### 9.3 CPU-Only Mode

Works for demo/testing using SEN2SRLite CNN. LDSR-S2 diffusion on CPU takes ~10 min/patch — acceptable for notebook demos, not for live presentation. Pre-compute SR outputs before the demo if on CPU.

---

## 10. Trade-off Analysis

### 10.1 Diffusion vs GAN vs CNN

| Approach | Quality | Speed | Uncertainty | Our Use |
|---|---|---|---|---|
| Diffusion (LDSR-S2) | Highest realism | Slowest (~90s) | Native | RGB+NIR primary path |
| CNN (SEN2SRLite) | Good, stable | Fast (~45s) | None | SWIR path + CPU fallback |
| GAN | Artefact-prone | Medium | None | Not used |
| Bicubic | Blurry | Instant | None | Fallback only |

**Decision:** Use diffusion for the bands where visual quality matters most (RGB+NIR) and CNN where spectral accuracy matters most (SWIR). This is the key architectural innovation in this pipeline.

### 10.2 Spectral Constraint: Fourier vs Histogram Matching vs None

| Approach | Global Radiometry | Spatial Structure | NDVI Accuracy |
|---|---|---|---|
| None | ❌ Unconstrained | ❌ Unconstrained | ❌ Invalid |
| Histogram match only | ✅ Global stats preserved | ❌ Low-freq unconstrained | ⚠️ Approximate |
| Fourier hard constraint | ✅ Low-freq from LR | ✅ High-freq from SR | ✅ Valid |

**Decision:** Always apply FourierHardConstraint. Histogram matching is additionally applied by LDSR-S2's `spectral_correction=True` — these are complementary, not alternatives.

### 10.3 Dashboard: Streamlit vs FastAPI+React

| Approach | Dev Time | Flexibility | Production-Ready |
|---|---|---|---|
| Streamlit | Hours | Limited | Good for demos |
| FastAPI + React | Days–weeks | Full | Production |

**Decision:** Streamlit for hackathon. If this moves to production, evaluate migrating dashboard to FastAPI + React. The pipeline (`core/`) is fully decoupled from the dashboard — migration doesn't require touching model code.

### 10.4 Data Access: cubo/STAC vs Manual Download vs GEE

| Approach | Setup | Automation | Cost |
|---|---|---|---|
| cubo (STAC) | Zero | Full (lat/lon/date) | Free |
| Manual download | Medium | None | Free |
| Google Earth Engine | Medium | Full | Requires GEE account |

**Decision:** cubo. Eliminates all manual data management; works in one command.

---

## 11. What Was Improved Over the Original Plan

The original architecture document was strong but had several gaps and improvement opportunities:

### 11.1 Added: Temporal Compositing Gap (Open Question)

The original plan used `da[0]` (first available scene). This is brittle — the first scene may be heavily clouded. **Added as Open Question** with recommendation to implement median compositing over cloud-free scenes for production.

### 11.2 Added: Explicit Cloud Coverage Threshold

Original plan masked clouds but didn't specify what to do with heavily clouded patches. **Added:** If > 50% pixels masked, skip diffusion, return bicubic fallback with `WARNING_CLOUDY` flag.

### 11.3 Improved: SWIR Band Alignment

The original plan didn't address potential pixel misalignment between LDSR-S2 (128→512) and SEN2SRLite's two-stage SWIR path (128→256→512). **Added as Open Question:** verify pixel-perfect alignment before band fusion.

### 11.4 Added: Pre-flight Weight Check

Original plan referenced weight caching informally. **Added:** `check_weights_available()` function to verify all weights are present before any inference call — critical for offline hackathon demo.

### 11.5 Strengthened: Negative Constraints

Original plan described what to build but didn't explicitly forbid common AI agent drift patterns (adding TimescaleDB, React, custom training loops). **Added:** explicit negative constraints section to prevent scope creep.

### 11.6 Recommended: Replace `X[:, 6]` Hardcoding

The original code snippet used literal band indices in several places. **Recommendation:** always reference `BAND_ORDER` constant and use `BAND_ORDER.index("B08")` instead of hardcoding `6`. One refactor of `BAND_ORDER` otherwise silently breaks spectral indices.

### 11.7 Recommended: Add ERGAS to Validation

Original plan listed PSNR/SSIM/LPIPS/SAM. **Added ERGAS** (Erreur Relative Globale Adimensionnelle de Synthèse) — this is the standard multi-band SR quality metric in remote sensing literature. Target: < 3.

### 11.8 Recommended: Separate `application_indices.py`

Original plan scattered NDVI/MNDWI computation across application sections. **Moved** to a dedicated `core/application_indices.py` with typed signatures — cleaner, testable, reusable.

### 11.9 Recommended: Dashboard Reads from `outputs/`, Never from Tensors

Original plan implied dashboard could receive tensors directly. **Clarified:** dashboard reads GeoTIFF files from `outputs/` directory only. This makes the dashboard stateless and prevents GPU memory from being tied up by dashboard sessions.

---

## 12. Known Gaps & Future Work

| Gap | Impact | Effort | Priority |
|---|---|---|---|
| Temporal median compositing | Medium (cloud artifacts in single-date SR) | Medium | High |
| SWIR band alignment verification | High (silent pixel shift in band fusion) | Low | High |
| Cartosat-3 API integration | Medium (needed for India-specific validation) | Medium | Medium |
| Batch GeoTIFF tiling (full S2 tile) | High (production throughput) | Low (opensr-hpc exists) | High |
| Authentication for dashboard | Low (hackathon scope) | Medium | Low |
| Model fine-tuning on India-specific data | High (domain shift) | Very High | Post-hackathon |
| FastAPI + React dashboard | Low (Streamlit sufficient for demo) | High | Post-hackathon |
| Automated regression test with reference HR data | Medium | Medium | Medium |

---

## 13. Getting Started for New Teammates

### Environment Setup

```bash
# 1. Clone with submodules
git clone --recurse-submodules <repo-url>
cd srm_sentinel2

# 2. Create conda environment
conda env create -f environment.yml
conda activate srm_s2

# 3. Pre-download model weights (do this BEFORE the demo)
python scripts/download_weights.py

# 4. Run smoke tests
python -m pytest tests/ -v

# 5. Try a quick SR (CPU mode, small patch)
python -m core.sr_pipeline \
  --lat 28.6139 --lon 77.2090 \
  --start 2026-02-01 --end 2026-02-28 \
  --output outputs/test.tif
```

### Key Files to Read First

1. `SRM_Architecture.md` — master architecture doc, interfaces, constraints
2. `core/sr_pipeline.py` — main orchestration, understand this before touching anything else
3. `configs/pipeline_config.yaml` — all tunable parameters live here

### Task Assignment Guide

| Task | Owner | Depends On |
|---|---|---|
| `core/ingestion.py` | — | Nothing (start here) |
| `core/preprocessing.py` | — | ingestion.py |
| `core/sr_pipeline.py` | — | preprocessing.py + both model submodules |
| `core/postprocessing.py` | — | sr_pipeline.py |
| `core/uncertainty.py` | — | sr_pipeline.py |
| `core/validation.py` | — | Nothing (pure numpy, no model dependency) |
| `core/application_indices.py` | — | Nothing (pure torch math) |
| `dashboard/app.py` | — | All core modules + outputs/ GeoTIFFs |
| `tests/` | — | All core modules |
| `notebooks/` | — | All of the above |

### PR Checklist

- [ ] All new functions have type annotations and docstrings
- [ ] `BAND_ORDER` constant used for all band index lookups (no hardcoded indices)
- [ ] `FourierHardConstraint` applied to any new SR output path
- [ ] New CLI flags documented in `README.md` (same PR)
- [ ] New functions have a corresponding test in `tests/`
- [ ] Uncertainty / LAM / metrics outputs preserved in `SRResult` if pipeline is modified

---

*Last updated: SIH 2026 architecture review pass*
*Cross-reference: `SRM_Architecture.md` for implementation-level interfaces*
