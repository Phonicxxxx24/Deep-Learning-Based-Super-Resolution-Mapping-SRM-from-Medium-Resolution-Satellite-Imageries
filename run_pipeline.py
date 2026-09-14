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
    sr_dict = pipeline.run_inference(padded_lr, aoi_name=aoi_key)
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
        type=str,
        default=None,
        help="Specific AOI key to process (e.g. 'urban_berlin', 'agri_valencia', 'disaster_derna')",
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
        "--lam",
        action="store_true",
        help="Run LAM explainability after SR inference. Runs on CPU, takes 2-5 min per AOI.",
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
    pipeline = DualPathSRPipeline(
        opensr_ckpt=cfg.models.opensr_ckpt_path,
        opensr_config_name=cfg.models.opensr_config_name,
        sen2sr_model_dir=cfg.models.sen2sr_model_dir,
        device=cfg.device,
        sampling_steps=cfg.models.sampling_steps,
        enable_hard_constraint=cfg.hard_constraint.enabled,
        filter_type=cfg.hard_constraint.filter_type,
        filter_cutoff=cfg.hard_constraint.cutoff,
    )

    # 3. Process AOIs
    if args.aoi:
        if args.aoi not in cfg.aois:
            raise KeyError(f"AOI '{args.aoi}' not found in configuration. Available: {list(cfg.aois.keys())}")
        process_single_aoi(args.aoi, cfg, pipeline, args)
    elif args.all_aois:
        for aoi_key in ["urban_berlin", "agri_valencia", "disaster_derna"]:
            process_single_aoi(aoi_key, cfg, pipeline, args)
    elif args.test_mode:
        # In test mode, process 1 real AOI to verify full pipeline execution
        process_single_aoi("agri_valencia", cfg, pipeline, args)
    else:
        # Default: process all 3 AOIs
        for aoi_key in ["urban_berlin", "agri_valencia", "disaster_derna"]:
            process_single_aoi(aoi_key, cfg, pipeline, args)

    logging.info("=" * 80)
    logging.info("ALL SRM OPERATIONS COMPLETED SUCCESSFULLY.")
    logging.info("=" * 80)


if __name__ == "__main__":
    main()
