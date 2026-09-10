"""Preprocessing module for Sentinel-2 multispectral tensors.

Handles reflectance scaling, SCL-driven cloud and shadow masking,
NaN/Inf sanitization, and reversible spatial padding for SR models.
"""

from dataclasses import dataclass
import logging
from typing import List, Optional, Tuple
import numpy as np
import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PaddingInfo:
    """Stores spatial padding margins applied to a tensor.

    Attributes:
        pad_left: Number of pixels padded to the left margin.
        pad_right: Number of pixels padded to the right margin.
        pad_top: Number of pixels padded to the top margin.
        pad_bottom: Number of pixels padded to the bottom margin.
        orig_height: Original height in pixels before padding.
        orig_width: Original width in pixels before padding.
    """

    pad_left: int
    pad_right: int
    pad_top: int
    pad_bottom: int
    orig_height: int
    orig_width: int

    @property
    def has_padding(self) -> bool:
        """Returns True if any non-zero padding was applied."""
        return (
            self.pad_left > 0
            or self.pad_right > 0
            or self.pad_top > 0
            or self.pad_bottom > 0
        )


def normalize_reflectance(
    tensor: torch.Tensor,
    scale: float = 10000.0,
    clip_min: float = 0.0,
    clip_max: float = 1.0,
) -> torch.Tensor:
    """Normalize raw Sentinel-2 L2A digital numbers to BOA surface reflectance.

    Args:
        tensor: Float or integer tensor of raw DN values.
        scale: Normalization factor (Sentinel-2 L2A baseline is 10000.0).
        clip_min: Minimum reflectance boundary.
        clip_max: Maximum reflectance boundary.

    Returns:
        torch.Tensor: Normalized float32 tensor strictly bounded in [clip_min, clip_max].
    """
    scaled = tensor.float() / float(scale)
    return torch.clamp(scaled, min=clip_min, max=clip_max)


def sanitize_tensor(
    tensor: torch.Tensor,
    nan_val: float = 0.0,
    posinf_val: float = 1.0,
    neginf_val: float = 0.0,
) -> torch.Tensor:
    """Replace NaNs and +/- Infs with valid physical values.

    Args:
        tensor: Input PyTorch tensor.
        nan_val: Replacement value for NaN entries.
        posinf_val: Replacement value for positive infinity entries.
        neginf_val: Replacement value for negative infinity entries.

    Returns:
        torch.Tensor: Cleaned tensor containing only finite numeric values.
    """
    return torch.nan_to_num(
        tensor, nan=nan_val, posinf=posinf_val, neginf=neginf_val
    )


def create_cloud_mask(
    scl_array: np.ndarray | torch.Tensor,
    cloud_classes: Optional[List[int]] = None,
) -> torch.Tensor:
    """Generate a boolean mask identifying cloud and shadow pixels from SCL.

    Sentinel-2 Scene Classification Layer (SCL) standard classes:
        3: Cloud Shadows
        8: Cloud Medium Probability
        9: Cloud High Probability
        10: Thin Cirrus

    Args:
        scl_array: Array or tensor of integer SCL classes of shape (H, W).
        cloud_classes: Integer class IDs considered contaminated.

    Returns:
        torch.Tensor: Boolean tensor of shape (H, W) where True indicates
            contaminated (cloud/shadow) pixels.
    """
    if cloud_classes is None:
        cloud_classes = [3, 8, 9, 10]

    if isinstance(scl_array, np.ndarray):
        scl_tensor = torch.from_numpy(scl_array)
    else:
        scl_tensor = scl_array

    mask = torch.zeros(scl_tensor.shape, dtype=torch.bool)
    for cls_id in cloud_classes:
        mask = mask | (scl_tensor == cls_id)

    return mask


def pad_to_multiple(
    tensor: torch.Tensor,
    multiple: int = 128,
    mode: str = "reflect",
) -> Tuple[torch.Tensor, PaddingInfo]:
    """Pad spatial dimensions (H, W) to the nearest multiple of a given integer.

    Args:
        tensor: Input tensor of shape (..., H, W).
        multiple: Spatial multiple required by network architecture (default: 128).
        mode: PyTorch padding mode ('reflect', 'replicate', or 'constant').

    Returns:
        Tuple[torch.Tensor, PaddingInfo]:
            - torch.Tensor: Spatially padded tensor.
            - PaddingInfo: Immutable record of applied margins for exact reversal.

    Raises:
        ValueError: If spatial dimensions are less than 1 or multiple is invalid.
    """
    h, w = tensor.shape[-2], tensor.shape[-1]
    if h < 1 or w < 1:
        raise ValueError(f"Spatial dimensions must be positive, got ({h}, {w})")

    pad_h = (multiple - (h % multiple)) % multiple
    pad_w = (multiple - (w % multiple)) % multiple

    pad_top = pad_h // 2
    pad_bottom = pad_h - pad_top
    pad_left = pad_w // 2
    pad_right = pad_w - pad_left

    info = PaddingInfo(
        pad_left=pad_left,
        pad_right=pad_right,
        pad_top=pad_top,
        pad_bottom=pad_bottom,
        orig_height=h,
        orig_width=w,
    )

    if not info.has_padding:
        return tensor, info

    # F.pad expects (pad_left, pad_right, pad_top, pad_bottom)
    # If dimensions are smaller than padding margin in reflect mode, fallback to replicate
    if mode == "reflect" and (h <= pad_h or w <= pad_w):
        mode = "replicate"

    padded = F.pad(
        tensor,
        (pad_left, pad_right, pad_top, pad_bottom),
        mode=mode,
    )
    return padded, info


def revert_spatial_padding(
    tensor: torch.Tensor,
    info: PaddingInfo,
    scale_factor: int = 1,
) -> torch.Tensor:
    """Revert spatial padding applied by pad_to_multiple, accounting for SR scaling.

    Args:
        tensor: Super-resolved or processed tensor of shape (..., H_pad, W_pad).
        info: PaddingInfo recorded during the forward padding step.
        scale_factor: Spatial scale multiplier applied between pad and revert
            (e.g., 4 for 4x super-resolution).

    Returns:
        torch.Tensor: Cropped tensor matching original spatial extent scaled by scale_factor.
    """
    if not info.has_padding:
        return tensor

    scale = int(scale_factor)
    top = info.pad_top * scale
    left = info.pad_left * scale
    target_h = info.orig_height * scale
    target_w = info.orig_width * scale

    return tensor[..., top : top + target_h, left : left + target_w]


def preprocess_scene(
    scene_numpy: np.ndarray,
    scale: float = 10000.0,
    patch_multiple: int = 128,
) -> Tuple[torch.Tensor, PaddingInfo]:
    """Preprocess a raw multispectral scene into a sanitized, padded tensor.

    Args:
        scene_numpy: Numpy array of shape (C, H, W) containing raw DN values.
        scale: Normalization denominator.
        patch_multiple: Spatial multiple for padding.

    Returns:
        Tuple[torch.Tensor, PaddingInfo]:
            - torch.Tensor: Float32 tensor in range [0, 1] of shape (1, C, H_pad, W_pad).
            - PaddingInfo: Exact padding parameters for subsequent postprocessing.
    """
    tensor = torch.from_numpy(scene_numpy).float()
    if tensor.ndim == 3:
        tensor = tensor.unsqueeze(0)  # Add batch dimension: (1, C, H, W)

    tensor = normalize_reflectance(tensor, scale=scale)
    tensor = sanitize_tensor(tensor)
    padded_tensor, padding_info = pad_to_multiple(tensor, multiple=patch_multiple)

    return padded_tensor, padding_info
