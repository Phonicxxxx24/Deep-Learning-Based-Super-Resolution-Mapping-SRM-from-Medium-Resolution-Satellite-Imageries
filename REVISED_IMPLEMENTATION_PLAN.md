# SRM — Revised Implementation Plan
## "Clone Both, Strip, Connect Directly"

> Built from analysis of: teammate's `srm/` package, `SRM_Architecture.md`, `SRM_Solution_Architecture.md`, and the benchmark results.

---

## 0. Why Revise

The teammate's `srm/` package is **good and working** — keep it. The benchmark is honest (21–24 dB PSNR, SEN2SRLite barely above bicubic is expected for SPOT reference; LDSR-S2 diffusion path not yet exercised in benchmark because it only benchmarks SEN2SRLite). The core issue is:

**Pip-installed packages are version-locked black boxes.** You can't access `referencex4.py` internals, can't call `lam()` from `sen2sr.xai`, can't tweak the DDIM sampler. The architecture plan assumed submodule access. The teammate used pip. Neither is wrong — but if you want the full pipeline (LAM, referencex4 SWIR fusion, direct HardConstraint tuning), you need the source.

**The fix is surgical, not a rewrite.**

---

## 1. Repo Layout After the Change

```
srm_sentinel2/                         ← your repo root
├── vendor/                            ← cloned source (gitignored from upstream remotes)
│   ├── opensr-model/                  ← git clone https://github.com/ESAOpenSR/opensr-model
│   │   └── opensr_model/              ← importable from here
│   └── sen2sr/                        ← git clone https://github.com/ESAOpenSR/sen2sr
│       └── sen2sr/                    ← importable from here
├── srm/                               ← KEEP all teammate code, modify imports only
│   ├── __init__.py
│   ├── config.py                      ← no change
│   ├── ingestion.py                   ← no change
│   ├── preprocessing.py               ← no change
│   ├── sr_pipeline.py                 ← MODIFY: use vendor/ imports + add referencex4 path
│   ├── uncertainty.py                 ← no change (already calls model.uncertainty_map())
│   ├── postprocessing.py              ← no change
│   ├── validation.py                  ← ADD: LPIPS, ERGAS, uncertainty calibration
│   ├── applications.py                ← no change
│   └── explainability.py              ← NEW: LAM wrapper from vendor/sen2sr/sen2sr/xai/lam.py
├── dashboard/                         ← NEW: Streamlit app
│   ├── app.py
│   ├── map_view.py
│   └── charts.py
├── configs/
│   ├── srm_config.yaml                ← already exists
│   └── pipeline_config.yaml           ← ADD: dashboard + LAM settings
├── tests/                             ← keep all 13 existing tests, add new ones
├── scripts/
│   └── setup_vendor.sh                ← NEW: clone + pip install -e vendor/
├── run_pipeline.py                    ← no change
├── pyproject.toml                     ← MODIFY: remove opensr-model/sen2sr from deps
└── verification/
    └── benchmark_results.csv          ← already exists
```

### What to strip from each cloned repo

**From `vendor/opensr-model/`** — delete:
- `deployment/` (HPC/Slurm — add back if you need it, but not for hackathon demo)
- `docs/`
- `.github/`
- Any training scripts (`train*.py`, `finetune*.py`)
- Keep everything under `opensr_model/` — you need the full module

**From `vendor/sen2sr/`** — delete:
- `notebooks/` (their examples, not yours)
- `.github/`
- `docs/`
- Keep: `sen2sr/models/`, `sen2sr/xai/`, `sen2sr/referencex4.py`, `sen2sr/utils.py`

---

## 2. Setup Script

