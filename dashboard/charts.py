"""Reusable Plotly chart builders for the SRM Streamlit dashboard.

No models, no tensors, no CUDA. Pure data -> Plotly figures.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def spectral_box_plot(sr_data: np.ndarray, band_names: list) -> go.Figure:
    """Box plot of per-band reflectance distribution in the SR output.

    Args:
        sr_data: Array of shape (C, H, W) -- C = number of bands.
        band_names: List of band name strings, length == C.

    Returns:
        Plotly Figure.
    """
    fig = go.Figure()
    colours = [
        "#4488ff", "#44bb55", "#ee4444", "#aa44bb",
        "#ff8844", "#ffcc00", "#44ddcc", "#cc44ff",
        "#884400", "#cc8844",
    ]
    for i, name in enumerate(band_names):
        colour = colours[i % len(colours)]
        band_flat = sr_data[i].flatten()
        if len(band_flat) > 20000:
            step = max(1, len(band_flat) // 20000)
            band_flat = band_flat[::step]
        fig.add_trace(go.Box(
            y=band_flat,
            name=name,
            boxpoints=False,
            marker_color=colour,
            line_color=colour,
        ))
    fig.update_layout(
        title="Band Reflectance Distribution (SR output)",
        yaxis_title="Reflectance [0 - 1]",
        height=420,
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False,
    )
    return fig


def metrics_bar_chart(df: pd.DataFrame) -> go.Figure:
    """Grouped bar chart comparing PSNR, SSIM, SAM (and ERGAS if present) by method.

    Args:
        df: DataFrame with columns at minimum: method, psnr_db, ssim, sam_deg.
            Optional: ergas, lpips.

    Returns:
        Plotly Figure with subplots, one per metric.
    """
    methods = df["method"].unique().tolist()

    metric_cols = [
        ("psnr_db",  "PSNR (dB)",  "higher better",  "up"),
        ("ssim",     "SSIM",        "higher better",  "up"),
        ("sam_deg",  "SAM (deg)",   "lower better",   "dn"),
    ]
    if "ergas" in df.columns and df["ergas"].notna().any():
        metric_cols.append(("ergas", "ERGAS", "lower better", "dn"))
    if "lpips" in df.columns and df["lpips"].notna().any():
        metric_cols.append(("lpips", "LPIPS", "lower better", "dn"))

    n_metrics = len(metric_cols)
    fig = make_subplots(
        rows=1, cols=n_metrics,
        subplot_titles=[m[1] for m in metric_cols],
        shared_yaxes=False,
    )

    palette = ["#4488ff", "#ff6644", "#44cc77", "#ffcc00", "#cc44ff"]
    for col_idx, (col_name, label, _, _arrow) in enumerate(metric_cols, start=1):
        for m_idx, method in enumerate(methods):
            grp = df[df["method"] == method][col_name].dropna()
            if grp.empty:
                continue
            colour = palette[m_idx % len(palette)]
            fig.add_trace(
                go.Bar(
                    name=method,
                    x=[label],
                    y=[grp.mean()],
                    error_y=dict(type="data", array=[grp.std()], visible=True),
                    marker_color=colour,
                    showlegend=(col_idx == 1),
                ),
                row=1, col=col_idx,
            )

    fig.update_layout(
        title="Benchmark: Method Comparison",
        barmode="group",
        height=420,
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", yanchor="bottom", y=1.08, xanchor="right", x=1),
    )
    return fig


def uncertainty_histogram(unc_data: np.ndarray) -> go.Figure:
    """Histogram of per-pixel uncertainty (std-dev) values.

    Args:
        unc_data: Array of any shape -- will be flattened.

    Returns:
        Plotly Figure.
    """
    vals = unc_data.flatten()
    if len(vals) > 50000:
        step = max(1, len(vals) // 50000)
        vals = vals[::step]
    p99 = float(np.percentile(vals, 99))
    vals_clipped = vals[vals <= p99 * 1.5]

    fig = go.Figure(go.Histogram(
        x=vals_clipped,
        nbinsx=60,
        marker_color="#ff8844",
        opacity=0.85,
    ))
    fig.update_layout(
        title="Uncertainty Distribution (per-pixel std dev)",
        xaxis_title="Std Dev",
        yaxis_title="Pixel Count",
        height=320,
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return fig


def psnr_per_scene_chart(df: pd.DataFrame) -> go.Figure:
    """Line chart showing PSNR vs scene index, per method.

    Args:
        df: DataFrame with columns: method, scene_idx, psnr_db.

    Returns:
        Plotly Figure.
    """
    fig = go.Figure()
    palette = ["#4488ff", "#ff6644", "#44cc77"]
    for m_idx, (method, grp) in enumerate(df.groupby("method")):
        grp_sorted = grp.sort_values("scene_idx")
        colour = palette[m_idx % len(palette)]
        fig.add_trace(go.Scatter(
            x=grp_sorted["scene_idx"],
            y=grp_sorted["psnr_db"],
            mode="lines+markers",
            name=method,
            line=dict(color=colour, width=2),
            marker=dict(size=6),
        ))
    fig.update_layout(
        title="PSNR per Scene",
        xaxis_title="Scene Index",
        yaxis_title="PSNR (dB)",
        height=320,
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return fig
