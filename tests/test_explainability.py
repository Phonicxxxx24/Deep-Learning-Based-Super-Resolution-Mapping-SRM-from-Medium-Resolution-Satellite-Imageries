"""Tests for srm/explainability.py -- all run on CPU, no GPU required."""
import numpy as np
import torch
import pytest


def test_compute_lam_handles_exception_gracefully():
    """Any exception inside lam() must return (None, 0.0, None, None)."""
    from unittest.mock import patch
    from srm.explainability import compute_lam

    with patch("sen2sr.xai.lam.lam", side_effect=RuntimeError("test error")):
        result = compute_lam(torch.rand(4, 32, 32), model=None, h=16, w=16)

    assert result[0] is None
    assert result[1] == 0.0
    assert result[2] is None
    assert result[3] is None


def test_compute_lam_squeezes_batch_dim():
    """4D input (1, 4, H, W) must be squeezed to (4, H, W) before lam() call."""
    from unittest.mock import patch
    from srm.explainability import compute_lam

    fake_kde = np.random.rand(32, 32)
    fake_return = (fake_kde, 0.5, np.random.rand(4), np.random.rand(4))

    with patch("sen2sr.xai.lam.lam", return_value=fake_return) as mock_lam:
        result = compute_lam(torch.rand(1, 4, 32, 32), model=None, h=64, w=64)

    called_tensor = mock_lam.call_args[0][0]
    assert called_tensor.ndim == 3, "Batch dim must be squeezed before lam() call"
    assert result[1] == pytest.approx(0.5)


def test_compute_lam_forces_cpu():
    """Input tensor must be on CPU when lam() is called."""
    from unittest.mock import patch
    from srm.explainability import compute_lam

    fake_kde = np.random.rand(32, 32)
    fake_return = (fake_kde, 0.3, np.random.rand(4), np.random.rand(4))

    with patch("sen2sr.xai.lam.lam", return_value=fake_return) as mock_lam:
        # Pass CPU tensor -- it must arrive on CPU regardless
        compute_lam(torch.rand(4, 32, 32), model=None, h=16, w=16)

    called_tensor = mock_lam.call_args[0][0]
    assert called_tensor.device.type == "cpu", "lam() must always receive CPU tensor"
