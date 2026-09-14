# SRM Pipeline — Progress Tracker

> **Single source of truth for session handoffs across multiple agents.**
> Update this file after every task completes or fails.
> Architecture reference: `SRM_Architecture.md`
> Task definitions: `SRM_Task_Prompts.md`
> Teammate baseline: Dhruv Gohel commits on `main` (last: `fa65218`, Sept 11 2026)

---

## Environment Facts (Confirmed, Never Assume)

| Item | Value |
|---|---|
| OS | Windows 11 |
| Python | `.venv\Scripts\python.exe` — Python **3.11.15** |
| GPU | RTX 3050, **6 GB VRAM** |
| PyTorch | 2.14.0 (CUDA build) |
| venv manager | `uv` — use `uv pip install`, NOT pip directly |
| Git remote | `origin/main` — GitHub (Phonicxxxx24 repo) |
| Always use | `.venv\Scripts\python.exe` — NEVER bare `python` or `py` |
| Architecture doc says | Python 3.12 — **actual venv is 3.11.15. Ignore doc on this.** |

---

## What Dhruv (Teammate) Already Built

Dhruv commits `d0ee6ad`, `4191ca6`, `fa65218` — all on Sept 11 2026.
All 13 original tests pass. Key gap: models never ran on his machine (env log shows FAILED).

| File | Status | Notes |
|---|---|---|
| `srm/ingestion.py` | DONE | STAC/cubo datacube fetcher |
| `srm/preprocessing.py` | DONE | Cloud masking, 128-px padding, sanitization |
| `srm/postprocessing.py` | DONE | GeoTIFF export, nodata propagation |
| `srm/uncertainty.py` | DONE | Stochastic diffusion uncertainty (15 passes — OOMs on 6GB, config fixed in Task 0) |
| `srm/applications.py` | DONE | NDVI, MNDWI, NDBI spectral indices |
| `srm/config.py` | DONE | SRMConfig dataclass with YAML loader |
| `srm/validation.py` | PARTIAL | Has PSNR, SSIM, SAM — missing LPIPS and ERGAS (Task 3) |
| `srm/sr_pipeline.py` | MODIFIED | Dhruv base kept, Task 1 changes added on top |
| `srm/explainability.py` | CREATED | Never built by Dhruv — Task 2 done |
| `dashboard/` | MISSING | Never built by Dhruv — Task 4 pending |
| `run_pipeline.py` | DONE | Full CLI orchestrator |
| `tests/` | 16/16 | 13 from Dhruv + 3 from Task 2 |

> IMPORTANT: Dhruv `verification/environment_check.log` shows mlstac, sen2sr, opensr-model
> all FAILED in his env when he pushed. Pipeline had NEVER run on real models on his machine.
> Outputs PNGs in `outputs/` exist but were generated on a separate machine or mocked.

---

## TASK 0 — Vendor Setup + Model Download + Hardware Config

**Status: DONE**
**Date: Sept 13 2026**

### What was done

#### Part A — Vendor repos
- Cloned `vendor/opensr-model` and `vendor/sen2sr` from ESAOpenSR GitHub (--depth 1)
- DEVIATION: Patched `vendor/opensr-model/setup.py`: changed `python_requires>=3.12` to `>=3.11`
  because venv is 3.11.15 and upstream constraint was wrong for our env
- Installed both editable via `uv pip install -e vendor/opensr-model` and `uv pip install -e vendor/sen2sr`
- Added `vendor/` to `.gitignore`

Verify passed:
```
opensr_model -> vendor/opensr-model/opensr_model/__init__.py  OK
sen2sr       -> vendor/sen2sr/sen2sr/__init__.py              OK
referencex4 OK
lam OK
```

#### Part B — Model weights downloaded
| Directory | Status | Notes |
|---|---|---|
| `model/SEN2SRLite/` | DOWNLOADED | Main 10-band CNN (8 files) |
| `model/SEN2SRLite_RGBN/` | DOWNLOADED | RGB+NIR 4-band model (4 files) |
| `model/SEN2SRLite_Reference_RSWIR_x2/` | DOWNLOADED | SWIR x2 upsampler (5 files) |
| `model/SEN2SRLite_Reference_RSWIR_x4/` | EMPTY DIR | Does NOT exist on HuggingFace — 404. Task prompt listed it but upstream never published it. referencex4 fallback handles this. |
| `opensr-ldsrs2_v1_0_0.ckpt` | DOWNLOADED | 1.13 GB — triggered on first pipeline run during Task 1 verify |

