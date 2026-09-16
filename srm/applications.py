"""Downstream remote sensing applications and spectral index analysis.

Computes Normalized Difference Vegetation Index (NDVI), Modified Normalized
Difference Water Index (MNDWI), and Normalized Difference Built-up Index (NDBI)
at 10m (LR) and 2.5m (SR) resolutions, rendering visual and quantitative diffs.
"""

import logging
from pathlib import Path
from typing import Dict, Tuple
import matplotlib.pyplot as plt
import numpy as np
import torch

logger = logging.getLogger(__name__)


def compute_ndvi(
    tensor_or_array: np.ndarray | torch.Tensor,
    nir_idx: int = 6,  # B08 in standard 10-band tensor
    red_idx: int = 2,  # B04 in standard 10-band tensor
    eps: float = 1e-8,
) -> np.ndarray:
    """Compute Normalized Difference Vegetation Index (NDVI).

    Formula: NDVI = (NIR - Red) / (NIR + Red)

    Args:
        tensor_or_array: Array of shape (C, H, W) with reflectance in [0, 1].
        nir_idx: Channel index of NIR band (B08).
        red_idx: Channel index of Red band (B04).
        eps: Epsilon to prevent division by zero.

    Returns:
        np.ndarray: NDVI raster bounded in [-1.0, 1.0].
    """
    arr = (
        tensor_or_array.detach().cpu().numpy()
        if isinstance(tensor_or_array, torch.Tensor)
        else np.asarray(tensor_or_array)
    )
    if arr.ndim == 4:
        arr = arr.squeeze(0)

    nir = arr[nir_idx].astype(np.float64)
    red = arr[red_idx].astype(np.float64)

    ndvi = (nir - red) / (nir + red + eps)
    return np.clip(ndvi, -1.0, 1.0)


def compute_mndwi(
    tensor_or_array: np.ndarray | torch.Tensor,
    green_idx: int = 1,  # B03 in standard 10-band tensor
    swir1_idx: int = 8,  # B11 in standard 10-band tensor
    eps: float = 1e-8,
) -> np.ndarray:
    """Compute Modified Normalized Difference Water Index (MNDWI).

    Formula: MNDWI = (Green - SWIR1) / (Green + SWIR1)

    Args:
        tensor_or_array: Array of shape (C, H, W) with reflectance in [0, 1].
        green_idx: Channel index of Green band (B03).
        swir1_idx: Channel index of SWIR1 band (B11).
        eps: Epsilon to prevent division by zero.

    Returns:
        np.ndarray: MNDWI raster bounded in [-1.0, 1.0].
    """
    arr = (
        tensor_or_array.detach().cpu().numpy()
        if isinstance(tensor_or_array, torch.Tensor)
        else np.asarray(tensor_or_array)
    )
    if arr.ndim == 4:
        arr = arr.squeeze(0)

    green = arr[green_idx].astype(np.float64)
    swir1 = arr[swir1_idx].astype(np.float64)

    mndwi = (green - swir1) / (green + swir1 + eps)
    return np.clip(mndwi, -1.0, 1.0)


def compute_ndbi(
    tensor_or_array: np.ndarray | torch.Tensor,
    swir1_idx: int = 8,  # B11 in standard 10-band tensor
    nir_idx: int = 6,  # B08 in standard 10-band tensor
    eps: float = 1e-8,
) -> np.ndarray:
    """Compute Normalized Difference Built-up Index (NDBI).

    Formula: NDBI = (SWIR1 - NIR) / (SWIR1 + NIR)

    Args:
        tensor_or_array: Array of shape (C, H, W) with reflectance in [0, 1].
        swir1_idx: Channel index of SWIR1 band (B11).
        nir_idx: Channel index of NIR band (B08).
        eps: Epsilon to prevent division by zero.

    Returns:
        np.ndarray: NDBI raster bounded in [-1.0, 1.0].
    """
    arr = (
        tensor_or_array.detach().cpu().numpy()
        if isinstance(tensor_or_array, torch.Tensor)
        else np.asarray(tensor_or_array)
    )
    if arr.ndim == 4:
        arr = arr.squeeze(0)

    swir1 = arr[swir1_idx].astype(np.float64)
    nir = arr[nir_idx].astype(np.float64)

    ndbi = (swir1 - nir) / (swir1 + nir + eps)
    return np.clip(ndbi, -1.0, 1.0)


