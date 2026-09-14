"""Unit tests for SR pipeline components, metrics, indices, and transforms.

Validates mathematical correctness of spectral formulas, frequency constraints,
and coordinate scaling using synthetic fixtures per Section 0.2.
"""

from affine import Affine
import numpy as np
import pytest
from sen2sr.models.tricks import HardConstraint, ideal_filter
import torch

from srm.applications import compute_mndwi, compute_ndbi, compute_ndvi
from srm.postprocessing import compute_scaled_transform
from srm.validation import compute_psnr, compute_sam, compute_ssim


def test_spectral_indices_formulas():
    """Verify NDVI, MNDWI, and NDBI implementations against hand-calculated values."""
    # Construct 10-band synthetic tensor: shape (10, 2, 2)
    # Channel 0: B02, 1: B03, 2: B04 (Red), 6: B08 (NIR), 8: B11 (SWIR1)
    arr = np.zeros((10, 2, 2), dtype=np.float32)
    # Pixel (0, 0): High vegetation (NIR=0.8, Red=0.2, Green=0.3, SWIR1=0.1)
    arr[6, 0, 0] = 0.8  # NIR
    arr[2, 0, 0] = 0.2  # Red
    arr[1, 0, 0] = 0.3  # Green
    arr[8, 0, 0] = 0.1  # SWIR1

    # Pixel (0, 1): Water body (Green=0.4, SWIR1=0.05, NIR=0.05, Red=0.1)
    arr[1, 0, 1] = 0.4
    arr[8, 0, 1] = 0.05
    arr[6, 0, 1] = 0.05
    arr[2, 0, 1] = 0.1

    # Pixel (1, 0): Built-up surface (SWIR1=0.6, NIR=0.3)
    arr[8, 1, 0] = 0.6
    arr[6, 1, 0] = 0.3

    ndvi = compute_ndvi(arr, nir_idx=6, red_idx=2)
    mndwi = compute_mndwi(arr, green_idx=1, swir1_idx=8)
    ndbi = compute_ndbi(arr, swir1_idx=8, nir_idx=6)

    # Hand calculations:
    # Pixel (0, 0): NDVI = (0.8 - 0.2) / (0.8 + 0.2) = 0.6 / 1.0 = 0.6
    assert ndvi[0, 0] == pytest.approx(0.6, abs=1e-4)

    # Pixel (0, 1): MNDWI = (0.4 - 0.05) / (0.4 + 0.05) = 0.35 / 0.45 = 0.7778
    assert mndwi[0, 1] == pytest.approx(0.35 / 0.45, abs=1e-4)

    # Pixel (1, 0): NDBI = (0.6 - 0.3) / (0.6 + 0.3) = 0.3 / 0.9 = 0.3333
    assert ndbi[1, 0] == pytest.approx(0.3 / 0.9, abs=1e-4)


def test_metrics_computations():
    """Verify PSNR, SSIM, and SAM implementations on known identity and perturbed pairs."""
    # Identity test
    ref = np.ones((4, 32, 32), dtype=np.float32) * 0.5
    psnr_ident = compute_psnr(ref, ref, data_range=1.0)
    ssim_ident = compute_ssim(ref, ref, data_range=1.0)
    sam_ident = compute_sam(ref, ref)

    # PSNR for identical signals is infinite or very large (>80 dB), SSIM is 1.0, SAM is 0.0 deg
    assert psnr_ident > 80.0
    assert ssim_ident == pytest.approx(1.0, abs=1e-4)
    assert sam_ident == pytest.approx(0.0, abs=1e-4)

    # Perturbed test
    perturbed = ref * 0.9  # 10% lower magnitude
    psnr_pert = compute_psnr(ref, perturbed, data_range=1.0)
    ssim_pert = compute_ssim(ref, perturbed, data_range=1.0)
    sam_pert = compute_sam(ref, perturbed)

    assert 20.0 < psnr_pert < 40.0
    assert 0.8 < ssim_pert < 1.0
    # Scaled collinear vectors still have angle = 0
    assert sam_pert == pytest.approx(0.0, abs=1e-4)

    # Orthogonal vectors should give SAM = 90 degrees
    v1 = np.zeros((2, 16, 16), dtype=np.float32)
    v1[0] = 1.0
    v2 = np.zeros((2, 16, 16), dtype=np.float32)
    v2[1] = 1.0
    sam_ortho = compute_sam(v1, v2)
    assert sam_ortho == pytest.approx(90.0, abs=1e-4)


def test_hard_constraint():
    """Verify sen2sr.models.tricks.HardConstraint executes without NaNs and preserves dimensions."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    lr = torch.rand((1, 10, 32, 32), device=device)
    sr = torch.rand((1, 10, 128, 128), device=device)

    low_pass = ideal_filter((128, 128), cutoff=16).to(device)
    hc = HardConstraint(low_pass_mask=low_pass, bands="all", device=device)

    constrained = hc(lr=lr, sr=sr)
    assert constrained.shape == sr.shape
    assert not torch.isnan(constrained).any()
    assert not torch.isinf(constrained).any()


def test_scaled_transform():
    """Verify affine transform scaling for 4x super-resolution."""
    # Original 10m transform: origin at (500000, 4000000), pixel size 10m x -10m
    orig = Affine(10.0, 0.0, 500000.0, 0.0, -10.0, 4000000.0)
    scaled = compute_scaled_transform(orig, scale_factor=4.0)

    assert scaled.a == pytest.approx(2.5)  # 10 / 4 = 2.5m
    assert scaled.e == pytest.approx(-2.5)
    assert scaled.c == orig.c  # Origin X preserved
    assert scaled.f == orig.f  # Origin Y preserved


def test_ergas_identical_arrays():
    """ERGAS of identical arrays must be 0."""
    import numpy as np
    arr = np.random.rand(4, 32, 32).astype(np.float32) * 0.5 + 0.1
    from srm.validation import compute_ergas
    assert compute_ergas(arr, arr) == pytest.approx(0.0, abs=1e-6)


def test_ergas_known_value():
    """Manual ERGAS calculation: RMSE=0.05, mean=0.5 -> ERGAS=2.5 at scale=4."""
    import numpy as np
    ref = np.ones((1, 16, 16), dtype=np.float32) * 0.5
    tgt = np.ones((1, 16, 16), dtype=np.float32) * 0.55
    from srm.validation import compute_ergas
    assert compute_ergas(ref, tgt, scale=4) == pytest.approx(2.5, rel=1e-4)


def test_calibration_wide_intervals():
    """Huge uncertainty intervals must give calibration of 1.0."""
    import numpy as np
    hr = np.random.rand(4, 32, 32).astype(np.float32)
    sr_mean = hr.copy()
    sr_std = np.ones((1, 32, 32), dtype=np.float32) * 999.0
    from srm.validation import check_uncertainty_calibration
    assert check_uncertainty_calibration(hr, sr_mean, sr_std) == pytest.approx(1.0)


def test_calibration_zero_intervals():
    """Zero-width intervals with wrong mean must give calibration of 0.0."""
    import numpy as np
    hr = np.ones((4, 32, 32), dtype=np.float32)
    sr_mean = np.zeros((4, 32, 32), dtype=np.float32)
    sr_std = np.zeros((1, 32, 32), dtype=np.float32)
    from srm.validation import check_uncertainty_calibration
    assert check_uncertainty_calibration(hr, sr_mean, sr_std) == pytest.approx(0.0)
