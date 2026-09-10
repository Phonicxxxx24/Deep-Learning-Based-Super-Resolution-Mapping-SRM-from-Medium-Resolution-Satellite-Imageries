"""Data ingestion module for Sentinel-2 L2A multispectral imagery.

Fetches real Sentinel-2 L2A datacubes via cubo and Microsoft Planetary
Computer STAC endpoint for specified coordinates and date windows.
"""

import logging
from typing import List, Optional, Tuple
import cubo
import numpy as np
import xarray as xr

from srm.config import AOIConfig

logger = logging.getLogger(__name__)


class IngestionError(Exception):
    """Base exception for data ingestion failures."""


class NoScenesFoundError(IngestionError):
    """Raised when the STAC query returns zero scenes for the given AOI and window."""


def fetch_sentinel2_datacube(
    lat: float,
    lon: float,
    start_date: str,
    end_date: str,
    edge_size: int = 128,
    bands: Optional[List[str]] = None,
    collection: str = "sentinel-2-l2a",
    resolution: float = 10.0,
    aoi_name: str = "custom_aoi",
) -> xr.DataArray:
    """Ingest a real Sentinel-2 L2A datacube using cubo STAC interface.

    Args:
        lat: Latitude of AOI center in decimal degrees (WGS84).
        lon: Longitude of AOI center in decimal degrees (WGS84).
        start_date: Start date for temporal query window (YYYY-MM-DD).
        end_date: End date for temporal query window (YYYY-MM-DD).
        edge_size: Spatial patch edge length in pixels (default 128).
        bands: List of band identifiers to retrieve. If None, retrieves
            standard 10 multispectral bands plus the SCL band.
        collection: STAC collection identifier (default 'sentinel-2-l2a').
        resolution: Target ground sample distance in meters (default 10.0).
        aoi_name: Identifier used for structured context logging.

    Returns:
        xr.DataArray: An xarray DataArray of dimensions (time, band, y, x)
            containing real surface reflectance and scene metadata.

    Raises:
        NoScenesFoundError: If zero scenes are found matching the criteria.
        IngestionError: If the STAC query fails or produces malformed data.
    """
    if bands is None:
        bands = [
            "B02",
            "B03",
            "B04",
            "B05",
            "B06",
            "B07",
            "B08",
            "B8A",
            "B11",
            "B12",
            "SCL",
        ]

    logger.info(
        "[%s] Ingesting Sentinel-2 L2A cube: lat=%.4f, lon=%.4f, window=[%s, %s], edge=%dpx",
        aoi_name,
        lat,
        lon,
        start_date,
        end_date,
        edge_size,
    )

    try:
        da: xr.DataArray = cubo.create(
            lat=lat,
            lon=lon,
            collection=collection,
            bands=bands,
            start_date=start_date,
            end_date=end_date,
            edge_size=edge_size,
            resolution=resolution,
        )
    except Exception as exc:
        raise IngestionError(
            f"[{aoi_name}] Cubo STAC query failed for coords ({lat}, {lon}) "
            f"in range [{start_date}, {end_date}]: {exc}"
        ) from exc

    if da is None or da.size == 0 or da.shape[0] == 0:
        raise NoScenesFoundError(
            f"[{aoi_name}] Zero scenes returned by STAC for coords ({lat}, {lon}) "
            f"in range [{start_date}, {end_date}]."
        )

    logger.info(
        "[%s] Ingestion successful: shape=%s, dtype=%s, dims=%s",
        aoi_name,
        da.shape,
        da.dtype,
        da.dims,
    )
    return da


def select_clearest_scene(
    da: xr.DataArray,
    scl_band_name: str = "SCL",
    cloud_classes: Optional[List[int]] = None,
    aoi_name: str = "custom_aoi",
) -> Tuple[xr.DataArray, int, str]:
    """Select the clearest single temporal scene from a multi-temporal datacube.

    Evaluates cloud/shadow pixel count using the SCL band across all time
    slices and selects the acquisition with the minimum corrupted pixels.
    If SCL is not present, falls back to selecting based on 'eo:cloud_cover'
    STAC item metadata.

    Args:
        da: Multi-temporal xarray DataArray of dimensions (time, band, y, x).
        scl_band_name: Coordinate name for the Scene Classification Layer.
        cloud_classes: List of integer class values representing cloud/shadow.
        aoi_name: AOI identifier for structured logging.

    Returns:
        Tuple[xr.DataArray, int, str]:
            - xr.DataArray: Selected single-scene DataArray of dimensions (band, y, x).
            - int: Time index of the selected acquisition.
            - str: Acquisition date/timestamp of the selected scene.

    Raises:
        IngestionError: If the datacube has no time dimension or is empty.
    """
    if "time" not in da.dims or da.sizes["time"] == 0:
        raise IngestionError(f"[{aoi_name}] DataArray must have a non-empty 'time' dimension.")

    if cloud_classes is None:
        cloud_classes = [3, 8, 9, 10]

    n_times = da.sizes["time"]
    best_idx = 0
    min_cloud_metric = float("inf")

    # Check if SCL band is available in coordinates
    has_scl = (
        "band" in da.coords
        and scl_band_name in da.coords["band"].values.tolist()
    )

    if has_scl:
        # Evaluate cloudiness based on real SCL classification counts
        for t in range(n_times):
            scl_slice = da.isel(time=t).sel(band=scl_band_name).values
            cloud_count = int(np.isin(scl_slice, cloud_classes).sum())
            if cloud_count < min_cloud_metric:
                min_cloud_metric = cloud_count
                best_idx = t
    elif "eo:cloud_cover" in da.coords:
        # Fall back to STAC metadata property
        cloud_covers = da.coords["eo:cloud_cover"].values
        best_idx = int(np.nanargmin(cloud_covers))
        min_cloud_metric = float(cloud_covers[best_idx])
    else:
        # Fall back to first available valid slice
        best_idx = 0
        min_cloud_metric = 0.0

    selected_scene = da.isel(time=best_idx)
    timestamp = str(da.time.values[best_idx])

    logger.info(
        "[%s] Selected scene index %d/%d (date: %s) with cloud metric: %.1f",
        aoi_name,
        best_idx,
        n_times,
        timestamp,
        min_cloud_metric,
    )
    return selected_scene, best_idx, timestamp