```bash
# scripts/setup_vendor.sh
#!/bin/bash
set -e

echo "Cloning opensr-model..."
git clone https://github.com/ESAOpenSR/opensr-model vendor/opensr-model --depth 1

echo "Cloning sen2sr..."
git clone https://github.com/ESAOpenSR/sen2sr vendor/sen2sr --depth 1

echo "Stripping unnecessary dirs..."
rm -rf vendor/opensr-model/deployment
rm -rf vendor/opensr-model/docs
rm -rf vendor/opensr-model/.github
rm -rf vendor/sen2sr/notebooks
rm -rf vendor/sen2sr/.github
rm -rf vendor/sen2sr/docs

echo "Installing vendor packages in editable mode..."
pip install -e vendor/opensr-model
pip install -e vendor/sen2sr

echo "Done. vendor/ packages override pip-installed versions."
```

After this, `import opensr_model` resolves to `vendor/opensr-model/opensr_model/` — editable, inspectable, tweakable.

---

## 3. The Three Changes That Complete the Pipeline

The teammate's code is ~80% done. These three additions finish it.

### 3.1 Add `referencex4` SWIR path to `sr_pipeline.py`

The current `DualPathSRPipeline` runs SEN2SRLite on all 10 bands via `mlstac.load()` compiled model. That's the `NonReference_RGBN_x4` variant — it doesn't do the two-stage SWIR fusion. The full pipeline needs `referencex4.srmodel()`.

**What to add to `DualPathSRPipeline.__init__`:**

```python
# In DualPathSRPipeline.__init__, after loading model_sen2sr:
from sen2sr import referencex4
from sen2sr.models.tricks import HardConstraint, ideal_filter

# Load SWIR-specific models
self.f2_model = mlstac.load(
    os.path.join(sen2sr_model_dir, "..", "SEN2SRLite_Reference_RSWIR_x2")
).compiled_model(device=self.device)

lp_mask = ideal_filter((512, 512), cutoff=filter_cutoff).to(self.device)
hc = HardConstraint(low_pass_mask=lp_mask, bands="all", device=str(self.device))

self.referencex4_pipeline = referencex4.srmodel(
    sr_model=self.model_sen2sr,    # RGB+NIR 4x
    f2_model=self.f2_model,         # SWIR 2x
    f4_model=None,                  # fusion — check if referencex4 needs this separately
    hc=hc,
    device=str(self.device)
)
```

**What to change in `run_inference`:**

Replace the current Path B call:
```python
# BEFORE:
sr_sen2sr = self.model_sen2sr(lr_gpu)

# AFTER (uses the full reference pipeline with SWIR fusion):
sr_sen2sr = self.referencex4_pipeline(lr_gpu)
# shape: (1, 10, 4H, 4W) — all 10 bands including proper SWIR at 2.5m
```

The HardConstraint is now applied inside `referencex4_pipeline` at each stage — remove the duplicate HardConstraint block at the end of `run_inference` (or keep it as a final pass, both are fine).

### 3.2 Add `srm/explainability.py` — LAM wrapper

This file doesn't exist yet. Wire it from `vendor/sen2sr/sen2sr/xai/lam.py`.

