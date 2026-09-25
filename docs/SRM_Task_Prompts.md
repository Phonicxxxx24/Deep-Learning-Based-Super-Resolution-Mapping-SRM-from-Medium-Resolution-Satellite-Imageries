# SRM — Task Prompts
## Paste one task at a time into Claude Code / Cursor. Do tasks in order.

---

## HARDWARE CONTEXT — READ BEFORE ANYTHING

**Your machine: RTX 3050 6GB VRAM, 16GB RAM**

This matters for every task. Rules the agent must follow throughout:

- **Never set `device="cuda"` without a CUDA OOM try/except fallback** — 6GB fills fast
- **Never set `n_uncertainty` above 5** for local runs — 25 passes will take 30+ minutes
- **Never set `sampling_steps` above 50** for local runs — 100 steps OOMs on 6GB
- **Never run LDSR-S2 on patches larger than 128×128** — bigger patches OOM
- **Always call `torch.cuda.empty_cache()` after each inference block**
- **LAM always runs on CPU** — move model to CPU before calling compute_lam
- **SEN2SRLite is the reliable path** — LDSR-S2 may OOM, fallback must always work

These are not suggestions. Every code block in every task must respect these limits.

---

## BEFORE ANY TASK — Run This First

```bash
# Confirm baseline — all 13 tests must pass before you touch anything
pytest tests/ -v

# If any test fails before you start, fix that first
```

---

## TASK 0 — Vendor Setup + Config (Do This Yourself, No Agent)

### Part A — Clone and install vendor repos

```bash
mkdir -p vendor
git clone https://github.com/ESAOpenSR/opensr-model vendor/opensr-model --depth 1
git clone https://github.com/ESAOpenSR/sen2sr vendor/sen2sr --depth 1

# Strip junk to save disk space
rm -rf vendor/opensr-model/deployment vendor/opensr-model/docs vendor/opensr-model/.github
rm -rf vendor/sen2sr/notebooks vendor/sen2sr/.github vendor/sen2sr/docs

# Keep vendor out of git
echo "vendor/" >> .gitignore

# Install editable — overrides pip-installed versions
pip install -e vendor/opensr-model
pip install -e vendor/sen2sr

# Verify both resolve to vendor/
python -c "import opensr_model; print(opensr_model.__file__)"
# Must print: .../vendor/opensr-model/...

python -c "import sen2sr; print(sen2sr.__file__)"
# Must print: .../vendor/sen2sr/...

# Verify internal APIs are accessible
python -c "from sen2sr import referencex4; print('referencex4 OK')"
python -c "from sen2sr.xai import lam; print('lam OK')"
```

**Stop here if any check fails. Fix the import before continuing.**

### Part B — Download all four models

```bash
python -c "
import mlstac

mlstac.download(
  file='https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/main/mlm.json',
  output_dir='model/SEN2SRLite',
)
mlstac.download(
  file='https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/NonReference_RGBN_x4/mlm.json',
  output_dir='model/SEN2SRLite_RGBN',
)
mlstac.download(
  file='https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/Reference_RSWIR_x2/mlm.json',
  output_dir='model/SEN2SRLite_Reference_RSWIR_x2',
)
mlstac.download(
  file='https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/Reference_RSWIR_x4/mlm.json',
  output_dir='model/SEN2SRLite_Reference_RSWIR_x4',
)
print('All four models downloaded.')
"
```

### Part C — Set hardware-safe config values

Open `configs/srm_config.yaml` (or `configs/pipeline_config.yaml` — whichever exists) and make sure these values are set:

```yaml
device: "cuda"          # pipeline will fall back to cpu on OOM
n_uncertainty: 5        # NOT 25 — 25 passes OOM on 6GB VRAM
sampling_steps: 50      # NOT 100 — 50 steps fit in 6GB
eta: 0.95
patch_size: 128         # hard limit — do not increase
overlap: 32
```

**Done when:** All four verify checks pass, all four model dirs exist under `model/`, config values updated.

---

## TASK 1 — Add referencex4 SWIR Path to sr_pipeline.py

**Paste this entire block into Claude Code:**

---

You are modifying one existing file: `srm/sr_pipeline.py`

**Hardware constraint — RTX 3050 6GB VRAM:**
- All CUDA calls must be wrapped in try/except RuntimeError with OOM detection
- Call `torch.cuda.empty_cache()` after every inference block
- Never increase patch size beyond 128
- SEN2SRLite direct call is the fallback — it must always work even if referencex4 fails

