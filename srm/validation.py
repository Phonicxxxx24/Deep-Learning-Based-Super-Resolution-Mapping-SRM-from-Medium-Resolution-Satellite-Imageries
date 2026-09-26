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


def compute_lpips(
    reference: np.ndarray,
    target: np.ndarray,
) -> float:
    """LPIPS perceptual distance using VGG. Lower is better. Target: < 0.15.

    Always runs on CPU — avoids loading VGG into already-tight 6GB VRAM.
    Returns nan if lpips package is not installed.

    Args:
        reference: (C, H, W) float32 in [0, 1]. C >= 3 required.
        target: (C, H, W) float32 in [0, 1].

    Returns:
        float: LPIPS distance (lower = more perceptually similar).
    """
    try:
        import lpips as lpips_lib
        import torch
        # Run on CPU — avoids loading VGG into already-tight 6GB VRAM
        loss_fn = lpips_lib.LPIPS(net="vgg", verbose=False)
        ref_t = torch.from_numpy(reference[:3]).unsqueeze(0).float() * 2 - 1
        tgt_t = torch.from_numpy(target[:3]).unsqueeze(0).float() * 2 - 1
        with torch.no_grad():
            return float(loss_fn(ref_t, tgt_t).item())
    except ImportError:
        return float("nan")


def compute_ergas(
    reference: np.ndarray,
    target: np.ndarray,
    scale: int = 4,
) -> float:
    """ERGAS: Relative Global Synthesis Error across all bands.

    Pure numpy — no GPU needed. Lower is better. Target: < 3.

    Formula: 100/scale * sqrt(1/C * sum_c[(RMSE_c / mean_c)^2])

    Args:
        reference: (C, H, W) float32 in [0, 1].
        target: (C, H, W) float32 in [0, 1].
        scale: SR scale factor. 4 for 10m -> 2.5m.

    Returns:
        float: ERGAS value (lower = better spectral synthesis).
    """
    ref = np.asarray(reference, dtype=np.float64)
    tgt = np.asarray(target, dtype=np.float64)
    band_scores = []
    for i in range(ref.shape[0]):
        rmse = np.sqrt(np.mean((ref[i] - tgt[i]) ** 2))
        mean_ref = np.mean(np.abs(ref[i]))
        if mean_ref > 1e-8:
            band_scores.append((rmse / mean_ref) ** 2)
    if not band_scores:
        return float("nan")
    return float((100.0 / scale) * np.sqrt(np.mean(band_scores)))


def check_uncertainty_calibration(
    hr: np.ndarray,
    sr_mean: np.ndarray,
    sr_std: np.ndarray,
) -> float:
    """Fraction of HR pixels within sr_mean +/- 1.96*sr_std (95% CI).

    Pure numpy. Target: >= 0.90. Logs WARNING if below threshold.

    Args:
        hr: (C, H, W) reference HR array.
        sr_mean: (C, H, W) mean SR prediction.
        sr_std: (1, H, W) or (C, H, W) uncertainty std-dev from diffusion sampling.

    Returns:
        float: Coverage fraction in [0, 1].
    """
    if sr_std.shape[0] == 1:
        sr_std = np.repeat(sr_std, hr.shape[0], axis=0)
    lower = sr_mean - 1.96 * sr_std
    upper = sr_mean + 1.96 * sr_std
    coverage = float(np.logical_and(hr >= lower, hr <= upper).mean())
    if coverage < 0.90:
        logger.warning(
            "Uncertainty calibration %.3f below target 0.90 — "
            "consider increasing n_uncertainty in config",
            coverage,
        )
    return coverage


