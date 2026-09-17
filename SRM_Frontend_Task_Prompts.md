# SRM Frontend — Task Prompts
## Next.js Interactive Map Interface + Flexible Pipeline API
## Paste one task at a time into Claude Code / Cursor. Do tasks in order.

---

## PROJECT CONTEXT — READ BEFORE ANYTHING

**What this replaces:** The hardcoded `aois:` block in `configs/srm_config.yaml` and
the `--aoi agri_valencia` CLI argument. Instead of the developer typing coordinates,
the user clicks a map, a 128×128 px patch centred on that click is fetched and
super-resolved, and results stream back to the browser.

**What stays unchanged:** Every file in `srm/` — ingestion, preprocessing, sr_pipeline,
validation, applications, explainability. The pipeline receives `lat`, `lon` and does
everything it already does. We are adding a web input layer on top, not touching the model.

**Hardware constraint:** RTX 3050, 6 GB VRAM. One SR job at a time. The API server
must queue concurrent requests — never run two GPU jobs simultaneously.

---

## ARCHITECTURE OVERVIEW

```
Browser (Next.js App Router)
  │
  │  POST /api/sr/submit  { lat, lon }
  │  GET  /api/sr/status/:jobId
  │  GET  /api/sr/result/:jobId
  │
FastAPI server  (srm_api/main.py)   ← NEW
  │  asyncio.Queue — one GPU job at a time
  │
  └── run_sr_from_latlon(lat, lon)  ← NEW thin wrapper in srm/
        cubo.create(lat, lon, edge_size=128, resolution=10)
        DualPathSRPipeline.run_inference(X)
        → writes outputs/{jobId}_sr_10band_2.5m.tif
        → writes outputs/{jobId}_uncertainty_2.5m.tif
        → returns SRResult with metrics + PNG paths
```

**File layout after all tasks:**

```
srm_sentinel2/              ← existing repo root
├── srm/                    ← UNCHANGED
├── dashboard/              ← existing Streamlit (kept, not deleted)
├── srm_api/                ← NEW: FastAPI backend
│   ├── main.py             ← FastAPI app, job queue, endpoints
│   ├── job_runner.py       ← GPU job execution, output export
│   └── schemas.py          ← Pydantic request/response models
├── frontend/               ← NEW: Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx          ← root layout, theme provider
│   │   │   ├── page.tsx            ← landing / map page
│   │   │   ├── results/[jobId]/
│   │   │   │   └── page.tsx        ← results viewer page
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── MapPicker.tsx       ← Leaflet map, click handler
│   │   │   ├── PatchPreview.tsx    ← 128×128 patch boundary box overlay
│   │   │   ├── JobStatusBadge.tsx  ← polling status indicator
│   │   │   ├── ResultsPanel.tsx    ← SR/LR comparison, metrics, indices
│   │   │   ├── UncertaintyOverlay.tsx
│   │   │   ├── SpectralChart.tsx   ← band reflectance chart
│   │   │   ├── ThemeToggle.tsx
│   │   │   └── ui/                 ← base primitives (Button, Badge, Card)
│   │   ├── hooks/
│   │   │   ├── useJobPoller.ts     ← polls /api/sr/status every 3s
│   │   │   └── useMapClick.ts      ← extracts lat/lon from Leaflet click
│   │   ├── utils/
│   │   │   └── api.ts              ← all fetch calls (centralised)
│   │   ├── types/
│   │   │   └── index.ts            ← shared TypeScript types
│   │   └── lib/
│   │       └── constants.ts        ← PATCH_SIZE_M, API_BASE, BAND_NAMES
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.ts
└── configs/
    └── srm_config.yaml             ← aois: section no longer needed
```

---

## TECH STACK (STRICT)

**Frontend**
- Next.js 14+ (App Router)
- TypeScript — strict mode
- Tailwind CSS — no CSS-in-JS, no inline style objects except for dynamic values
- Framer Motion — page transitions and component entry/exit only
- Leaflet + react-leaflet — map (SSR-disabled, client component)
- Lucide React — single icon system, no mixing
- `react-query` (`@tanstack/react-query`) — data fetching and polling

**Backend API**
- FastAPI (Python) — runs alongside the existing pipeline
- Pydantic v2 — request/response schemas
- `asyncio.Queue` — GPU job serialisation
- uvicorn — ASGI server

**Do NOT use:**
- Redux, Zustand, Jotai, or any global state beyond React context
- axios (use native fetch)
- styled-components or emotion
- shadcn/ui (build primitives from scratch — they must match project identity)
- Next.js `/api` routes for GPU work — all GPU work goes through FastAPI

---

## DESIGN SYSTEM

**Palette**

```css
/* Use these exact values — defined in globals.css as CSS vars */
--color-bg:          #0a0e14;   /* near-black space */
--color-surface:     #111827;   /* card surface */
--color-surface-2:   #1a2235;   /* elevated surface */
--color-border:      #1e2d40;   /* subtle border */
--color-accent:      #00d4aa;   /* teal — primary action / SR highlight */
--color-accent-dim:  #00a888;   /* hover state */
--color-warn:        #f59e0b;   /* uncertainty / amber */
--color-danger:      #ef4444;   /* errors */
--color-text:        #e2e8f0;   /* primary text */
--color-muted:       #64748b;   /* secondary text */
```

Light mode: invert bg → `#f8fafc`, surface → `#ffffff`, border → `#e2e8f0`.
Accent and warn stay the same in both modes.

**Typography**
- Font: `Inter` (Google Fonts, preloaded in layout.tsx)
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 48px
- Weight: 400 body, 500 label, 600 heading — never 700+

**Glass effect** (use only on map overlays and modals)
```css
background: rgba(17, 24, 39, 0.72);
backdrop-filter: blur(12px);
border: 0.5px solid rgba(255,255,255,0.08);
```

**Motion timing** (all Framer Motion)
```ts
const ease = [0.16, 1, 0.3, 1];  // custom spring-ish ease
const duration = { fast: 0.18, base: 0.28, slow: 0.45 };
```

**Radius:** 8px controls, 12px cards, 16px panels, 9999px badges/pills

---

## BEFORE ANY TASK

```bash
# 1. Confirm the existing Python pipeline still passes
.venv\Scripts\python.exe -m pytest tests/ -v
# Must be 20/20 green. If not, fix before touching anything here.

# 2. Confirm FastAPI and uvicorn are installable
.venv\Scripts\python.exe -m pip show fastapi uvicorn
# If missing: uv pip install fastapi uvicorn pydantic python-multipart

# 3. Confirm Node version
node --version   # Must be >= 18
```

---

## TASK 0 — FastAPI Backend Setup

**Do this task yourself. No agent.**

### Part A — Install Python dependencies

