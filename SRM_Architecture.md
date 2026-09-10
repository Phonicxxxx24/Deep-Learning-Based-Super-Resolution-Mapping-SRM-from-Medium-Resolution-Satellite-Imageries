# SRM Sentinel-2 Super-Resolution — Master Architecture Document

> **Single source of truth for all code generation sessions.**
> Paste this document into every AI coding agent session. Do not paraphrase it. Do not summarise it.

---

## 0. The One Rule That Overrides Everything

**Spectral consistency is non-negotiable.**
Every SR output, at every stage, must be radiometrically consistent with the LR Sentinel-2 input. Visual realism is secondary. If a model produces plausible-looking textures but the NDVI or MNDWI derived from those textures does not match what the LR image implies, the output is wrong — regardless of PSNR.

Apply `FourierHardConstraint` to every SR output before it leaves the pipeline. This is not optional and is not a post-processing suggestion.

---

## 1. Component Scope

This component is a **five-stage deep-learning super-resolution pipeline** that converts 10 m Sentinel-2 L2A imagery (Bands B02–B12, 10 spectral bands) into 2.5 m enhanced imagery (4× scale factor) with per-pixel uncertainty maps and explainability outputs. It ingests raw Sentinel-2 datacubes via STAC, applies a dual-model SR architecture (LDSR-S2 for RGB+NIR, SEN2SRLite for SWIR), enforces spectral hard constraints, quantifies uncertainty, and delivers GeoTIFF products + Streamlit web dashboard.

**What comes in:** lat/lon/date range → Sentinel-2 L2A xarray datacube (10 bands, float32, 10 m)
**What goes out:** 2.5 m SR GeoTIFF (10 bands), uncertainty GeoTIFF (1 band), LAM PNG, validation metrics CSV, Streamlit dashboard

**Explicitly out of scope:** Real-time streaming ingestion. Training new SR models from scratch. Pansharpening using commercial satellite data. Any model other than LDSR-S2 and SEN2SRLite as the SR backbone.

---

## 2. Stack — Decided, Not Open for Discussion

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.11 | Required by both sen2sr and opensr-model; mamba-ssm requires ≥ 3.10 |
| GPU framework | PyTorch 2.x + CUDA 12.1 | Both repos are PyTorch-native; no JAX/TF ports exist |
| Primary SR model | LDSR-S2 (opensr-model) | Only publicly available pretrained model trained on real S2/Pleiades pairs at 2.5 m |
| Auxiliary SR model | SEN2SRLite (sen2sr) | Only available implementation for SWIR band super-resolution with FourierHardConstraint |
| Spectral constraint | FourierHardConstraint (sen2sr/models/tricks.py) | Physics-principled low-freq LR preservation; not replaceable by histogram matching alone |
| Data ingestion | cubo + STAC | Declarative lat/lon/date → xarray; eliminates manual data download |
| Diffusion sampler | DDIMSampler (opensr-model) | Required by LDSR-S2 architecture; not swappable to DDPM |
| Geospatial I/O | rasterio + rioxarray | CRS/transform preservation; industry standard for satellite data |
| Dashboard | Streamlit 1.35+ + Folium | Fastest path from model output to non-technical stakeholder UI |
| Validation metrics | scikit-image + lpips | PSNR/SSIM from scikit-image; LPIPS requires VGG-based lpips package |
| HPC batch | opensr-hpc + Slurm | Built into opensr-model; Slurm-native array jobs for tile processing |
| Packaging | conda env `srm_s2` | Reproducible; mamba-ssm install requires conda-managed CUDA toolkit |

**These choices are closed. Implement them. Do not suggest alternatives.**

---

## 3. What Is NOT Being Built (Negative Constraints)

- **GAN-based SR** — GANs produce mode-collapse artefacts and no uncertainty estimates. LDSR-S2 was chosen specifically to avoid this. Do not add any GAN inference path.
- **Custom diffusion training** — The pretrained LDSR-S2 weights (HuggingFace: simon-donike/RS-SR-LTDF) are used as-is. No fine-tuning, no LoRA, no training loop.
- **Real-time / streaming ingestion** — cubo fetches complete patches on demand. No Kafka, no Redis Streams, no websocket frame pipeline.
- **Third-party commercial satellite data as primary input** — Pleiades and Cartosat-3 are used for *validation reference only*, not as inference inputs.
- **Custom attention / transformer architectures** — Swin2SR is available in sen2sr as a comparison option only. The production SR path is LDSR-S2 (RGB+NIR) + SEN2SRLite (SWIR). Do not make Swin2SR the default.
- **TimescaleDB / PostGIS / geospatial database** — Outputs are GeoTIFF files. No spatial database is being introduced.
- **React / Vue / Angular frontend** — Dashboard is Streamlit only. Do not create a separate frontend application.
- **Authentication / multi-user system** — Dashboard is single-user, local or Streamlit Cloud. No auth layer.
- **Atmospheric correction** — Input is Sentinel-2 L2A (already atmospherically corrected). Do not add another atmospheric correction step.
- **Pansharpening** — This is not pansharpening. Do not reference panchromatic bands or pansharpening algorithms.
- **Band 1 (B01, 60 m) and Band 9 (B09)** — Not used. The 10-band set is: B02, B03, B04, B05, B06, B07, B08, B8A, B11, B12.

