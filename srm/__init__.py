"""SRM: Super-Resolution Mapping from Medium-Resolution Satellite Imageries.

Production-grade super-resolution mapping for Sentinel-2 multispectral imagery
combining Latent Diffusion, SEN2SRLite CNN, and Fourier HardConstraints.
"""

from srm.config import AOIConfig, SRMConfig
from srm.ingestion import fetch_sentinel2_datacube, select_clearest_scene
from srm.preprocessing import (
    PaddingInfo,
    create_cloud_mask,
    normalize_reflectance,
    pad_to_multiple,
    preprocess_scene,
    revert_spatial_padding,
    sanitize_tensor,
)
from srm.sr_pipeline import DualPathSRPipeline
from srm.uncertainty import compute_uncertainty_map
from srm.postprocessing import (
    compute_scaled_transform,
    extract_georeferencing,
    postprocess_and_export,
    save_geotiff,
)
from srm.validation import (
    compute_psnr,
    compute_sam,
    compute_ssim,
    evaluate_benchmark,
)
from srm.applications import (
    compute_mndwi,
    compute_ndbi,
    compute_ndvi,
    create_rgb_composite,
    generate_comparison_figure,
)

__version__ = "1.0.0"

__all__ = [
    "AOIConfig",
    "SRMConfig",
    "fetch_sentinel2_datacube",
    "select_clearest_scene",
    "PaddingInfo",
    "normalize_reflectance",
    "sanitize_tensor",
    "create_cloud_mask",
    "pad_to_multiple",
    "revert_spatial_padding",
    "preprocess_scene",
    "DualPathSRPipeline",
    "compute_uncertainty_map",
    "extract_georeferencing",
    "compute_scaled_transform",
    "save_geotiff",
    "postprocess_and_export",
    "compute_psnr",
    "compute_ssim",
    "compute_sam",
    "evaluate_benchmark",
    "compute_ndvi",
    "compute_mndwi",
    "compute_ndbi",
    "create_rgb_composite",
    "generate_comparison_figure",
]