```bash
C:\Users\jainh\.local\bin\uv.exe pip install fastapi uvicorn pydantic python-multipart --python .venv\Scripts\python.exe
```

### Part B — Create `srm_api/schemas.py`

```python
# srm_api/schemas.py
"""Pydantic v2 request/response schemas for the SR API."""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


class SRRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0, description="Centre latitude")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Centre longitude")
    n_uncertainty: int = Field(default=5, ge=1, le=5,
        description="Stochastic passes for uncertainty map. Max 5 on 6GB GPU.")
    sampling_steps: int = Field(default=50, ge=10, le=50,
        description="DDIM steps. Max 50 on 6GB GPU.")
    run_lam: bool = Field(default=False,
        description="Run LAM explainability (adds 2-5 min on CPU).")

    @model_validator(mode="after")
    def clamp_hardware_limits(self) -> "SRRequest":
        # Hard limits — RTX 3050 6GB. Never override these.
        self.n_uncertainty = min(self.n_uncertainty, 5)
        self.sampling_steps = min(self.sampling_steps, 50)
        return self


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "error"]
    queue_position: Optional[int] = None   # None when running or done
    progress_msg: Optional[str] = None


class BandMetrics(BaseModel):
    psnr_db: Optional[float] = None
    ssim: Optional[float] = None
    sam_deg: Optional[float] = None
    ergas: Optional[float] = None
    lpips: Optional[float] = None


class SRResult(BaseModel):
    job_id: str
    lat: float
    lon: float
    # Image URLs served by FastAPI /static/ mount
    sr_rgb_url: str          # 3-band RGB PNG at 2.5m
    lr_rgb_url: str          # 3-band RGB PNG at 10m (bicubic upscaled for display)
    uncertainty_url: str     # uncertainty heatmap PNG
    lam_url: Optional[str] = None
    ndvi_url: Optional[str] = None
    mndwi_url: Optional[str] = None
    ndbi_url: Optional[str] = None
    metrics: BandMetrics
    patch_size_px: int = 128
    output_size_px: int = 512
    lr_resolution_m: float = 10.0
    sr_resolution_m: float = 2.5
    processing_time_s: float
```

### Part C — Create `srm/flexible_input.py`

This is the thin wrapper that replaces hardcoded AOI config with lat/lon input.

