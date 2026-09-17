"""
Flexible lat/lon input wrapper for the SR pipeline.

Replaces the hardcoded `aois:` config block. Fetches a 128×128 px Sentinel-2
L2A patch centred on the given lat/lon and runs the full SR pipeline on it.

Hardware constraints (RTX 3050 6GB):
- patch_size always 128 — do NOT increase
- n_uncertainty max 5
- sampling_steps: 50 (fast) / 100 (full quality) / 150 (extra quality)

API call flow:
    1.  cubo.create(lat, lon, edge_size=128, resolution=10) → xarray DataArray
    2.  Tensor conversion, clamp, sanitize
    3.  DualPathSRPipeline.run_inference(...)  → sr_dict["sr_final"]
    4.  compute_uncertainty_map(model_diffusion, rgbn_tensor, ...)
    5.  LAM (optional, CPU)
    6.  Spectral indices
    7.  GeoTIFF export via save_geotiff + extract_georeferencing
    8.  PNG export for web API static serving
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

PATCH_SIZE_PX = 128        # Hard limit — 6GB VRAM
LR_RESOLUTION_M = 10       # Sentinel-2 native
SR_SCALE = 4               # 10m → 2.5m
OUTPUT_SIZE_PX = PATCH_SIZE_PX * SR_SCALE   # 512

BAND_NAMES_10B = ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"]

BAND_METADATA_10B = [
    {"band": "B02", "name": "Blue", "wavelength": 492},
    {"band": "B03", "name": "Green", "wavelength": 560},
    {"band": "B04", "name": "Red", "wavelength": 665},
    {"band": "B05", "name": "Red Edge 1", "wavelength": 704},
    {"band": "B06", "name": "Red Edge 2", "wavelength": 740},
    {"band": "B07", "name": "Red Edge 3", "wavelength": 783},
    {"band": "B08", "name": "NIR", "wavelength": 842},
    {"band": "B8A", "name": "Narrow NIR", "wavelength": 865},
    {"band": "B11", "name": "SWIR 1", "wavelength": 1610},
    {"band": "B12", "name": "SWIR 2", "wavelength": 2190},
]


@dataclass
class FlexibleSRResult:
    job_id: str
    lat: float
    lon: float
    sr_tensor: torch.Tensor             # (10, 512, 512) float32 [0,1]
    lr_tensor: torch.Tensor             # (10, 128, 128) float32 [0,1]
    uncertainty: Optional[torch.Tensor]  # (1, 512, 512) or None
    kde_map: Optional[np.ndarray]
    gini_complexity: float
    metrics: dict                        # keys: psnr_db, ssim, sam_deg, ergas, lpips
    processing_time_s: float
    output_dir: Path
    sampling_steps_used: int
    band_stats: list[dict] = None        # per-band reflectance preservation statistics



def run_sr_from_latlon(
    lat: float,
    lon: float,
    output_dir: Path,
    job_id: Optional[str] = None,
    n_uncertainty: int = 5,
    sampling_steps: int = 50,
    run_lam: bool = False,
    date_range: tuple[str, str] = ("2024-01-01", "2025-12-31"),
    config_path: str = "configs/srm_config.yaml",
) -> FlexibleSRResult:
    """
    Fetch Sentinel-2 data centred on (lat, lon) and run the full SR pipeline.

    The 128×128 px patch covers a 1280m × 1280m ground footprint at 10m/px.

    Args:
        lat:              Centre latitude (WGS84).
        lon:              Centre longitude (WGS84).
        output_dir:       Directory where GeoTIFFs and PNGs are written.
        job_id:           Unique job identifier. Auto-generated if None.
        n_uncertainty:    Stochastic diffusion passes. Hard cap: 5.
        sampling_steps:   DDIM steps. Supported tiers: 50 / 100 / 150.
        run_lam:          Whether to run LAM explainability (CPU, 2-5 min).
        date_range:       (start_date, end_date) for Sentinel-2 scene selection.
        config_path:      Path to srm_config.yaml.

    Returns:
        FlexibleSRResult with tensors, uncertainty, metrics, and output paths.
    """
    import cubo
    from srm.config import SRMConfig
    from srm.preprocessing import preprocess
    from srm.sr_pipeline import DualPathSRPipeline
    from srm.postprocessing import (
        save_geotiff, extract_georeferencing, compute_scaled_transform,
    )
    from srm.uncertainty import compute_uncertainty
    from srm.applications import compute_ndvi, compute_mndwi, compute_ndbi

    # Hard clamps
    n_uncertainty = min(n_uncertainty, 5)
    valid_tiers = [50, 100, 150]
    sampling_steps = min(valid_tiers, key=lambda t: abs(t - sampling_steps))

    if job_id is None:
        job_id = uuid.uuid4().hex[:12]

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    t_start = time.time()
    cfg = SRMConfig.from_yaml(config_path)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(
        "[%s] SR job started — lat=%.5f lon=%.5f device=%s steps=%d",
        job_id, lat, lon, device, sampling_steps,
    )

    # ── 1. Fetch 128×128 Sentinel-2 patch centred on lat/lon ──────────────
    start_date, end_date = date_range
    try:
        da = cubo.create(
            lat=lat,
            lon=lon,
            collection="sentinel-2-l2a",
            bands=["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"],
            start_date=start_date,
            end_date=end_date,
            edge_size=PATCH_SIZE_PX,
            resolution=LR_RESOLUTION_M,
        )
    except Exception as e:
        raise ValueError(
            f"No Sentinel-2 scenes found for lat={lat:.4f}, lon={lon:.4f}, "
            f"dates={start_date}–{end_date}. Try a wider date range."
        ) from e

    # Take the least-cloudy scene (index 0 after cubo sorts by cloud cover)
    raw_np = (da[0].compute().to_numpy() / 10_000).astype("float32")
    lr_tensor = torch.from_numpy(raw_np)  # (10, 128, 128)
    lr_tensor = torch.nan_to_num(lr_tensor, nan=0.0, posinf=0.0, neginf=0.0)
    lr_tensor = lr_tensor.clamp(0.0, 1.0)
    lr_np = lr_tensor.numpy()


    # ── 2. Preprocessing (cloud mask, padding) ─────────────────────────────
    preprocess_result = preprocess(lr_tensor, cfg)

    # preprocess() returns (tensor, pad_tuple) — always unpack defensively
    if isinstance(preprocess_result, tuple):
        lr_padded, pad_tuple = preprocess_result
    else:
        lr_padded = preprocess_result
        pad_tuple = (0, 0, 0, 0)

    # lr_padded must be a torch.Tensor at this point
    assert isinstance(lr_padded, torch.Tensor), \
        f"preprocess() must return a Tensor, got {type(lr_padded)}"

    # ── 3. Run dual-path SR ────────────────────────────────────────────────
    pipeline = DualPathSRPipeline(
        device=device,
        sampling_steps=sampling_steps,
        use_referencex4=True,
        use_tta=False,   # sequential TTA adds too much time for the web UI
    )
    sr_dict = pipeline.run_inference(
        lr_padded.unsqueeze(0).to(device),   # adds batch dim: (10,128,128) → (1,10,128,128)
        aoi_name=job_id,
    )
    sr_tensor = sr_dict["sr_final"].squeeze(0).cpu()  # (10, 512, 512)

    if device != "cpu":
        torch.cuda.empty_cache()

    # ── 4. Uncertainty map ─────────────────────────────────────────────────
    uncertainty = None
    try:
        uncertainty = compute_uncertainty(
            lr_padded.unsqueeze(0).to(device),   # NOT lr_tensor, NOT preprocess_result
            pipeline,
            n_variations=n_uncertainty,
            sampling_steps=sampling_steps,
            aoi_name=job_id,
        ).cpu()
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
        try:
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
        except Exception as e:
            logger.warning("[%s] LAM failed: %s", job_id, e)

    # ── 6. Spectral indices (both 10m LR and 2.5m SR) ───────────────────────
    sr_np = sr_tensor.numpy()  # (10, 512, 512)
    ndvi_map     = compute_ndvi(sr_np)
    mndwi_map    = compute_mndwi(sr_np)
    ndbi_map     = compute_ndbi(sr_np)
    lr_ndvi_map  = compute_ndvi(lr_np)
    lr_mndwi_map = compute_mndwi(lr_np)
    lr_ndbi_map  = compute_ndbi(lr_np)

    # ── 7. Export GeoTIFFs ─────────────────────────────────────────────────
    crs, orig_transform = extract_georeferencing(da[0])
    sr_transform = compute_scaled_transform(orig_transform, scale_factor=float(SR_SCALE))

    sr_tif_path = output_dir / f"{job_id}_sr_10band_2.5m.tif"
    save_geotiff(
        data=sr_tensor,
        output_path=sr_tif_path,
        crs=crs,
        transform=sr_transform,
        band_names=BAND_NAMES_10B,
        aoi_name=job_id,
    )

    if uncertainty is not None:
        unc_tif_path = output_dir / f"{job_id}_uncertainty_2.5m.tif"
        save_geotiff(
            data=uncertainty,
            output_path=unc_tif_path,
            crs=crs,
            transform=sr_transform,
            band_names=["Uncertainty_StdDev"],
            aoi_name=job_id,
        )

    # ── 8. Export PNGs for the web API ────────────────────────────────────
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from PIL import Image
    import torch.nn.functional as F

    def _save_rgb_png(arr_chw: np.ndarray, path: Path, percentile: int = 98) -> None:
        """Save a 3-band (C, H, W) float32 array as a display-ready PNG."""
        rgb = arr_chw.transpose(1, 2, 0).copy()  # (H, W, 3)
        p2  = np.percentile(rgb, 2)
        p98 = np.percentile(rgb, percentile)
        rgb = np.clip((rgb - p2) / (p98 - p2 + 1e-8), 0, 1)
        Image.fromarray((rgb * 255).astype(np.uint8)).save(path)

    def _save_index_pair(
        lr_2d: np.ndarray,
        sr_2d: np.ndarray,
        lr_path: Path,
        sr_path: Path,
        cmap: str = "RdYlGn",
        title_prefix: str = "Index",
    ) -> None:
        """Save calibrated 10m LR and 2.5m SR index maps with a shared dynamic colorbar scale."""
        lr_clean = np.nan_to_num(lr_2d, nan=0.0)
        sr_clean = np.nan_to_num(sr_2d, nan=0.0)

        if lr_clean.shape != sr_clean.shape:
            zoom_h = sr_clean.shape[0] // lr_clean.shape[0]
            zoom_w = sr_clean.shape[1] // lr_clean.shape[1]
            lr_display = np.repeat(np.repeat(lr_clean, zoom_h, axis=0), zoom_w, axis=1)
        else:
            lr_display = lr_clean

        p2 = float(np.nanpercentile(sr_clean, 2))
        p98 = float(np.nanpercentile(sr_clean, 98))
        margin = max(0.01, (p98 - p2) * 0.05)
        vmin = round(p2 - margin, 2)
        vmax = round(p98 + margin, 2)
        if vmax - vmin < 0.05:
            vmin = round(float(np.nanmin(sr_clean)), 2)
            vmax = round(float(np.nanmax(sr_clean)), 2)
            if vmax <= vmin:
                vmax = vmin + 0.1

        for data, res_label, out_path in [
            (lr_display, "10m LR (Before)", lr_path),
            (sr_clean, "2.5m SR (After)", sr_path),
        ]:
            fig, ax = plt.subplots(figsize=(5.4, 5.8), dpi=120, facecolor="#0e131d")
            im = ax.imshow(data, cmap=cmap, vmin=vmin, vmax=vmax)
            ax.axis("off")
            ax.set_title(f"{title_prefix} — {res_label}", color="#ffffff", fontsize=10, fontweight="bold", pad=8)
            cbar = fig.colorbar(im, ax=ax, orientation="horizontal", fraction=0.045, pad=0.03, shrink=0.85)
            cbar.ax.tick_params(labelsize=8, colors="#ffffff")
            cbar.outline.set_edgecolor("#4a5568")
            cbar.set_label(f"Index Value Scale [{vmin} to {vmax}]", color="#e2e8f0", fontsize=8, fontweight="bold", labelpad=4)
            plt.tight_layout()
            plt.savefig(out_path, facecolor=fig.get_facecolor(), edgecolor="none", bbox_inches="tight")
            plt.close(fig)

    def _save_uncertainty_png(unc: np.ndarray, path: Path) -> None:
        arr = unc.squeeze()  # (H, W)
        vmax = float(np.percentile(arr, 95)) + 1e-8
        fig, ax = plt.subplots(figsize=(5.12, 5.12), dpi=100)
        ax.imshow(arr / vmax, cmap="plasma", vmin=0, vmax=1)
        ax.axis("off")
        plt.tight_layout(pad=0)
        plt.savefig(path, bbox_inches="tight", pad_inches=0)
        plt.close(fig)

    sr_rgb_path   = output_dir / f"{job_id}_sr_rgb.png"
    lr_rgb_path   = output_dir / f"{job_id}_lr_rgb.png"
    unc_png_path  = output_dir / f"{job_id}_uncertainty.png"
    ndvi_path     = output_dir / f"{job_id}_ndvi.png"
    lr_ndvi_path  = output_dir / f"{job_id}_lr_ndvi.png"
    mndwi_path    = output_dir / f"{job_id}_mndwi.png"
    lr_mndwi_path = output_dir / f"{job_id}_lr_mndwi.png"
    ndbi_path     = output_dir / f"{job_id}_ndbi.png"
    lr_ndbi_path  = output_dir / f"{job_id}_lr_ndbi.png"
    lam_path      = output_dir / f"{job_id}_lam.png"
    chart_path    = output_dir / f"{job_id}_spectral_chart.png"
    stats_json    = output_dir / f"{job_id}_band_stats.json"

    # SR RGB: B04 (idx 2), B03 (idx 1), B02 (idx 0) → true colour
    _save_rgb_png(sr_np[[2, 1, 0]], sr_rgb_path)

    # LR display: bicubic 4× for visual comparison only
    lr_display = F.interpolate(
        lr_tensor[[2, 1, 0]].unsqueeze(0), scale_factor=4,
        mode="bicubic", align_corners=False,
    ).squeeze(0).numpy()
    _save_rgb_png(lr_display, lr_rgb_path)

    if uncertainty is not None:
        _save_uncertainty_png(uncertainty.numpy(), unc_png_path)

    _save_index_pair(lr_ndvi_map, ndvi_map, lr_ndvi_path, ndvi_path, cmap="RdYlGn", title_prefix="NDVI (Vegetation Index)")
    _save_index_pair(lr_mndwi_map, mndwi_map, lr_mndwi_path, mndwi_path, cmap="YlGnBu", title_prefix="MNDWI (Water Index)")
    _save_index_pair(lr_ndbi_map, ndbi_map, lr_ndbi_path, ndbi_path, cmap="plasma", title_prefix="NDBI (Built-up Index)")

    if kde_map is not None:
        fig, ax = plt.subplots(figsize=(5.12, 5.12), dpi=100)
        ax.imshow(kde_map, cmap="hot")
        ax.axis("off")
        plt.tight_layout(pad=0)
        plt.savefig(lam_path, bbox_inches="tight", pad_inches=0)
        plt.close(fig)

    # ── 8b. Compute 10-band spectral preservation stats & plot chart ────────
    import json
    band_stats = []
    for i, m in enumerate(BAND_METADATA_10B):
        band_lr = lr_np[i]
        band_sr = sr_np[i]

        lr_m = float(np.nanmean(band_lr)) if not np.all(np.isnan(band_lr)) else 0.2
        sr_m = float(np.nanmean(band_sr)) if not np.all(np.isnan(band_sr)) else 0.2
        lr_s = float(np.nanstd(band_lr)) if not np.all(np.isnan(band_lr)) else 0.02
        sr_s = float(np.nanstd(band_sr)) if not np.all(np.isnan(band_sr)) else 0.02

        if np.isnan(lr_m) or np.isinf(lr_m): lr_m = 0.2
        if np.isnan(sr_m) or np.isinf(sr_m): sr_m = 0.2
        if np.isnan(lr_s) or np.isinf(lr_s): lr_s = 0.02
        if np.isnan(sr_s) or np.isinf(sr_s): sr_s = 0.02

        diff = abs(sr_m - lr_m)
        pres_pct = max(0.0, min(100.0, (1.0 - diff / (lr_m + 1e-6)) * 100))
        band_stats.append({
            "band": m["band"],
            "name": m["name"],
            "wavelength_nm": m["wavelength"],
            "lr_mean": round(lr_m, 4),
            "sr_mean": round(sr_m, 4),
            "lr_std": round(lr_s, 4),
            "sr_std": round(sr_s, 4),
            "abs_diff": round(diff, 6),
            "preservation_pct": round(pres_pct, 2),
        })

    with open(stats_json, "w", encoding="utf-8") as f:
        json.dump(band_stats, f, indent=2)

    try:
        generate_spectral_chart_file(band_stats, chart_path)
    except Exception as chart_err:
        logger.warning("[%s] Failed generating spectral chart: %s", job_id, chart_err)

    # ── 9. Metrics (no HR reference for user patches — return None) ────────
    metrics: dict = {
        "psnr_db": None, "ssim": None, "sam_deg": None,
        "ergas": None, "lpips": None,
    }

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
        sampling_steps_used=sampling_steps,
        band_stats=band_stats,
    )


def generate_spectral_chart_file(band_stats: list[dict], path: Path) -> None:
    """Render a publication-grade light-themed 2-panel chart proving radiometric consistency."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    def _safe_float(val, fallback):
        try:
            if val is None: return fallback
            f = float(val)
            return fallback if (np.isnan(f) or np.isinf(f)) else f
        except Exception:
            return fallback

    bands = [str(s.get("band", "")) for s in band_stats]
    wls = [int(s.get("wavelength_nm", 500)) for s in band_stats]
    lr_means = [_safe_float(s.get("lr_mean"), 0.2) for s in band_stats]
    sr_means = [_safe_float(s.get("sr_mean"), 0.2) for s in band_stats]
    sr_stds = [_safe_float(s.get("sr_std"), 0.02) for s in band_stats]

    bg_color = "#ffffff"
    surface_color = "#f8fafc"
    text_color = "#0f172a"
    muted_color = "#64748b"
    accent_color = "#0066cc"      # SRM deep blue
    lr_color = "#38bdf8"          # Sentinel-2 LR sky blue
    grid_color = "#e2e8f0"
    border_color = "#cbd5e1"

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.5, 5.0), dpi=140, facecolor=bg_color)

    # Subplot 1: Curve across wavelengths with spectral domain zones
    ax1.set_facecolor(surface_color)

    # Spectral Domain Background Spans
    ax1.axvspan(470, 700, facecolor="#f1f5f9", alpha=0.7, zorder=0)
    ax1.axvspan(700, 785, facecolor="#ecfdf5", alpha=0.6, zorder=0)
    ax1.axvspan(785, 1000, facecolor="#f0f9ff", alpha=0.6, zorder=0)
    ax1.axvspan(1000, 2250, facecolor="#faf5ff", alpha=0.6, zorder=0)

    # Safe limits calculation (cannot be NaN or Inf)
    all_vals = [v for v in (lr_means + sr_means) if not (np.isnan(v) or np.isinf(v))]
    if not all_vals:
        all_vals = [0.15, 0.35]

    min_val = min(all_vals)
    max_val = max(all_vals)
    y_min = max(0.0, min_val * 0.8)
    y_max = max(y_min + 0.05, max_val * 1.2)

    if np.isnan(y_min) or np.isinf(y_min): y_min = 0.0
    if np.isnan(y_max) or np.isinf(y_max): y_max = 0.4
    if y_max <= y_min: y_max = y_min + 0.1

    ax1.text(585, y_max * 0.95, "VIS", ha="center", fontsize=8, fontweight="bold", color="#94a3b8")
    ax1.text(742, y_max * 0.95, "RED EDGE", ha="center", fontsize=8, fontweight="bold", color="#059669")
    ax1.text(892, y_max * 0.95, "NIR", ha="center", fontsize=8, fontweight="bold", color="#0284c7")
    ax1.text(1600, y_max * 0.95, "SWIR", ha="center", fontsize=8, fontweight="bold", color="#7c3aed")


    ax1.plot(wls, lr_means, "d--", color=lr_color, label="Input S2 (10m)", linewidth=1.8, markersize=5, zorder=3)
    ax1.plot(wls, sr_means, "o-", color=accent_color, label="SRM (2.5m)", linewidth=2.4, markersize=5.5, zorder=4)
    ax1.fill_between(
        wls,
        np.array(sr_means) - 0.5 * np.array(sr_stds),
        np.array(sr_means) + 0.5 * np.array(sr_stds),
        color=accent_color, alpha=0.12, label="SR ±0.5σ Variance", zorder=2
    )
    for w, y, b in zip(wls, sr_means, bands):
        ax1.annotate(b, (w, y), textcoords="offset points", xytext=(0, 7), ha="center",
                     fontsize=8, color=text_color, fontweight="bold")
    ax1.set_title("SPECTRAL SIGNATURE BY WAVELENGTH", fontsize=10.5, fontweight="bold", color=text_color, pad=10)
    ax1.set_xlabel("Wavelength $\\lambda$ (nm)", fontsize=9, color=muted_color)
    ax1.set_ylabel("Reflectance [0 - 1]", fontsize=9, color=muted_color)
    ax1.set_ylim(y_min, y_max)
    ax1.grid(True, linestyle="--", alpha=0.6, color=grid_color)
    ax1.tick_params(colors=muted_color, labelsize=8.5)
    for spine in ax1.spines.values():
        spine.set_color(border_color)
    ax1.legend(loc="upper left", framealpha=0.95, facecolor="#ffffff", edgecolor=border_color, labelcolor=text_color, fontsize=8)

    # Subplot 2: Grouped bar chart (LR vs SR)
    ax2.set_facecolor(surface_color)
    x = np.arange(len(bands))
    width = 0.35
    ax2.bar(x - width/2, lr_means, width, label="LR (10m)", color=lr_color, alpha=0.9, zorder=3)
    ax2.bar(x + width/2, sr_means, width, label="SR (2.5m)", color=accent_color, alpha=0.95, zorder=3)
    ax2.set_title("10-BAND RADIOMETRIC CONSISTENCY", fontsize=10.5, fontweight="bold", color=text_color, pad=10)
    ax2.set_xticks(x)
    ax2.set_xticklabels([f"{b}\n{w}nm" for b, w in zip(bands, wls)], fontsize=7.5, color=text_color)
    ax2.set_ylabel("Mean Reflectance", fontsize=9, color=muted_color)
    ax2.grid(True, axis="y", linestyle="--", alpha=0.6, color=grid_color)
    ax2.tick_params(colors=muted_color, labelsize=8.5)
    for spine in ax2.spines.values():
        spine.set_color(border_color)
    ax2.legend(loc="upper right", framealpha=0.95, facecolor="#ffffff", edgecolor=border_color, labelcolor=text_color, fontsize=8)

    for i in range(len(bands)):
        max_h = max(lr_means[i], sr_means[i])
        pres = band_stats[i]["preservation_pct"]
        ax2.text(x[i], max_h + 0.008, f"{pres:.0f}%", ha="center", va="bottom", fontsize=7.5, color="#059669", fontweight="bold")

    ax2.set_ylim(0, y_max)

    plt.tight_layout()
    plt.savefig(path, bbox_inches="tight", facecolor=bg_color)
    plt.close(fig)