---

## 4. File Structure

```
srm_sentinel2/
├── core/
│   ├── ingestion.py          [NEW] STAC/cubo data pipeline; returns normalised torch tensor
│   ├── preprocessing.py      [NEW] Cloud/SCL masking, NaN clamping, padding to 128-px multiples
│   ├── sr_pipeline.py        [NEW] Main orchestration: calls LDSR-S2 + sen2sr, fuses bands
│   ├── postprocessing.py     [NEW] FourierHardConstraint, histogram match, nodata propagation
│   ├── uncertainty.py        [NEW] Wraps LDSR-S2 uncertainty_map(); exports GeoTIFF
│   ├── explainability.py     [NEW] Wraps sen2sr.xai.lam(); exports PNG + metadata
│   ├── validation.py         [NEW] PSNR / SSIM / LPIPS / SAM / ERGAS; returns dict
│   └── application_indices.py [NEW] NDVI, MNDWI, built-up index computed at 2.5 m
├── models/
│   ├── ldsr_s2/              [SUBMODULE] opensr-model package — do not modify
│   └── sen2sr/               [SUBMODULE] sen2sr package — do not modify
├── hpc/
│   └── opensr_hpc/           [SUBMODULE] Slurm launcher from opensr-model — do not modify
├── dashboard/
│   ├── app.py                [NEW] Streamlit entry point
│   ├── map_view.py           [NEW] Folium side-by-side LR/SR map + uncertainty heatmap
│   └── charts.py             [NEW] Plotly spectral profiles, metric bar charts
├── configs/
│   ├── config_10m.yaml       [COPY from opensr-model] DDIM sampler config — do not modify
│   └── pipeline_config.yaml  [NEW] Global settings: device, n_uncertainty, sampling_steps
├── tests/
│   ├── test_pipeline.py      [NEW] End-to-end smoke test with tiny synthetic tensor
│   ├── test_metrics.py       [NEW] Unit tests for validation.py
│   └── test_uncertainty.py   [NEW] Checks uncertainty map shape and value range
├── notebooks/
│   ├── 01_quickstart.ipynb   [NEW]
│   ├── 02_full_pipeline_demo.ipynb [NEW]
│   └── 03_application_demos.ipynb [NEW] Crop / urban / disaster workflows
├── outputs/                  [GITIGNORED] SR GeoTIFFs, uncertainty maps, metrics CSV
├── model/                    [GITIGNORED] Downloaded pretrained weights
├── environment.yml           [NEW] Conda environment specification
└── README.md                 [NEW] — update in same PR when adding new CLI flags
```

---

## 5. Interfaces and Signatures

### `core/ingestion.py`

```python
import cubo
import torch
import numpy as np

BAND_ORDER = ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"]
# Index mapping: B02=0, B03=1, B04=2, B05=3, B06=4, B07=5, B08=6, B8A=7, B11=8, B12=9

def fetch_sentinel2(
    lat: float,
    lon: float,
    start_date: str,   # "YYYY-MM-DD"
    end_date: str,     # "YYYY-MM-DD"
    edge_size: int = 128,
    resolution: int = 10,
    device: str = "cpu"
) -> torch.Tensor:
    """
    Fetch Sentinel-2 L2A datacube and return normalised float32 tensor.
    Returns: shape (10, edge_size, edge_size), values in [0, 1].
    Raises: ValueError if no scenes found in date range.
    """

def load_geotiff(
    path: str,
    device: str = "cpu"
) -> tuple[torch.Tensor, dict]:
    """
    Load an existing GeoTIFF for inference.
    Returns: (tensor shape (C, H, W), rasterio profile dict)
    """
```

### `core/preprocessing.py`

