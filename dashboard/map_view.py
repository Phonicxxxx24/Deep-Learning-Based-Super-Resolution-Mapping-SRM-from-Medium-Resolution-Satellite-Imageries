"""Folium map component for SRM dashboard. No models, no tensors, no CUDA."""
from __future__ import annotations

from typing import Optional

import folium
import rasterio
from rasterio.warp import transform_bounds


def render_folium_map(
    sr_path: str,
    unc_path: Optional[str] = None,
    aoi_name: str = "",
) -> folium.Map:
    """Build a Folium map centred on the AOI showing the SR tile extent.

    Args:
        sr_path: Absolute path to the 2.5m 10-band SR GeoTIFF on disk.
        unc_path: Optional path to uncertainty GeoTIFF (reserved for future
                  overlay functionality).
        aoi_name: Label used for the bounding-box tooltip.

    Returns:
        folium.Map -- pass directly to st_folium() in app.py.
    """
    with rasterio.open(sr_path) as src:
        left, bottom, right, top = transform_bounds(
            src.crs,
            "EPSG:4326",
            src.bounds.left,
            src.bounds.bottom,
            src.bounds.right,
            src.bounds.top,
        )

    center_lat = (bottom + top) / 2
    center_lon = (left + right) / 2

    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=13,
        tiles="CartoDB dark_matter",
    )

    # SR extent bounding box
    folium.Rectangle(
        bounds=[[bottom, left], [top, right]],
        color="#ff4444",
        weight=2,
        fill=True,
        fill_color="#ff4444",
        fill_opacity=0.08,
        tooltip=folium.Tooltip(f"<b>{aoi_name}</b><br>SR extent at 2.5 m"),
    ).add_to(m)

    # Centre marker
    folium.CircleMarker(
        location=[center_lat, center_lon],
        radius=5,
        color="#ffcc00",
        fill=True,
        fill_color="#ffcc00",
        fill_opacity=0.9,
        tooltip=folium.Tooltip(f"{aoi_name} — scene centre"),
    ).add_to(m)

    return m


def render_folium_map_latlon(
    lat: float,
    lon: float,
    edge_size_km: float = 5.12,
    aoi_name: str = "",
) -> folium.Map:
    """Build a Folium map from a lat/lon centre and approximate edge size.

    Used when no GeoTIFF is available yet (e.g. before pipeline has run).

    Args:
        lat: Centre latitude in decimal degrees.
        lon: Centre longitude in decimal degrees.
        edge_size_km: Approximate tile half-width in km (default 5.12 = 512px x 10m).
        aoi_name: Map tooltip label.

    Returns:
        folium.Map.
    """
    # Approximate degree offset: 1 deg lat ~ 111 km, 1 deg lon ~ 111*cos(lat) km
    delta_lat = edge_size_km / 2 / 111.0
    import math
    delta_lon = edge_size_km / 2 / (111.0 * max(math.cos(math.radians(lat)), 0.01))

    m = folium.Map(location=[lat, lon], zoom_start=13, tiles="CartoDB dark_matter")

    folium.Rectangle(
        bounds=[[lat - delta_lat, lon - delta_lon], [lat + delta_lat, lon + delta_lon]],
        color="#ff4444",
        weight=2,
        fill=True,
        fill_color="#ff4444",
        fill_opacity=0.08,
        tooltip=folium.Tooltip(f"<b>{aoi_name}</b><br>Approx. AOI extent"),
    ).add_to(m)

    folium.CircleMarker(
        location=[lat, lon],
        radius=5,
        color="#ffcc00",
        fill=True,
        fill_color="#ffcc00",
        fill_opacity=0.9,
    ).add_to(m)

    return m