```python
# srm/explainability.py
"""Local Attribution Map (LAM) explainability via sen2sr.xai.lam."""

import logging
from typing import Tuple
import torch
from sen2sr.xai import lam as lam_module   # available after vendor install

logger = logging.getLogger(__name__)


def compute_lam(
    lr_rgbn: torch.Tensor,          # (4, H, W) — B02,B03,B04,B08 on CPU
    model: torch.nn.Module,          # compiled SEN2SRLite RGBN model
    h: int = 240,
    w: int = 240,
    window: int = 32,
    scales: list[str] = None,
    aoi_name: str = "custom_aoi",
) -> Tuple[torch.Tensor, float, torch.Tensor, torch.Tensor]:
    """Compute Local Attribution Map for SR model interpretability.

    Args:
        lr_rgbn: 4-band LR tensor (no batch dim) on CPU. Must be (4, H, W).
        model: Compiled SEN2SRLite RGBN model (CPU inference for LAM).
        h, w: Pixel coordinates for the target SR output pixel to explain.
        window: Neighbourhood window size around target pixel.
        scales: Upscaling factors to analyse. Default: ["2x","3x","4x","5x","6x"].
        aoi_name: For structured logging.

    Returns:
        Tuple of (kde_map, gini_complexity, robustness_tensor, robustness_vector).
        kde_map: (H, W) tensor — attribution heatmap over LR pixels.
        gini_complexity: float — how concentrated the attribution is.
    """
    if scales is None:
        scales = ["2x", "3x", "4x", "5x", "6x"]

    if lr_rgbn.ndim == 4:
        lr_rgbn = lr_rgbn.squeeze(0)

    logger.info("[%s] Computing LAM (h=%d, w=%d, window=%d)...", aoi_name, h, w, window)

    kde_map, complexity, robustness, rob_vec = lam_module.lam(
        lr_rgbn,
        model,
        h=h,
        w=w,
        window=window,
        scales=scales,
    )
    logger.info(
        "[%s] LAM complete: Gini complexity=%.4f", aoi_name, float(complexity)
    )
    return kde_map, float(complexity), robustness, rob_vec
```

**Wire into `run_pipeline.py`** — add optional `--lam` flag call after SR inference:

```python
if cfg.lam.enabled:
    from srm.explainability import compute_lam
    lite_model = pipeline.model_sen2sr.cpu()  # LAM runs on CPU
    kde_map, complexity, _, _ = compute_lam(
        lr_rgbn=lr_10b_normalized[[0,1,2,6]].cpu(),
        model=lite_model,
        h=aoi_cfg.edge_size * 2,
        w=aoi_cfg.edge_size * 2,
        aoi_name=aoi_key,
    )
    # Save kde_map as PNG
```

### 3.3 Add missing validation metrics to `validation.py`

The teammate has PSNR/SSIM/SAM. Missing: LPIPS and ERGAS. Add both to `compute_metrics()`:

```python
# Add to srm/validation.py

import lpips as lpips_lib

def compute_lpips(
    reference: np.ndarray,   # (C, H, W) float32 [0,1]
    target: np.ndarray,
) -> float:
    """Compute LPIPS perceptual distance (VGG). Lower is better, target < 0.15."""
    loss_fn = lpips_lib.LPIPS(net="vgg", verbose=False)
    # LPIPS needs (1, 3, H, W) in [-1, 1]
    ref_t = torch.from_numpy(reference[:3]).unsqueeze(0) * 2 - 1
    tgt_t = torch.from_numpy(target[:3]).unsqueeze(0) * 2 - 1
    return float(loss_fn(ref_t, tgt_t).item())


def compute_ergas(
    reference: np.ndarray,   # (C, H, W)
    target: np.ndarray,
    scale: int = 4,
) -> float:
    """Compute ERGAS (Erreur Relative Globale Adimensionnelle de Synthèse).
    
    ERGAS = 100/scale * sqrt(1/C * sum_c((RMSE_c / mean_c)^2))
    Target: < 3.
    """
    c = reference.shape[0]
    band_scores = []
    for i in range(c):
        rmse = np.sqrt(np.mean((reference[i] - target[i]) ** 2))
        mean_ref = np.mean(reference[i])
        if mean_ref > 1e-8:
            band_scores.append((rmse / mean_ref) ** 2)
    ergas = (100 / scale) * np.sqrt(np.mean(band_scores))
    return float(ergas)


def check_uncertainty_calibration(
    hr: np.ndarray,           # (C, H, W)
    sr_mean: np.ndarray,      # (C, H, W)
    sr_std: np.ndarray,       # (1, H, W) or (C, H, W)
) -> float:
    """Fraction of HR pixels within 95% CI (mean ± 1.96*std). Target ≥ 0.90."""
    if sr_std.shape[0] == 1:
        sr_std = np.repeat(sr_std, hr.shape[0], axis=0)
    lower = sr_mean - 1.96 * sr_std
    upper = sr_mean + 1.96 * sr_std
    within = np.logical_and(hr >= lower, hr <= upper)
    return float(within.mean())
```