ASSUMPTION: Task 0 Part B asked for 4 models. Only 3 exist on HuggingFace. The 4th
(Reference_RSWIR_x4) was verified missing via HuggingFace API. Empty dir left in place.
The referencex4 loading in Task 1 catches this with try/except fallback.

#### Part C — Hardware-safe config
Updated `configs/srm_config.yaml`:
```yaml
device: "cuda"      # falls back to cpu on OOM
n_uncertainty: 5    # was 15 in Dhruv code — OOMs on 6GB
sampling_steps: 50
eta: 0.95
patch_size: 128     # hard limit
overlap: 32
```

### Failures / Issues
- `pip.exe` not in `.venv/Scripts/` — venv is uv-managed. Used `uv pip install` instead.
- `vendor/opensr-model/setup.py` had `python_requires>=3.12` — patched to `>=3.11` locally.

---

## TASK 1 — Add referencex4 SWIR Path to sr_pipeline.py

**Status: DONE**
**Date: Sept 13 2026**

### What was done
Modified ONE file only: `srm/sr_pipeline.py` (all of Dhruv logic preserved)

1. Added `use_referencex4: bool = True` parameter to `DualPathSRPipeline.__init__`
2. Added block to attempt loading SWIR referencex4 pipeline after SEN2SRLite load:
   - Loads `SEN2SRLite_Reference_RSWIR_x2` (f2 model: 20m to 10m SWIR)
   - Attempts `SEN2SRLite_Reference_RSWIR_x4` (f4: 10m to 2.5m SWIR) — fails, fallback catches
   - `self.referencex4_pipeline = None` on failure
3. Path B routes through referencex4_pipeline when available, else direct model
4. Path B OOM guard: catches RuntimeError("out of memory"), empties cache, retries on CPU
5. Path A OOM guard: LDSR-S2 wrapped, on OOM sets `sr_diffusion = None`
6. Band fusion None guard: skips diffusion channels when `sr_diffusion is None`
7. `torch.cuda.empty_cache()` after both Path A and Path B

### Verified
- `pytest tests/ -v` — 13/13 PASSED (29.51s)
- Task 1 verify script: TASK 1 PASS — output shape (1, 10, 512, 512) confirmed
  - NOTE: 1.13 GB opensr-ldsrs2_v1_0_0.ckpt downloaded during this verify run

### Failures / Issues
- None

### Assumptions
- `referencex4.srmodel()` uses `self.model_sen2sr.sr_model` (inner raw nn.Module) not
  `self.model_sen2sr` (which is already a full referencex4.SRModel wrapper)
- confirmed: `SEN2SRLite` compiled_model has `.sr_model` but no `.hard_constraint`
- confirmed: `SEN2SRLite_Reference_RSWIR_x2` compiled_model has both `.sr_model` and `.hard_constraint`

---

## TASK 2 — Create srm/explainability.py

**Status: DONE**
**Date: Sept 14 2026**

### What was done
Created two new files:
- `srm/explainability.py` — LAM wrapper from `sen2sr.xai.lam`
- `tests/test_explainability.py` — 3 unit tests (CPU-only, mocked)

### lam() signature confirmed from source (vendor/sen2sr/sen2sr/xai/lam.py line 143)
```
def lam(X, model, h=240, w=240, window=32, scales=["1x",...]) -> Tuple[ndarray, float, float, ndarray]
Returns: (kde_map, complexity_metric, robustness_metric, robustness_vector)
kde_map is np.ndarray NOT torch.Tensor
complexity_metric = (1 - gini_index) * 100
```

### Verified
- `pytest tests/test_explainability.py -v` — 3/3 PASSED (18.30s)
- `pytest tests/ -v` — 16/16 PASSED (13 original + 3 new)
- Import check: `from srm.explainability import compute_lam; print("import OK")` — OK

### Failures / Issues
- None

### Assumptions / Deviations from task prompt
- Default scales set to ["2x","3x","4x","5x","6x"] (5 scales, not 8) per hardware note in prompt
  — fewer scales = faster CPU execution on 6GB laptop
  — full 8-scale list still works if caller passes it explicitly

---

## TASK 3 — Add LPIPS, ERGAS, Calibration to validation.py

**Status: DONE**
**Date: Sept 14 2026**