```python
import torch

def apply_cloud_mask(
    X: torch.Tensor,   # (10, H, W) or (B, 10, H, W)
    scl: torch.Tensor  # SCL band from Sentinel-2 L2A, same spatial shape
) -> torch.Tensor:
    """
    Zero out cloud/shadow pixels using SCL classification.
    SCL values 3 (cloud shadow), 8,9,10 (cloud) → set all bands to 0.
    Returns tensor same shape as X.
    """

def clamp_nan(X: torch.Tensor) -> torch.Tensor:
    """
    Replace NaN, +Inf, -Inf with 0.0. Must be applied before any model inference.
    """

def pad_to_multiple(
    X: torch.Tensor,   # (C, H, W)
    multiple: int = 128
) -> tuple[torch.Tensor, tuple[int, int, int, int]]:
    """
    Pad spatial dims to nearest multiple of `multiple`.
    Returns: (padded tensor, (pad_top, pad_bottom, pad_left, pad_right))
    Store padding tuple to unpad after SR.
    """

def unpad(
    X: torch.Tensor,
    padding: tuple[int, int, int, int]
) -> torch.Tensor:
    """Reverse of pad_to_multiple."""
```

### `core/sr_pipeline.py`

```python
import torch
from dataclasses import dataclass

@dataclass
class SRResult:
    sr_fused: torch.Tensor       # (10, H*4, W*4) all bands at 2.5 m
    sr_rgbn: torch.Tensor        # (4, H*4, W*4) LDSR-S2 RGB+NIR output
    sr_all10: torch.Tensor       # (10, H*4, W*4) sen2sr all-band output
    uncertainty: torch.Tensor    # (1, H*4, W*4) per-pixel std-dev
    kde_map: torch.Tensor        # LAM attribution map
    complexity: float            # Gini complexity index

def run_sr_pipeline(
    X: torch.Tensor,          # (10, H, W) normalised LR tensor
    config_path: str,         # path to configs/pipeline_config.yaml
    n_uncertainty: int = 25,
    sampling_steps: int = 100,
    device: str = "cpu"
) -> SRResult:
    """
    Main pipeline entrypoint. Calls LDSR-S2, sen2sr, fuses bands, runs uncertainty and LAM.
    Raises: RuntimeError if GPU OOM — caller should retry with smaller patch via predict_large.
    """

def fuse_bands(
    sr_rgbn: torch.Tensor,   # (4, H, W) from LDSR-S2, indices [B02,B03,B04,B08]
    sr_all10: torch.Tensor   # (10, H, W) from sen2sr referencex4
) -> torch.Tensor:
    """
    Replace channels [0,1,2,6] in sr_all10 with sr_rgbn (diffusion quality for RGB+NIR).
    Returns: (10, H, W)
    """
```

### `core/postprocessing.py`

```python
import torch

def apply_fourier_hard_constraint(
    lr: torch.Tensor,   # (C, H, W) original LR, bicubic-upsampled to SR spatial size
    sr: torch.Tensor,   # (C, H, W) SR model output
    scale: int = 4
) -> torch.Tensor:
    """
    Fourier hybrid: low-freq from LR, high-freq from SR.
    This enforces spectral consistency. MUST be called on every SR output.
    Returns: (C, H, W) constrained SR tensor.
    """

def apply_nodata_mask(
    lr: torch.Tensor,   # (C, H, W) original LR
    sr: torch.Tensor    # (C, H, W) SR output
) -> torch.Tensor:
    """
    Where any LR band == 0, set corresponding SR pixel to 0.
    Prevents hallucinated values in nodata regions.
    """

def clamp_reflectance(X: torch.Tensor) -> torch.Tensor:
    """Clamp to [0, 1] reflectance range after SR."""
```

### `core/validation.py`

```python
import numpy as np

def compute_metrics(
    sr: np.ndarray,   # float32 (C, H, W) normalised [0,1]
    hr: np.ndarray    # float32 (C, H, W) same shape as sr
) -> dict[str, float]:
    """
    Returns: {"PSNR": float, "SSIM": float, "LPIPS": float, "SAM_deg": float, "ERGAS": float}
    PSNR and SSIM via scikit-image. LPIPS via VGG network (lpips package). SAM computed in numpy.
    ERGAS: relative global synthesis error across all bands.
    """

def check_uncertainty_calibration(
    hr: np.ndarray,           # (C, H, W) reference HR
    sr_mean: np.ndarray,      # (C, H, W) mean SR output
    sr_std: np.ndarray        # (1, H, W) or (C, H, W) uncertainty std-dev
) -> float:
    """
    Returns fraction of HR pixels falling within mean ± 1.96*std (95% CI).
    Target: ≥ 0.90. Log a warning if below.
    """
```

### `core/application_indices.py`