```python
# srm/flexible_input.py
"""
Flexible lat/lon input wrapper for the SR pipeline.

Replaces the hardcoded `aois:` config block. Fetches a 128×128 px Sentinel-2
L2A patch centred on the given lat/lon and runs the full SR pipeline on it.

Hardware constraints (RTX 3050 6GB):
- patch_size always 128 — do NOT increase
- n_uncertainty max 5
- sampling_steps max 50
"""
from __future__ import annotations
import logging
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import torch

logger = logging.getLogger(__name__)

PATCH_SIZE_PX = 128       # Hard limit — 6GB VRAM
LR_RESOLUTION_M = 10      # Sentinel-2 native
SR_SCALE = 4              # 10m → 2.5m
OUTPUT_SIZE_PX = PATCH_SIZE_PX * SR_SCALE  # 512


@dataclass
class FlexibleSRResult:
    job_id: str
    lat: float
    lon: float
    sr_tensor: torch.Tensor         # (10, 512, 512) float32 [0,1]
    lr_tensor: torch.Tensor         # (10, 128, 128) float32 [0,1]
    uncertainty: Optional[torch.Tensor]  # (1, 512, 512) or None
    kde_map: Optional[np.ndarray]
    gini_complexity: float
    metrics: dict                   # PSNR, SSIM, SAM, ERGAS, LPIPS if available
    processing_time_s: float
    output_dir: Path


def run_sr_from_latlon(
    lat: float,
    lon: float,
    output_dir: Path,
    job_id: Optional[str] = None,
    n_uncertainty: int = 5,
    sampling_steps: int = 50,
    run_lam: bool = False,
    date_range: tuple[str, str] = ("2025-01-01", "2025-12-31"),
    config_path: str = "configs/srm_config.yaml",
) -> FlexibleSRResult:
    """
    Fetch Sentinel-2 data centred on (lat, lon) and run full SR pipeline.

    The 128×128 px patch is centred on the coordinate. At 10m/px resolution,
    this covers a 1280m × 1280m ground footprint.

    Args:
        lat: Centre latitude (WGS84).
        lon: Centre longitude (WGS84).
        output_dir: Directory where output GeoTIFFs and PNGs are written.
        job_id: Unique identifier for this job. Auto-generated if None.
        n_uncertainty: Stochastic diffusion passes. Hard cap: 5.
        sampling_steps: DDIM steps. Hard cap: 50.
        run_lam: Whether to run LAM explainability (CPU, 2-5 min).
        date_range: (start_date, end_date) for Sentinel-2 scene selection.
        config_path: Path to srm_config.yaml.

    Returns:
        FlexibleSRResult with tensors, uncertainty, metrics, and output paths.
    """
    import cubo
    from srm.config import SRMConfig
    from srm.preprocessing import preprocess
    from srm.sr_pipeline import DualPathSRPipeline
    from srm.postprocessing import export_geotiff
    from srm.uncertainty import compute_uncertainty
    from srm.applications import (
        compute_ndvi, compute_mndwi, compute_ndbi, create_rgb_composite
    )
    from srm.validation import compute_ergas, compute_lpips
    from skimage.metrics import peak_signal_noise_ratio, structural_similarity

    # Hard clamps — never exceed these on 6GB GPU
    n_uncertainty = min(n_uncertainty, 5)
    sampling_steps = min(sampling_steps, 50)

    if job_id is None:
        job_id = uuid.uuid4().hex[:12]

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    t_start = time.time()
    cfg = SRMConfig.from_yaml(config_path)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("[%s] SR job started — lat=%.5f lon=%.5f device=%s", job_id, lat, lon, device)

    # ── 1. Fetch 128×128 Sentinel-2 patch centred on lat/lon ──────────────
    start_date, end_date = date_range
    try:
        da = cubo.create(
            lat=lat,
            lon=lon,
            collection="sentinel-2-l2a",
            bands=["B02", "B03", "B04", "B05", "B06", "B07",
                   "B08", "B8A", "B11", "B12"],
            start_date=start_date,
            end_date=end_date,
            edge_size=PATCH_SIZE_PX,   # 128 — hard limit
            resolution=LR_RESOLUTION_M,
        )
    except Exception as e:
        raise ValueError(
            f"No Sentinel-2 scenes found for lat={lat:.4f}, lon={lon:.4f}, "
            f"dates={start_date}–{end_date}. Try a wider date range."
        ) from e

    # Take the least-cloudy scene (index 0 after cubo sorts by cloud cover)
    lr_np = (da[0].compute().to_numpy() / 10_000).astype("float32")
    lr_tensor = torch.from_numpy(lr_np)
    lr_tensor = torch.nan_to_num(lr_tensor, nan=0.0, posinf=0.0, neginf=0.0)
    lr_tensor = lr_tensor.clamp(0.0, 1.0)
    # lr_tensor: (10, 128, 128)

    # ── 2. Preprocessing (cloud mask, padding) ─────────────────────────────
    lr_padded, pad_tuple = preprocess(lr_tensor, cfg)
    # lr_padded: (10, 128, 128) — padding is zero here since input is exactly 128

    # ── 3. Run dual-path SR ────────────────────────────────────────────────
    pipeline = DualPathSRPipeline(
        device=device,
        sampling_steps=sampling_steps,
        use_referencex4=True,
    )
    sr_dict = pipeline.run_inference(lr_padded.unsqueeze(0).to(device), aoi_name=job_id)
    sr_tensor = sr_dict["sr_final"].squeeze(0).cpu()  # (10, 512, 512)

    if device != "cpu":
        torch.cuda.empty_cache()

    # ── 4. Uncertainty map ─────────────────────────────────────────────────
    uncertainty = None
    try:
        uncertainty = compute_uncertainty(
            lr_padded.unsqueeze(0).to(device),
            pipeline,
            n_variations=n_uncertainty,
            sampling_steps=sampling_steps,
        ).cpu()  # (1, 512, 512)
        if device != "cpu":
            torch.cuda.empty_cache()
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            logger.warning("[%s] OOM computing uncertainty — skipping", job_id)
            torch.cuda.empty_cache()
        else:
            raise

    # ── 5. LAM explainability (CPU, optional) ─────────────────────────────
    kde_map = None
    gini = 0.0
    if run_lam:
        from srm.explainability import compute_lam
        import mlstac
        lite_model = mlstac.load("model/SEN2SRLite_RGBN").compiled_model(device="cpu")
        kde_map, gini, _, _ = compute_lam(
            lr_rgbn=lr_tensor[[0, 1, 2, 6]].cpu(),
            model=lite_model,
            h=OUTPUT_SIZE_PX // 2,
            w=OUTPUT_SIZE_PX // 2,
            aoi_name=job_id,
        )

    # ── 6. Spectral indices ────────────────────────────────────────────────
    sr_np = sr_tensor.numpy()
    ndvi_map  = compute_ndvi(sr_np)
    mndwi_map = compute_mndwi(sr_np)
    ndbi_map  = compute_ndbi(sr_np)

    # ── 7. Export GeoTIFF outputs ──────────────────────────────────────────
    # Use cubo-derived transform for geolocation
    sr_tif_path  = output_dir / f"{job_id}_sr_10band_2.5m.tif"
    unc_tif_path = output_dir / f"{job_id}_uncertainty_2.5m.tif"

    # Export SR GeoTIFF (re-use postprocessing with adjusted transform)
    export_geotiff(
        tensor=sr_tensor,
        path=sr_tif_path,
        reference_da=da[0],     # provides CRS + original transform
        scale_factor=SR_SCALE,
    )
    if uncertainty is not None:
        export_geotiff(
            tensor=uncertainty,
            path=unc_tif_path,
            reference_da=da[0],
            scale_factor=SR_SCALE,
        )

    # ── 8. Export PNGs for the web API ────────────────────────────────────
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from PIL import Image

    def _save_rgb_png(arr_chw: np.ndarray, path: Path, percentile: int = 98) -> None:
        """Save a 3-band (C, H, W) float32 array as a display-ready PNG."""
        rgb = arr_chw.transpose(1, 2, 0)  # (H, W, 3)
        p2 = np.percentile(rgb, 2)
        p98 = np.percentile(rgb, percentile)
        rgb = np.clip((rgb - p2) / (p98 - p2 + 1e-8), 0, 1)
        img = Image.fromarray((rgb * 255).astype(np.uint8))
        img.save(path)

    def _save_index_png(index_2d: np.ndarray, path: Path, cmap: str = "RdYlGn") -> None:
        fig, ax = plt.subplots(figsize=(5.12, 5.12), dpi=100)
        ax.imshow(index_2d, cmap=cmap, vmin=-0.3, vmax=0.8)
        ax.axis("off")
        plt.tight_layout(pad=0)
        plt.savefig(path, bbox_inches="tight", pad_inches=0)
        plt.close(fig)

    def _save_uncertainty_png(unc: np.ndarray, path: Path) -> None:
        vmax = float(np.percentile(unc, 95)) + 1e-8
        fig, ax = plt.subplots(figsize=(5.12, 5.12), dpi=100)
        ax.imshow(unc[0] / vmax, cmap="plasma", vmin=0, vmax=1)
        ax.axis("off")
        plt.tight_layout(pad=0)
        plt.savefig(path, bbox_inches="tight", pad_inches=0)
        plt.close(fig)

    sr_rgb_path  = output_dir / f"{job_id}_sr_rgb.png"
    lr_rgb_path  = output_dir / f"{job_id}_lr_rgb.png"
    unc_png_path = output_dir / f"{job_id}_uncertainty.png"
    ndvi_path    = output_dir / f"{job_id}_ndvi.png"
    mndwi_path   = output_dir / f"{job_id}_mndwi.png"
    ndbi_path    = output_dir / f"{job_id}_ndbi.png"
    lam_path     = output_dir / f"{job_id}_lam.png"

    _save_rgb_png(sr_np[[2, 1, 0]], sr_rgb_path)   # B04,B03,B02 → RGB
    # LR display: bicubic 4× for visual comparison only
    import torch.nn.functional as F
    lr_display = F.interpolate(
        lr_tensor[[2, 1, 0]].unsqueeze(0), scale_factor=4, mode="bicubic",
        align_corners=False
    ).squeeze(0).numpy()
    _save_rgb_png(lr_display, lr_rgb_path)

    if uncertainty is not None:
        _save_uncertainty_png(uncertainty.numpy(), unc_png_path)

    _save_index_png(ndvi_map,  ndvi_path,  cmap="YlGn")
    _save_index_png(mndwi_map, mndwi_path, cmap="Blues")
    _save_index_png(ndbi_map,  ndbi_path,  cmap="YlOrRd")

    if kde_map is not None:
        fig, ax = plt.subplots(figsize=(5.12, 5.12), dpi=100)
        ax.imshow(kde_map, cmap="hot")
        ax.axis("off")
        plt.tight_layout(pad=0)
        plt.savefig(lam_path, bbox_inches="tight", pad_inches=0)
        plt.close(fig)

    # ── 9. Metrics (no HR reference — report NaN gracefully) ──────────────
    metrics: dict = {"psnr_db": None, "ssim": None, "sam_deg": None,
                     "ergas": None, "lpips": None}

    t_end = time.time()
    logger.info("[%s] SR job complete in %.1fs", job_id, t_end - t_start)

    return FlexibleSRResult(
        job_id=job_id,
        lat=lat,
        lon=lon,
        sr_tensor=sr_tensor,
        lr_tensor=lr_tensor,
        uncertainty=uncertainty,
        kde_map=kde_map,
        gini_complexity=gini,
        metrics=metrics,
        processing_time_s=t_end - t_start,
        output_dir=output_dir,
    )
```