**Step 1 — Read these files before writing any code:**
- `vendor/sen2sr/sen2sr/referencex4.py` — read `srmodel()` signature exactly. It takes four model arguments: `sr_model`, `f2_model`, `reference_model_x4`, `reference_model_hard_constraint_x4`, `device`. Confirm before writing.
- `srm/sr_pipeline.py` — understand existing `__init__` and `run_inference` fully.

**Step 2 — Add one new parameter to `DualPathSRPipeline.__init__`:**

```python
use_referencex4: bool = True
```

**Step 3 — After `self.model_sen2sr` is loaded, add this block:**

```python
# Load referencex4 SWIR fusion pipeline
# Hardware note: all four models loaded to same device as main model
self.referencex4_pipeline = None
if use_referencex4:
    try:
        from sen2sr import referencex4

        # f2 model: 20m SWIR bands → 10m
        f2_dir = os.path.join(
            os.path.dirname(sen2sr_model_dir), "SEN2SRLite_Reference_RSWIR_x2"
        )
        f2_compiled = mlstac.load(f2_dir).compiled_model(device=str(self.device))

        # f4 fusion model: SWIR 10m → 2.5m
        f4_dir = os.path.join(
            os.path.dirname(sen2sr_model_dir), "SEN2SRLite_Reference_RSWIR_x4"
        )
        f4_compiled = mlstac.load(f4_dir).compiled_model(device=str(self.device))

        # compiled_model() returns SRModelWithConstraint with:
        #   .sr_model        — raw nn.Module
        #   .hard_constraint — HardConstraint nn.Module
        # If these attribute names do not exist, print dir(f4_compiled) and
        # use whatever names appear — do not guess.
        self.referencex4_pipeline = referencex4.srmodel(
            sr_model=self.model_sen2sr.sr_model,
            f2_model=f2_compiled.sr_model,
            reference_model_x4=f4_compiled.sr_model,
            reference_model_hard_constraint_x4=f4_compiled.hard_constraint,
            device=str(self.device),
        )
        logger.info("referencex4 pipeline loaded successfully.")
    except Exception as exc:
        logger.warning(
            "referencex4 load failed — falling back to direct SEN2SRLite: %s", exc
        )
        self.referencex4_pipeline = None
```

**Step 4 — Modify Path B in `run_inference` with OOM guard:**

Replace:
```python
sr_sen2sr = self.model_sen2sr(lr_gpu)
```

With:
```python
try:
    if self.referencex4_pipeline is not None:
        sr_sen2sr = self.referencex4_pipeline(lr_gpu)
    else:
        sr_sen2sr = self.model_sen2sr(lr_gpu)
except RuntimeError as e:
    if "out of memory" in str(e).lower():
        logger.warning("CUDA OOM in SEN2SRLite path — clearing cache and retrying on CPU")
        torch.cuda.empty_cache()
        sr_sen2sr = self.model_sen2sr.cpu()(lr_gpu.cpu())
        sr_sen2sr = sr_sen2sr.to(self.device)
    else:
        raise

# Always clear cache after inference on 6GB GPU
if self.device != "cpu":
    torch.cuda.empty_cache()
```

**Step 5 — Add OOM guard to LDSR-S2 path as well:**

Find the LDSR-S2 forward call and wrap it:
```python
try:
    sr_rgbn = ldsr.forward(X_rgbn, sampling_steps=sampling_steps,
                           spectral_correction=True)
except RuntimeError as e:
    if "out of memory" in str(e).lower():
        logger.warning("CUDA OOM in LDSR-S2 — skipping diffusion, using SEN2SRLite output for RGB+NIR")
        torch.cuda.empty_cache()
        sr_rgbn = None   # handled below in band fusion
    else:
        raise

if self.device != "cpu":
    torch.cuda.empty_cache()
```

In `fuse_bands`, handle `sr_rgbn=None` by keeping the sen2sr RGB+NIR bands unchanged.

**Step 6 — Do NOT change anything else.**
- Do not change `_extract_rgbn`
- Do not change the final HardConstraint call
- Do not change any other file

**Step 7 — Verify (CPU only — no GPU needed for test):**
```bash
pytest tests/ -v
# All existing tests must still pass

python -c "
from srm.sr_pipeline import DualPathSRPipeline
import torch
# Test on CPU only — safe on any machine
p = DualPathSRPipeline(device='cpu', use_referencex4=False)
x = torch.rand(1, 10, 128, 128)
out = p.run_inference(x, aoi_name='test')
assert out['sr_final'].shape == (1, 10, 512, 512), f'Wrong shape: {out[\"sr_final\"].shape}'
print('TASK 1 PASS')
"
```

