"""LAM explainability wrapper from sen2sr.xai.lam.

Hardware note: LAM always runs on CPU regardless of pipeline device.
On RTX 3050 (6GB), running LAM on CUDA risks OOM and offers no
speed benefit since lam() is gradient-computation bound, not VRAM bound.

Expected runtime per patch: 2-5 minutes on CPU. This is normal.
"""

import logging
from typing import Optional, Tuple

import numpy as np
import torch

logger = logging.getLogger(__name__)


def compute_lam(
    lr_rgbn: torch.Tensor,
    model: torch.nn.Module,
    h: int = 240,
    w: int = 240,
    window: int = 32,
    scales: list = None,
    aoi_name: str = "custom_aoi",
) -> Tuple[Optional[np.ndarray], float, Optional[np.ndarray], Optional[np.ndarray]]:
    """Compute Local Attribution Map for SR model explainability.

    IMPORTANT: Always runs on CPU. Caller must pass CPU tensors and CPU model.
    Expected runtime: 2-5 minutes on CPU for a 128x128 patch. This is normal.

    Args:
        lr_rgbn: 4-band LR tensor, shape (4, H, W) or (1, 4, H, W). Must be CPU.
        model: SEN2SRLite RGBN model. Must be on CPU.
        h: Target pixel row in output space. Keep near centre of patch.
        w: Target pixel col in output space. Keep near centre of patch.
        window: Neighbourhood window size around target pixel.
        scales: Blur scales. Defaults to ["2x","3x","4x","5x","6x"] -- fewer than
            the full 8-scale default to reduce CPU runtime on 6GB laptop.
        aoi_name: For logging only.

    Returns:
        (kde_map, gini_complexity, robustness, robustness_vector)
        All None / 0.0 on any failure -- LAM never crashes the pipeline.

        kde_map: np.ndarray of shape (H, W) -- KDE-smoothed attribution map.
        gini_complexity: float -- complexity metric = (1 - gini_index) * 100.
        robustness: float -- area under robustness curve (np.trapz result).
        robustness_vector: np.ndarray -- per-scale mean gradient magnitudes.
    """
    if scales is None:
        # Use 5 scales instead of 8 to keep CPU runtime under 5 min on this machine
        scales = ["2x", "3x", "4x", "5x", "6x"]

    # Squeeze batch dim if present -- lam() expects (Bands, H, W), not (1, Bands, H, W)
    if lr_rgbn.ndim == 4:
        lr_rgbn = lr_rgbn.squeeze(0)

    # Force CPU -- non-negotiable for 6GB GPU
    lr_rgbn = lr_rgbn.cpu()
    if model is not None:
        model = model.cpu()

    try:
        from sen2sr.xai import lam as lam_module

        logger.info(
            "[%s] Starting LAM on CPU (h=%d, w=%d, window=%d, scales=%s). "
            "Expected time: 2-5 min...",
            aoi_name,
            h,
            w,
            window,
            scales,
        )
        result = lam_module.lam(
            lr_rgbn, model, h=h, w=w, window=window, scales=scales
        )
        kde_map, complexity, robustness, rob_vec = result
        logger.info("[%s] LAM complete. Gini=%.4f", aoi_name, float(complexity))
        return kde_map, float(complexity), robustness, rob_vec

    except Exception as exc:
        logger.warning(
            "[%s] LAM failed (non-fatal, pipeline continues): %s", aoi_name, exc
        )
        return None, 0.0, None, None