### Part D — Verify the wrapper runs on CPU (no GPU needed)

```bash
.venv\Scripts\python.exe -c "
from srm.flexible_input import run_sr_from_latlon
from pathlib import Path
# This will attempt a real cubo fetch — needs internet
# If no internet, it will raise ValueError with a clear message (expected)
print('flexible_input import OK')
print('run_sr_from_latlon callable:', callable(run_sr_from_latlon))
"
```

**Done when:** Import succeeds and prints both lines without error.

---

## TASK 1 — FastAPI Job Queue Server

**Paste this entire block into Claude Code:**

---

You are creating one new file: `srm_api/main.py`

Read these files before writing:
- `srm/flexible_input.py` (Task 0 Part C) — understand `run_sr_from_latlon` return type
- `srm_api/schemas.py` (Task 0 Part B) — understand request/response models

**Do NOT change any file in `srm/`.**

Create `srm_api/__init__.py` (empty) and `srm_api/main.py`:

```python
# srm_api/main.py
"""
SRM FastAPI server — exposes the SR pipeline via HTTP for the Next.js frontend.

GPU constraint (RTX 3050 6GB):
- asyncio.Queue ensures only ONE GPU job runs at a time.
- Concurrent requests are queued, not rejected.
- /api/sr/status/:jobId returns queue_position so the UI can show a live queue.

Run with:
    .venv\Scripts\python.exe -m uvicorn srm_api.main:app --host 0.0.0.0 --port 8000 --reload
"""
from __future__ import annotations
import asyncio
import logging
import uuid
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from srm_api.schemas import SRRequest, JobStatus, SRResult, BandMetrics

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="SRM API",
    description="Sentinel-2 Super-Resolution — flexible lat/lon input",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Serve output PNGs at /static/<filename>
app.mount("/static", StaticFiles(directory=str(OUTPUT_DIR)), name="static")

# ── In-memory job store ────────────────────────────────────────────────────
# For production: replace with Redis + Celery. For hackathon: dict is fine.
_jobs: Dict[str, dict] = {}   # job_id → {"status", "result", "request"}
_queue: asyncio.Queue = asyncio.Queue()


# ── GPU worker coroutine — runs exactly ONE job at a time ─────────────────
async def _gpu_worker() -> None:
    """Background task: drain _queue one job at a time."""
    while True:
        job_id, req = await _queue.get()
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["progress_msg"] = "Running SR inference..."
        try:
            # Run blocking SR pipeline in executor (avoids blocking event loop)
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                _run_sr_blocking,
                job_id,
                req,
            )
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["result"] = result
            _jobs[job_id]["progress_msg"] = "Complete"
        except Exception as exc:
            logger.exception("[%s] Job failed: %s", job_id, exc)
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["progress_msg"] = str(exc)
        finally:
            _queue.task_done()


def _run_sr_blocking(job_id: str, req: SRRequest) -> SRResult:
    """Synchronous SR execution — called in executor to avoid blocking asyncio."""
    from srm.flexible_input import run_sr_from_latlon

    flex_result = run_sr_from_latlon(
        lat=req.lat,
        lon=req.lon,
        output_dir=OUTPUT_DIR,
        job_id=job_id,
        n_uncertainty=req.n_uncertainty,
        sampling_steps=req.sampling_steps,
        run_lam=req.run_lam,
    )

    def _png_url(suffix: str) -> str:
        return f"/static/{job_id}_{suffix}"

    return SRResult(
        job_id=job_id,
        lat=req.lat,
        lon=req.lon,
        sr_rgb_url=_png_url("sr_rgb.png"),
        lr_rgb_url=_png_url("lr_rgb.png"),
        uncertainty_url=_png_url("uncertainty.png"),
        lam_url=_png_url("lam.png") if req.run_lam else None,
        ndvi_url=_png_url("ndvi.png"),
        mndwi_url=_png_url("mndwi.png"),
        ndbi_url=_png_url("ndbi.png"),
        metrics=BandMetrics(**flex_result.metrics),
        processing_time_s=flex_result.processing_time_s,
    )


@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(_gpu_worker())
    logger.info("GPU worker started. One SR job runs at a time.")


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.post("/api/sr/submit", response_model=JobStatus, status_code=202)
async def submit_sr_job(req: SRRequest) -> JobStatus:
    """Submit a new SR job. Returns immediately with job_id and queue position."""
    job_id = uuid.uuid4().hex[:12]
    _jobs[job_id] = {"status": "queued", "result": None, "request": req}
    queue_size_before = _queue.qsize()
    await _queue.put((job_id, req))
    return JobStatus(
        job_id=job_id,
        status="queued",
        queue_position=queue_size_before + 1,
        progress_msg=f"Queued (position {queue_size_before + 1})",
    )


@app.get("/api/sr/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str) -> JobStatus:
    """Poll job status. Frontend polls this every 3 seconds."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")

    job = _jobs[job_id]
    status = job["status"]

    # Calculate queue position only for queued jobs
    queue_pos = None
    if status == "queued":
        # Approximate — iterate queue snapshot
        queue_list = list(_queue._queue)  # type: ignore[attr-defined]
        ids_in_queue = [item[0] for item in queue_list]
        queue_pos = ids_in_queue.index(job_id) + 1 if job_id in ids_in_queue else 1

    return JobStatus(
        job_id=job_id,
        status=status,
        queue_position=queue_pos,
        progress_msg=job.get("progress_msg"),
    )


@app.get("/api/sr/result/{job_id}", response_model=SRResult)
async def get_job_result(job_id: str) -> SRResult:
    """Fetch the full result. Only valid after status == 'done'."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")

    job = _jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(
            status_code=409,
            detail=f"Job {job_id!r} is {job['status']}, not done yet.",
        )
    return job["result"]


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "jobs_total": len(_jobs),
        "queue_depth": _queue.qsize(),
    }
```

**Verify:**
```bash
.venv\Scripts\python.exe -m uvicorn srm_api.main:app --host 0.0.0.0 --port 8000
# Must start without import errors
# Open http://localhost:8000/docs — Swagger UI must show 4 endpoints
# Ctrl+C to stop
```

---

## TASK 2 — Next.js Project Bootstrap

**Paste this entire block into Claude Code:**

---