---

## TASK 2 — Create srm/explainability.py

**Paste this entire block into Claude Code:**

---

You are creating one new file: `srm/explainability.py`

**Hardware constraint — RTX 3050 6GB VRAM:**
- LAM MUST run on CPU — the model must be moved to CPU before calling lam()
- LAM is slow on CPU (2-5 min per patch) — this is expected and acceptable
- Never move the model back to CUDA inside this file — caller handles that

**Step 1 — Read before writing:**
- `vendor/sen2sr/sen2sr/xai/lam.py` — confirm exact signature and return types

Confirmed signature:
```python
def lam(
    X: torch.Tensor,        # (Bands, H, W) — no batch dim, must be on CPU
    model: torch.nn.Module, # must be on CPU
    h: int = 240,
    w: int = 240,
    window: int = 32,
    scales: list = ["1x", "2x", "3x", "4x", "5x", "6x", "7x", "8x"],
) -> Tuple[np.ndarray, float, float, np.ndarray]:
    # returns: (kde_map, complexity_metric, robustness_metric, robustness_vector)
    # kde_map is np.ndarray NOT torch.Tensor
```

**Step 2 — Create `srm/explainability.py`:**

```python
"""LAM explainability wrapper from sen2sr.xai.lam.

Hardware note: LAM always runs on CPU regardless of pipeline device.
On RTX 3050 (6GB), running LAM on CUDA risks OOM and offers no
speed benefit since lam() is gradient-computation bound, not VRAM bound.
"""

import logging
from typing import Optional, Tuple
import numpy as np
import torch

logger = logging.getLogger(__name__)


def compute_lam(
    lr_rgbn: torch.Tensor,
    model: torch.nn.Module,
    h: int = 240,
    w: int = 240,
    window: int = 32,
    scales: list = None,
    aoi_name: str = "custom_aoi",
) -> Tuple[Optional[np.ndarray], float, Optional[np.ndarray], Optional[np.ndarray]]:
    """
    Compute Local Attribution Map for SR model explainability.

    IMPORTANT: Always runs on CPU. Caller must pass CPU tensors and CPU model.
    Expected runtime: 2-5 minutes on CPU for a 128x128 patch. This is normal.

    Args:
        lr_rgbn: 4-band LR tensor, shape (4, H, W) or (1, 4, H, W). Must be CPU.
        model: SEN2SRLite RGBN model. Must be on CPU.
        h: Target pixel row in output space. Keep near centre of patch.
        w: Target pixel col in output space. Keep near centre of patch.
        window: Neighbourhood window size around target pixel.
        scales: Blur scales. Defaults to ["2x","3x","4x","5x","6x"].
        aoi_name: For logging only.

    Returns:
        (kde_map, gini_complexity, robustness, robustness_vector)
        All None / 0.0 on any failure — LAM never crashes the pipeline.
    """
    if scales is None:
        scales = ["2x", "3x", "4x", "5x", "6x"]

    # Squeeze batch dim if present
    if lr_rgbn.ndim == 4:
        lr_rgbn = lr_rgbn.squeeze(0)

    # Force CPU — non-negotiable for 6GB GPU
    lr_rgbn = lr_rgbn.cpu()
    if model is not None:
        model = model.cpu()

    try:
        from sen2sr.xai import lam as lam_module
        logger.info(
            "[%s] Starting LAM on CPU (h=%d, w=%d, window=%d, scales=%s). "
            "Expected time: 2-5 min...",
            aoi_name, h, w, window, scales,
        )
        result = lam_module.lam(
            lr_rgbn, model, h=h, w=w, window=window, scales=scales
        )
        kde_map, complexity, robustness, rob_vec = result
        logger.info("[%s] LAM complete. Gini=%.4f", aoi_name, float(complexity))
        return kde_map, float(complexity), robustness, rob_vec

    except Exception as exc:
        logger.warning("[%s] LAM failed (non-fatal, pipeline continues): %s", aoi_name, exc)
        return None, 0.0, None, None
```

**Step 3 — Create `tests/test_explainability.py`:**

