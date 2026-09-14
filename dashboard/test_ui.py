"""SRM Pipeline — Testing Dashboard
Runs on localhost:8501 via: .venv\Scripts\streamlit.exe run dashboard/test_ui.py
Shows live status of all pipeline components, test suite, and metric checks.
"""

import subprocess
import sys
import time
from pathlib import Path
import numpy as np
import streamlit as st

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="SRM Pipeline — Test Dashboard",
    page_icon="🛰️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── CSS ───────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  .main { background: #0e1117; }
  .stMetric { background: #1c1f26; border-radius: 8px; padding: 12px; }
  .pass-badge { color: #00e676; font-weight: bold; font-size: 1.1em; }
  .fail-badge { color: #ff5252; font-weight: bold; font-size: 1.1em; }
  .warn-badge { color: #ffab40; font-weight: bold; font-size: 1.1em; }
  .section-title { color: #82b1ff; font-size: 1.2em; font-weight: bold; margin-top: 1em; }
  h1 { color: #82b1ff; }
  h2 { color: #b0bec5; }
</style>
""", unsafe_allow_html=True)

ROOT = Path(__file__).parent.parent

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.image("https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Sentinel-2.jpg/320px-Sentinel-2.jpg", use_container_width=True)
    st.markdown("## 🛰️ SRM Pipeline")
    st.markdown("**Status Dashboard**")
    st.divider()
    st.markdown("**Environment**")
    st.code(f"Python {sys.version.split()[0]}\nCWD: {ROOT.name}", language="text")
    st.divider()
    st.markdown("**Tasks Completed**")
    tasks = {
        "Task 0 — Vendor + Models": True,
        "Task 1 — referencex4 SWIR": True,
        "Task 2 — Explainability (LAM)": True,
        "Task 3 — LPIPS + ERGAS": True,
        "Task 4 — run_pipeline --lam": False,
        "Task 5 — Dashboard": False,
    }
    for task, done in tasks.items():
        icon = "✅" if done else "🔲"
        st.markdown(f"{icon} {task}")

# ── Header ────────────────────────────────────────────────────────────────────
st.title("🛰️ SRM Pipeline — Test & Status Dashboard")
st.caption("Verify all pipeline components are working without touching the terminal.")
st.divider()

# ── TAB LAYOUT ────────────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4 = st.tabs(["🧪 Test Suite", "📦 Imports", "📊 Metrics Live Check", "📁 Model Files"])

# ────────────────────────────────────────────────────────────────────────────
# TAB 1 — TEST SUITE
# ────────────────────────────────────────────────────────────────────────────
with tab1:
    st.markdown("### Run `pytest tests/ -v` and see results here")
    col_run, col_info = st.columns([1, 3])
    with col_run:
        run_tests = st.button("▶️ Run All Tests", type="primary", use_container_width=True)
    with col_info:
        st.info("Runs all 20 tests. Takes ~20 seconds. Warnings are expected and harmless.")

    if run_tests:
        with st.spinner("Running pytest..."):
            t0 = time.time()
            result = subprocess.run(
                [sys.executable, "-m", "pytest", "tests/", "-v", "--tb=short", "--no-header"],
                capture_output=True,
                text=True,
                cwd=str(ROOT),
            )
            elapsed = time.time() - t0

        output = result.stdout + result.stderr
        lines = output.splitlines()

        passed = sum(1 for l in lines if "PASSED" in l)
        failed = sum(1 for l in lines if "FAILED" in l)
        errors = sum(1 for l in lines if "ERROR" in l)

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("✅ Passed", passed)
        c2.metric("❌ Failed", failed)
        c3.metric("💥 Errors", errors)
        c4.metric("⏱️ Time", f"{elapsed:.1f}s")

        if result.returncode == 0:
            st.success(f"**All {passed} tests passed in {elapsed:.1f}s** — pipeline is healthy.")
        else:
            st.error(f"**{failed} test(s) failed.** See details below.")

        # Show test-by-test results
        st.markdown("#### Results")
        for line in lines:
            if "PASSED" in line:
                name = line.split("::")[1].split(" ")[0] if "::" in line else line
                st.markdown(f'<span class="pass-badge">✅ PASS</span> `{name}`', unsafe_allow_html=True)
            elif "FAILED" in line:
                name = line.split("::")[1].split(" ")[0] if "::" in line else line
                st.markdown(f'<span class="fail-badge">❌ FAIL</span> `{name}`', unsafe_allow_html=True)

        with st.expander("📋 Full pytest output"):
            st.code(output, language="text")

# ────────────────────────────────────────────────────────────────────────────
# TAB 2 — IMPORTS
# ────────────────────────────────────────────────────────────────────────────
with tab2:
    st.markdown("### Module Import Status")
    st.caption("Checks every SRM and vendor import is resolving to the correct source.")

    if st.button("🔍 Check All Imports", type="primary"):
        checks = {
            "srm.sr_pipeline → DualPathSRPipeline": "from srm.sr_pipeline import DualPathSRPipeline",
            "srm.explainability → compute_lam": "from srm.explainability import compute_lam",
            "srm.validation → compute_ergas": "from srm.validation import compute_ergas",
            "srm.validation → compute_lpips": "from srm.validation import compute_lpips",
            "srm.validation → check_uncertainty_calibration": "from srm.validation import check_uncertainty_calibration",
            "opensr_model (vendor)": "import opensr_model; assert 'vendor' in opensr_model.__file__",
            "sen2sr (vendor)": "import sen2sr; assert 'vendor' in sen2sr.__file__",
            "sen2sr.xai.lam": "from sen2sr.xai import lam",
            "sen2sr.referencex4": "from sen2sr import referencex4",
            "mlstac": "import mlstac",
            "torch": "import torch",
            "rasterio": "import rasterio",
            "lpips": "import lpips",
        }

        results = []
        for label, stmt in checks.items():
            res = subprocess.run(
                [sys.executable, "-c", stmt],
                capture_output=True, text=True, cwd=str(ROOT)
            )
            results.append((label, res.returncode == 0, res.stderr.strip()))

        ok = sum(1 for _, s, _ in results if s)
        fail = len(results) - ok
        c1, c2 = st.columns(2)
        c1.metric("✅ OK", ok)
        c2.metric("❌ Failed", fail)

        for label, success, err in results:
            if success:
                st.markdown(f'<span class="pass-badge">✅</span> `{label}`', unsafe_allow_html=True)
            else:
                st.markdown(f'<span class="fail-badge">❌</span> `{label}`', unsafe_allow_html=True)
                if err:
                    st.code(err[:300], language="text")

# ────────────────────────────────────────────────────────────────────────────
# TAB 3 — METRICS LIVE CHECK
# ────────────────────────────────────────────────────────────────────────────
with tab3:
    st.markdown("### Live Metric Computations")
    st.caption("Computes PSNR, SSIM, SAM, ERGAS, and uncertainty calibration on random tensors.")

    c1, c2 = st.columns(2)
    with c1:
        h = st.slider("Patch H", 16, 128, 64, 16)
        bands = st.slider("Bands", 1, 10, 4)
    with c2:
        noise = st.slider("Noise level (0=identical)", 0.0, 0.5, 0.1, 0.05)
        scale = st.selectbox("SR Scale", [2, 4], index=1)

    if st.button("📊 Compute Metrics", type="primary"):
        from srm.validation import compute_psnr, compute_ssim, compute_sam, compute_ergas, check_uncertainty_calibration

        rng = np.random.default_rng(42)
        ref = rng.random((bands, h, h), dtype=np.float32) * 0.5 + 0.25
        sr  = np.clip(ref + rng.normal(0, noise, ref.shape).astype(np.float32), 0, 1)
        std = np.ones((1, h, h), dtype=np.float32) * noise * 2

        psnr  = compute_psnr(ref, sr)
        ssim  = compute_ssim(ref, sr)
        sam   = compute_sam(ref, sr)
        ergas = compute_ergas(ref, sr, scale=scale)
        calib = check_uncertainty_calibration(ref, sr, std)

        c1, c2, c3 = st.columns(3)
        c1.metric("PSNR (dB)", f"{psnr:.2f}", help="Higher is better. Benchmark: 21-24 dB")
        c2.metric("SSIM", f"{ssim:.4f}", help="Higher is better. Max = 1.0")
        c3.metric("SAM (°)", f"{sam:.2f}", help="Lower is better. < 5° is excellent")

        c4, c5 = st.columns(2)
        c4.metric("ERGAS", f"{ergas:.3f}", help="Lower is better. Target < 3")
        c5.metric("Uncertainty Calibration", f"{calib:.3f}", help="Target ≥ 0.90")

        # Gauges as progress bars
        st.markdown("#### Quick Health")
        st.progress(min(psnr / 40.0, 1.0), text=f"PSNR: {psnr:.1f} dB")
        st.progress(float(ssim), text=f"SSIM: {ssim:.4f}")
        st.progress(min(float(calib), 1.0), text=f"Calibration: {calib:.3f}")

        if noise == 0:
            st.success("🎯 Zero noise — all metrics at perfect values (ERGAS=0, SSIM=1.0)")
        elif psnr > 30:
            st.success("✅ Metrics look healthy for this noise level.")
        else:
            st.warning("⚠️ PSNR below 30 dB — expected for high noise. Real SR targets 21-24 dB vs SPOT reference.")

# ────────────────────────────────────────────────────────────────────────────
# TAB 4 — MODEL FILES
# ────────────────────────────────────────────────────────────────────────────
with tab4:
    st.markdown("### Model Weight Files on Disk")

    model_dirs = {
        "SEN2SRLite": ROOT / "model" / "SEN2SRLite",
        "SEN2SRLite_RGBN": ROOT / "model" / "SEN2SRLite_RGBN",
        "SEN2SRLite_Reference_RSWIR_x2": ROOT / "model" / "SEN2SRLite_Reference_RSWIR_x2",
        "SEN2SRLite_Reference_RSWIR_x4 (not on HF)": ROOT / "model" / "SEN2SRLite_Reference_RSWIR_x4",
        "opensr-ldsrs2_v1_0_0.ckpt (1.13 GB)": ROOT / "opensr-ldsrs2_v1_0_0.ckpt",
    }

    for name, path in model_dirs.items():
        if path.is_dir():
            files = list(path.iterdir())
            size_mb = sum(f.stat().st_size for f in files if f.is_file()) / 1e6
            if files:
                st.markdown(f'<span class="pass-badge">✅</span> **{name}** — {len(files)} files, {size_mb:.1f} MB', unsafe_allow_html=True)
            else:
                st.markdown(f'<span class="warn-badge">⚠️</span> **{name}** — Empty directory (x4 not published on HuggingFace)', unsafe_allow_html=True)
        elif path.is_file():
            size_mb = path.stat().st_size / 1e6
            st.markdown(f'<span class="pass-badge">✅</span> **{name}** — {size_mb:.0f} MB', unsafe_allow_html=True)
        else:
            st.markdown(f'<span class="fail-badge">❌</span> **{name}** — Not found', unsafe_allow_html=True)

    st.divider()
    st.markdown("### Vendor Repos")
    vendors = {
        "vendor/opensr-model": ROOT / "vendor" / "opensr-model",
        "vendor/sen2sr": ROOT / "vendor" / "sen2sr",
    }
    for name, path in vendors.items():
        if path.is_dir():
            st.markdown(f'<span class="pass-badge">✅</span> `{name}` present', unsafe_allow_html=True)
        else:
            st.markdown(f'<span class="fail-badge">❌</span> `{name}` missing — run Task 0 setup', unsafe_allow_html=True)