You are scaffolding the Next.js frontend. Run these shell commands, then create the listed files.

**Do NOT run the Next.js dev server yet — just scaffold.**

```bash
cd srm_sentinel2
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd frontend
npm install framer-motion lucide-react @tanstack/react-query react-leaflet leaflet
npm install --save-dev @types/leaflet
```

After install, create or overwrite these files exactly:

### `frontend/src/lib/constants.ts`

```ts
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export const PATCH_SIZE_PX = 128;   // LR patch size
export const SR_SCALE      = 4;     // → 512px output
export const LR_RES_M      = 10;    // metres per pixel
export const SR_RES_M      = 2.5;   // metres per pixel after SR

// Ground footprint of the 128px LR patch in metres
export const PATCH_FOOTPRINT_M = PATCH_SIZE_PX * LR_RES_M; // 1280m

export const BAND_NAMES = [
  "B02", "B03", "B04", "B05", "B06",
  "B07", "B08", "B8A", "B11", "B12",
] as const;

export const POLL_INTERVAL_MS = 3000;  // status polling cadence

export const DEFAULT_MAP_CENTER: [number, number] = [20.5937, 78.9629]; // India
export const DEFAULT_MAP_ZOOM = 5;
```

### `frontend/src/types/index.ts`

```ts
export type JobStatus = "queued" | "running" | "done" | "error";

export interface SubmitResponse {
  job_id: string;
  status: JobStatus;
  queue_position: number | null;
  progress_msg: string | null;
}

export interface StatusResponse {
  job_id: string;
  status: JobStatus;
  queue_position: number | null;
  progress_msg: string | null;
}

export interface BandMetrics {
  psnr_db:  number | null;
  ssim:     number | null;
  sam_deg:  number | null;
  ergas:    number | null;
  lpips:    number | null;
}

export interface SRResult {
  job_id:          string;
  lat:             number;
  lon:             number;
  sr_rgb_url:      string;
  lr_rgb_url:      string;
  uncertainty_url: string;
  lam_url:         string | null;
  ndvi_url:        string | null;
  mndwi_url:       string | null;
  ndbi_url:        string | null;
  metrics:         BandMetrics;
  patch_size_px:   number;
  output_size_px:  number;
  lr_resolution_m: number;
  sr_resolution_m: number;
  processing_time_s: number;
}

export interface SubmitPayload {
  lat:             number;
  lon:             number;
  n_uncertainty?:  number;
  sampling_steps?: number;
  run_lam?:        boolean;
}
```

### `frontend/src/utils/api.ts`

```ts
/**
 * Centralised API client for the SRM FastAPI backend.
 * All fetch calls live here — components never call fetch() directly.
 */
import { API_BASE } from "@/lib/constants";
import type { SubmitPayload, SubmitResponse, StatusResponse, SRResult } from "@/types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Submit a new SR job. Returns immediately with job_id. */
export const submitSRJob = (payload: SubmitPayload): Promise<SubmitResponse> =>
  apiFetch<SubmitResponse>("/api/sr/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** Poll job status (call every POLL_INTERVAL_MS). */
export const getJobStatus = (jobId: string): Promise<StatusResponse> =>
  apiFetch<StatusResponse>(`/api/sr/status/${jobId}`);

/** Fetch full result after status === 'done'. */
export const getJobResult = (jobId: string): Promise<SRResult> =>
  apiFetch<SRResult>(`/api/sr/result/${jobId}`);

/** Health check. */
export const healthCheck = (): Promise<{ status: string; queue_depth: number }> =>
  apiFetch("/api/health");

/** Resolve a static PNG URL from the API base. */
export const staticUrl = (relPath: string): string =>
  `${API_BASE}${relPath}`;
```

### `frontend/src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg:         #0a0e14;
  --color-surface:    #111827;
  --color-surface-2:  #1a2235;
  --color-border:     #1e2d40;
  --color-accent:     #00d4aa;
  --color-accent-dim: #00a888;
  --color-warn:       #f59e0b;
  --color-danger:     #ef4444;
  --color-text:       #e2e8f0;
  --color-muted:      #64748b;
}

.light {
  --color-bg:        #f8fafc;
  --color-surface:   #ffffff;
  --color-surface-2: #f1f5f9;
  --color-border:    #e2e8f0;
  --color-text:      #0f172a;
  --color-muted:     #64748b;
}

* { box-sizing: border-box; }

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: "Inter", system-ui, sans-serif;
}

/* Leaflet override — keep map controls above glass panels */
.leaflet-control { z-index: 800 !important; }
.leaflet-pane    { z-index: 400 !important; }
```

### `frontend/next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" },
      { protocol: "http", hostname: "127.0.0.1", port: "8000" },
    ],
  },
};