```python
"""Tests for srm/explainability.py — all run on CPU, no GPU required."""
import numpy as np
import torch
import pytest


def test_compute_lam_handles_exception_gracefully():
    """Any exception inside lam() must return (None, 0.0, None, None)."""
    from unittest.mock import patch
    from srm.explainability import compute_lam

    with patch("sen2sr.xai.lam.lam", side_effect=RuntimeError("test error")):
        result = compute_lam(torch.rand(4, 32, 32), model=None, h=16, w=16)

    assert result[0] is None
    assert result[1] == 0.0
    assert result[2] is None
    assert result[3] is None


def test_compute_lam_squeezes_batch_dim():
    """4D input (1, 4, H, W) must be squeezed to (4, H, W) before lam() call."""
    from unittest.mock import patch
    from srm.explainability import compute_lam

    fake_kde = np.random.rand(32, 32)
    fake_return = (fake_kde, 0.5, np.random.rand(4), np.random.rand(4))

    with patch("sen2sr.xai.lam.lam", return_value=fake_return) as mock_lam:
        result = compute_lam(torch.rand(1, 4, 32, 32), model=None, h=64, w=64)

    called_tensor = mock_lam.call_args[0][0]
    assert called_tensor.ndim == 3, "Batch dim must be squeezed before lam() call"
    assert result[1] == pytest.approx(0.5)


def test_compute_lam_forces_cpu():
    """Input tensor must be on CPU when lam() is called."""
    from unittest.mock import patch
    from srm.explainability import compute_lam

    fake_kde = np.random.rand(32, 32)
    fake_return = (fake_kde, 0.3, np.random.rand(4), np.random.rand(4))

    with patch("sen2sr.xai.lam.lam", return_value=fake_return) as mock_lam:
        # Pass CUDA tensor if available, otherwise CPU — either way it must arrive as CPU
        compute_lam(torch.rand(4, 32, 32), model=None, h=16, w=16)

    called_tensor = mock_lam.call_args[0][0]
    assert called_tensor.device.type == "cpu", "lam() must always receive CPU tensor"
```

**Step 4 — Verify:**
```bash
pytest tests/test_explainability.py -v
# All three tests must pass

python -c "from srm.explainability import compute_lam; print('import OK')"
```

---

## TASK 3 — Add LPIPS, ERGAS, Calibration to validation.py

**Paste this entire block into Claude Code:**

---

You are modifying one existing file: `srm/validation.py`

Do not touch `compute_psnr`, `compute_ssim`, `compute_sam`, or `evaluate_benchmark` structure.
Add three new functions. Then add their outputs to `evaluate_benchmark` records.

**Hardware note:** LPIPS loads a VGG network. On 6GB GPU it fits fine but runs on CPU
by default since validation is not time-critical. Do not move LPIPS to CUDA.

**Step 1 — Add these three functions:**

```python
def compute_lpips(
    reference: np.ndarray,
    target: np.ndarray,
) -> float:
    """
    LPIPS perceptual distance using VGG. Lower is better. Target: < 0.15.
    Always runs on CPU. Returns nan if lpips package not installed.

    Args:
        reference: (C, H, W) float32 [0, 1]. C >= 3 required.
        target: (C, H, W) float32 [0, 1].
    """
    try:
        import lpips as lpips_lib
        import torch
        # Run on CPU — avoids loading VGG into already-tight 6GB VRAM
        loss_fn = lpips_lib.LPIPS(net="vgg", verbose=False)
        ref_t = torch.from_numpy(reference[:3]).unsqueeze(0).float() * 2 - 1
        tgt_t = torch.from_numpy(target[:3]).unsqueeze(0).float() * 2 - 1
        with torch.no_grad():
            return float(loss_fn(ref_t, tgt_t).item())
    except ImportError:
        return float("nan")


def compute_ergas(
    reference: np.ndarray,
    target: np.ndarray,
    scale: int = 4,
) -> float:
    """
    ERGAS: relative global synthesis error across all bands.
    Pure numpy — no GPU needed. Target: < 3.

    Formula: 100/scale * sqrt(1/C * sum_c[(RMSE_c / mean_c)^2])

    Args:
        reference: (C, H, W) float32 [0, 1]
        target: (C, H, W) float32 [0, 1]
        scale: 4 for 10m → 2.5m SR
    """
    ref = np.asarray(reference, dtype=np.float64)
    tgt = np.asarray(target, dtype=np.float64)
    band_scores = []
    for i in range(ref.shape[0]):
        rmse = np.sqrt(np.mean((ref[i] - tgt[i]) ** 2))
        mean_ref = np.mean(np.abs(ref[i]))
        if mean_ref > 1e-8:
            band_scores.append((rmse / mean_ref) ** 2)
    if not band_scores:
        return float("nan")
    return float((100.0 / scale) * np.sqrt(np.mean(band_scores)))


def check_uncertainty_calibration(
    hr: np.ndarray,
    sr_mean: np.ndarray,
    sr_std: np.ndarray,
) -> float:
    """
    Fraction of HR pixels within sr_mean +/- 1.96*sr_std (95% CI).
    Pure numpy. Target: >= 0.90. Logs WARNING if below.

    Args:
        hr: (C, H, W) reference HR
        sr_mean: (C, H, W) mean SR prediction
        sr_std: (1, H, W) or (C, H, W) uncertainty std-dev
    """
    if sr_std.shape[0] == 1:
        sr_std = np.repeat(sr_std, hr.shape[0], axis=0)
    lower = sr_mean - 1.96 * sr_std
    upper = sr_mean + 1.96 * sr_std
    coverage = float(np.logical_and(hr >= lower, hr <= upper).mean())
    if coverage < 0.90:
        logger.warning(
            "Uncertainty calibration %.3f below target 0.90 — "
            "consider increasing n_uncertainty in config", coverage
        )
    return coverage
```

