"""Folium map component for SRM dashboard. No models, no tensors, no CUDA."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import folium
import rasterio
from rasterio.warp import transform_bounds

# Load .env if present (project root two levels up from this file)
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

_CARTO_KEY = os.environ.get("CARTO_API_KEY", "").strip()
_CARTO_VALID = bool(_CARTO_KEY and _CARTO_KEY != "your_carto_api_key_here")

# Tile configuration: CartoDB dark_matter if API key is set, else OpenStreetMap
if _CARTO_VALID:
    _TILE_URL = (
        f"https://{{s}}.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}{{r}}.png"
        f"?api_key={_CARTO_KEY}"
    )
    _TILE_ATTR = (
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
        'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    )
    _TILES: str | None = None  # use custom TileLayer below
else:
    _TILE_URL = None
    _TILE_ATTR = None
    _TILES = "OpenStreetMap"


def _make_map(lat: float, lon: float, zoom: int = 13) -> folium.Map:
    """Create a Folium map with CartoDB dark_matter (if CARTO_API_KEY set) or OpenStreetMap."""
    if _CARTO_VALID and _TILE_URL:
        m = folium.Map(location=[lat, lon], zoom_start=zoom, tiles=None)
        folium.TileLayer(
            tiles=_TILE_URL,
            attr=_TILE_ATTR,
            name="CartoDB Dark Matter",
            subdomains="abcd",
        ).add_to(m)
    else:
        m = folium.Map(location=[lat, lon], zoom_start=zoom, tiles="OpenStreetMap")
    return m


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

    m = _make_map(center_lat, center_lon, zoom=13)

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

    m = _make_map(lat, lon, zoom=13)

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