def evaluate_benchmark(
    dataset_name: str = "spot",
    max_samples: Optional[int] = None,
    output_csv: Optional[str | Path] = None,
    device: str = "cuda",
) -> pd.DataFrame:
    """Run real quantitative benchmarking against an opensr-test dataset.

    Tests THREE models on the same real Sentinel-2 → SPOT/NAIP HR pairs:
      1. Bicubic baseline (no ML)
      2. SEN2SRLite (ESA OpenSR pre-trained, 10-band CNN)
      3. Sen2SR_RGBN / Able (our custom-trained 4-band RRDB)

    All three are compared against the SAME ground-truth HR from opensr-test,
    so the resulting PSNR/SSIM/SAM numbers are directly comparable.

    Args:
        dataset_name: Name of opensr-test dataset ('spot', 'naip', etc.).
        max_samples: Optional limit on number of test scenes to evaluate.
        output_csv: Optional path to save the resulting metrics CSV.
        device: Device to use for model inference.

    Returns:
        pd.DataFrame: Tabulated metrics with columns [dataset, scene_idx, method,
            psnr_db, ssim, sam_deg, lpips, ergas] — three rows per scene.
    """
    raw_ds: Any = opensr_test.load(dataset_name)
    ds: Dict[str, Any] = cast(Dict[str, Any], raw_ds)

    # SPOT: L2A shape (N, 12, 128, 128), HRharm shape (N, 4, 512, 512)
    l2a = np.asarray(ds["L2A"])
    hr = np.asarray(ds["HRharm"] if "HRharm" in ds else ds["HR"])

    n_samples = l2a.shape[0]
    if max_samples is not None:
        n_samples = min(n_samples, max_samples)

    logger.info("Evaluating %d real scenes from '%s'...", n_samples, dataset_name)

    dev = torch.device(device if (device == "cuda" and torch.cuda.is_available()) else "cpu")

    # ── Load SEN2SRLite (10-band ESA pre-trained model) ──────────────────────
    import mlstac
    sen2sr_loader = mlstac.load("model/SEN2SRLite")
    sen2sr_model = sen2sr_loader.compiled_model(device=dev)
    sen2sr_model.eval()
    logger.info("SEN2SRLite loaded for benchmark.")

    # ── Load our custom Sen2SR_RGBN (Able, 4-band RRDB) ─────────────────────
    able_model = None
    able_weights = "model/Sen2SR_Able/final_weights.pth"
    # Also check training dir as fallback
    if not Path(able_weights).exists():
        able_weights = "training/stage1_rgbn/weights/final_weights.pth"
    try:
        from srm.able import Sen2SRModel
        able_model = Sen2SRModel(weights_path=able_weights, device=dev)
        logger.info("Sen2SR_RGBN (Able) loaded from '%s' for benchmark.", able_weights)
    except Exception as exc:
        logger.warning(
            "Could not load Sen2SR_RGBN (Able) model — skipping Able row: %s", exc
        )

    records: List[Dict[str, float | str]] = []

    def _pad_to_multiple(t: torch.Tensor, mult: int = 8) -> tuple:
        """Pad (1, C, H, W) to nearest multiple of mult. Returns (padded, (h, w))."""
        _, c, h, w = t.shape
        ph = ((h + mult - 1) // mult) * mult
        pw = ((w + mult - 1) // mult) * mult
        padded = torch.nn.functional.pad(t, (0, pw - w, 0, ph - h), mode="reflect")
        return padded, (h, w)

    for i in range(n_samples):
        # Normalise LR to [0, 1]
        l2a_sample = (l2a[i, :10].astype(np.float32) / 10000.0)
        # HR reference: 4 bands RGBNIR
        hr_sample = (hr[i, :4].astype(np.float32) / 10000.0)

        # Derive exact target size from real HR dimensions (NAIP may not be 512×512)
        _, hr_h, hr_w = hr_sample.shape

        # Extract RGBN channels: B02=0, B03=1, B04=2, B08=6 in 10-band order
        lr_rgbn = l2a_sample[[0, 1, 2, 6]]

        # ── Bicubic baseline — resize to exact HR dimensions ─────────────────
        lr_tensor = torch.from_numpy(lr_rgbn).unsqueeze(0)
        bicubic_sr = torch.nn.functional.interpolate(
            lr_tensor, size=(hr_h, hr_w), mode="bicubic", align_corners=False
        ).squeeze(0).numpy()
        bicubic_sr = np.clip(bicubic_sr, 0.0, 1.0)

        # ── SEN2SRLite — pad LR to mult-of-8, run, crop, resize to HR shape ─
        lr_10b_tensor = torch.from_numpy(l2a_sample).unsqueeze(0).to(dev)
        lr_10b_padded, (orig_h, orig_w) = _pad_to_multiple(lr_10b_tensor, mult=8)
        with torch.no_grad():
            sr_10b_padded = sen2sr_model(lr_10b_padded)
        # Crop back to 4× original LR size, then resize to exact HR size
        sr_10b_crop = sr_10b_padded[:, :, :orig_h * 4, :orig_w * 4]
        if sr_10b_crop.shape[-2] != hr_h or sr_10b_crop.shape[-1] != hr_w:
            sr_10b_crop = torch.nn.functional.interpolate(
                sr_10b_crop, size=(hr_h, hr_w), mode="bilinear", align_corners=False
            )
        sr_sen2sr_rgbn = np.clip(sr_10b_crop.squeeze(0).cpu().numpy()[[0, 1, 2, 6]], 0.0, 1.0)

        # ── Our Able model — pad 4-band LR, run, crop, resize to HR shape ────
        sr_able_rgbn = None
        if able_model is not None:
            try:
                lr_rgbn_tensor = torch.from_numpy(lr_rgbn).unsqueeze(0).to(dev)
                lr_rgbn_padded, (orig_h4, orig_w4) = _pad_to_multiple(lr_rgbn_tensor, mult=8)
                with torch.no_grad():
                    sr_able_padded = able_model(lr_rgbn_padded)
                sr_able_crop = sr_able_padded[:, :, :orig_h4 * 4, :orig_w4 * 4]
                if sr_able_crop.shape[-2] != hr_h or sr_able_crop.shape[-1] != hr_w:
                    sr_able_crop = torch.nn.functional.interpolate(
                        sr_able_crop, size=(hr_h, hr_w), mode="bilinear", align_corners=False
                    )
                sr_able_rgbn = np.clip(sr_able_crop.squeeze(0).cpu().numpy(), 0.0, 1.0)
            except Exception as exc:
                logger.warning("Able model inference failed on scene %d: %s", i, exc)

        # ── Compute metrics against the same HR ground truth ─────────────────
        def _metrics(pred: np.ndarray) -> Dict[str, float]:
            return {
                "psnr_db": compute_psnr(hr_sample, pred),
                "ssim": compute_ssim(hr_sample, pred),
                "sam_deg": compute_sam(hr_sample, pred),
                "lpips": compute_lpips(hr_sample, pred),
                "ergas": compute_ergas(hr_sample, pred),
            }

        bic_m = _metrics(bicubic_sr)
        sr_m  = _metrics(sr_sen2sr_rgbn)

        record_bicubic = {"dataset": dataset_name, "scene_idx": i, "method": "Bicubic_Baseline", **bic_m}
        record_sr      = {"dataset": dataset_name, "scene_idx": i, "method": "SEN2SRLite",       **sr_m}
        records.extend([record_bicubic, record_sr])

        if sr_able_rgbn is not None:
            able_m = _metrics(sr_able_rgbn)
            record_able = {"dataset": dataset_name, "scene_idx": i, "method": "Able_RRDB", **able_m}
            records.append(record_able)

        logger.info(
            "Scene %d (%dx%d→%dx%d) | Bicubic PSNR=%.2fdB | SEN2SR PSNR=%.2fdB | Able PSNR=%s",
            i, l2a_sample.shape[-2], l2a_sample.shape[-1], hr_h, hr_w,
            bic_m["psnr_db"], sr_m["psnr_db"],
            f"{able_m['psnr_db']:.2f}" if sr_able_rgbn is not None else "N/A",
        )


    df = pd.DataFrame(records)

    if output_csv:
        csv_path = Path(output_csv)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(csv_path, index=False)
        logger.info("Saved benchmark results to: %s", csv_path.resolve())

    return df