**Step 2 — Update `evaluate_benchmark` records:**

Add to both `record_bicubic` and `record_sr` dicts:
```python
"lpips": compute_lpips(hr_sample, bicubic_sr),
"ergas": compute_ergas(hr_sample, bicubic_sr),
```

**Step 3 — Append to `tests/test_sr_components.py` (do not modify existing tests):**

```python
def test_ergas_identical_arrays():
    """ERGAS of identical arrays must be 0."""
    import numpy as np
    arr = np.random.rand(4, 32, 32).astype(np.float32) * 0.5 + 0.1
    from srm.validation import compute_ergas
    assert compute_ergas(arr, arr) == pytest.approx(0.0, abs=1e-6)


def test_ergas_known_value():
    """Manual ERGAS calculation: RMSE=0.05, mean=0.5 → ERGAS=2.5 at scale=4."""
    import numpy as np
    ref = np.ones((1, 16, 16), dtype=np.float32) * 0.5
    tgt = np.ones((1, 16, 16), dtype=np.float32) * 0.55
    from srm.validation import compute_ergas
    assert compute_ergas(ref, tgt, scale=4) == pytest.approx(2.5, rel=1e-4)


def test_calibration_wide_intervals():
    """Huge uncertainty intervals must give calibration of 1.0."""
    import numpy as np
    hr = np.random.rand(4, 32, 32).astype(np.float32)
    sr_mean = hr.copy()
    sr_std = np.ones((1, 32, 32), dtype=np.float32) * 999.0
    from srm.validation import check_uncertainty_calibration
    assert check_uncertainty_calibration(hr, sr_mean, sr_std) == pytest.approx(1.0)


def test_calibration_zero_intervals():
    """Zero-width intervals with wrong mean must give calibration of 0.0."""
    import numpy as np
    hr = np.ones((4, 32, 32), dtype=np.float32)
    sr_mean = np.zeros((4, 32, 32), dtype=np.float32)
    sr_std = np.zeros((1, 32, 32), dtype=np.float32)
    from srm.validation import check_uncertainty_calibration
    assert check_uncertainty_calibration(hr, sr_mean, sr_std) == pytest.approx(0.0)
```

**Step 4 — Verify:**
```bash
pytest tests/ -v
# Test count increases by 4, all green

python -c "
from srm.validation import compute_ergas, check_uncertainty_calibration
import numpy as np
arr = np.random.rand(4, 32, 32).astype('float32')
print('ERGAS identical:', compute_ergas(arr, arr))
print('TASK 3 PASS')
"
```

---

## TASK 4 — Add --lam Flag to run_pipeline.py

**Paste this entire block into Claude Code:**

---

You are making small additions to `run_pipeline.py`. Read the whole file first.

**Hardware note — RTX 3050 6GB:**
- LAM always runs on CPU — move model to CPU before calling compute_lam
- After LAM, move model back to original device so subsequent AOIs still use GPU
- LAM is optional and slow — never block pipeline completion if it fails

**Change 1 — Add `--lam` to argparse:**

```python
parser.add_argument(
    "--lam",
    action="store_true",
    help="Run LAM explainability after SR. Runs on CPU, takes 2-5 min per AOI.",
)
```

**Change 2 — Update `process_single_aoi` signature:**

