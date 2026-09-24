"""Tests for Able Sen2SR model integration in SRM pipeline."""

import pytest
import torch

from srm.able import Sen2SRLoss, Sen2SRModel, Sen2SR_RGBN, make_sen2sr_model
from srm.config import SRMConfig
from srm.sr_pipeline import DualPathSRPipeline
from srm.uncertainty import compute_uncertainty, compute_uncertainty_map


def test_make_sen2sr_model_architecture():
    """Verify neural network architecture instantiation and forward tensor shapes."""
    model = make_sen2sr_model(in_ch=4, out_ch=4, feat_ch=32, num_blocks=2, scale=4)
    model.eval()
    x = torch.rand(1, 4, 32, 32)
    with torch.no_grad():
        out = model(x)
    assert out.shape == (1, 4, 128, 128), f"Expected (1, 4, 128, 128), got {out.shape}"


def test_sen2sr_loss_computation():
    """Verify Sen2SR multi-objective loss computation."""
    criterion = Sen2SRLoss()
    pred = torch.rand(2, 4, 64, 64)
    target = torch.rand(2, 4, 64, 64)
    lr = torch.rand(2, 4, 16, 16)
    total_loss, loss_dict = criterion(pred, target, lr=lr)

    assert total_loss > 0.0
    for k in ["l1", "sam", "lap", "grad", "obs", "total"]:
        assert k in loss_dict
        assert torch.isfinite(loss_dict[k])


def test_sen2sr_model_loading_and_inference():
    """Verify Sen2SRModel wrapper loads production weights and performs 4x inference."""
    weights_path = "model/Sen2SR_Able/final_weights.pth"
    model = Sen2SRModel(weights_path=weights_path, device="cpu")
    assert model.metadata.get("architecture") == "Sen2SR_RGBN"

    x = torch.rand(1, 4, 64, 64)
    sr = model(x)
    assert sr.shape == (1, 4, 256, 256)
    assert float(sr.min()) >= 0.0
    assert float(sr.max()) <= 1.0


def test_sen2sr_model_uncertainty_map():
    """Verify stochastic uncertainty mapping on Sen2SRModel."""
    weights_path = "model/Sen2SR_Able/final_weights.pth"
    model = Sen2SRModel(weights_path=weights_path, device="cpu")
    x = torch.rand(1, 4, 64, 64)

    unc = model.uncertainty_map(x, n_variations=4)
    assert unc.shape == (1, 1, 256, 256)
    assert float(unc.std()) > 0.0, "Uncertainty map should express non-zero spatial variance"


def test_dual_path_sr_pipeline_with_able():
    """Verify end-to-end execution of DualPathSRPipeline with Able model."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipeline = DualPathSRPipeline(
        able_weights="model/Sen2SR_Able/final_weights.pth",
        device=device,
    )

    # 10-band Sentinel-2 input (native patch multiple is 128)
    lr_10b = torch.rand(1, 10, 128, 128)
    out = pipeline.run_inference(lr_10b, aoi_name="unit_test_aoi")

    assert "sr_able" in out
    assert "sr_diffusion" in out  # backward compatibility alias
    assert "sr_sen2sr" in out
    assert "sr_fused" in out
    assert "sr_final" in out

    assert out["sr_able"] is not None
    assert out["sr_able"].shape == (1, 4, 512, 512)
    assert out["sr_final"].shape == (1, 10, 512, 512)


def test_uncertainty_wrappers_with_pipeline():
    """Verify compute_uncertainty and compute_uncertainty_map on pipeline."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipeline = DualPathSRPipeline(
        able_weights="model/Sen2SR_Able/final_weights.pth",
        device=device,
    )

    lr_10b = torch.rand(1, 10, 64, 64)
    unc = compute_uncertainty(lr_10b, pipeline, n_variations=4)
    assert unc.shape == (1, 256, 256)

    lr_rgbn = pipeline._extract_rgbn(lr_10b.to(pipeline.device))
    unc_map, stats = compute_uncertainty_map(pipeline.model_able, lr_rgbn, n_variations=4)
    assert unc_map.shape == (1, 1, 256, 256)
    assert stats["spatial_variance"] > 0.0


def test_dual_model_schemas_and_requests():
    """Verify Pydantic schemas accept and validate model_choice and dual URLs."""
    from srm_api.schemas import SRRequest, SRResult, BandMetrics, BandPreservationStat

    req_able = SRRequest(lat=23.0, lon=72.0, model_choice="able")
    assert req_able.model_choice == "able"

    req_diff = SRRequest(lat=23.0, lon=72.0, model_choice="diffusion")
    assert req_diff.model_choice == "diffusion"

    req_both = SRRequest(lat=23.0, lon=72.0, model_choice="both")
    assert req_both.model_choice == "both"

    result = SRResult(
        job_id="test1234",
        lat=23.0,
        lon=72.0,
        sr_rgb_url="/static/test1234_sr_rgb.png",
        lr_rgb_url="/static/test1234_lr_rgb.png",
        uncertainty_url="/static/test1234_uncertainty.png",
        metrics=BandMetrics(),
        processing_time_s=1.2,
        model_choice="both",
        sr_able_url="/static/test1234_sr_able_rgb.png",
        sr_diffusion_url="/static/test1234_sr_diffusion_rgb.png",
    )
    assert result.model_choice == "both"
    assert result.sr_able_url is not None
    assert result.sr_diffusion_url is not None