---

## 4. The Dashboard (Streamlit) — Minimum Viable for Demo

The dashboard is the biggest remaining gap. It should be buildable in 3–4 hours.

### File: `dashboard/app.py`

```python
"""Streamlit dashboard — reads from outputs/, never calls models directly."""
import streamlit as st
import rasterio
import numpy as np
from pathlib import Path
import plotly.graph_objects as go
import folium
from streamlit_folium import st_folium

from srm.applications import compute_ndvi, compute_mndwi, compute_ndbi, create_rgb_composite

OUTPUT_DIR = Path("outputs")

st.set_page_config(page_title="SRM Dashboard", layout="wide")
st.title("Sentinel-2 Super-Resolution Mapping — SIH 2026")

# Sidebar: pick an AOI output
available = sorted(OUTPUT_DIR.glob("*_sr_10band_2.5m.tif"))
if not available:
    st.warning("No SR outputs found. Run run_pipeline.py first.")
    st.stop()

selected = st.sidebar.selectbox("AOI", [p.stem.replace("_sr_10band_2.5m", "") for p in available])
sr_path = OUTPUT_DIR / f"{selected}_sr_10band_2.5m.tif"
unc_path = OUTPUT_DIR / f"{selected}_uncertainty_2.5m.tif"

with rasterio.open(sr_path) as src:
    sr_data = src.read().astype(np.float32)   # (10, H, W)
    crs = src.crs
    transform = src.transform

# --- Tab layout ---
tab_map, tab_spectral, tab_metrics, tab_indices = st.tabs(
    ["🗺 Map", "📊 Spectral", "📈 Metrics", "🌿 Indices"]
)

with tab_map:
    col1, col2 = st.columns(2)
    with col1:
        st.subheader("SR Output (2.5m)")
        sr_rgb = create_rgb_composite(sr_data)
        st.image(sr_rgb, use_column_width=True, caption="RGB composite (B04-B03-B02)")
    with col2:
        if unc_path.exists():
            st.subheader("Uncertainty Map")
            with rasterio.open(unc_path) as usrc:
                unc = usrc.read(1).astype(np.float32)
            vmax = float(np.percentile(unc, 95))
            st.image(unc / (vmax + 1e-8), use_column_width=True,
                     caption="Per-pixel std-dev (brighter = more uncertain)")

with tab_spectral:
    st.subheader("Band Reflectance Distribution")
    band_names = ["B02","B03","B04","B05","B06","B07","B08","B8A","B11","B12"]
    fig = go.Figure()
    for i, bname in enumerate(band_names):
        band = sr_data[i].flatten()
        fig.add_trace(go.Box(y=band, name=bname, boxpoints=False))
    fig.update_layout(yaxis_title="Reflectance [0,1]", height=400)
    st.plotly_chart(fig, use_container_width=True)

with tab_indices:
    index_choice = st.radio("Index", ["NDVI", "MNDWI", "NDBI"], horizontal=True)
    if index_choice == "NDVI":
        idx = compute_ndvi(sr_data)
        cmap = "YlGn"
    elif index_choice == "MNDWI":
        idx = compute_mndwi(sr_data)
        cmap = "Blues"
    else:
        idx = compute_ndbi(sr_data)
        cmap = "YlOrRd"
    import matplotlib.pyplot as plt
    fig2, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(idx, cmap=cmap, vmin=-0.3, vmax=0.8)
    plt.colorbar(im, ax=ax)
    ax.set_title(f"{index_choice} at 2.5m resolution")
    ax.axis("off")
    st.pyplot(fig2)

with tab_metrics:
    csv_path = Path("verification/benchmark_results.csv")
    if csv_path.exists():
        import pandas as pd
        df = pd.read_csv(csv_path)
        st.dataframe(df)
        # Bar chart: PSNR by method
        fig3 = go.Figure()
        for method, grp in df.groupby("method"):
            fig3.add_trace(go.Bar(x=[method], y=[grp["psnr_db"].mean()], name=method))
        fig3.update_layout(title="Mean PSNR by Method (SPOT benchmark)", yaxis_title="PSNR (dB)")
        st.plotly_chart(fig3, use_container_width=True)
```