```python
# Before:
def process_single_aoi(aoi_key, cfg, pipeline):

# After:
def process_single_aoi(aoi_key, cfg, pipeline, args):
```

Update all call sites in `main()` to pass `args`.

**Change 3 — Add LAM block after `sr_dict` is built, before export:**

```python
if args.lam:
    from srm.explainability import compute_lam
    import matplotlib.pyplot as plt
    try:
        # LAM must run on CPU — move model off GPU temporarily
        original_device = next(pipeline.model_sen2sr.parameters()).device
        lr_rgbn_cpu = pipeline._extract_rgbn(padded_lr).squeeze(0).cpu()
        model_cpu = pipeline.model_sen2sr.cpu()

        h_target = padded_lr.shape[-2] * 2   # midpoint of SR output space
        w_target = padded_lr.shape[-1] * 2

        kde_map, complexity, _, _ = compute_lam(
            lr_rgbn=lr_rgbn_cpu,
            model=model_cpu,
            h=h_target,
            w=w_target,
            aoi_name=aoi_key,
        )

        # Move model back to original device for next AOI
        pipeline.model_sen2sr.to(original_device)

        if kde_map is not None:
            lam_path = Path(cfg.output.dir) / f"{aoi_key}_lam.png"
            fig, ax = plt.subplots(figsize=(6, 6))
            ax.imshow(kde_map, cmap="hot")
            ax.set_title(f"LAM — {aoi_key} (Gini={complexity:.3f})")
            ax.axis("off")
            plt.savefig(lam_path, bbox_inches="tight", dpi=150)
            plt.close(fig)
            logging.info("[%s] LAM saved: %s", aoi_key, lam_path)

    except Exception as lam_exc:
        logging.warning("[%s] LAM failed (non-fatal): %s", aoi_key, lam_exc)
        # Ensure model is back on GPU even if LAM crashed midway
        try:
            pipeline.model_sen2sr.to(original_device)
        except Exception:
            pass
```

**Do NOT change anything else.**

**Verify:**
```bash
# Without --lam: identical behaviour to before
python run_pipeline.py --aoi agri_valencia

# With --lam: completes without crash; lam.png produced or warning logged
python run_pipeline.py --aoi agri_valencia --lam
# Note: LAM will take 2-5 minutes on CPU. This is normal.
```

---

## TASK 5 — Build the Streamlit Dashboard

**Paste this entire block into Claude Code:**

---

You are creating three new files. The dashboard is read-only — it reads GeoTIFFs from
`outputs/` and never imports or runs any model. No tensors in memory. No CUDA.

**Read before writing:**
- `srm/applications.py` — understand `compute_ndvi`, `compute_mndwi`, `compute_ndbi`, `create_rgb_composite`
- `verification/benchmark_results.csv` — check column names if file exists

**Install if missing:**
```bash
pip install streamlit-folium
```

---

### File 1: `dashboard/charts.py`

```python
"""Reusable Plotly chart builders for SRM dashboard. No models, no tensors."""
import numpy as np
import pandas as pd
import plotly.graph_objects as go


def spectral_box_plot(sr_data: np.ndarray, band_names: list) -> go.Figure:
    """Box plot of per-band reflectance distribution."""
    fig = go.Figure()
    for i, name in enumerate(band_names):
        fig.add_trace(go.Box(y=sr_data[i].flatten(), name=name, boxpoints=False))
    fig.update_layout(
        title="Band Reflectance Distribution (SR output)",
        yaxis_title="Reflectance [0, 1]",
        height=400,
    )
    return fig


def metrics_bar_chart(df: pd.DataFrame) -> go.Figure:
    """Grouped bar chart: mean PSNR per method with std error bars."""
    fig = go.Figure()
    for method, grp in df.groupby("method"):
        fig.add_trace(go.Bar(
            name=method,
            x=["PSNR (dB)"],
            y=[grp["psnr_db"].mean()],
            error_y=dict(type="data", array=[grp["psnr_db"].std()]),
        ))
    fig.update_layout(
        title="Benchmark: Mean PSNR by Method",
        yaxis_title="PSNR (dB)",
        barmode="group",
    )
    return fig


def uncertainty_histogram(unc_data: np.ndarray) -> go.Figure:
    """Histogram of per-pixel uncertainty values."""
    fig = go.Figure(go.Histogram(x=unc_data.flatten(), nbinsx=50))
    fig.update_layout(
        title="Uncertainty Distribution",
        xaxis_title="Std Dev",
        yaxis_title="Pixel Count",
    )
    return fig
```