export default nextConfig;
```

**Verify:**
```bash
cd frontend
npm run build
# Must build without TypeScript errors
# (It will 404 at runtime until other tasks are done — that is expected)
```

---

## TASK 3 — MapPicker Component (Leaflet, Client-Only)

**Paste this entire block into Claude Code:**

---

You are creating `frontend/src/components/MapPicker.tsx`.

**Rules:**
- This is a `"use client"` component. Leaflet cannot run on the server.
- Import Leaflet lazily inside a `useEffect` — never at the module top level.
- Use `react-leaflet` for the map. Use plain Leaflet `L.circle` for the patch preview.
- The patch preview circle shows the 1280m ground footprint (128px × 10m/px).
- On click: snap the preview circle to the clicked lat/lon. Call `onSelect(lat, lon)`.
- No Leaflet CSS import inside this file — add it to `layout.tsx`.

```tsx
// frontend/src/components/MapPicker.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLng } from "leaflet";
import { PATCH_FOOTPRINT_M, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/constants";

interface MapPickerProps {
  onSelect: (lat: number, lon: number) => void;
  disabled?: boolean;
}

/** Invisible child component — listens for map clicks and draws patch preview. */
function ClickHandler({
  onSelect,
  disabled,
}: {
  onSelect: (lat: number, lon: number) => void;
  disabled: boolean;
}) {
  const circleRef = useRef<any>(null);

  const map = useMapEvents({
    click(e: { latlng: LatLng }) {
      if (disabled) return;
      const { lat, lng } = e.latlng;

      // Draw or move patch preview circle
      if (typeof window !== "undefined") {
        import("leaflet").then((L) => {
          if (circleRef.current) {
            circleRef.current.setLatLng([lat, lng]);
          } else {
            circleRef.current = L.circle([lat, lng], {
              radius: PATCH_FOOTPRINT_M / 2,  // radius = half the footprint
              color: "#00d4aa",
              fillColor: "#00d4aa",
              fillOpacity: 0.10,
              weight: 2,
              dashArray: "6 4",
            }).addTo(map);
          }
          // Place a small centre marker
          L.circleMarker([lat, lng], {
            radius: 5,
            color: "#00d4aa",
            fillColor: "#00d4aa",
            fillOpacity: 1,
            weight: 0,
          }).addTo(map);
        });
      }

      onSelect(lat, lng);
    },
    mousemove(e: { latlng: LatLng }) {
      // Optional: show a ghost circle following cursor when not disabled
      if (disabled) return;
    },
  });

  return null;
}

export default function MapPicker({ onSelect, disabled = false }: MapPickerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Server-side placeholder — same dimensions as map
    return (
      <div className="w-full h-full rounded-2xl bg-[var(--color-surface)] flex items-center justify-center">
        <span className="text-[var(--color-muted)] text-sm">Loading map...</span>
      </div>
    );
  }

  return (
    <MapContainer
      center={DEFAULT_MAP_CENTER}
      zoom={DEFAULT_MAP_ZOOM}
      style={{ width: "100%", height: "100%", borderRadius: "1rem" }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.esri.com">Esri</a>'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      {/* Overlay dark tile for labels */}
      <TileLayer
        url="https://stamen-tiles.a.ssl.fastly.net/toner-hybrid/{z}/{x}/{y}.png"
        opacity={0.35}
      />
      <ClickHandler onSelect={onSelect} disabled={disabled} />
    </MapContainer>
  );
}
```

Add Leaflet CSS to `frontend/src/app/layout.tsx`:

```tsx
// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SRM — Sentinel-2 Super-Resolution",
  description: "Deep learning based 4× SR from 10m to 2.5m resolution",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

**Verify:**
```bash
cd frontend && npm run dev
# Open http://localhost:3000
# Map must render with satellite tiles. Clicking must draw the teal circle.
# Console must be free of SSR errors.
```

---

## TASK 4 — Landing Page (Map + Submit Panel)

**Paste this entire block into Claude Code:**

---

You are creating `frontend/src/app/page.tsx` and `frontend/src/components/JobStatusBadge.tsx`.

Read before writing:
- `frontend/src/utils/api.ts` — `submitSRJob`, `getJobStatus`
- `frontend/src/types/index.ts` — all types
- `frontend/src/components/MapPicker.tsx` — props interface
- `frontend/src/lib/constants.ts`

### `frontend/src/components/JobStatusBadge.tsx`

```tsx
"use client";
import { motion } from "framer-motion";
import type { JobStatus } from "@/types";

const config: Record<JobStatus, { label: string; color: string; pulse: boolean }> = {
  queued:  { label: "Queued",     color: "#f59e0b", pulse: false },
  running: { label: "Processing", color: "#00d4aa", pulse: true  },
  done:    { label: "Done",       color: "#22c55e", pulse: false },
  error:   { label: "Error",      color: "#ef4444", pulse: false },
};

export default function JobStatusBadge({ status, msg }: { status: JobStatus; msg?: string | null }) {
  const { label, color, pulse } = config[status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
      style={{
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
      }}
    >
      <motion.span
        className="w-2 h-2 rounded-full"
        style={{ background: color }}
        animate={pulse ? { opacity: [1, 0.3, 1] } : {}}
        transition={pulse ? { repeat: Infinity, duration: 1.4 } : {}}
      />
      {msg ?? label}
    </motion.div>
  );
}
```

### `frontend/src/app/page.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { MapPin, Satellite, Zap, ChevronRight, Info } from "lucide-react";

import JobStatusBadge from "@/components/JobStatusBadge";
import { submitSRJob, getJobStatus } from "@/utils/api";
import { POLL_INTERVAL_MS, SR_RES_M, LR_RES_M, PATCH_FOOTPRINT_M } from "@/lib/constants";
import type { JobStatus, StatusResponse } from "@/types";

// Leaflet must not run on server
const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-2xl bg-[var(--color-surface)] flex items-center justify-center">
      <span className="text-[var(--color-muted)] text-sm animate-pulse">Initialising map…</span>
    </div>
  ),
});

const ease = [0.16, 1, 0.3, 1] as const;