```python
import torch

def ndvi(B08: torch.Tensor, B04: torch.Tensor) -> torch.Tensor:
    """NDVI = (B08 - B04) / (B08 + B04 + 1e-8). Returns (H, W)."""

def mndwi(B03: torch.Tensor, B11: torch.Tensor) -> torch.Tensor:
    """Modified NDWI = (B03 - B11) / (B03 + B11 + 1e-8). Returns (H, W)."""

def moisture_index(B8A: torch.Tensor, B11: torch.Tensor) -> torch.Tensor:
    """(B8A - B11) / (B8A + B11 + 1e-8). Returns (H, W)."""

def built_up_index(B11: torch.Tensor, B08: torch.Tensor) -> torch.Tensor:
    """(B11 - B08) / (B11 + B08 + 1e-8). Returns (H, W)."""
```

### `configs/pipeline_config.yaml` schema

```yaml
device: "cuda"          # "cuda" | "cpu"
n_uncertainty: 25       # stochastic diffusion passes for uncertainty
sampling_steps: 100     # DDIM steps
eta: 0.95               # DDIM stochasticity (0 = deterministic, 1 = full DDPM)
patch_size: 128         # LR patch size in pixels
overlap: 32             # overlap for predict_large tiling
model_dir: "model/"     # path to downloaded weights
output_dir: "outputs/"  # GeoTIFF output directory
```

---

## 6. Integration Contracts

### 6.1 LDSR-S2 Model Contract

| Item | Detail |
|---|---|
| **Input shape** | `(1, 4, 128, 128)` float32 tensor, channels = [B02, B03, B04, B08] |
| **Input range** | [0, 1] normalised reflectance |
| **Output shape** | `(1, 4, 512, 512)` float32 |
| **Output range** | [0, 1] after `spectral_correction=True` |
| **Who owns model** | `models/ldsr_s2/` submodule — do not copy model code into `core/` |
| **Weight location** | `model/opensr-ldsrs2_v1_0_0.ckpt` (download once, cache) |
| **Call pattern** | `ldsr.forward(X_rgbn, sampling_steps=100)` |
| **Uncertainty call** | `ldsr.uncertainty_map(X_rgbn, n_variations=25, sampling_steps=100)` → `(1, 1, 512, 512)` |

### 6.2 SEN2SRLite Model Contract

| Item | Detail |
|---|---|
| **Input shape** | `(1, 10, 128, 128)` float32, all 10 bands in BAND_ORDER |
| **Output shape** | `(1, 10, 512, 512)` float32 |
| **Pipeline call** | `referencex4.srmodel(sr_model, f2_model, f4_model, hc, device)(X)` |
| **Who owns model** | `models/sen2sr/` submodule |
| **Weight loading** | via `mlstac.load(url).compiled_model(device=device)` |

### 6.3 cubo → Pipeline Contract

| Item | Detail |
|---|---|
| **Output type** | `xarray.DataArray`, shape `(time, band, y, x)` |
| **Consumer** | `core/ingestion.py` → slice `[0]` (first time step), `.compute()`, `/10000` normalisation |
| **Band order** | Must match `BAND_ORDER` constant in `ingestion.py` — do not reorder |

### 6.4 Dashboard → core Contract

| Item | Detail |
|---|---|
| **Dashboard calls** | `run_sr_pipeline()` from `core/sr_pipeline.py` only |
| **No direct model calls from dashboard** | `dashboard/` files never import from `models/` directly |
| **GeoTIFF exchange** | Dashboard reads from `outputs/` directory; never holds tensors in session state |

---

## 7. Security and Correctness Rules

**Fourier constraint before any output**: Apply `apply_fourier_hard_constraint()` to every SR tensor before writing to disk or passing to validation. The SR model output without this constraint has unconstrained low-frequency content — spectral indices derived from it will be meaningless. What breaks if ignored: NDVI from SR image will not correlate with NDVI from LR image; downstream crop monitoring and disaster assessment results become scientifically invalid.

**NaN clamping before inference**: Call `clamp_nan()` on every tensor before passing to any model. Edge pixels from cubo have SCL nodata → NaN. Unclamped NaN propagates to NaN SR output through the entire diffusion process. What breaks if ignored: entire SR patch outputs NaN; uncertainty map is undefined; pipeline crashes on the SAM metric computation.

**Band index constants — never hardcode**: Always use `BAND_ORDER` and index lookup, never hardcode `X[:, 6]` as "B08" in code. If BAND_ORDER is refactored, hardcoded indices silently produce wrong spectral outputs. What breaks if ignored: NDVI computed with wrong band; model fed wrong channels.

