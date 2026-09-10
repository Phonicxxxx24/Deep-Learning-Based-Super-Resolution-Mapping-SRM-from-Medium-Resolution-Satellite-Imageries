"""Unit tests for srm.preprocessing module.

Tests padding reversibility, reflectance scaling, sanitization, and SCL masking
using synthetic fixture tensors (permitted in unit tests per Section 0.2).
"""

import numpy as np
import pytest
import torch

from srm.preprocessing import (
    PaddingInfo,
    create_cloud_mask,
    normalize_reflectance,
    pad_to_multiple,
    preprocess_scene,
    revert_spatial_padding,
    sanitize_tensor,
)


def test_normalize_reflectance():
    """Verify reflectance normalization scales by 10000 and clamps strictly to [0, 1]."""
    raw_dn = torch.tensor([-500.0, 0.0, 5000.0, 10000.0, 15000.0])
    normalized = normalize_reflectance(raw_dn, scale=10000.0)

    assert normalized.dtype == torch.float32
    assert normalized[0].item() == 0.0  # Clamped min
    assert normalized[1].item() == 0.0
    assert normalized[2].item() == 0.5
    assert normalized[3].item() == 1.0
    assert normalized[4].item() == 1.0  # Clamped max
    assert (normalized >= 0.0).all() and (normalized <= 1.0).all()


def test_sanitize_tensor():
    """Verify sanitization replaces NaNs and Infs with valid values."""
    corrupt = torch.tensor([float("nan"), float("inf"), float("-inf"), 0.42])
    cleaned = sanitize_tensor(corrupt, nan_val=0.0, posinf_val=1.0, neginf_val=0.0)

    assert not torch.isnan(cleaned).any()
    assert not torch.isinf(cleaned).any()
    assert cleaned[0].item() == 0.0
    assert cleaned[1].item() == 1.0
    assert cleaned[2].item() == 0.0
    assert cleaned[3].item() == pytest.approx(0.42)


@pytest.mark.parametrize(
    "orig_shape",
    [
        (1, 10, 128, 128),
        (1, 10, 100, 100),
        (1, 10, 75, 130),
        (1, 4, 63, 65),
    ],
)
def test_padding_roundtrip(orig_shape):
    """Verify that pad_to_multiple followed by revert_spatial_padding is exactly lossless."""
    dummy_input = torch.rand(orig_shape)
    padded, pad_info = pad_to_multiple(dummy_input, multiple=128)

    # Check that padded dimensions are exact multiples of 128
    assert padded.shape[-2] % 128 == 0
    assert padded.shape[-1] % 128 == 0
    assert padded.shape[-2] >= orig_shape[-2]
    assert padded.shape[-1] >= orig_shape[-1]

    # Revert padding without scale
    reverted_1x = revert_spatial_padding(padded, pad_info, scale_factor=1)
    assert reverted_1x.shape == orig_shape
    torch.testing.assert_close(reverted_1x, dummy_input)

    # Revert padding with 4x scale factor
    # Upsample padded to 4x, then revert
    padded_4x = torch.nn.functional.interpolate(
        padded,
        size=(padded.shape[-2] * 4, padded.shape[-1] * 4),
        mode="nearest",
    )
    reverted_4x = revert_spatial_padding(padded_4x, pad_info, scale_factor=4)
    expected_4x_shape = (
        orig_shape[0],
        orig_shape[1],
        orig_shape[2] * 4,
        orig_shape[3] * 4,
    )
    assert reverted_4x.shape == expected_4x_shape


def test_create_cloud_mask():
    """Verify SCL cloud and shadow masking identifies standard Sentinel-2 classes."""
    # 0: no data, 3: shadow, 4: vegetation, 8: med cloud, 9: high cloud, 10: cirrus
    scl = np.array([[0, 3, 4], [8, 9, 10]], dtype=np.uint8)
    mask = create_cloud_mask(scl, cloud_classes=[3, 8, 9, 10])

    expected = torch.tensor([[False, True, False], [True, True, True]], dtype=torch.bool)
    assert torch.equal(mask, expected)
