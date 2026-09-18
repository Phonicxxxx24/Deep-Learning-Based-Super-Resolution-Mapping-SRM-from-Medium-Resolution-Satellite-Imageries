"""Pydantic v2 request/response schemas for the SR API."""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


class SRRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0, description="Centre latitude")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Centre longitude")
    n_uncertainty: int = Field(
        default=5, ge=1, le=5,
        description="Stochastic passes for uncertainty map. Max 5 on 6GB GPU.",
    )
    sampling_steps: int = Field(
        default=50, ge=10, le=200,
        description=(
            "DDIM steps. 50 = fast (~45s), 100 = full quality (~90s), "
            "150 = extra quality (~135s), 200 = ultra precision (~180s). Default 50 for local testing."
        ),
    )
    run_lam: bool = Field(
        default=False,
        description="Run LAM explainability (adds 2-5 min on CPU).",
    )
    scale_factor: int = Field(
        default=4,
        description="Enhancement scale factor: 4 (2.5m standard) or 8 (0.625m ultra-res).",
    )

    @model_validator(mode="after")
    def clamp_hardware_limits(self) -> "SRRequest":
        # Allow 50 / 100 / 150 / 200 — snap to nearest valid tier
        valid_tiers = [50, 100, 150, 200]
        self.sampling_steps = min(valid_tiers, key=lambda t: abs(t - self.sampling_steps))
        self.n_uncertainty = min(self.n_uncertainty, 5)
        return self


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "error"]
    queue_position: Optional[int] = None   # None when running or done
    progress_msg: Optional[str] = None


class BandMetrics(BaseModel):
    psnr_db: Optional[float] = None
    ssim: Optional[float] = None
    sam_deg: Optional[float] = None
    ergas: Optional[float] = None
    lpips: Optional[float] = None


class BandPreservationStat(BaseModel):
    band: str                # e.g. "B02", "B08"
    name: str                # e.g. "Blue", "NIR"
    wavelength_nm: int       # e.g. 492, 842
    lr_mean: float           # Mean Sentinel-2 input reflectance [0-1]
    sr_mean: float           # Mean super-resolved reflectance [0-1]
    lr_std: float
    sr_std: float
    abs_diff: float          # |sr_mean - lr_mean|
    preservation_pct: float  # Percentage consistency (e.g. 99.8%)


class SRResult(BaseModel):
    job_id: str
    lat: float
    lon: float
    # Image URLs served by FastAPI /static/ mount
    sr_rgb_url: str          # 3-band RGB PNG at 2.5m
    lr_rgb_url: str          # 3-band RGB PNG at 10m (bicubic upscaled for display)
    uncertainty_url: str     # uncertainty heatmap PNG
    spectral_chart_url: Optional[str] = None  # 10-band spectral preservation plot PNG
    lam_url: Optional[str] = None
    ndvi_url: Optional[str] = None
    lr_ndvi_url: Optional[str] = None
    mndwi_url: Optional[str] = None
    lr_mndwi_url: Optional[str] = None
    ndbi_url: Optional[str] = None
    lr_ndbi_url: Optional[str] = None
    metrics: BandMetrics
    band_stats: Optional[list[BandPreservationStat]] = None
    patch_size_px: int = 128
    output_size_px: int = 512
    lr_resolution_m: float = 10.0
    sr_resolution_m: float = 2.5
    processing_time_s: float
    sampling_steps_used: int = 50   # echoed back so UI can display what was used
    scale_factor: int = 4