---

### File 2: `dashboard/map_view.py`

```python
"""Folium map component. No models, no tensors, no CUDA."""
import folium
import rasterio
from rasterio.warp import transform_bounds


def render_folium_map(
    sr_path: str,
    unc_path: str = None,
    aoi_name: str = "",
) -> folium.Map:
    """
    Build a folium map centred on the AOI showing SR tile extent.

    Args:
        sr_path: Path to 2.5m 10-band GeoTIFF on disk.
        unc_path: Optional uncertainty GeoTIFF path (reserved for future use).
        aoi_name: Label for the map tooltip.

    Returns:
        folium.Map — pass directly to st_folium() in app.py.
    """
    with rasterio.open(sr_path) as src:
        left, bottom, right, top = transform_bounds(
            src.crs, "EPSG:4326",
            src.bounds.left, src.bounds.bottom,
            src.bounds.right, src.bounds.top,
        )

    center_lat = (bottom + top) / 2
    center_lon = (left + right) / 2

    m = folium.Map(location=[center_lat, center_lon], zoom_start=13)
    folium.Rectangle(
        bounds=[[bottom, left], [top, right]],
        color="red",
        fill=False,
        tooltip=f"{aoi_name} — SR extent at 2.5 m",
    ).add_to(m)
    return m
```

---

### File 3: `dashboard/app.py`

