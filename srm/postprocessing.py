"""Postprocessing and geospatial raster export module.

Reverts spatial padding, updates affine geotransforms for 4x resolution,
and writes fully georeferenced Cloud-Optimized GeoTIFFs (COGs) via rasterio.
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from affine import Affine
import numpy as np
import rasterio
from rasterio.crs import CRS
import rioxarray  # Registers .rio on xarray DataArray
import torch
import xarray as xr

from srm.preprocessing import PaddingInfo, revert_spatial_padding

logger = logging.getLogger(__name__)


def extract_georeferencing(
    da: xr.DataArray,
) -> Tuple[CRS, Affine]:
    """Extract authoritative CRS and Affine transform from a cubo DataArray.

    Args:
        da: Sentinel-2 L2A xarray DataArray ingested via cubo.

    Returns:
        Tuple[CRS, Affine]:
            - rasterio.crs.CRS: Authoritative spatial reference system.
            - affine.Affine: Pixel-to-world low-resolution transformation matrix.

    Raises:
        ValueError: If neither EPSG coordinate nor affine transform is discoverable.
    """
    # 1. Resolve CRS
    crs_val = None
    if "epsg" in da.coords:
        raw_epsg = da.coords["epsg"].values
        # Handle scalar or array
        epsg_int = int(raw_epsg if np.ndim(raw_epsg) == 0 else raw_epsg.flat[0])
        crs_val = CRS.from_epsg(epsg_int)
    elif "epsg" in da.attrs:
        crs_val = CRS.from_epsg(int(da.attrs["epsg"]))
    elif "proj:code" in da.coords:
        raw_code = da.coords["proj:code"].values
        code_str = str(raw_code if np.ndim(raw_code) == 0 else raw_code.flat[0])
        crs_val = CRS.from_string(code_str)
    elif da.rio.crs is not None:
        crs_val = da.rio.crs

    if crs_val is None:
        raise ValueError("Could not extract a valid CRS from input DataArray metadata.")

    # 2. Resolve Transform
    transform = da.rio.transform()
    if transform is None or transform.is_identity:
        raise ValueError("Could not extract a valid affine transform from input DataArray.")

    return crs_val, transform


def compute_scaled_transform(
    transform: Affine,
    scale_factor: float = 4.0,
) -> Affine:
    """Scale an affine transform to represent higher spatial resolution.

    Args:
        transform: Original low-resolution Affine matrix.
        scale_factor: Upscaling multiplier (e.g., 4.0 for 10m -> 2.5m).

    Returns:
        Affine: New affine matrix where pixel dimensions are divided by scale_factor.
    """
    scale = float(scale_factor)
    return Affine(
        transform.a / scale,
        transform.b,
        transform.c,
        transform.d,
        transform.e / scale,
        transform.f,
    )


def save_geotiff(
    data: np.ndarray | torch.Tensor,
    output_path: str | Path,
    crs: CRS,
    transform: Affine,
    band_names: Optional[List[str]] = None,
    nodata: Optional[float] = None,
    aoi_name: str = "custom_aoi",
) -> Path:
    """Save an array or tensor as a georeferenced GeoTIFF.

    Args:
        data: Array or tensor of shape (C, H, W) or (1, C, H, W).
        output_path: Destination file path for the GeoTIFF.
        crs: Coordinate Reference System.
        transform: Affine geotransform matrix.
        band_names: Optional descriptions for each band.
        nodata: Nodata pixel value.
        aoi_name: Identifier for structured logging.

    Returns:
        Path: Absolute path to the written GeoTIFF.

    Raises:
        ValueError: If data dimensionality is incorrect.
        IOError: If writing the raster fails.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if isinstance(data, torch.Tensor):
        arr = data.detach().cpu().numpy()
    else:
        arr = np.asarray(data)

    if arr.ndim == 4 and arr.shape[0] == 1:
        arr = arr.squeeze(0)

    if arr.ndim != 3:
        raise ValueError(f"Expected 3D array (C, H, W), got shape {arr.shape}")

    c, h, w = arr.shape
    dtype_str = "float32"
    arr_f32 = arr.astype(np.float32)

    logger.info(
        "[%s] Exporting GeoTIFF to %s: bands=%d, shape=(%d, %d), CRS=%s",
        aoi_name,
        path.name,
        c,
        h,
        w,
        crs,
    )

    meta = {
        "driver": "GTiff",
        "height": h,
        "width": w,
        "count": c,
        "dtype": dtype_str,
        "crs": crs,
        "transform": transform,
        "nodata": nodata,
        "compress": "deflate",
    }

    with rasterio.open(path, "w", **meta) as dst:
        for i in range(c):
            dst.write(arr_f32[i], i + 1)
            if band_names and i < len(band_names):
                dst.set_band_description(i + 1, band_names[i])

    return path


def postprocess_and_export(
    sr_dict: Dict[str, torch.Tensor],
    padding_info: PaddingInfo,
    input_da: xr.DataArray,
    output_dir: str | Path,
    aoi_name: str = "custom_aoi",
    band_names: Optional[List[str]] = None,
) -> Dict[str, Path]:
    """Execute end-to-end postprocessing: padding reversal, transform scaling, and file export.

    Args:
        sr_dict: Dictionary containing super-resolved tensors from DualPathSRPipeline.
        padding_info: PaddingInfo recorded during preprocessing.
        input_da: Original ingested xarray DataArray with metadata.
        output_dir: Directory where outputs will be saved.
        aoi_name: AOI identifier for filenames and logging.
        band_names: 10-band spectral names.

    Returns:
        Dict[str, Path]: Dictionary mapping export identifiers to generated file paths.
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    crs, orig_transform = extract_georeferencing(input_da)
    sr_transform = compute_scaled_transform(orig_transform, scale_factor=4.0)

    exported_files: Dict[str, Path] = {}

    # 1. Postprocess final 10-band SR
    if "sr_final" in sr_dict:
        sr_final = revert_spatial_padding(
            sr_dict["sr_final"], padding_info, scale_factor=4
        )
        final_path = out_dir / f"{aoi_name}_sr_10band_2.5m.tif"
        save_geotiff(
            data=sr_final,
            output_path=final_path,
            crs=crs,
            transform=sr_transform,
            band_names=band_names,
            aoi_name=aoi_name,
        )
        exported_files["sr_final"] = final_path

    # 2. Postprocess uncertainty map if present
    if "uncertainty" in sr_dict:
        unc_final = revert_spatial_padding(
            sr_dict["uncertainty"], padding_info, scale_factor=4
        )
        unc_path = out_dir / f"{aoi_name}_uncertainty_2.5m.tif"
        save_geotiff(
            data=unc_final,
            output_path=unc_path,
            crs=crs,
            transform=sr_transform,
            band_names=["Uncertainty_StdDev"],
            aoi_name=aoi_name,
        )
        exported_files["uncertainty"] = unc_path

    return exported_files