### What was done
Modified two files:
- `srm/validation.py`:
  - Added `compute_lpips(reference, target)` — strictly on CPU to avoid loading VGG into 6GB VRAM; includes graceful `nan` fallback if `lpips` package is missing.
  - Added `compute_ergas(reference, target, scale=4)` — pure numpy Relative Global Synthesis Error formula: `100/scale * sqrt(1/C * sum((RMSE/mean)^2))`.
  - Added `check_uncertainty_calibration(hr, sr_mean, sr_std)` — pure numpy 95% CI coverage fraction (`sr_mean +/- 1.96*sr_std`); logs warning if coverage < 0.90.
  - Wired `lpips` and `ergas` metrics into `evaluate_benchmark()` dictionaries for both baseline bicubic and deep learning SR records.
- `tests/test_sr_components.py`:
  - Added 4 unit tests covering ERGAS and calibration (all existing 13 tests untouched):
    - `test_ergas_identical_arrays`
    - `test_ergas_known_value`
    - `test_calibration_wide_intervals`
    - `test_calibration_zero_intervals`

### Verified
- `pytest tests/ -v` — 20/20 PASSED (29.81s)
  - 13 original baseline tests
  - 3 explainability tests (Task 2)
  - 4 validation metric tests (Task 3)
- ERGAS calculation verified: identical arrays = 0.0; known value = 2.5 at scale=4.
- Uncertainty calibration verified: wide intervals = 1.0; zero intervals = 0.0.

### Failures / Issues
- None.

---

## TASK 4 — Add --lam Flag to run_pipeline.py

**Status: DONE**
**Date: Sept 14 2026**

### What was done
- Added `--lam` CLI argument to `run_pipeline.py` argparse.
- Updated `process_single_aoi` signature to accept `args` across all call sites in `main()`.
- Added CPU-isolated LAM explainability execution block: moves model to CPU before computing LAM, saves `{aoi_key}_lam.png`, and safely restores model back to original device even on exceptions.

### Verified
- Full pytest suite 20/20 green.
- Tested pipeline execution with `--lam` handling.

---

## TASK 5 — Build the Streamlit Dashboard (dashboard/)

**Status: PENDING (Next in sequence)**

### Plan
- `dashboard/charts.py`: Plotly spectral profiles, metric bar charts, uncertainty histogram.
- `dashboard/map_view.py`: Folium split-map LR/SR + uncertainty heatmap.
- `dashboard/app.py`: Streamlit entry point reading GeoTIFFs from `outputs/`.

---

## FINAL — End-to-End Benchmark and Demo Run

**Status: PENDING**

---

## Files Modified vs Original Baseline

| File | Action | By |
|---|---|---|
| `srm/sr_pipeline.py` | Modified (Task 1) | Us |
| `srm/explainability.py` | Created NEW (Task 2) | Us |
| `tests/test_explainability.py` | Created NEW (Task 2) | Us |
| `srm/validation.py` | Modified (Task 3) | Us |
| `tests/test_sr_components.py` | Modified (Task 3) | Us |
| `run_pipeline.py` | Modified (Task 4) | Us |
| `configs/srm_config.yaml` | Modified (Task 0 Part C) | Us |
| `.gitignore` | Modified (added vendor/) | Us |
| `vendor/opensr-model/setup.py` | Patched locally (python_requires) | Us |
| `tests/test_integration.py` | Untouched | Dhruv |
| `tests/test_preprocessing.py` | Untouched | Dhruv |

---

## Running Test Suite

```powershell
# Full suite — must always pass before and after any task
.venv\Scripts\python.exe -m pytest tests/ -v

# Task-specific
.venv\Scripts\python.exe -m pytest tests/test_explainability.py -v
```

---

## Known Permanent Issues / Watch-outs

1. `SEN2SRLite_Reference_RSWIR_x4` does NOT exist on HuggingFace — 404.
   referencex4 pipeline always falls back to direct SEN2SRLite. Watch for upstream publish.
2. No `pip.exe` in `.venv/Scripts/` — use `uv pip install` for all package installs.
3. `SRM_Architecture.md` says Python 3.12 — actual venv is 3.11.15. Ignore doc on this point.
4. `uncertainty_variations` must be max 5 (not 15) for 6GB GPU.
5. LAM always runs on CPU — slow (2-5 min per patch). Never move to CUDA.
6. `opensr-ldsrs2_v1_0_0.ckpt` — 1.13 GB, gitignored, cached locally after Task 1 verify.
7. Dhruv outputs/ PNGs exist but the pipeline generating them was never run on this machine.