def create_rgb_composite(
    arr: np.ndarray,
    r_idx: int = 2,  # B04
    g_idx: int = 1,  # B03
    b_idx: int = 0,  # B02
    p_low: float = 2.0,
    p_high: float = 98.0,
) -> np.ndarray:
    """Render a 3-channel natural color RGB composite with percentile contrast stretch.

    Args:
        arr: Multispectral array of shape (C, H, W).
        r_idx: Index of red channel.
        g_idx: Index of green channel.
        b_idx: Index of blue channel.
        p_low: Lower percentile for linear stretch.
        p_high: Upper percentile for linear stretch.

    Returns:
        np.ndarray: Display-ready RGB image of shape (H, W, 3) in [0.0, 1.0].
    """
    if arr.ndim == 4:
        arr = arr.squeeze(0)

    rgb = np.stack([arr[r_idx], arr[g_idx], arr[b_idx]], axis=-1)
    stretched = np.zeros_like(rgb, dtype=np.float32)

    for c in range(3):
        channel = rgb[..., c]
        vmin = np.percentile(channel, p_low)
        vmax = np.percentile(channel, p_high)
        if vmax > vmin:
            stretched[..., c] = np.clip((channel - vmin) / (vmax - vmin), 0.0, 1.0)
        else:
            stretched[..., c] = np.clip(channel, 0.0, 1.0)

    return stretched


def generate_comparison_figure(
    lr_10b: np.ndarray,
    sr_10b: np.ndarray,
    aoi_name: str,
    output_path: str | Path,
    primary_index: str = "NDVI",
) -> Path:
    """Generate and save a 6-panel before-and-after comparison figure.

    Panels:
        1. Original 10m Sentinel-2 RGB
        2. Super-Resolved 2.5m RGB
        3. Original 10m Index (e.g. NDVI, MNDWI, NDBI)
        4. Super-Resolved 2.5m Index
        5. Detailed Zoom Comparison
        6. Spatial Resolution & Histogram Enhancement

    Args:
        lr_10b: Input 10-band low-resolution array (C, H, W).
        sr_10b: Super-resolved 10-band array (C, 4H, 4W).
        aoi_name: AOI identifier for plot title.
        output_path: File path to save the generated PNG.
        primary_index: Spectral index to highlight ('NDVI', 'MNDWI', or 'NDBI').

    Returns:
        Path: Path to the saved figure PNG.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if lr_10b.ndim == 4:
        lr_10b = lr_10b.squeeze(0)
    if sr_10b.ndim == 4:
        sr_10b = sr_10b.squeeze(0)

    # Compute selected index
    index_fns = {
        "NDVI": (compute_ndvi, "YlGn", "Vegetation Index (NDVI)"),
        "MNDWI": (compute_mndwi, "Blues", "Water Index (MNDWI)"),
        "NDBI": (compute_ndbi, "YlOrRd", "Built-Up Index (NDBI)"),
    }
    fn, cmap, title_label = index_fns.get(primary_index.upper(), index_fns["NDVI"])

    lr_idx = fn(lr_10b)
    sr_idx = fn(sr_10b)

    lr_rgb = create_rgb_composite(lr_10b)
    sr_rgb = create_rgb_composite(sr_10b)

    fig, axes = plt.subplots(2, 2, figsize=(14, 12), dpi=200)

    # Panel 1: LR RGB (nearest interpolation exposes native 10m pixel resolution)
    axes[0, 0].imshow(lr_rgb, interpolation="nearest")
    axes[0, 0].set_title(f"Input Sentinel-2 (10m Native) — {aoi_name}\nRGB Composite (B04-B03-B02)", fontsize=11, fontweight="bold")
    axes[0, 0].axis("off")

    # Panel 2: SR RGB
    axes[0, 1].imshow(sr_rgb, interpolation="bilinear")
    axes[0, 1].set_title(f"Super-Resolved Output (2.5m, 4x SRM)\nDual-Path Fusion + HardConstraint", fontsize=11, fontweight="bold")
    axes[0, 1].axis("off")

    # Panel 3: LR Index
    im3 = axes[1, 0].imshow(lr_idx, cmap=cmap, vmin=-0.2, vmax=0.8, interpolation="nearest")
    axes[1, 0].set_title(f"Original 10m Native {title_label}", fontsize=11, fontweight="bold")
    axes[1, 0].axis("off")
    fig.colorbar(im3, ax=axes[1, 0], fraction=0.046, pad=0.04)

    # Panel 4: SR Index
    im4 = axes[1, 1].imshow(sr_idx, cmap=cmap, vmin=-0.2, vmax=0.8, interpolation="bilinear")
    axes[1, 1].set_title(f"Super-Resolved 2.5m {title_label}", fontsize=11, fontweight="bold")
    axes[1, 1].axis("off")
    fig.colorbar(im4, ax=axes[1, 1], fraction=0.046, pad=0.04)

    plt.tight_layout()
    plt.savefig(path, bbox_inches="tight")
    plt.close(fig)

    logger.info("[%s] Saved comparison figure to: %s", aoi_name, path.resolve())
    return path