**`spectral_correction=True` on LDSR-S2**: The `ldsr.forward()` call must include `spectral_correction=True`. Without it, the diffusion output has no histogram matching and will have radiometrically incorrect reflectance values. What breaks if ignored: spectral indices from RGB+NIR bands are uncalibrated.

**No wall-clock time for temporal compositing**: Use scene acquisition timestamps from the xarray datacube (`da.time`), not `datetime.now()`. What breaks if ignored: temporal compositing selects wrong scenes.

**GPU OOM fallback**: If `run_sr_pipeline()` raises CUDA OOM, retry via `sen2sr.predict_large()` with `overlap=32`. Never silently resize the input tensor — this changes the effective resolution of the output. What breaks if ignored: SR output covers a smaller spatial extent than the LR input.

---

## 8. Evaluation and Verification

### Quantitative metrics (when HR reference available)

| Metric | Library | Target |
|---|---|---|
| PSNR (dB) | `skimage.metrics.peak_signal_noise_ratio` | > 30 dB |
| SSIM | `skimage.metrics.structural_similarity(channel_axis=0)` | > 0.85 |
| LPIPS | `lpips.LPIPS(net='vgg')` | < 0.15 |
| SAM (°) | Custom numpy (see `validation.py`) | < 3° |
| ERGAS | Custom numpy | < 3 |
| Uncertainty coverage | `check_uncertainty_calibration()` | ≥ 90% |

**Do not report bare "accuracy" for application-level tasks.** Use:
- Crop monitoring: boundary delineation IoU (target > 0.75)
- Urban mapping: road extraction F1 (target > 0.70)
- Disaster assessment: damage class accuracy per Copernicus EMS grading (target > 80%)
- Change detection: AUC (target > 0.85)

### Smoke test (no reference required)

```bash
python -m pytest tests/ -v
# Expected: all tests pass; test_pipeline.py runs in < 2 min on CPU with synthetic 128×128 tensor
```

### End-to-end integration check

```bash
python -m core.sr_pipeline \
  --lat 28.6139 --lon 77.2090 \
    --start 2026-01-01 --end 2026-03-31 \
  --output outputs/delhi_test.tif --uncertainty
# Verify: outputs/delhi_test.tif exists, is valid GeoTIFF with 10 bands at 2.5m resolution
# Verify: outputs/delhi_test_uncertainty.tif exists with 1 band
```

---

## 9. Don't Re-Litigate This List

- **LDSR-S2 as primary RGB+NIR model** — Best available pretrained S2/Pleiades model at 2.5 m; no comparable alternative exists open-source. Decided at architecture phase.
- **sen2sr for SWIR** — LDSR-S2 only handles 4 bands; SWIR coverage requires sen2sr. Not a fallback; a required complement.
- **FourierHardConstraint, not histogram matching alone** — Histogram matching corrects global statistics but doesn't preserve low-frequency spatial structure. Fourier hybrid is physically principled. Decision rationale: spectral indices must be derivable from SR output.
- **n=25 stochastic diffusion passes for uncertainty** — Validated by opensr-model authors. Increasing beyond 50 gives diminishing returns; decreasing below 10 underestimates uncertainty variance. 25 is the documented default.
- **eta=0.95 for DDIM** — Full deterministic (eta=0) produces over-smoothed textures. eta=0.95 balances realism with reproducibility.
- **Streamlit dashboard, not custom React app** — Hackathon timeline; Streamlit delivers working UI in hours, not days.
- **10-band set B02–B12 excluding B01/B09** — B01 (60m coastal aerosol) and B09 (water vapour) are not supported by sen2sr reference pipeline and are not required by the four application domains.
- **Python 3.11, CUDA 12.1** — mamba-ssm package requires these exact versions. Deviating breaks the optional Mamba SR path.

---

## 10. Open Questions

- **Temporal compositing strategy**: When multiple S2 scenes exist in the date range, current plan is to use `da[0]` (first scene). For production, median compositing over cloud-free scenes would reduce cloud contamination — not yet implemented.
- **SWIR band alignment at 2.5 m**: The sen2sr referencex4 pipeline produces SWIR at 2.5 m by first upsampling 20 m → 10 m then applying 4×. The alignment between the LDSR-S2 RGB+NIR (128→512) and sen2sr SWIR (128→512 via two-stage) must be verified pixel-perfect before band fusion.
- **Cartosat-3 API access**: Bhuvan API authentication for India-specific validation reference data is not yet set up. Fallback is controlled degradation experiments.
- **Dashboard deployment**: Streamlit Cloud vs. local Docker vs. HPC-hosted — not decided. No auth is planned regardless of deployment target.
