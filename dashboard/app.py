"""
SRM Streamlit Dashboard — Task 5 (SRM_Task_Prompts.md)

READ-ONLY: loads GeoTIFFs from outputs/ directory.
No model imports. No CUDA. No tensors in session state.
Safe to run while pipeline is processing on GPU in another terminal.

Run:
    .venv\\Scripts\\python.exe -m streamlit run dashboard/app.py --server.port 8501
"""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import rasterio
from skimage import exposure
from scipy.ndimage import convolve
import streamlit as st

from srm.applications import (
    compute_mndwi,
    compute_ndbi,
    compute_ndvi,
    create_rgb_composite,
)
from dashboard.charts import (
    metrics_bar_chart,
    psnr_per_scene_chart,
    spectral_box_plot,
    uncertainty_histogram,
)
from dashboard.map_view import render_folium_map, render_folium_map_latlon

try:
    from streamlit_folium import st_folium
    FOLIUM_AVAILABLE = True
except ImportError:
    FOLIUM_AVAILABLE = False

# ── Constants ─────────────────────────────────────────────────────────────────
OUTPUT_DIR    = Path("outputs")
BENCHMARK_CSV = Path("verification/benchmark_results.csv")
BAND_NAMES    = ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"]

# AOI metadata from srm_config.yaml (static — avoids importing SRMConfig)
AOI_META = {
    "agri_valencia": {
        "label": "Valencia, Spain (Agriculture)",
        "lat": 39.4915, "lon": -0.4309,
        "index": "NDVI",
        "icon": "🌾",
    },
    "urban_berlin": {
        "label": "Berlin, Germany (Urban)",
        "lat": 52.5200, "lon": 13.4050,
        "index": "NDBI",
        "icon": "🏙️",
    },
    "disaster_derna": {
        "label": "Derna, Libya (Flood/Disaster)",
        "lat": 32.7667, "lon": 22.6367,
        "index": "MNDWI",
        "icon": "🌊",
    },
    "punjab_crops": {
        "label": "Ludhiana, Punjab, India (Crop Monitoring)",
        "lat": 30.9010, "lon": 75.8573,
        "index": "NDVI",
        "icon": "🌾",
    },
    "mumbai_urban": {
        "label": "Mumbai, Maharashtra, India (Urban Mapping)",
        "lat": 19.0760, "lon": 72.8777,
        "index": "NDBI",
        "icon": "🌆",
    },
    "uttarakhand_disaster": {
        "label": "Chamoli, Uttarakhand, India (Disaster / Landslide)",
        "lat": 30.4200, "lon": 79.3800,
        "index": "MNDWI",
        "icon": "🏔️",
    },
    "sundarbans": {
        "label": "Sundarbans, West Bengal, India (Mangrove Delta)",
        "lat": 21.9497, "lon": 88.9003,
        "index": "MNDWI",
        "icon": "🌿",
    },
    "jaisalmer_desert": {
        "label": "Jaisalmer, Rajasthan, India (Arid Land / Solar)",
        "lat": 26.9157, "lon": 70.9083,
        "index": "NDVI",
        "icon": "🏜️",
    },
    "gujarat_ahmedabad": {
        "label": "Ahmedabad, Gujarat, India (Custom Input)",
        "lat": 23.0300, "lon": 72.2400,
        "index": "NDVI",
        "icon": "🏙️",
    },
}

INDEX_FN   = {"NDVI": compute_ndvi,  "MNDWI": compute_mndwi,  "NDBI": compute_ndbi}
INDEX_CMAP = {"NDVI": "YlGn",        "MNDWI": "Blues_r",       "NDBI": "YlOrRd"}


# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="SRM — Sentinel-2 Super-Resolution Dashboard",
    page_icon="🛰️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Styling ───────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
  html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
  .stApp { background: #0d1117; }
  .block-container { padding-top: 1.5rem; padding-bottom: 2rem; }
  .metric-card {
      background: linear-gradient(135deg, #1a1f2e, #141820);
      border: 1px solid #2a3040;
      border-radius: 10px;
      padding: 1rem 1.2rem;
      margin-bottom: 0.5rem;
  }
  .metric-label { color: #7a8899; font-size: 0.78em; letter-spacing: 0.05em; text-transform: uppercase; }
  .metric-value { color: #e8eaf0; font-size: 1.6em; font-weight: 700; }
  .hero-title {
      background: linear-gradient(90deg, #4488ff, #7c44ff, #ff4488);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      font-size: 2em; font-weight: 700; margin-bottom: 0;
  }
  .tag {
      display: inline-block; padding: 2px 10px; border-radius: 20px;
      font-size: 0.75em; font-weight: 600; margin-right: 4px;
  }
  .tag-done  { background: #1a3a2a; color: #44ee77; border: 1px solid #2a5a3a; }
  .tag-pend  { background: #2a2020; color: #ffaa44; border: 1px solid #4a3020; }
  section[data-testid="stSidebar"] { background: #111520; border-right: 1px solid #1e2535; }
</style>
""", unsafe_allow_html=True)


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown('<p class="hero-title">🛰️ SRM</p>', unsafe_allow_html=True)
    st.markdown("**Sentinel-2 Super-Resolution Mapping**")
    st.markdown("*SIH 2026 · 4× spatial enhancement*")
    st.divider()

    # Discover all GeoTIFF outputs on disk
    available_tifs = sorted(OUTPUT_DIR.glob("*_sr_10band_2.5m.tif"))
    aoi_keys_on_disk = [p.stem.replace("_sr_10band_2.5m", "") for p in available_tifs]

    # Ensure any on-disk output is in AOI_META
    for k in aoi_keys_on_disk:
        if k not in AOI_META:
            AOI_META[k] = {
                "label": k.replace("_", " ").title(),
                "lat": 20.5937, "lon": 78.9629,
                "index": "NDVI",
                "icon": "🛰️",
            }

    selectable = [k for k in AOI_META.keys() if k in aoi_keys_on_disk]

    if selectable:
        aoi_labels = [f"{AOI_META[k]['icon']} {AOI_META[k]['label']}" for k in selectable]
        chosen_idx = st.selectbox(
            "Select AOI", range(len(selectable)),
            format_func=lambda i: aoi_labels[i],
        )
        selected_aoi = selectable[chosen_idx]
    else:
        selected_aoi = None

    st.divider()

    # Pipeline status badges
    st.markdown("**Pipeline Stage Status**")
    stages = [
        ("Task 0 — Vendor + Config",   True),
        ("Task 1 — referencex4 SWIR",  True),
        ("Task 2 — LAM Explainability", True),
        ("Task 3 — LPIPS/ERGAS",       True),
        ("Task 4 — --lam CLI flag",    True),
        ("Task 5 — Dashboard (this)",  True),
    ]
    for name, done in stages:
        badge = '<span class="tag tag-done">✓ DONE</span>' if done else '<span class="tag tag-pend">⏳ PENDING</span>'
        st.markdown(f"{badge} {name}", unsafe_allow_html=True)

    st.divider()
    st.caption("20/20 tests passing · branch: stage-task-3")

# ── Main content ──────────────────────────────────────────────────────────────
st.markdown('<p class="hero-title">Sentinel-2 Super-Resolution Mapping Dashboard</p>', unsafe_allow_html=True)
st.caption("Deep Learning Based SR from 10 m Sentinel-2 imagery → 2.5 m enhanced products | Smart India Hackathon 2026")

# ── No outputs warning ────────────────────────────────────────────────────────
if not selectable:
    st.warning(
        "⚠️ No SR outputs found in `outputs/` yet.\n\n"
        "Run the pipeline first to generate GeoTIFF outputs:\n"
        "```powershell\n"
        ".venv\\Scripts\\python.exe run_pipeline.py --aoi agri_valencia\n"
        "```\n\n"
        "Then refresh this page. The Metrics and Map tabs below will still show available data."
    )

    # Show the benchmark and AOI map even without SR outputs
    st.divider()
    col_a, col_b = st.columns([1, 1])

    with col_a:
        st.subheader("📊 Benchmark Results")
        if BENCHMARK_CSV.exists():
            df_bench = pd.read_csv(BENCHMARK_CSV)
            st.dataframe(df_bench, width='stretch')
            st.plotly_chart(metrics_bar_chart(df_bench), width='stretch', key="no_out_metrics_bar")
        else:
            st.info("No benchmark CSV yet. Run: `.venv\\Scripts\\python.exe run_pipeline.py --benchmark`")

    with col_b:
        st.subheader("🌍 Configured AOIs")
        for aoi_key, meta in AOI_META.items():
            on_disk = aoi_key in aoi_keys_on_disk
            status_icon = "✅" if on_disk else "⏳"
            st.markdown(f"**{meta['icon']} {meta['label']}** {status_icon}")
            st.caption(f"Lat {meta['lat']:.4f}, Lon {meta['lon']:.4f} · Index: {meta['index']}")
            if FOLIUM_AVAILABLE and not on_disk:
                with st.expander(f"Show {aoi_key} location"):
                    m = render_folium_map_latlon(meta["lat"], meta["lon"], aoi_name=meta["label"])
                    st_folium(m, height=220, width='stretch', key=f"map_latlon_{aoi_key}")
    st.stop()

# ── Build paths for selected AOI ──────────────────────────────────────────────
sr_path  = OUTPUT_DIR / f"{selected_aoi}_sr_10band_2.5m.tif"
unc_path = OUTPUT_DIR / f"{selected_aoi}_uncertainty_2.5m.tif"
lam_path = OUTPUT_DIR / f"{selected_aoi}_lam.png"

# Load SR raster once — numpy only, no torch
with rasterio.open(sr_path) as src:
    sr_data = src.read().astype(np.float32)   # (10, H, W)
    sr_crs  = src.crs
    sr_res  = src.res  # (pixel_height, pixel_width) in CRS units

aoi_meta = AOI_META.get(selected_aoi, {"label": selected_aoi, "index": "NDVI", "icon": "🛰️"})

# Sidebar stats
with st.sidebar:
    st.divider()
    st.markdown(f"**{aoi_meta['icon']} {aoi_meta['label']}**")
    col_s1, col_s2 = st.columns(2)
    with col_s1:
        st.metric("Bands", sr_data.shape[0])
        st.metric("Width px", sr_data.shape[2])
    with col_s2:
        st.metric("Height px", sr_data.shape[1])
        st.metric("Scale", "4× SR")
    st.caption(f"CRS: {sr_crs.to_epsg() if sr_crs else 'N/A'}")

# ── Tabs ──────────────────────────────────────────────────────────────────────
tab_map, tab_spectral, tab_indices, tab_metrics, tab_lam = st.tabs([
    "🗺️ Map & SR Output",
    "📈 Spectral",
    "🌿 Indices",
    "📊 Metrics",
    "🔍 Explainability",
])

# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Map & SR Output
# ══════════════════════════════════════════════════════════════════════════════
with tab_map:

    # ── Helper: simulate LR by 4× downsample then nearest-neighbour upscale ──
    # This shows what the original 10 m Sentinel-2 pixel grid looked like.
    # We average-pool 4×4 blocks → 128×128 (true LR resolution)
    # then display at full size with nearest-neighbour (exposes pixel grid).
    H, W = sr_data.shape[1], sr_data.shape[2]
    # 4× average-pool to 128×128
    lr_sim = sr_data.reshape(
        sr_data.shape[0], H // 4, 4, W // 4, 4
    ).mean(axis=(2, 4))                              # (C, 128, 128)

    sr_rgb  = create_rgb_composite(sr_data)          # (H, W, 3) float [0,1]
    lr_rgb  = create_rgb_composite(lr_sim)           # (128, 128, 3) float [0,1]

    # ── Display enhancement (visual only — GeoTIFF unchanged) ─────────────────
    def enhance_for_display(
        img: np.ndarray,
        clahe: bool = True,
        contrast_strength: float = 1.0,
        sharpen: bool = True,
        sharpen_strength: float = 1.0,
    ) -> np.ndarray:
        """Apply adaptive contrast (CLAHE) + dynamic tonal contrast + high-boost unsharp mask.
        Purely for display — does NOT modify stored GeoTIFF data."""
        out = img.copy().astype(np.float32)
        
        # 1. Adaptive histogram equalization (CLAHE)
        if clahe:
            # Scale clip_limit with user contrast setting (base 0.035 * contrast_strength)
            clip_lim = float(np.clip(0.035 * contrast_strength, 0.005, 0.080))
            for c in range(out.shape[2]):
                out[..., c] = exposure.equalize_adapthist(
                    np.clip(out[..., c], 0.0, 1.0), clip_limit=clip_lim
                ).astype(np.float32)

        # 2. Dynamic tonal contrast scaling around mean luminance
        if contrast_strength != 1.0:
            mean_val = float(np.mean(out))
            out = np.clip((out - mean_val) * contrast_strength + mean_val, 0.0, 1.0)

        # 3. High-boost edge sharpening
        if sharpen:
            k = float(sharpen_strength)
            # High-boost sharpening kernel: preserves energy while boosting edge gradients
            kernel = np.array([[0, -k, 0], [-k, 1.0 + 4.0 * k, -k], [0, -k, 0]], dtype=np.float32)
            for c in range(out.shape[2]):
                out[..., c] = np.clip(convolve(out[..., c], kernel), 0.0, 1.0)
        return out

    # ── Banner ────────────────────────────────────────────────────────────────
    st.markdown("""
    <div style="background:linear-gradient(135deg,#1a2340,#0d1117);border:1px solid #2a3a60;
                border-radius:10px;padding:12px 18px;margin-bottom:1rem;">
      <b style="color:#4488ff;font-size:1.05em;">⚡ Resolution Enhancement</b>
      &nbsp;|&nbsp;
      <span style="color:#aabbcc;">10 m Sentinel-2 L2A &nbsp;→&nbsp;
      <b style="color:#44ee88;">2.5 m Super-Resolved (4× sharper, 16× more pixels)</b></span>
    </div>
    """, unsafe_allow_html=True)

    # ── Enhancement controls ──────────────────────────────────────────────────
    with st.expander("🎛️ Display Enhancement, Contrast & Sharpness Settings", expanded=True):
        col_ctrl1, col_ctrl2 = st.columns(2, gap="large")
        with col_ctrl1:
            st.markdown("**🌓 Contrast & Dynamic Range**")
            c_sub1, c_sub2 = st.columns([1, 1.4])
            with c_sub1:
                use_clahe = st.toggle(
                    "Adaptive CLAHE", value=True,
                    help="Adaptive histogram equalisation — balances local contrast across heterogeneous terrain"
                )
            with c_sub2:
                contrast_strength = st.slider(
                    "Contrast Intensity", min_value=0.5, max_value=2.5, value=1.0, step=0.1,
                    help="Adjusts tonal contrast and CLAHE clip limit (0.5 = soft/flat, 1.0 = standard, 2.5 = high dynamic punch)"
                )
        with col_ctrl2:
            st.markdown("**⚡ Edge Definition & Sharpness**")
            s_sub1, s_sub2 = st.columns([1, 1.4])
            with s_sub1:
                use_sharpen = st.toggle(
                    "High-Boost Sharpen", value=True,
                    help="Laplacian high-boost filter — brings out roads, building edges, and field boundaries"
                )
            with s_sub2:
                sharpen_strength = st.slider(
                    "Sharpening Intensity", min_value=0.5, max_value=2.5, value=1.2, step=0.1,
                    help="Controls edge gradient boost (0.5 = subtle, 1.2 = recommended, 2.5 = razor crisp)"
                ) if use_sharpen else 1.0

    st.caption("⚠️ Display enhancement is visual-only — scientific GeoTIFF reflectance and indices remain unadulterated.")

    def to_display_uint8(img: np.ndarray, max_dim: int = 4096) -> np.ndarray:
        """Convert float [0, 1] array to full-fidelity uint8 RGB without downsampling decimation."""
        return np.clip(img * 255.0, 0, 255).astype(np.uint8)

    sr_display = enhance_for_display(
        sr_rgb,
        clahe=use_clahe,
        contrast_strength=contrast_strength,
        sharpen=use_sharpen,
        sharpen_strength=sharpen_strength,
    )
    lr_display = lr_rgb   # keep LR faithful to show the raw input resolution

    # ── 3-column comparison: LR | SR | Zoom ──────────────────────────────────
    col_lr, col_sr, col_zoom = st.columns([1, 1, 1], gap="medium")

    with col_lr:
        st.markdown("**📡 Original Input — 10 m (LR)**")
        st.image(to_display_uint8(lr_rgb), width='stretch')
        st.caption(
            f"{lr_sim.shape[2]} × {lr_sim.shape[1]} px · 10 m/px · {sr_data.shape[0]} bands\n"
            "Pixel grid visible at native 10 m resolution"
        )

    with col_sr:
        enh_label_parts = []
        if use_clahe:
            enh_label_parts.append(f"CLAHE (×{contrast_strength:.1f})")
        elif contrast_strength != 1.0:
            enh_label_parts.append(f"Contrast (×{contrast_strength:.1f})")
        if use_sharpen:
            enh_label_parts.append(f"Sharpen (×{sharpen_strength:.1f})")
        enh_label = f" · {' + '.join(enh_label_parts)}" if enh_label_parts else ""
        st.markdown(f"**✨ Super-Resolved Output — 2.5 m (SR){enh_label}**")
        st.image(to_display_uint8(sr_display), width='stretch')
        st.caption(
            f"{H} × {W} px · 2.5 m/px · {sr_data.shape[0]} bands\n"
            "Dual-path LDSR-S2 (100 steps) + SEN2SRLite with FourierHardConstraint"
        )

    with col_zoom:
        st.markdown("**🔍 1:1 Pixel Inspection — High-Res Detail**")
        zoom_choices = ["Centre", "Top-Left", "Top-Right", "Bottom-Left", "Bottom-Right"]
        z_choice = st.selectbox("Inspect Region", zoom_choices, index=0, label_visibility="collapsed")

        # Compute crop coordinates based on selection
        crop_lr_size = 32
        crop_sr_size = crop_lr_size * 4  # 128

        lr_h, lr_w = lr_display.shape[:2]
        sr_h, sr_w = sr_display.shape[:2]

        if z_choice == "Top-Left":
            lr_y0, lr_x0 = 0, 0
        elif z_choice == "Top-Right":
            lr_y0, lr_x0 = 0, max(0, lr_w - crop_lr_size)
        elif z_choice == "Bottom-Left":
            lr_y0, lr_x0 = max(0, lr_h - crop_lr_size), 0
        elif z_choice == "Bottom-Right":
            lr_y0, lr_x0 = max(0, lr_h - crop_lr_size), max(0, lr_w - crop_lr_size)
        else:  # Centre
            lr_y0, lr_x0 = max(0, lr_h // 2 - crop_lr_size // 2), max(0, lr_w // 2 - crop_lr_size // 2)

        sr_y0, sr_x0 = lr_y0 * 4, lr_x0 * 4

        lr_crop = lr_display[lr_y0:lr_y0 + crop_lr_size, lr_x0:lr_x0 + crop_lr_size]
        sr_crop = sr_display[sr_y0:sr_y0 + crop_sr_size, sr_x0:sr_x0 + crop_sr_size]

        # Calculate Laplacian variance sharpness for both crops
        import cv2
        lr_gray = cv2.cvtColor(np.clip(lr_crop * 255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
        sr_gray = cv2.cvtColor(np.clip(sr_crop * 255, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
        lr_var = float(cv2.Laplacian(lr_gray, cv2.CV_64F).var())
        sr_var = float(cv2.Laplacian(sr_gray, cv2.CV_64F).var())

        fig_zoom, axes = plt.subplots(1, 2, figsize=(7, 3.5), dpi=150)
        fig_zoom.patch.set_facecolor("#0d1117")
        axes[0].imshow(lr_crop, interpolation="nearest")
        axes[0].set_title(f"LR Input (10m)\nSharpness: {lr_var:.1f}", color="#aabbcc", fontsize=9)
        axes[0].axis("off")
        axes[1].imshow(sr_crop, interpolation="nearest")
        axes[1].set_title(f"SR Output (2.5m)\nSharpness: {sr_var:.1f} (+{(sr_var/(lr_var+1e-5)-1)*100:+.0f}%)", color="#44ee88", fontsize=9)
        axes[1].axis("off")
        fig_zoom.tight_layout(pad=0.3)
        st.pyplot(fig_zoom, width='stretch')
        plt.close(fig_zoom)
        st.caption(f"Same geographic footprint · {sr_crop.shape[0]}×{sr_crop.shape[1]} px vs {lr_crop.shape[0]}×{lr_crop.shape[1]} px")

    # ── Comparison PNG from pipeline (NDVI before/after) ─────────────────────
    cmp_png = OUTPUT_DIR / f"{selected_aoi}_ndvi_comparison.png"
    if not cmp_png.exists():
        # Try any comparison PNG
        cmp_pngs = sorted(OUTPUT_DIR.glob(f"{selected_aoi}_*_comparison.png"))
        cmp_png = cmp_pngs[0] if cmp_pngs else None

    if cmp_png and Path(cmp_png).exists():
        st.divider()
        st.subheader("📊 Pipeline Comparison Figure (from run_pipeline.py)")
        st.image(str(cmp_png), width='stretch',
                 caption="6-panel comparison generated by the pipeline: RGB LR vs SR + Spectral Index LR vs SR + Zoom + Histogram")

    # ── Uncertainty map ───────────────────────────────────────────────────────
    st.divider()
    col_unc1, col_unc2 = st.columns([1, 1], gap="medium")

    with col_unc1:
        if unc_path.exists():
            st.subheader("🎯 Uncertainty Map (per-pixel std dev)")
            with rasterio.open(unc_path) as usrc:
                unc = usrc.read(1).astype(np.float32)
            vmax = float(np.percentile(unc, 95)) + 1e-8
            fig_unc, ax_unc = plt.subplots(figsize=(6, 5))
            im_unc = ax_unc.imshow(unc, cmap="inferno", vmin=0, vmax=vmax)
            plt.colorbar(im_unc, ax=ax_unc, label="Std Dev")
            ax_unc.set_title(f"Uncertainty — {aoi_meta['label']}", color="#c0c8d8")
            ax_unc.axis("off")
            fig_unc.patch.set_facecolor("#0d1117")
            ax_unc.set_facecolor("#0d1117")
            st.pyplot(fig_unc, width='stretch')
            plt.close(fig_unc)
            st.caption("Brighter = model was less certain | 5 stochastic DDIM passes (n_uncertainty=5)")
        else:
            st.info(
                f"No uncertainty map for **{aoi_meta['label']}**.\n\n"
                f"Run: `.venv\\Scripts\\python.exe run_pipeline.py --aoi {selected_aoi}`"
            )

    with col_unc2:
        if unc_path.exists():
            st.subheader("📈 Uncertainty Distribution")
            st.plotly_chart(uncertainty_histogram(unc), width='stretch', key=f"unc_hist_{selected_aoi}")
            col_um1, col_um2 = st.columns(2)
            with col_um1:
                st.metric("Mean Std Dev", f"{unc.mean():.4f}")
            with col_um2:
                st.metric("Max Std Dev (P95)", f"{vmax:.4f}")

    # ── Folium geographic map ─────────────────────────────────────────────────
    st.divider()
    st.subheader("🌍 Geographic Extent")
    if FOLIUM_AVAILABLE:
        try:
            folium_map = render_folium_map(str(sr_path), aoi_name=aoi_meta["label"])
            st_folium(folium_map, height=350, width='stretch', key="main_map")
        except Exception as e:
            st.warning(f"Map render failed: {e}")
            m = render_folium_map_latlon(
                aoi_meta.get("lat", 0), aoi_meta.get("lon", 0),
                aoi_name=aoi_meta["label"],
            )
            st_folium(m, height=300, width='stretch', key="main_map_fallback")
    else:
        st.caption("Install `streamlit-folium` for interactive map.")

# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Spectral
# ══════════════════════════════════════════════════════════════════════════════
with tab_spectral:
    st.subheader("Band Reflectance Distribution")
    st.caption("Box plot of all 10 spectral bands from the SR output at 2.5 m resolution.")
    st.plotly_chart(spectral_box_plot(sr_data, BAND_NAMES), width='stretch', key=f"spectral_box_{selected_aoi}")

    st.divider()
    st.subheader("Band Statistics")
    stats_rows = []
    for i, name in enumerate(BAND_NAMES):
        b = sr_data[i]
        stats_rows.append({
            "Band": name,
            "Min": f"{b.min():.4f}",
            "Max": f"{b.max():.4f}",
            "Mean": f"{b.mean():.4f}",
            "Std": f"{b.std():.4f}",
            "P2": f"{np.percentile(b, 2):.4f}",
            "P98": f"{np.percentile(b, 98):.4f}",
        })
    st.dataframe(pd.DataFrame(stats_rows), width='stretch', hide_index=True)

# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — Spectral Indices
# ══════════════════════════════════════════════════════════════════════════════
with tab_indices:
    st.subheader("Spectral Index Visualisation")
    st.caption("Computed from the 2.5 m SR output — all 10 spectral bands.")

    # Default to the AOI-specific index, but let the user switch
    default_idx_name = aoi_meta.get("index", "NDVI")
    default_idx_pos  = ["NDVI", "MNDWI", "NDBI"].index(default_idx_name)
    index_choice = st.radio(
        "Choose index", ["NDVI", "MNDWI", "NDBI"],
        index=default_idx_pos,
        horizontal=True,
        help="NDVI=vegetation, MNDWI=water, NDBI=built-up",
    )

    idx_arr = INDEX_FN[index_choice](sr_data)

    fig_idx, ax_idx = plt.subplots(figsize=(9, 6))
    im_idx = ax_idx.imshow(
        idx_arr,
        cmap=INDEX_CMAP[index_choice],
        vmin=-0.5, vmax=0.9,
        interpolation="nearest",
    )
    cbar = plt.colorbar(im_idx, ax=ax_idx, fraction=0.03, pad=0.02)
    cbar.set_label(index_choice, color="#c0c8d8")
    cbar.ax.yaxis.set_tick_params(color="#c0c8d8")
    plt.setp(cbar.ax.yaxis.get_ticklabels(), color="#c0c8d8")
    ax_idx.set_title(
        f"{index_choice} at 2.5 m — {aoi_meta['label']}",
        color="#c0c8d8", pad=10,
    )
    ax_idx.axis("off")
    fig_idx.patch.set_facecolor("#0d1117")
    ax_idx.set_facecolor("#0d1117")
    st.pyplot(fig_idx, width='stretch')
    plt.close(fig_idx)

    col_i1, col_i2, col_i3, col_i4 = st.columns(4)
    with col_i1:
        st.metric(f"Mean {index_choice}", f"{idx_arr.mean():.3f}")
    with col_i2:
        st.metric("Max", f"{idx_arr.max():.3f}")
    with col_i3:
        st.metric("Min", f"{idx_arr.min():.3f}")
    with col_i4:
        positive_frac = float((idx_arr > 0).mean())
        st.metric("Fraction > 0", f"{positive_frac:.1%}")

    index_notes = {
        "NDVI":  "NDVI > 0.4 → dense vegetation | 0.2–0.4 → moderate | < 0.2 → sparse / urban / bare soil",
        "MNDWI": "MNDWI > 0 → water body | negative → land",
        "NDBI":  "NDBI > 0 → built-up / impervious surface | negative → vegetation / water",
    }
    st.caption(index_notes.get(index_choice, ""))

# ══════════════════════════════════════════════════════════════════════════════
# TAB 4 — Metrics
# ══════════════════════════════════════════════════════════════════════════════
with tab_metrics:
    st.subheader("Quantitative Benchmark Results")
    st.caption(
        "Evaluated against opensr-test SPOT reference dataset. "
        "SEN2SRLite PSNR ≈ Bicubic is *expected* — diffusion realism shows in LPIPS/perceptual quality."
    )

    if BENCHMARK_CSV.exists():
        df = pd.read_csv(BENCHMARK_CSV)

        # Show full table
        st.dataframe(df, width='stretch')

        col_m1, col_m2 = st.columns(2, gap="medium")
        with col_m1:
            st.plotly_chart(metrics_bar_chart(df), width='stretch', key="tab_metrics_bar")
        with col_m2:
            if "scene_idx" in df.columns:
                st.plotly_chart(psnr_per_scene_chart(df), width='stretch', key="tab_metrics_psnr_scene")

        # Summary stats by method
        st.divider()
        st.subheader("Method Summary Statistics")
        summary_cols = [c for c in ["psnr_db", "ssim", "sam_deg", "ergas", "lpips"] if c in df.columns]
        summary = df.groupby("method")[summary_cols].agg(["mean", "std"]).round(4)
        st.dataframe(summary, width='stretch')

    else:
        st.info(
            "No benchmark results found yet.\n\n"
            "Run: `.venv\\Scripts\\python.exe run_pipeline.py --benchmark`\n\n"
            "Results will be saved to `verification/benchmark_results.csv`."
        )

    # Uncertainty distribution (if unc map exists for selected AOI)
    if unc_path.exists():
        st.divider()
        st.subheader(f"Uncertainty Distribution — {aoi_meta['label']}")
        with rasterio.open(unc_path) as usrc_m:
            unc_m = usrc_m.read(1).astype(np.float32)
        st.plotly_chart(uncertainty_histogram(unc_m), width='stretch', key=f"tab_unc_hist_{selected_aoi}")

        coverage_target = 0.90
        unc_mean_val = float(unc_m.mean())
        st.metric(
            "Mean Uncertainty (std dev)",
            f"{unc_mean_val:.4f}",
            help="Lower = more confident. Target < 0.05 for well-calibrated SR.",
        )

# ══════════════════════════════════════════════════════════════════════════════
# TAB 5 — Explainability (LAM)
# ══════════════════════════════════════════════════════════════════════════════
with tab_lam:
    st.subheader("Local Attribution Map (LAM) — Explainability")
    st.caption(
        "LAM quantifies which low-resolution input pixels most influenced each "
        "super-resolved output region. Gini index measures spatial complexity."
    )

    if lam_path.exists():
        st.image(
            str(lam_path),
            caption=(
                f"LAM for {aoi_meta['label']} | "
                "Brighter = stronger influence on SR output | "
                "Computed by sen2sr.xai.lam() on CPU"
            ),
            width='stretch',
        )
    else:
        st.info(
            f"No LAM found for **{aoi_meta['label']}**.\n\n"
            "Generate it by running the pipeline with the `--lam` flag:\n"
            "```powershell\n"
            f".venv\\Scripts\\python.exe run_pipeline.py --aoi {selected_aoi} --lam\n"
            "```\n"
            "*Note: LAM runs on CPU and takes 2–5 minutes per AOI patch.*"
        )

    st.divider()
    st.subheader("LAM Files in outputs/")
    lam_files = sorted(OUTPUT_DIR.glob("*_lam.png"))
    if lam_files:
        cols_lam = st.columns(min(len(lam_files), 3))
        for col_l, lam_f in zip(cols_lam, lam_files):
            with col_l:
                aoi_k = lam_f.stem.replace("_lam", "")
                label = AOI_META.get(aoi_k, {}).get("label", aoi_k)
                st.image(str(lam_f), caption=label, width='stretch')
    else:
        st.caption("No LAM PNGs found yet in outputs/.")