---

## 5. What NOT to Touch

| Area | Status | Action |
|---|---|---|
| `srm/config.py` | Perfect | No change |
| `srm/ingestion.py` | Perfect | No change |
| `srm/preprocessing.py` | Perfect + well-tested | No change |
| `srm/uncertainty.py` | Working, edge/flat ratio validation is good | No change |
| `srm/postprocessing.py` | Working, CRS-preserved COG output | No change |
| `srm/applications.py` | NDVI/MNDWI/NDBI correct | No change |
| All 13 existing tests | Passing | No change, add new tests only |
| `configs/srm_config.yaml` | Good structure | Add `lam:` section |
| `run_pipeline.py` | Clean orchestration | Add `--lam` flag only |

---

## 6. Task Sequence (Who Does What, In Order)

| # | Task | File | Depends On | Time Est |
|---|---|---|---|---|
| 1 | Run `setup_vendor.sh`, verify imports work | `vendor/` | Nothing | 30 min |
| 2 | Switch `sr_pipeline.py` to `referencex4` SWIR path | `srm/sr_pipeline.py` | Task 1 | 1 hr |
| 3 | Write `srm/explainability.py` | `srm/explainability.py` | Task 1 | 45 min |
| 4 | Add LPIPS + ERGAS + calibration to `validation.py` | `srm/validation.py` | Nothing (pure numpy) | 45 min |
| 5 | Wire LAM into `run_pipeline.py` with `--lam` flag | `run_pipeline.py` | Task 3 | 30 min |
| 6 | Build `dashboard/app.py` | `dashboard/` | Task 2, outputs exist | 3 hr |
| 7 | Update `pipeline_config.yaml` with LAM section | `configs/` | Task 3 | 15 min |
| 8 | Add tests for LPIPS, ERGAS, LAM shape | `tests/` | Tasks 3, 4 | 1 hr |
| 9 | End-to-end demo run: all 3 AOIs + dashboard | All | All above | 1 hr |

**Total: ~8–9 hours of focused work.**

---

## 7. The Benchmark Reality Check

Current results (from `benchmark_results.csv`):
- SEN2SRLite barely beats bicubic on SPOT (21–24 dB, +0.003 SSIM)
- This is **expected and fine** — the SPOT benchmark tests the CNN path only

The LDSR-S2 diffusion path will score differently (and better perceptually) but can't be easily benchmarked with PSNR because diffusion outputs have different noise patterns than the reference. **For the hackathon presentation**, the right framing is:
- PSNR/SSIM: report these honestly (SEN2SRLite path, SPOT dataset)
- Perceptual quality: show LDSR-S2 output visually — it looks dramatically better
- Uncertainty maps: unique selling point, no interpolation approach offers this
- LAM: the explainability angle that judges will ask about

Don't try to game the PSNR — it will look suspicious. Let each metric tell its own story.

---

## 8. Single Command to Reproduce Everything

After completing all tasks:

```bash
# 1. Setup
bash scripts/setup_vendor.sh
pip install -e .

# 2. Run full pipeline: all 3 AOIs
python run_pipeline.py --all-aois --lam

# 3. Run benchmark
python run_pipeline.py --benchmark

# 4. Launch dashboard
streamlit run dashboard/app.py
```

The demo is live. All outputs are in `outputs/`. The benchmark CSV is in `verification/`.