export default function HomePage() {
  const router = useRouter();
  const [selectedLatLon, setSelectedLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [jobId,    setJobId]    = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [queuePos,  setQueuePos]  = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map click handler
  const handleMapSelect = useCallback((lat: number, lon: number) => {
    setSelectedLatLon({ lat, lon });
    setError(null);
  }, []);

  // Submit job
  const handleSubmit = useCallback(async () => {
    if (!selectedLatLon) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitSRJob({
        lat: selectedLatLon.lat,
        lon: selectedLatLon.lon,
        n_uncertainty: 5,
        sampling_steps: 50,
      });
      setJobId(res.job_id);
      setJobStatus(res.status);
      setStatusMsg(res.progress_msg);
      setQueuePos(res.queue_position);
    } catch (e: any) {
      setError(e.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [selectedLatLon]);

  // Poll status while job is active
  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "error") return;
    const interval = setInterval(async () => {
      try {
        const s: StatusResponse = await getJobStatus(jobId);
        setJobStatus(s.status);
        setStatusMsg(s.progress_msg);
        setQueuePos(s.queue_position);
        if (s.status === "done") {
          clearInterval(interval);
          // Navigate to results page
          router.push(`/results/${jobId}`);
        }
        if (s.status === "error") {
          clearInterval(interval);
          setError(s.progress_msg ?? "Pipeline error");
        }
      } catch (e: any) {
        setError(e.message);
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [jobId, jobStatus, router]);

  const isRunning = jobStatus === "queued" || jobStatus === "running";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>

      {/* ── Header ── */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--color-accent)20", border: "1px solid var(--color-accent)40" }}>
            <Satellite size={16} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              SRM — Sentinel-2 Super-Resolution
            </h1>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              10 m → 2.5 m · 4× upscale · SIH 2026
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Pipeline ready
        </div>
      </motion.header>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Map (left, 70%) ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease }}
          className="flex-1 p-4"
          style={{ minHeight: "calc(100vh - 60px)" }}
        >
          <MapPicker onSelect={handleMapSelect} disabled={isRunning} />
        </motion.div>

        {/* ── Side panel (right, fixed 340px) ── */}
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease, delay: 0.1 }}
          className="w-[340px] flex flex-col gap-4 p-4 overflow-y-auto border-l"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >

          {/* Instructions */}
          <div className="rounded-xl p-4" style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
          }}>
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={14} style={{ color: "var(--color-accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Select a location
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
              Click anywhere on the map. The teal circle shows the{" "}
              <strong style={{ color: "var(--color-text)" }}>{PATCH_FOOTPRINT_M / 1000} km × {PATCH_FOOTPRINT_M / 1000} km</strong>{" "}
              patch that will be fetched from Sentinel-2 and super-resolved.
            </p>
          </div>

          {/* Selected coords */}
          <AnimatePresence>
            {selectedLatLon && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease }}
                className="rounded-xl p-4"
                style={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-accent)30",
                }}
              >
                <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>Selected patch centre</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>Latitude</p>
                    <p className="text-base font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                      {selectedLatLon.lat.toFixed(5)}°
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>Longitude</p>
                    <p className="text-base font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                      {selectedLatLon.lon.toFixed(5)}°
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t flex gap-6 text-[11px]" style={{ borderColor: "var(--color-border)" }}>
                  <span style={{ color: "var(--color-muted)" }}>LR: <strong style={{ color: "var(--color-text)" }}>128×128 px @ {LR_RES_M}m</strong></span>
                  <span style={{ color: "var(--color-muted)" }}>SR: <strong style={{ color: "var(--color-text)" }}>512×512 px @ {SR_RES_M}m</strong></span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status badge when job is running */}
          <AnimatePresence>
            {jobStatus && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                <JobStatusBadge status={jobStatus} msg={statusMsg} />
                {queuePos && queuePos > 1 && (
                  <p className="text-xs mt-1.5" style={{ color: "var(--color-muted)" }}>
                    Position {queuePos} in queue — one GPU job runs at a time.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-xl p-3 text-sm"
                style={{
                  background: "#ef444415",
                  border: "1px solid #ef444430",
                  color: "#ef4444",
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pipeline info pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <Zap size={11} />, label: "LDSR-S2 diffusion" },
              { icon: <Satellite size={11} />, label: "SEN2SRLite SWIR" },
              { icon: <Info size={11} />, label: "Uncertainty map" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                style={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-muted)",
                }}>
                {icon}{label}
              </div>
            ))}
          </div>

          {/* Submit button */}
          <motion.button
            onClick={handleSubmit}
            disabled={!selectedLatLon || isRunning || submitting}
            whileHover={(!selectedLatLon || isRunning) ? {} : { scale: 1.02 }}
            whileTap={(!selectedLatLon || isRunning) ? {} : { scale: 0.98 }}
            className="mt-auto flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: (!selectedLatLon || isRunning)
                ? "var(--color-surface-2)"
                : "var(--color-accent)",
              color: (!selectedLatLon || isRunning)
                ? "var(--color-muted)"
                : "#0a0e14",
              cursor: (!selectedLatLon || isRunning) ? "not-allowed" : "pointer",
              border: "none",
            }}
          >
            {submitting || isRunning ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 rounded-full"
                  style={{ borderColor: "transparent", borderTopColor: "currentColor" }}
                />
                {isRunning ? "Processing…" : "Submitting…"}
              </>
            ) : (
              <>
                Run Super-Resolution
                <ChevronRight size={16} />
              </>
            )}
          </motion.button>

          <p className="text-[11px] text-center pb-2" style={{ color: "var(--color-muted)" }}>
            Processing takes ~45–90 sec on GPU · ~10 min on CPU
          </p>
        </motion.aside>
      </div>
    </div>
  );
}
```

**Verify:**
```bash
cd frontend && npm run dev
# Open http://localhost:3000
# Map renders → click produces teal circle + coordinates in side panel
# Submit button activates after clicking map
# Submitting without FastAPI running shows a clear error (not a crash)
```

---

## TASK 5 — Results Page

**Paste this entire block into Claude Code:**

---

You are creating:
- `frontend/src/app/results/[jobId]/page.tsx`
- `frontend/src/components/ResultsPanel.tsx`

Read before writing:
- `frontend/src/utils/api.ts`
- `frontend/src/types/index.ts`
- `frontend/src/lib/constants.ts`

### `frontend/src/components/ResultsPanel.tsx`

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { ArrowLeft, Download, BarChart2, Map, Layers, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { SRResult } from "@/types";
import { staticUrl } from "@/utils/api";

const ease = [0.16, 1, 0.3, 1] as const;

type IndexTab = "ndvi" | "mndwi" | "ndbi";

const INDEX_CONFIG: Record<IndexTab, { label: string; desc: string; urlKey: keyof SRResult }> = {
  ndvi:  { label: "NDVI",  desc: "Vegetation index",     urlKey: "ndvi_url"  },
  mndwi: { label: "MNDWI", desc: "Water index",          urlKey: "mndwi_url" },
  ndbi:  { label: "NDBI",  desc: "Built-up index",       urlKey: "ndbi_url"  },
};

function MetricCard({ label, value, unit, good }: { label: string; value: number | null; unit: string; good?: boolean }) {
  return (
    <div className="rounded-xl p-3 flex flex-col gap-1"
      style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
      <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>{label}</span>
      <span className="text-lg font-semibold tabular-nums" style={{ color: value === null ? "var(--color-muted)" : "var(--color-text)" }}>
        {value === null ? "—" : value.toFixed(2)}{value !== null ? " " + unit : ""}
      </span>
    </div>
  );
}

function CompareImage({ label, src, badge }: { label: string; src: string; badge: string }) {
  return (
    <div className="flex-1 rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--color-border)" }}>
      <div className="relative w-full" style={{ paddingBottom: "100%" }}>
        <Image src={staticUrl(src)} alt={label} fill className="object-cover" unoptimized />
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{
            background: "rgba(10,14,20,0.72)", backdropFilter: "blur(8px)",
            border: "0.5px solid rgba(255,255,255,0.08)", color: "var(--color-text)",
          }}>
          {badge}
        </div>
      </div>
      <div className="px-3 py-2 text-xs" style={{ color: "var(--color-muted)" }}>{label}</div>
    </div>
  );
}

export default function ResultsPanel({ result }: { result: SRResult }) {
  const [indexTab, setIndexTab] = useState<IndexTab>("ndvi");

  return (
    <div className="min-h-screen p-6 flex flex-col gap-6 max-w-6xl mx-auto"
      style={{ background: "var(--color-bg)" }}>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--color-muted)" }}>
            <ArrowLeft size={14} /> Back to map
          </Link>
          <div className="w-px h-4" style={{ background: "var(--color-border)" }} />
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Super-Resolution Result
            </h1>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              {result.lat.toFixed(5)}°, {result.lon.toFixed(5)}° · {result.processing_time_s.toFixed(1)}s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "#22c55e18", border: "1px solid #22c55e40", color: "#22c55e" }}>
          ✓ Complete
        </div>
      </motion.div>

      {/* LR vs SR comparison */}
      <motion.section
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease, delay: 0.05 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Map size={14} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Before / After Comparison
          </h2>
        </div>
        <div className="flex gap-3">
          <CompareImage
            label="Sentinel-2 input (bicubic 4× display)"
            src={result.lr_rgb_url}
            badge={`${result.patch_size_px}px @ ${result.lr_resolution_m}m`}
          />
          <CompareImage
            label="Super-resolved output (2.5 m)"
            src={result.sr_rgb_url}
            badge={`${result.output_size_px}px @ ${result.sr_resolution_m}m`}
          />
          {result.uncertainty_url && (
            <CompareImage
              label="Uncertainty map (per-pixel std dev)"
              src={result.uncertainty_url}
              badge="Brighter = uncertain"
            />
          )}
        </div>
      </motion.section>

      {/* Metrics */}
      <motion.section
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease, delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={14} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Quality Metrics
          </h2>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            (no HR reference available for user-submitted patches)
          </span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          <MetricCard label="PSNR"  value={result.metrics.psnr_db}  unit="dB"  />
          <MetricCard label="SSIM"  value={result.metrics.ssim}     unit=""    />
          <MetricCard label="SAM"   value={result.metrics.sam_deg}  unit="°"   />
          <MetricCard label="ERGAS" value={result.metrics.ergas}    unit=""    />
          <MetricCard label="LPIPS" value={result.metrics.lpips}    unit=""    />
        </div>
      </motion.section>

      {/* Spectral indices */}
      <motion.section
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease, delay: 0.15 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Layers size={14} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Spectral Indices at 2.5 m
          </h2>
        </div>
        <div className="flex gap-2 mb-3">
          {(Object.keys(INDEX_CONFIG) as IndexTab[]).map((tab) => (
            <button key={tab}
              onClick={() => setIndexTab(tab)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: indexTab === tab ? "var(--color-accent)" : "var(--color-surface-2)",
                color: indexTab === tab ? "#0a0e14" : "var(--color-muted)",
                border: indexTab === tab ? "none" : "1px solid var(--color-border)",
              }}
            >
              {INDEX_CONFIG[tab].label}
              <span className="ml-1.5 opacity-60">{INDEX_CONFIG[tab].desc}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
          {result[INDEX_CONFIG[indexTab].urlKey] ? (
            <div className="relative w-full" style={{ paddingBottom: "40%" }}>
              <Image
                src={staticUrl(result[INDEX_CONFIG[indexTab].urlKey] as string)}
                alt={INDEX_CONFIG[indexTab].label}
                fill className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 gap-2"
              style={{ color: "var(--color-muted)" }}>
              <AlertCircle size={16} />
              <span className="text-sm">Index not available</span>
            </div>
          )}
        </div>
      </motion.section>

      {/* LAM */}
      {result.lam_url && (
        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease, delay: 0.2 }}
          className="rounded-xl p-4"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--color-text)" }}>
            Local Attribution Map (LAM)
          </h2>
          <div className="relative rounded-xl overflow-hidden" style={{ paddingBottom: "30%" }}>
            <Image src={staticUrl(result.lam_url)} alt="LAM" fill className="object-cover" unoptimized />
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
            Brighter regions = greater influence on the SR output at the sampled pixel. Computed by CPU LAM.
          </p>
        </motion.section>
      )}
    </div>
  );
}
```

