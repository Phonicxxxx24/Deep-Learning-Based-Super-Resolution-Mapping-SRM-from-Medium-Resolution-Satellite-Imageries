# Beyond Pixels — Sentinel-2 Super-Resolution Command Center

<div align="center">
  <img src="frontend/public/beyond-pixels-logo.png" alt="Beyond Pixels Logo" width="320" />
  <p><strong>Deep-Learning-Based Super-Resolution Mapping (SRM) from Medium-Resolution Satellite Imageries</strong></p>
</div>

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.3-black.svg)](https://nextjs.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.1%2Bcu12x-EE4C2C.svg)](https://pytorch.org/)
[![Sentinel-2 L2A](https://img.shields.io/badge/Data-Copernicus%20Sentinel--2%20L2A-006699.svg)](https://sentinels.copernicus.eu/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

An operational, production-grade deep learning super-resolution platform that enhances medium-resolution Copernicus Sentinel-2 multispectral imagery (10m & 20m) into high-resolution (**2.5m** standard 4× and **0.625m** ultra-res 8×) analysis-ready products.

The platform combines a **high-throughput feedforward neural pipeline (Sen2SR-RRDB)** and a **generative Latent Diffusion model (LDSR-S2)** with mathematical **Fourier HardConstraints** that guarantee 100% preservation of low-frequency physical surface reflectance while hallucination artifacts are eliminated.

---

## Architecture & System Overview

```
                                  Beyond Pixels Platform
                                             │
               ┌─────────────────────────────┴─────────────────────────────┐
               ▼                                                           ▼
    Interactive Web Command Center                               Python Deep Learning Engine
    • Next.js 16 + Tailwind CSS (iOS Theme)                      • Sen2SR-RRDB & LDSR-S2
    • Leaflet Satellite Map & Target Inspector                   • 10-Band Multispectral Processing
    • Real-Time Swipe Comparator                                 • Fourier HardConstraint Invariance
    • Monte Carlo Uncertainty Visualizer                         • 4× (2.5m) and 8× (0.625m) Scaling
    • STAC Item & Executive PDF Dossier Export                   • Cloud-Optimized GeoTIFF (COG)
               │                                                           ▲
               └──────────────────► FastAPI REST Backend ──────────────────┘
                                    • Async Worker Queue (GPU Safe)
                                    • SQLite Mission Database
                                    • Live Progress Polling & STAC
```

---

## Key Capabilities

### 1. Dual-Path Deep Learning Architectures
- **Sen2SR-RRDB (`able`)**: Deep Residual-in-Residual Dense Block architecture optimized for ultra-fast (<1s) multi-band satellite super-resolution with zero diffusion latency.
- **Latent Diffusion (`diffusion`)**: Generative diffusion model (`opensr-model` LDSR-S2) operating with configurable DDIM sampling steps (50 to 200 passes) for high structural precision.
- **Fourier HardConstraint**: Frequency-domain filtering combining Sentinel-2 low-frequency observations with super-resolved high-frequency details, mathematically guaranteeing radiometric conservation across all 10 bands.

### 2. Multi-Scale Enhancement Tiers
- **4× Standard Super-Resolution**: Enhances 10m bands (B02, B03, B04, B08) and 20m red-edge/SWIR bands into **2.5m GSD** (16× pixel density increase; 128×128 px → 512×512 px).
- **8× Ultra-Resolution**: Enhances satellite patches into sub-meter **0.625m GSD** (256× pixel density increase; 128×128 px → 2048×2048 px).

### 3. Downstream Biophysical Index Generation
Automatically derives calibrated physical index products at enhanced resolution:
- **NDVI** (Normalized Difference Vegetation Index): Canopy health, agricultural parcel boundaries, and biomass density.
- **MNDWI** (Modified Normalized Difference Water Index): Sub-pixel water body boundaries, coastline delineation, and flood inundation.
- **NDBI** (Normalized Difference Built-Up Index): Urban footprints, road networks, and impervious surface detection.

### 4. Epistemic Uncertainty Estimation
Monte Carlo stochastic forward passes measure per-pixel standard deviation, generating confidence heatmaps that identify structural ambiguity, clouds, or complex texture boundaries.

### 5. Enterprise Web Command Center
- **Interactive Map Picker**: Leaflet-based high-resolution satellite imagery map with global coordinate search, custom bounding box targeting, and quick presets.
- **Before / After Slider**: Real-time swipe comparison with 1:1 native pixel rendering.
- **Executive Intelligence Dossier**: Dedicated 2-page print-ready A4 PDF report with area name geocoding, spatial exhibits, 10-band preservation matrix, and STAC JSON export.
- **Mission Archive**: SQLite-backed history tracking past scans, processing times, and outputs.

---

## Repository Structure

```
├── configs/
│   ├── srm_config.yaml               # Standard pipeline configuration
│   └── srm_config_highvram.yaml      # Extended GPU batch configuration
├── data/
│   └── srm_scans.db                  # Persistent SQLite mission archive
├── frontend/                         # Next.js 16 Web Application
│   ├── src/
│   │   ├── app/                      # App router (homepage, results, layouts)
│   │   ├── components/               # iOS-themed components (MapPicker, Slider, Report, etc.)
│   │   ├── lib/                      # Constants, notable presets, quality tiers
│   │   ├── types/                    # TypeScript interfaces for API & STAC
│   │   └── utils/                    # API client and helper functions
│   └── public/                       # Static branding and map assets
├── model/
│   └── Sen2SR_Able/                  # Custom RRDB PyTorch model weights
├── srm/                              # Core Python SRM Scientific Library
│   ├── able/                         # Sen2SR-RRDB network implementation
│   ├── applications.py               # NDVI, MNDWI, NDBI index calculation
│   ├── config.py                     # Dataclass configuration schemas
│   ├── explainability.py             # LAM (Local Attribution Map)
│   ├── flexible_input.py             # Coordinate/GeoTIFF ingestion & pipeline runner
│   ├── ingestion.py                  # STAC Sentinel-2 L2A retrieval via cubo
│   ├── postprocessing.py             # Affine scaling & GeoTIFF/COG raster output
│   ├── preprocessing.py              # Normalization, padding & SCL masking
│   ├── sr_pipeline.py                # Dual-path SR execution & Fourier constraints
│   ├── uncertainty.py                # Monte Carlo uncertainty estimation
│   └── validation.py                 # Benchmarking metrics (PSNR, SSIM, SAM, ERGAS)
├── srm_api/                          # FastAPI REST API Backend
│   ├── db.py                         # SQLite scans database & reverse geocoding
│   ├── main.py                       # FastAPI application & GPU worker queue
│   └── schemas.py                    # Pydantic v2 validation models
├── tests/                            # Pytest test suite (unit & integration)
├── verification/                     # Benchmark CSVs and environment logs
├── run_pipeline.py                   # Master CLI execution tool
├── start_project.sh                  # One-click Linux launcher (Backend + Frontend)
└── start_project.bat                 # One-click Windows launcher
```

---

## Quick Start & Installation

### Prerequisites
- **Operating System**: Linux (Ubuntu 22.04+, Arch, Debian) or Windows 10/11
- **Python**: 3.10 to 3.12
- **Node.js**: 18+ (tested on Node 20 / 22)
- **GPU (Recommended)**: NVIDIA CUDA-compatible GPU (e.g. RTX 3050 6GB or higher)

### 1. Automated One-Command Launch (Recommended)

Run the master start script, which automatically verifies virtual environments, installs missing frontend dependencies, and boots both the FastAPI backend and Next.js frontend:

```bash
# Linux / macOS
chmod +x start_project.sh
./start_project.sh

# Windows
start_project.bat
```

Once loaded:
- **Next.js Command Center**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive API Docs (Swagger)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

### 2. Manual Step-by-Step Installation

#### Step A: Python Backend Setup

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Upgrade pip and install package
pip install --upgrade pip
pip install -r requirements.txt
pip install -e .

# Run environment verification
python scripts/run_env_check.py
```

#### Step B: Start Backend Server

```bash
python -m uvicorn srm_api.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Step C: Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## CLI Usage (`run_pipeline.py`)

The pipeline can also be run directly from the command line for headless batch jobs:

```bash
# Activate Python environment
source .venv/bin/activate

# 1. Run on standard demonstration AOIs
python run_pipeline.py --all-aois

# 2. Run on a specific AOI
python run_pipeline.py --aoi urban_berlin
python run_pipeline.py --aoi agri_valencia
python run_pipeline.py --aoi disaster_derna

# 3. Enable Local Attribution Map (LAM) explainability
python run_pipeline.py --aoi agri_valencia --lam

# 4. Run quantitative benchmark evaluation on real SPOT data
python run_pipeline.py --benchmark
```

---

## Quantitative Benchmarking

Quantitative evaluation was performed using real Sentinel-2 L2A and high-resolution SPOT reference pairs from `opensr-test`:

$$\text{PSNR} = 10 \cdot \log_{10}\left(\frac{\text{MAX}^2}{\text{MSE}}\right)$$

$$\text{SSIM}(x, y) = \frac{(2\mu_x\mu_y + c_1)(2\sigma_{xy} + c_2)}{(\mu_x^2 + \mu_y^2 + c_1)(\sigma_x^2 + \sigma_y^2 + c_2)}$$

$$\text{SAM}(\mathbf{x}, \mathbf{y}) = \arccos\left(\frac{\mathbf{x} \cdot \mathbf{y}}{\|\mathbf{x}\|_2 \|\mathbf{y}\|_2}\right)$$

| Model / Pipeline | PSNR (dB) | SSIM | SAM (°) | Radiometric Preservation |
|---|---|---|---|---|
| **Bicubic Interpolation** | 21.96 dB | 0.6972 | 19.08° | Standard Baseline |
| **SEN2SR / RRDB** | **21.96 dB** | **0.7011** | **19.10°** | **100.0% Low-Pass Preserved** |

---

## Testing & Quality Assurance

Run the automated pytest suite covering preprocessing normalization, Fourier hard constraints, STAC I/O, and model inference:

```bash
pytest tests/ -v
```

To validate the frontend build:
```bash
cd frontend
npm run build
```

---

## License

This project is licensed under the **Apache License 2.0**.
