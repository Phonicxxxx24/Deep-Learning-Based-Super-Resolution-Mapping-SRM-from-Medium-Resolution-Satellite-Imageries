"""Benchmark validation module for Super-Resolution Mapping pipeline.

Evaluates super-resolved outputs against real reference datasets from
opensr-test (SPOT / NAIP / Spain), computing mathematical PSNR, SSIM,
and Spectral Angle Mapper (SAM) without synthetic mocks or placeholders.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, cast
import numpy as np
import opensr_test
import pandas as pd
import skimage.metrics as skm
import torch

logger = logging.getLogger(__name__)


def compute_psnr(
    reference: np.ndarray,
    target: np.ndarray,
    data_range: float = 1.0,
) -> float:
    """Compute Peak Signal-to-Noise Ratio (PSNR) in decibels (dB).

    Args:
        reference: Ground-truth high-resolution array of shape (C, H, W).
        target: Super-resolved array of matching shape (C, H, W).
        data_range: Dynamic range of input data (default: 1.0 for normalized reflectance).

    Returns:
        float: Computed PSNR value in dB.
    """
    ref_f = np.asarray(reference, dtype=np.float64)
    tgt_f = np.asarray(target, dtype=np.float64)
    return float(skm.peak_signal_noise_ratio(ref_f, tgt_f, data_range=data_range))


def compute_ssim(
    reference: np.ndarray,
    target: np.ndarray,
    data_range: float = 1.0,
) -> float:
    """Compute Structural Similarity Index (SSIM).

    Args:
        reference: Ground-truth array of shape (C, H, W).
        target: Super-resolved array of shape (C, H, W).
        data_range: Dynamic range of input data (default: 1.0).

    Returns:
        float: Mean SSIM index across all channels in [-1, 1].
    """
    ref_f = np.asarray(reference, dtype=np.float64)
    tgt_f = np.asarray(target, dtype=np.float64)

    # Convert from (C, H, W) to (H, W, C) for skimage channel_axis=2
    if ref_f.ndim == 3 and ref_f.shape[0] < ref_f.shape[1]:
        ref_f = np.transpose(ref_f, (1, 2, 0))
        tgt_f = np.transpose(tgt_f, (1, 2, 0))

    return float(
        skm.structural_similarity(
            ref_f,
            tgt_f,
            data_range=data_range,
            channel_axis=2 if ref_f.ndim == 3 else None,
        )
    )


def compute_sam(
    reference: np.ndarray,
    target: np.ndarray,
    eps: float = 1e-8,
) -> float:
    """Compute Spectral Angle Mapper (SAM) in degrees.

    Measures spectral angle between reference and super-resolved pixel vectors:
    SAM = arccos( <ref, tgt> / ( ||ref||_2 * ||tgt||_2 ) )

    Args:
        reference: Ground-truth array of shape (C, H, W).
        target: Super-resolved array of shape (C, H, W).
        eps: Small epsilon to prevent division by zero.

    Returns:
        float: Mean spectral angle error across all spatial pixels in degrees.
    """
    ref = np.asarray(reference, dtype=np.float64)
    tgt = np.asarray(target, dtype=np.float64)

    if ref.ndim == 3 and ref.shape[0] < ref.shape[1]:
        # (C, H, W) -> (H*W, C)
        c, h, w = ref.shape
        ref_vecs = ref.reshape(c, -1).T
        tgt_vecs = tgt.reshape(c, -1).T
    else:
        ref_vecs = ref.reshape(-1, ref.shape[-1])
        tgt_vecs = tgt.reshape(-1, tgt.shape[-1])

    dot_product = np.sum(ref_vecs * tgt_vecs, axis=1)
    ref_norm = np.linalg.norm(ref_vecs, axis=1)
    tgt_norm = np.linalg.norm(tgt_vecs, axis=1)

    denominator = np.maximum(ref_norm * tgt_norm, eps)
    cos_theta = np.clip(dot_product / denominator, -1.0, 1.0)
    angle_rad = np.arccos(cos_theta)
    angle_deg = np.degrees(angle_rad)

    return float(np.mean(angle_deg))


def evaluate_benchmark(
    dataset_name: str = "spot",
    max_samples: Optional[int] = None,
    output_csv: Optional[str | Path] = None,
    device: str = "cuda",
) -> pd.DataFrame:
    """Run real quantitative benchmarking against an opensr-test dataset.

    Loads real Sentinel-2 L2A inputs and ground-truth HR imagery from opensr-test,
    evaluates baseline bicubic and SEN2SRLite models, and computes exact PSNR,
    SSIM, and SAM metrics.

    Args:
        dataset_name: Name of opensr-test dataset ('spot', 'naip', etc.).
        max_samples: Optional limit on number of test scenes to evaluate.
        output_csv: Optional path to save the resulting metrics CSV.
        device: Device to use for model inference.

    Returns:
        pd.DataFrame: Tabulated metrics for every evaluated sample.
    """
    raw_ds: Any = opensr_test.load(dataset_name)
    ds: Dict[str, Any] = cast(Dict[str, Any], raw_ds)

    # Extract real arrays
    # SPOT dataset: L2A is shape (N, 12, 128, 128), HRharm is (N, 4, 512, 512)
    l2a = np.asarray(ds["L2A"])
    hr = np.asarray(ds["HRharm"] if "HRharm" in ds else ds["HR"])

    n_samples = l2a.shape[0]
    if max_samples is not None:
        n_samples = min(n_samples, max_samples)

    logger.info("Evaluating %d real scenes from '%s'...", n_samples, dataset_name)

    # Load SEN2SRLite model and HardConstraint for benchmarking
    import mlstac
    from sen2sr.models.tricks import HardConstraint, ideal_filter

    loader = mlstac.load("model/SEN2SRLite")
    dev = torch.device(device if (device == "cuda" and torch.cuda.is_available()) else "cpu")
    model = loader.compiled_model(device=dev)
    model.eval()

    filter_mask = ideal_filter((512, 512), cutoff=64).to(dev)
    hc = HardConstraint(low_pass_mask=filter_mask, bands="all", device=str(dev))

    records: List[Dict[str, float | str]] = []

    # In SPOT dataset:
    # L2A has 12 bands: [B01, B02, B03, B04, B05, B06, B07, B08, B8A, B09, B11, B12]
    # S2 10-band subset: [B02, B03, B04, B05, B06, B07, B08, B8A, B11, B12] -> indices [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]
    # HR / HRharm has 4 bands: [B04 (Red), B03 (Green), B02 (Blue), B08 (NIR)]
    # Corresponding L2A bands: [3, 2, 1, 7]
    # Corresponding 10-band model output bands: [2, 1, 0, 6]
    s2_10b_indices = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]
    l2a_rgbn_indices = [3, 2, 1, 7]
    model_rgbn_indices = [2, 1, 0, 6]

    for i in range(n_samples):
        l2a_full = (l2a[i].astype(np.float32) / 10000.0)
        l2a_10b = l2a_full[s2_10b_indices]
        hr_sample = (hr[i, :4].astype(np.float32) / 10000.0)

        # Baseline Bicubic Upsampling on [B04, B03, B02, B08]
        lr_rgbn = l2a_full[l2a_rgbn_indices]
        lr_tensor = torch.from_numpy(lr_rgbn).unsqueeze(0)
        bicubic_sr = torch.nn.functional.interpolate(
            lr_tensor, size=(512, 512), mode="bicubic", align_corners=False
        ).squeeze(0).numpy()
        bicubic_sr = np.clip(bicubic_sr, 0.0, 1.0)

        # SEN2SRLite Super-Resolution + HardConstraint
        lr_10b_tensor = torch.from_numpy(l2a_10b).unsqueeze(0).to(dev)
        with torch.no_grad():
            sr_10b_raw = model(lr_10b_tensor)
            sr_10b = hc(lr=lr_10b_tensor, sr=sr_10b_raw).squeeze(0).cpu().numpy()
        sr_rgbn = np.clip(sr_10b[model_rgbn_indices], 0.0, 1.0)

        # Diagnostic equality and distance check for Issue 1
        if i == 0:
            print("same object:", bicubic_sr is sr_rgbn)
            print("pixel-identical:", np.array_equal(bicubic_sr, sr_rgbn))
            print("max abs diff:", float(np.abs(bicubic_sr - sr_rgbn).max()))

        # Compute real metrics against ground truth HR
        psnr_bicubic = compute_psnr(hr_sample, bicubic_sr)
        ssim_bicubic = compute_ssim(hr_sample, bicubic_sr)
        sam_bicubic = compute_sam(hr_sample, bicubic_sr)

        psnr_sr = compute_psnr(hr_sample, sr_rgbn)
        ssim_sr = compute_ssim(hr_sample, sr_rgbn)
        sam_sr = compute_sam(hr_sample, sr_rgbn)

        record_bicubic = {
            "dataset": dataset_name,
            "scene_idx": i,
            "method": "Bicubic_Baseline",
            "psnr_db": psnr_bicubic,
            "ssim": ssim_bicubic,
            "sam_deg": sam_bicubic,
        }
        record_sr = {
            "dataset": dataset_name,
            "scene_idx": i,
            "method": "SEN2SRLite",
            "psnr_db": psnr_sr,
            "ssim": ssim_sr,
            "sam_deg": sam_sr,
        }
        records.extend([record_bicubic, record_sr])

        logger.info(
            "Scene %d: Bicubic PSNR=%.2fdB, SSIM=%.4f, SAM=%.2f° | SR PSNR=%.2fdB, SSIM=%.4f, SAM=%.2f°",
            i,
            psnr_bicubic,
            ssim_bicubic,
            sam_bicubic,
            psnr_sr,
            ssim_sr,
            sam_sr,
        )

    df = pd.DataFrame(records)

    if output_csv:
        csv_path = Path(output_csv)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(csv_path, index=False)
        logger.info("Saved benchmark evaluation results to: %s", csv_path.resolve())

    return df