### `frontend/src/app/results/[jobId]/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { getJobStatus, getJobResult } from "@/utils/api";
import ResultsPanel from "@/components/ResultsPanel";
import JobStatusBadge from "@/components/JobStatusBadge";
import type { SRResult, JobStatus } from "@/types";
import { POLL_INTERVAL_MS } from "@/lib/constants";

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [status, setStatus] = useState<JobStatus>("queued");
  const [msg, setMsg]       = useState<string | null>("Loading…");
  const [result, setResult] = useState<SRResult | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const s = await getJobStatus(jobId);
        setStatus(s.status);
        setMsg(s.progress_msg);
        if (s.status === "done") {
          const r = await getJobResult(jobId);
          setResult(r);
        }
        if (s.status === "error") {
          setError(s.progress_msg ?? "Unknown error");
        }
      } catch (e: any) {
        setError(e.message);
      }
    };

    poll();
    const id = setInterval(async () => {
      const s = await getJobStatus(jobId).catch(() => null);
      if (!s) return;
      setStatus(s.status);
      setMsg(s.progress_msg);
      if (s.status === "done" || s.status === "error") clearInterval(id);
      if (s.status === "done") {
        const r = await getJobResult(jobId);
        setResult(r);
      }
      if (s.status === "error") setError(s.progress_msg ?? "Error");
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [jobId]);

  if (result) return <ResultsPanel result={result} />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ background: "var(--color-bg)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 text-center max-w-sm"
      >
        <JobStatusBadge status={status} msg={msg} />
        {error && (
          <p className="text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>
        )}
        {!error && (
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            The SR pipeline is running on the GPU. This page updates automatically.
            Processing takes ~45–90 seconds on a GPU.
          </p>
        )}
      </motion.div>
    </div>
  );
}
```

**Verify:**
```bash
# With FastAPI running in a second terminal:
.venv\Scripts\python.exe -m uvicorn srm_api.main:app --host 0.0.0.0 --port 8000

# In another terminal:
cd frontend && npm run dev

# 1. Click map → submit → watch side panel show "Queued" → "Processing"
# 2. After pipeline completes, browser navigates to /results/{jobId} automatically
# 3. Results page shows LR vs SR comparison, metrics grid, index tabs
```

---

## FINAL — End-to-End Demo Checklist

```bash
# Terminal 1: FastAPI backend
.venv\Scripts\python.exe -m uvicorn srm_api.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Next.js frontend
cd frontend && npm run dev

# Terminal 3: Original Streamlit (optional, kept intact)
.venv\Scripts\python.exe -m streamlit run dashboard/app.py --server.port 8501
```

**Demo flow:**
1. Open `http://localhost:3000`
2. Map loads centred on India with satellite imagery
3. Click on Ahmedabad, Mumbai, Jaisalmer, or any location
4. Teal circle appears showing the 1.28 km × 1.28 km patch footprint
5. Coordinates and patch specs appear in the side panel
6. Click "Run Super-Resolution"
7. Status badge pulses: Queued → Processing
8. After ~45-90 sec (GPU) or ~10 min (CPU): auto-navigates to `/results/{jobId}`
9. Results page shows:
   - LR (10m bicubic display) vs SR (2.5m) vs Uncertainty side by side
   - Metrics grid (all — until HR reference available)
   - NDVI / MNDWI / NDBI index tabs
   - LAM if enabled

**Done when:**
- [ ] `pytest tests/ -v` still 20/20 green (srm/ untouched)
- [ ] `srm/flexible_input.py` import succeeds
- [ ] FastAPI `/docs` shows 4 endpoints
- [ ] Next.js map click draws teal patch circle
- [ ] Submit → navigate → results page renders images
- [ ] No CUDA OOM errors (queued jobs respect GPU serialisation)