```python
"""
SRM Streamlit Dashboard.

READ-ONLY: loads GeoTIFFs from outputs/ directory.
No model imports. No CUDA. No tensors in session state.
Safe to run while pipeline is processing on GPU in another terminal.
"""
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import rasterio
import streamlit as st

from srm.applications import (
    compute_mndwi,
    compute_ndbi,
    compute_ndvi,
    create_rgb_composite,
)
from dashboard.charts import metrics_bar_chart, spectral_box_plot, uncertainty_histogram
from dashboard.map_view import render_folium_map

try:
    from streamlit_folium import st_folium
    FOLIUM_AVAILABLE = True
except ImportError:
    FOLIUM_AVAILABLE = False

OUTPUT_DIR = Path("outputs")
BENCHMARK_CSV = Path("verification/benchmark_results.csv")
BAND_NAMES = ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12"]

st.set_page_config(
    page_title="SRM — Sentinel-2 Super-Resolution",
    layout="wide",
)
st.title("Sentinel-2 Super-Resolution Mapping — SIH 2026")

# ── Sidebar ───────────────────────────────────────────────────────────────────
available_tifs = sorted(OUTPUT_DIR.glob("*_sr_10band_2.5m.tif"))
if not available_tifs:
    st.warning(
        "No SR outputs found in outputs/. "
        "Run the pipeline first: python run_pipeline.py --all-aois"
    )
    st.stop()

aoi_options = [p.stem.replace("_sr_10band_2.5m", "") for p in available_tifs]
selected_aoi = st.sidebar.selectbox("Select AOI", aoi_options)

sr_path   = OUTPUT_DIR / f"{selected_aoi}_sr_10band_2.5m.tif"
unc_path  = OUTPUT_DIR / f"{selected_aoi}_uncertainty_2.5m.tif"
lam_path  = OUTPUT_DIR / f"{selected_aoi}_lam.png"

# Load SR raster once — numpy only, no torch
with rasterio.open(sr_path) as src:
    sr_data = src.read().astype(np.float32)   # (10, H, W)

st.sidebar.markdown(f"**Bands:** {sr_data.shape[0]}")
st.sidebar.markdown(f"**Size:** {sr_data.shape[1]} × {sr_data.shape[2]} px")
st.sidebar.markdown("**Resolution:** 2.5 m (4× SR)")

# ── Tabs ──────────────────────────────────────────────────────────────────────
tab_map, tab_spectral, tab_indices, tab_metrics, tab_lam = st.tabs([
    "Map", "Spectral", "Indices", "Metrics", "Explainability",
])

# ── Tab 1: Map ────────────────────────────────────────────────────────────────
with tab_map:
    col1, col2 = st.columns(2)

    with col1:
        st.subheader("SR Output — RGB composite (2.5 m)")
        rgb = create_rgb_composite(sr_data)
        st.image(rgb, use_column_width=True, clamp=True,
                 caption="B04-B03-B02 with percentile stretch")

    with col2:
        if unc_path.exists():
            st.subheader("Uncertainty Map")
            with rasterio.open(unc_path) as usrc:
                unc = usrc.read(1).astype(np.float32)
            vmax = float(np.percentile(unc, 95)) + 1e-8
            st.image(unc / vmax, use_column_width=True, clamp=True,
                     caption="Per-pixel std dev — brighter = more uncertain")
            st.plotly_chart(uncertainty_histogram(unc), use_container_width=True)
        else:
            st.info(
                "No uncertainty map. "
                f"Run: python run_pipeline.py --aoi {selected_aoi}"
            )

    if FOLIUM_AVAILABLE:
        st.subheader("Geographic Extent")
        folium_map = render_folium_map(str(sr_path), aoi_name=selected_aoi)
        st_folium(folium_map, height=300, use_container_width=True)
    else:
        st.caption("pip install streamlit-folium for interactive map")

# ── Tab 2: Spectral ───────────────────────────────────────────────────────────
with tab_spectral:
    st.subheader("Band Reflectance Distribution")
    st.plotly_chart(spectral_box_plot(sr_data, BAND_NAMES), use_container_width=True)

# ── Tab 3: Indices ────────────────────────────────────────────────────────────
with tab_indices:
    index_choice = st.radio(
        "Spectral Index", ["NDVI", "MNDWI", "NDBI"], horizontal=True
    )
    fn_map   = {"NDVI": compute_ndvi, "MNDWI": compute_mndwi, "NDBI": compute_ndbi}
    cmap_map = {"NDVI": "YlGn",       "MNDWI": "Blues_r",     "NDBI": "YlOrRd"}

    idx = fn_map[index_choice](sr_data)
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(idx, cmap=cmap_map[index_choice], vmin=-0.3, vmax=0.8)
    plt.colorbar(im, ax=ax, label=index_choice)
    ax.set_title(f"{index_choice} at 2.5 m — {selected_aoi}")
    ax.axis("off")
    st.pyplot(fig)
    plt.close(fig)
    st.caption(
        f"Mean {index_choice}: {idx.mean():.3f} | "
        f"Max: {idx.max():.3f} | Min: {idx.min():.3f}"
    )

# ── Tab 4: Metrics ────────────────────────────────────────────────────────────
with tab_metrics:
    if BENCHMARK_CSV.exists():
        df = pd.read_csv(BENCHMARK_CSV)
        st.subheader("Benchmark Results")
        st.dataframe(df, use_container_width=True)
        st.plotly_chart(metrics_bar_chart(df), use_container_width=True)
        st.caption(
            "SEN2SRLite PSNR is similar to bicubic — expected behaviour for "
            "diffusion-based SR. Perceptual quality (LPIPS) is the meaningful metric."
        )
    else:
        st.info("No benchmark results yet. Run: python run_pipeline.py --benchmark")

# ── Tab 5: Explainability ─────────────────────────────────────────────────────
with tab_lam:
    st.subheader("Local Attribution Map (LAM)")
    if lam_path.exists():
        st.image(str(lam_path),
                 caption="Brighter = more influence on SR output at sampled pixel")
    else:
        st.info(
            "No LAM yet. "
            f"Run: python run_pipeline.py --aoi {selected_aoi} --lam  "
            "(takes 2-5 min on CPU)"
        )
```

**Create empty init:**
```bash
touch dashboard/__init__.py
```

**Verify:**
```bash
# Run at least one AOI first
python run_pipeline.py --aoi agri_valencia

streamlit run dashboard/app.py
# Open http://localhost:8501
# All 5 tabs must load without error
# Map tab: RGB image visible
# Spectral tab: box plot renders
# Indices tab: NDVI map with colorbar
# Metrics tab: table or info message
# Explainability tab: LAM image or info message
```

---

## FINAL — End-to-End Demo Run

```bash
# 1. Run all AOIs — uses n_uncertainty=5 and sampling_steps=50 from config
python run_pipeline.py --all-aois

# 2. One AOI with LAM (slow — 2-5 min per AOI, runs on CPU)
python run_pipeline.py --aoi agri_valencia --lam

# 3. Benchmark
python run_pipeline.py --benchmark

# 4. Full test suite — must be all green
pytest tests/ -v

# 5. Dashboard
streamlit run dashboard/app.py
```

**Done when:**
- All tests green
- `outputs/` has SR GeoTIFF + uncertainty for each AOI
- `verification/benchmark_results.csv` has LPIPS and ERGAS columns
- Dashboard opens, all 5 tabs work
- No CUDA OOM errors in logs (warnings are fine, errors are not)
