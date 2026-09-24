"""Main execution pipeline for Deep-Learning-Based Super-Resolution Mapping (SRM).

Orchestrates data ingestion from Planetary Computer STAC, dual-path SR inference,
stochastic uncertainty estimation, georeferenced GeoTIFF export, spectral index
mapping, and opensr-test quantitative benchmark evaluation.
"""

import argparse
import logging
from pathlib import Path
import sys
import time
import numpy as np
import rasterio
import torch

from srm.applications import generate_comparison_figure
from srm.config import SRMConfig
from srm.ingestion import fetch_sentinel2_datacube, select_clearest_scene
from srm.postprocessing import postprocess_and_export
from srm.preprocessing import preprocess_scene
from srm.sr_pipeline import DualPathSRPipeline
from srm.uncertainty import compute_uncertainty_map
from srm.validation import evaluate_benchmark


def setup_logging(level: str = "INFO") -> None:
    """Configure structured logging output format."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def process_single_aoi(
    aoi_key: str,
    cfg: SRMConfig,
    pipeline: DualPathSRPipeline,
    args: argparse.Namespace,
) -> None:
    """Execute end-to-end SRM workflow on a single real named AOI.

    Args:
        aoi_key: Key identifier in configuration dictionary (e.g. 'urban_berlin').
        cfg: Master SRMConfig object.
        pipeline: Initialized DualPathSRPipeline instance.
        args: Parsed CLI arguments (used for --lam flag).
    """
    aoi_cfg = cfg.aois[aoi_key]
    aoi_name = aoi_cfg.name
    logging.info("=" * 80)
    logging.info("PROCESSING AOI: %s (%s)", aoi_name, aoi_key)
    logging.info("Description: %s", aoi_cfg.description)
    logging.info("=" * 80)

    # 1. Ingestion: Fetch real Sentinel-2 L2A datacube via cubo
    t0 = time.time()
    datacube = fetch_sentinel2_datacube(
        lat=aoi_cfg.lat,
        lon=aoi_cfg.lon,
        start_date=aoi_cfg.start_date,
        end_date=aoi_cfg.end_date,
        edge_size=aoi_cfg.edge_size,
        collection=aoi_cfg.collection,
        aoi_name=aoi_key,
    )
    ingest_time = time.time() - t0

    # 2. Select clearest temporal acquisition
    selected_scene, scene_idx, scene_time = select_clearest_scene(
        datacube,
        scl_band_name=cfg.bands.scl,
        cloud_classes=cfg.preprocessing.cloud_shadow_classes,
        aoi_name=aoi_key,
    )

    # Extract 10 multispectral bands
    raw_10b = selected_scene.sel(band=cfg.bands.all_10).values
    logging.info(
        "[%s] Selected scene array shape: %s, dtype: %s, min: %.1f, max: %.1f",
        aoi_key,
        raw_10b.shape,
        raw_10b.dtype,
        float(np.min(raw_10b)),
        float(np.max(raw_10b)),
    )

    # 3. Preprocessing: Reflectance scaling, sanitization, reversible padding
    padded_lr, padding_info = preprocess_scene(
        raw_10b,
        scale=cfg.preprocessing.reflectance_scale,
        patch_multiple=cfg.preprocessing.patch_multiple,
    )
    logging.info(
        "[%s] Preprocessed input tensor shape: %s (padding margins: T=%d, B=%d, L=%d, R=%d)",
        aoi_key,
        tuple(padded_lr.shape),
        padding_info.pad_top,
        padding_info.pad_bottom,
        padding_info.pad_left,
        padding_info.pad_right,
    )

    # 4. Super-Resolution: Dual-path execution, fusion, and HardConstraint
    t_sr_start = time.time()
    sr_dict = pipeline.run_inference(padded_lr, aoi_name=aoi_key, scale_factor=getattr(args, "scale", 4))
    sr_time = time.time() - t_sr_start

    # 4b. Optional LAM explainability (--lam flag)
    # Hardware note: LAM ALWAYS runs on CPU. Model is temporarily moved off the GPU
    # then restored. This is non-fatal — pipeline never fails if LAM crashes.
    if args.lam:
        from srm.explainability import compute_lam
        import matplotlib.pyplot as plt
        original_device = next(pipeline.model_sen2sr.parameters()).device
        try:
            lr_rgbn_cpu = pipeline._extract_rgbn(padded_lr).squeeze(0).cpu()
            model_cpu = pipeline.model_sen2sr.cpu()

            # Target midpoint of SR output space
            h_target = padded_lr.shape[-2] * 2
            w_target = padded_lr.shape[-1] * 2

            kde_map, complexity, _, _ = compute_lam(
                lr_rgbn=lr_rgbn_cpu,
                model=model_cpu,
                h=h_target,
                w=w_target,
                aoi_name=aoi_key,
            )

            # Restore model to original device for subsequent AOIs
            pipeline.model_sen2sr.to(original_device)

            if kde_map is not None:
                lam_path = Path(cfg.output.dir) / f"{aoi_key}_lam.png"
                fig, ax = plt.subplots(figsize=(6, 6))
                ax.imshow(kde_map, cmap="hot")
                ax.set_title(f"LAM — {aoi_key} (Gini={complexity:.3f})")
                ax.axis("off")
                plt.savefig(lam_path, bbox_inches="tight", dpi=150)
                plt.close(fig)
                logging.info("[%s] LAM saved: %s", aoi_key, lam_path)

        except Exception as lam_exc:
            logging.warning("[%s] LAM failed (non-fatal): %s", aoi_key, lam_exc)
            # Ensure model is back on GPU even if LAM crashed midway
            try:
                pipeline.model_sen2sr.to(original_device)
            except Exception:
                pass

    # 5. Stochastic Uncertainty Mapping on LDSR-S2
    lr_rgbn = pipeline._extract_rgbn(padded_lr.to(pipeline.device))
    unc_map, unc_stats = compute_uncertainty_map(
        model=pipeline.model_diffusion,
        lr_rgbn=lr_rgbn,
        n_variations=cfg.models.uncertainty_variations,
        sampling_steps=cfg.models.sampling_steps,
        aoi_name=aoi_key,
    )
    sr_dict["uncertainty"] = unc_map

    # 6. Postprocessing & GeoTIFF Export
    exported_paths = postprocess_and_export(
        sr_dict=sr_dict,
        padding_info=padding_info,
        input_da=selected_scene,
        output_dir=cfg.output.dir,
        aoi_name=aoi_key,
        band_names=cfg.bands.all_10,
        scale_factor=getattr(args, "scale", 4),
    )

    # Verify written GeoTIFF using rasterio
    final_tif = exported_paths.get("sr_final")
    if final_tif and final_tif.is_file():
        with rasterio.open(final_tif) as src:
            logging.info(
                "[%s] VERIFIED GeoTIFF on disk: %s (bands=%d, shape=%s, CRS=%s, transform=%s)",
                aoi_key,
                final_tif.name,
                src.count,
                (src.height, src.width),
                src.crs,
                src.transform,
            )
            assert src.count == 10, f"Expected 10 bands, found {src.count}"
            assert src.crs is not None, "Output GeoTIFF must have authoritative CRS"

    # 7. Downstream Applications: Spectral index analysis & comparison figure
    # Determine appropriate index based on AOI type
    index_map = {
        "urban_berlin": "NDBI",
        "agri_valencia": "NDVI",
        "disaster_derna": "MNDWI",
        "punjab_crops": "NDVI",
        "mumbai_urban": "NDBI",
        "uttarakhand_disaster": "MNDWI",
        "sundarbans": "MNDWI",
        "jaisalmer_desert": "NDVI",
        "gujarat_ahmedabad": "NDVI",
    }
    chosen_index = index_map.get(aoi_key, "NDVI")

    # Crop unpadded LR and SR for visualization
    lr_norm_unpadded = raw_10b / cfg.preprocessing.reflectance_scale
    sr_10b_unpadded = rasterio.open(final_tif).read() if final_tif else None

    if sr_10b_unpadded is not None:
        fig_path = Path(cfg.output.dir) / f"{aoi_key}_{chosen_index.lower()}_comparison.png"
        generate_comparison_figure(
            lr_10b=lr_norm_unpadded,
            sr_10b=sr_10b_unpadded,
            aoi_name=aoi_name,
            output_path=fig_path,
            primary_index=chosen_index,
        )
        logging.info("[%s] Generated comparison artifact: %s", aoi_key, fig_path.name)

    logging.info(
        "[%s] Completed successfully in %.2fs (ingest=%.2fs, SR=%.2fs)",
        aoi_key,
        time.time() - t0,
        ingest_time,
        sr_time,
    )

def process_input_geotiff(
    input_path: str,
    aoi_name: str,
    cfg,
    pipeline,
    args: argparse.Namespace,
    patch_size: int = 128,
) -> None:
    """Run SR pipeline on an existing GeoTIFF file, bypassing STAC ingestion.

    Automatically tiles inputs larger than 128×128 into patch_size patches,
    super-resolves each at 4×, then reassembles the full high-res output.
    For a 512×512 input this produces a 2048×2048 SR GeoTIFF.

    Band remapping: file bands are mapped to model order
    [B02, B03, B04, B05, B06, B07, B08, B8A, B11, B12] by description.
    Missing bands are zero-filled. DN values (max > 2.0) are divided by 10000.
    """
    import torch
    import xarray as xr
    import rioxarray  # noqa: F401
    from srm.preprocessing import preprocess_scene
    from srm.uncertainty import compute_uncertainty_map
    from rasterio.transform import Affine
    import rasterio.crs

    logging.info("=" * 80)
    logging.info("PROCESSING INPUT FILE: %s", input_path)
    logging.info("Output name: %s", aoi_name)
    logging.info("=" * 80)

    # ── 1. Read GeoTIFF ───────────────────────────────────────────────────────
    with rasterio.open(input_path) as src:
        raw = src.read().astype(np.float32)          # (C, H, W)
        file_crs = src.crs
        file_transform = src.transform
        file_descriptions = [d or f"Band{i+1}" for i, d in enumerate(src.descriptions)]

    logging.info("Input: %d bands, shape=%s, CRS=%s", raw.shape[0], raw.shape[1:], file_crs)

    # ── 2. Normalise to [0, 1] ────────────────────────────────────────────────
    if raw.max() > 2.0:
        logging.info("Values > 2.0 — applying /10000 reflectance scaling")
        raw = raw / 10_000.0
    raw = np.clip(raw, 0.0, 1.0)

    # ── 3. Remap to 10-band model order ──────────────────────────────────────
    TARGET_BANDS = ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"]
    H, W = raw.shape[1], raw.shape[2]
    remapped = np.zeros((10, H, W), dtype=np.float32)

    desc_upper = [d.upper().strip() for d in file_descriptions]
    for out_idx, band_id in enumerate(TARGET_BANDS):
        if band_id in desc_upper:
            in_idx = desc_upper.index(band_id)
            remapped[out_idx] = raw[in_idx]
            logging.info("  Mapped %s → pos %d (file band %d)", band_id, out_idx, in_idx + 1)
        else:
            logging.warning("  %s not found — zero-filled at pos %d", band_id, out_idx)

    # ── 4. Tile into 128×128 patches, SR each, assemble ──────────────────────
    # ── 4. Tiling with Hann window blending (max quality) ────────────────────
    scale_opt = getattr(args, "scale", 4)
    SCALE = 16 if scale_opt == 8 else 4
    res_str = "0.625m" if scale_opt == 8 else "2.5m"
    patch_size = cfg.patch_size
    overlap = args.overlap if (args.overlap is not None) else getattr(cfg, "overlap", 32)
    use_tta = getattr(args, "tta", False) or getattr(args, "max_quality", False) or getattr(cfg, "use_tta", False)

    if overlap > 0 and (H > patch_size or W > patch_size):
        stride = patch_size - overlap
        def get_starts(dim, p_size, st):
            if dim <= p_size:
                return [0]
            starts = list(range(0, dim - p_size + 1, st))
            if starts[-1] + p_size < dim:
                starts.append(dim - p_size)
            return starts

        y_starts = get_starts(H, patch_size, stride)
        x_starts = get_starts(W, patch_size, stride)
        total_tiles = len(y_starts) * len(x_starts)
        logging.info(
            "Tiling %dx%d input with overlap=%dpx (stride=%dpx, TTA=%s, scale=%dx) → %d tiles (%d×%d grid) with 2D Hann blending",
            H, W, overlap, stride, use_tta, scale_opt, total_tiles, len(y_starts), len(x_starts)
        )

        # 2D Hann window for smooth boundary blending
        wy = np.hanning(patch_size * SCALE + 2)[1:-1]
        wx = np.hanning(patch_size * SCALE + 2)[1:-1]
        w2d = np.outer(wy, wx).astype(np.float32)
        w2d = np.maximum(w2d, 1e-3)

        sr_accum = np.zeros((10, H * SCALE, W * SCALE), dtype=np.float32)
        unc_accum = np.zeros((H * SCALE, W * SCALE), dtype=np.float32)
        weight_accum = np.zeros((H * SCALE, W * SCALE), dtype=np.float32)

        tile_count = 0
        t_sr_start = time.time()
        for yi, y0 in enumerate(y_starts):
            for xi, x0 in enumerate(x_starts):
                tile_count += 1
                logging.info("  Tile %d/%d (y=%d, x=%d)...", tile_count, total_tiles, y0, x0)
                tile = remapped[:, y0:y0 + patch_size, x0:x0 + patch_size]
                padded_tile, pad_info = preprocess_scene(tile, scale=1.0, patch_multiple=patch_size)

                tile_label = f"{aoi_name}_t{yi}{xi}"
                sr_dict = pipeline.run_inference(padded_tile, aoi_name=tile_label, use_tta=use_tta, scale_factor=scale_opt)
                sr_tile = sr_dict["sr_final"].squeeze(0).cpu().numpy()

                is_centre = (yi == len(y_starts) // 2) and (xi == len(x_starts) // 2)
                if is_centre or total_tiles <= 4:
                    lr_rgbn = pipeline._extract_rgbn(padded_tile.to(pipeline.device))
                    unc_tile_result, _ = compute_uncertainty_map(
                        model=pipeline.model_diffusion,
                        lr_rgbn=lr_rgbn,
                        n_variations=cfg.models.uncertainty_variations,
                        sampling_steps=cfg.models.sampling_steps,
                        aoi_name=tile_label,
                    )
                    unc_np = unc_tile_result.squeeze(0).squeeze(0).cpu().numpy()
                    if scale_opt == 8 and unc_np.shape[0] != patch_size * SCALE:
                        import torch.nn.functional as F
                        unc_t = torch.from_numpy(unc_np).unsqueeze(0).unsqueeze(0)
                        unc_np = F.interpolate(unc_t, size=(patch_size * SCALE, patch_size * SCALE), mode="bilinear", align_corners=False).squeeze().numpy()
                else:
                    unc_np = np.zeros((patch_size * SCALE, patch_size * SCALE), dtype=np.float32)

                oy, ox = y0 * SCALE, x0 * SCALE
                sr_accum[:, oy:oy + patch_size * SCALE, ox:ox + patch_size * SCALE] += sr_tile * w2d
                unc_accum[oy:oy + patch_size * SCALE, ox:ox + patch_size * SCALE] += unc_np * w2d
                weight_accum[oy:oy + patch_size * SCALE, ox:ox + patch_size * SCALE] += w2d

        sr_time = time.time() - t_sr_start
        weight_accum = np.maximum(weight_accum, 1e-6)
        sr_final = (sr_accum / weight_accum).clip(0.0, 1.0)
        unc_final = unc_accum / weight_accum
    else:
        # ── Non-overlapping tile grid fallback ──────────────────────────────
        n_ph = (H + patch_size - 1) // patch_size
        n_pw = (W + patch_size - 1) // patch_size
        pad_h = n_ph * patch_size - H
        pad_w = n_pw * patch_size - W
        remapped_pad = np.pad(remapped, ((0, 0), (0, pad_h), (0, pad_w)), mode="reflect")

        logging.info(
            "Tiling %dx%d input into %dx%d patches of size %dx%d (TTA=%s) → output %dx%d (%s GSD)",
            H, W, n_ph, n_pw, patch_size, patch_size, use_tta, n_ph * patch_size * SCALE, n_pw * patch_size * SCALE, res_str
        )

        Ph, Pw = n_ph * patch_size, n_pw * patch_size
        sr_full = np.zeros((10, Ph * SCALE, Pw * SCALE), dtype=np.float32)
        unc_full = np.zeros((Ph * SCALE, Pw * SCALE), dtype=np.float32)
        total_tiles = n_ph * n_pw
        t_sr_start = time.time()

        for ti in range(n_ph):
            for tj in range(n_pw):
                tile_idx = ti * n_pw + tj + 1
                logging.info("  Tile %d/%d (row=%d col=%d) …", tile_idx, total_tiles, ti, tj)
                y0, x0 = ti * patch_size, tj * patch_size
                tile = remapped_pad[:, y0:y0 + patch_size, x0:x0 + patch_size]
                padded_tile, pad_info = preprocess_scene(tile, scale=1.0, patch_multiple=patch_size)

                tile_label = f"{aoi_name}_t{ti}{tj}"
                sr_dict = pipeline.run_inference(padded_tile, aoi_name=tile_label, use_tta=use_tta, scale_factor=scale_opt)
                sr_tile = sr_dict["sr_final"].squeeze(0).cpu().numpy()

                centre_ti = n_ph // 2
                centre_tj = n_pw // 2
                if ti == centre_ti and tj == centre_tj:
                    lr_rgbn = pipeline._extract_rgbn(padded_tile.to(pipeline.device))
                    unc_tile_result, _ = compute_uncertainty_map(
                        model=pipeline.model_diffusion,
                        lr_rgbn=lr_rgbn,
                        n_variations=cfg.models.uncertainty_variations,
                        sampling_steps=cfg.models.sampling_steps,
                        aoi_name=tile_label,
                    )
                    unc_np = unc_tile_result.squeeze(0).squeeze(0).cpu().numpy()
                    if scale_opt == 8 and unc_np.shape[0] != patch_size * SCALE:
                        import torch.nn.functional as F
                        unc_t = torch.from_numpy(unc_np).unsqueeze(0).unsqueeze(0)
                        unc_np = F.interpolate(unc_t, size=(patch_size * SCALE, patch_size * SCALE), mode="bilinear", align_corners=False).squeeze().numpy()
                else:
                    unc_np = np.zeros((patch_size * SCALE, patch_size * SCALE), dtype=np.float32)

                oy, ox = ti * patch_size * SCALE, tj * patch_size * SCALE
                sr_full[:, oy:oy + patch_size * SCALE, ox:ox + patch_size * SCALE] = sr_tile
                unc_full[oy:oy + patch_size * SCALE, ox:ox + patch_size * SCALE] = unc_np

        sr_time = time.time() - t_sr_start
        sr_final = sr_full[:, :H * SCALE, :W * SCALE]
        unc_final = unc_full[:H * SCALE, :W * SCALE]

    logging.info("SR tiling complete in %.2fs → output shape: %s", sr_time, sr_final.shape)

    # ── 5. Export SR GeoTIFF directly ─────────────────────────────────────────
    out_dir = Path(cfg.output.dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # SR transform: pixel size divided by SCALE
    sr_transform = Affine(
        file_transform.a / SCALE, file_transform.b, file_transform.c,
        file_transform.d, file_transform.e / SCALE, file_transform.f,
    )
    out_crs = file_crs or rasterio.crs.CRS.from_epsg(4326)

    sr_tif_path = out_dir / f"{aoi_name}_sr_10band_{res_str}.tif"
    with rasterio.open(
        sr_tif_path, "w",
        driver="GTiff", height=sr_final.shape[1], width=sr_final.shape[2],
        count=10, dtype="float32", crs=out_crs, transform=sr_transform,
        compress="lzw",
    ) as dst:
        dst.write(sr_final)
        dst.update_tags(BAND_NAMES=",".join(TARGET_BANDS))
    logging.info("Saved SR GeoTIFF: %s", sr_tif_path.name)
    if scale_opt == 8:
        legacy_tif = out_dir / f"{aoi_name}_sr_10band_2.5m.tif"
        if not legacy_tif.exists():
            try:
                import shutil
                shutil.copyfile(sr_tif_path, legacy_tif)
            except Exception:
                pass

    unc_tif_path = out_dir / f"{aoi_name}_uncertainty_{res_str}.tif"
    with rasterio.open(
        unc_tif_path, "w",
        driver="GTiff", height=unc_final.shape[0], width=unc_final.shape[1],
        count=1, dtype="float32", crs=out_crs, transform=sr_transform,
        compress="lzw",
    ) as dst:
        dst.write(unc_final[np.newaxis])
    logging.info("Saved uncertainty GeoTIFF: %s", unc_tif_path.name)

    # ── 6. Verify ─────────────────────────────────────────────────────────────
    with rasterio.open(sr_tif_path) as vsrc:
        logging.info(
            "VERIFIED: %s (bands=%d, shape=%s, CRS=%s, transform=%s)",
            sr_tif_path.name, vsrc.count, (vsrc.height, vsrc.width), vsrc.crs, vsrc.transform,
        )

    # ── 7. Comparison figure ──────────────────────────────────────────────────
    from srm.applications import generate_comparison_figure
    fig_path = out_dir / f"{aoi_name}_ndvi_comparison.png"
    generate_comparison_figure(
        lr_10b=remapped[:, :H, :W],       # original LR (unpadded)
        sr_10b=sr_final,
        aoi_name=aoi_name,
        output_path=fig_path,
        primary_index="NDVI",
    )
    logging.info("Comparison figure saved: %s", fig_path.name)

    logging.info("=" * 80)
    logging.info("INPUT FILE PROCESSING COMPLETE: %s", aoi_name)
    logging.info("=" * 80)



def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Operational Super-Resolution Mapping (SRM) Pipeline"
    )
    parser.add_argument(
        "--config",
        type=str,
        default="configs/srm_config.yaml",
        help="Path to YAML configuration file",
    )
    parser.add_argument(
        "--aoi",
        nargs="+",
        default=None,
        help="Specific AOI key(s) to process (e.g. --aoi mumbai_urban uttarakhand_disaster jaisalmer_desert)",
    )
    parser.add_argument(
        "--all-aois",
        action="store_true",
        help="Process all 3 named demo AOIs sequentially",
    )
    parser.add_argument(
        "--benchmark",
        action="store_true",
        help="Run quantitative validation against opensr-test benchmark datasets",
    )
    parser.add_argument(
        "--test-mode",
        action="store_true",
        help="Run verification test mode (evaluates 1 AOI and benchmark)",
    )
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Path to an existing GeoTIFF to super-resolve (skips STAC ingestion). "
             "Bands are auto-remapped to the 10-band model order.",
    )
    parser.add_argument(
        "--input-name",
        type=str,
        default=None,
        help="Output name prefix for --input mode (default: stem of input filename).",
    )
    parser.add_argument(
        "--lam",
        action="store_true",
        help="Run LAM explainability after SR inference. Runs on CPU, takes 2-5 min per AOI.",
    )
    parser.add_argument(
        "--tta",
        action="store_true",
        help="Enable Test-Time Augmentation (4-fold dihedral ensembling) for maximum sharpness.",
    )
    parser.add_argument(
        "--max-quality",
        action="store_true",
        help="Enable all max-quality settings: 100 DDIM steps, TTA ensembling, overlapping Hann tiling.",
    )
    parser.add_argument(
        "--overlap",
        type=int,
        default=None,
        help="Patch overlap in pixels for tiling (default: from config, e.g. 32).",
    )
    parser.add_argument(
        "--scale",
        type=int,
        choices=[4, 8],
        default=4,
        help="Super-resolution scale factor: 4 (512px @ 2.5m) or 8 (2048px @ 0.625m from 128px original).",
    )

    args = parser.parse_args()
    cfg = SRMConfig.from_yaml(args.config)
    setup_logging(cfg.log_level)

    logging.info("=" * 80)
    logging.info("SUPER-RESOLUTION MAPPING (SRM) PIPELINE STARTING")
    logging.info("Device: %s (CUDA Available: %s)", cfg.device, torch.cuda.is_available())
    logging.info("Active Config: %s", args.config)
    logging.info("=" * 80)

    # 1. Run Benchmark Evaluation if requested
    if args.benchmark or args.test_mode:
        logging.info("Executing opensr-test quantitative benchmark...")
        csv_out = Path("verification") / "benchmark_results.csv"
        df_results = evaluate_benchmark(
            dataset_name="spot",
            max_samples=3 if args.test_mode else 9,
            output_csv=csv_out,
            device=cfg.device,
        )
        logging.info("Benchmark evaluation complete. Summary statistics:")
        for method, group in df_results.groupby("method"):
            logging.info(
                "  Method '%s' — Mean PSNR: %.2f dB, Mean SSIM: %.4f, Mean SAM: %.2f°",
                method,
                group["psnr_db"].mean(),
                group["ssim"].mean(),
                group["sam_deg"].mean(),
            )

    # 2. Initialize DualPathSRPipeline
    logging.info("Loading super-resolution models...")
    use_tta_flag = args.tta or args.max_quality or getattr(cfg, "use_tta", False)
    pipeline = DualPathSRPipeline(
        able_weights=cfg.models.able_weights_path,
        opensr_ckpt=cfg.models.opensr_ckpt_path,
        opensr_config_name=cfg.models.opensr_config_name,
        sen2sr_model_dir=cfg.models.sen2sr_model_dir,
        device=cfg.device,
        sampling_steps=cfg.models.sampling_steps,
        enable_hard_constraint=cfg.hard_constraint.enabled,
        filter_type=cfg.hard_constraint.filter_type,
        filter_cutoff=cfg.hard_constraint.cutoff,
        use_tta=use_tta_flag,
    )

    # 3. Process AOIs or direct GeoTIFF input
    if args.input:
        input_path = Path(args.input)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
        out_name = args.input_name or input_path.stem.replace(" ", "_")
        process_input_geotiff(str(input_path), out_name, cfg, pipeline, args)
    elif args.aoi:
        for aoi_key in args.aoi:
            if aoi_key not in cfg.aois:
                raise KeyError(f"AOI '{aoi_key}' not found in configuration. Available: {list(cfg.aois.keys())}")
            process_single_aoi(aoi_key, cfg, pipeline, args)
    elif args.all_aois:
        for aoi_key in cfg.aois.keys():
            process_single_aoi(aoi_key, cfg, pipeline, args)
    elif args.test_mode:
        process_single_aoi("agri_valencia", cfg, pipeline, args)
    else:
        for aoi_key in ["urban_berlin", "agri_valencia", "disaster_derna"]:
            process_single_aoi(aoi_key, cfg, pipeline, args)

    logging.info("=" * 80)
    logging.info("ALL SRM OPERATIONS COMPLETED SUCCESSFULLY.")
    logging.info("=" * 80)


if __name__ == "__main__":
    main()
