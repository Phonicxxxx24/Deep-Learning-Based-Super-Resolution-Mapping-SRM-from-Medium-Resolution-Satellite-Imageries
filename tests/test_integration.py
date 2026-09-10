"""Integration tests for SRM end-to-end pipeline components on real data.

Per Section 4, asserts real data ingestion, preprocessing, transform scaling,
and GeoTIFF validation with genuine Sentinel-2 acquisitions.
"""

from pathlib import Path
import numpy as np
import pytest
import rasterio
import torch

from srm.config import SRMConfig
from srm.ingestion import fetch_sentinel2_datacube, select_clearest_scene
from srm.postprocessing import (
    compute_scaled_transform,
    extract_georeferencing,
    save_geotiff,
)
from srm.preprocessing import preprocess_scene


@pytest.mark.integration
def test_real_data_ingestion_and_preprocessing():
    """Verify live STAC ingestion from Planetary Computer and preprocessing on real data."""
    # Ingest a real patch over Valencia (agricultural AOI)
    lat = 39.4915
    lon = -0.4309
    start_date = "2023-06-01"
    end_date = "2023-06-10"
    edge_size = 64

    datacube = fetch_sentinel2_datacube(
        lat=lat,
        lon=lon,
        start_date=start_date,
        end_date=end_date,
        edge_size=edge_size,
        aoi_name="test_integration_aoi",
    )

    # Assert non-empty and correct dimensions
    assert datacube is not None
    assert datacube.size > 0
    assert "time" in datacube.dims
    assert "band" in datacube.dims
    assert datacube.shape[-2] == edge_size
    assert datacube.shape[-1] == edge_size

    # Select clearest acquisition
    scene, idx, timestamp = select_clearest_scene(datacube, aoi_name="test_integration_aoi")
    assert scene is not None
    assert isinstance(timestamp, str)

    # Extract 10 spectral bands
    all_10_bands = [
        "B02", "B03", "B04", "B05", "B06",
        "B07", "B08", "B8A", "B11", "B12",
    ]
    raw_10b = scene.sel(band=all_10_bands).values

    # Assert shape and data validity
    assert raw_10b.shape == (10, edge_size, edge_size)
    assert not np.isnan(raw_10b).any()

    # Preprocess
    padded_tensor, pad_info = preprocess_scene(raw_10b, scale=10000.0, patch_multiple=128)

    assert padded_tensor.ndim == 4
    assert padded_tensor.shape[1] == 10
    assert padded_tensor.shape[2] == 128
    assert padded_tensor.shape[3] == 128
    assert (padded_tensor >= 0.0).all() and (padded_tensor <= 1.0).all()
    assert not torch.isnan(padded_tensor).any()
    assert not torch.isinf(padded_tensor).any()


@pytest.mark.integration
def test_real_geotiff_export_and_readback(tmp_path):
    """Verify GeoTIFF export preserves CRS and correctly scales transform for 4x SRM."""
    lat = 39.4915
    lon = -0.4309
    start_date = "2023-06-01"
    end_date = "2023-06-05"
    edge_size = 32

    datacube = fetch_sentinel2_datacube(
        lat=lat,
        lon=lon,
        start_date=start_date,
        end_date=end_date,
        edge_size=edge_size,
        aoi_name="test_export_aoi",
    )
    scene, _, _ = select_clearest_scene(datacube, aoi_name="test_export_aoi")

    crs, orig_transform = extract_georeferencing(scene)
    sr_transform = compute_scaled_transform(orig_transform, scale_factor=4.0)

    # Create dummy 4x array (10, 128, 128) representing 4x upsampled data
    sr_data = np.full((10, 128, 128), 0.42, dtype=np.float32)
    test_tif = tmp_path / "test_sr_export.tif"

    save_geotiff(
        data=sr_data,
        output_path=test_tif,
        crs=crs,
        transform=sr_transform,
        band_names=["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"],
        aoi_name="test_export_aoi",
    )

    # Read back with rasterio and verify properties
    assert test_tif.is_file()
    with rasterio.open(test_tif) as src:
        assert src.count == 10
        assert src.height == 128
        assert src.width == 128
        assert src.crs == crs
        assert src.transform.a == pytest.approx(orig_transform.a / 4.0)
        assert src.transform.e == pytest.approx(orig_transform.e / 4.0)
        assert src.transform.c == pytest.approx(orig_transform.c)
        assert src.transform.f == pytest.approx(orig_transform.f)
        data_read = src.read()
        assert data_read.shape == (10, 128, 128)
        assert np.allclose(data_read, 0.42)
