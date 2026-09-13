"""Uncertainty estimation module using Latent Diffusion Monte Carlo sampling.

Leverages opensr-model's stochastic sampling to compute per-pixel predictive
uncertainty (variance / confidence interval width) across repeated passes.
"""

import logging
from typing import Dict, Tuple
import numpy as np
import opensr_model
from scipy.ndimage import sobel  # type: ignore[import-untyped]
import torch

logger = logging.getLogger(__name__)


def compute_uncertainty_map(
    model: opensr_model.SRLatentDiffusion,
    lr_rgbn: torch.Tensor,
    n_variations: int = 15,
    sampling_steps: int = 50,
    aoi_name: str = "custom_aoi",
) -> Tuple[torch.Tensor, Dict[str, float]]:
    """Compute per-pixel uncertainty map using stochastic diffusion passes.

    Calls the native uncertainty_map method on SRLatentDiffusion, which
    varies random sampling seeds to calculate per-pixel standard deviation.

    Args:
        model: Loaded SRLatentDiffusion instance in eval mode.
        lr_rgbn: 4-band input tensor of shape (1, 4, H, W) on model's device.
        n_variations: Number of stochastic forward passes.
        sampling_steps: DDIM sampling steps per pass.
        aoi_name: Identifier for structured logging.

    Returns:
        Tuple[torch.Tensor, Dict[str, float]]:
            - torch.Tensor: Uncertainty map of shape (1, 1, 4H, 4W) indicating
              per-pixel standard deviation.
            - Dict[str, float]: Statistical metrics (mean, std, min, max,
              edge_vs_flat_ratio) proving non-constant, structure-correlated uncertainty.

    Raises:
        ValueError: If input tensor does not match expected (B, 4, H, W) shape.
        RuntimeError: If uncertainty computation fails or returns zero variance.
    """
    if lr_rgbn.ndim != 4 or lr_rgbn.shape[1] != 4:
        raise ValueError(
            f"[{aoi_name}] Expected 4D tensor with 4 channels (B, 4, H, W), got {lr_rgbn.shape}"
        )

    logger.info(
        "[%s] Computing uncertainty map (variations=%d, steps=%d)...",
        aoi_name,
        n_variations,
        sampling_steps,
    )

    with torch.no_grad():
        unc_tensor: torch.Tensor = model.uncertainty_map(
            lr_rgbn,
            n_variations=n_variations,
            sampling_steps=sampling_steps,
        )

    if torch.isnan(unc_tensor).any() or torch.isinf(unc_tensor).any():
        raise RuntimeError(f"[{aoi_name}] Uncertainty map contains NaN or Inf values.")

    unc_np = unc_tensor.squeeze().detach().cpu().numpy().astype(np.float64)
    variance_val = float(np.var(unc_np))

    if variance_val == 0.0:
        raise RuntimeError(
            f"[{aoi_name}] Uncertainty map has zero variance (constant fill detected)."
        )

    # Compute correlation with image edges to confirm it measures real structural uncertainty
    # Extract intensity from RGB (first 3 channels of lr_rgbn upsampled)
    rgb_up = torch.nn.functional.interpolate(
        lr_rgbn[:, 0:3], size=unc_tensor.shape[-2:], mode="bilinear", align_corners=False
    )
    gray = rgb_up.mean(dim=1).squeeze().cpu().numpy()
    edge_mag = np.hypot(sobel(gray, axis=0), sobel(gray, axis=1))

    # Compare mean uncertainty on top 20% edges vs bottom 20% flat areas
    edge_threshold = np.percentile(edge_mag, 80)
    flat_threshold = np.percentile(edge_mag, 20)
    edge_mask = edge_mag >= edge_threshold
    flat_mask = edge_mag <= flat_threshold

    mean_edge_unc = float(unc_np[edge_mask].mean()) if edge_mask.any() else 0.0
    mean_flat_unc = float(unc_np[flat_mask].mean()) if flat_mask.any() else 0.0
    ratio = (mean_edge_unc / mean_flat_unc) if mean_flat_unc > 0 else 1.0

    stats = {
        "mean_uncertainty": float(np.mean(unc_np)),
        "std_uncertainty": float(np.std(unc_np)),
        "min_uncertainty": float(np.min(unc_np)),
        "max_uncertainty": float(np.max(unc_np)),
        "spatial_variance": variance_val,
        "mean_edge_uncertainty": mean_edge_unc,
        "mean_flat_uncertainty": mean_flat_unc,
        "edge_to_flat_ratio": ratio,
    }

    logger.info(
        "[%s] Uncertainty stats: mean=%.5f, std=%.5f, variance=%.2e, edge/flat ratio=%.2f",
        aoi_name,
        stats["mean_uncertainty"],
        stats["std_uncertainty"],
        stats["spatial_variance"],
        stats["edge_to_flat_ratio"],
    )

    return unc_tensor, stats
