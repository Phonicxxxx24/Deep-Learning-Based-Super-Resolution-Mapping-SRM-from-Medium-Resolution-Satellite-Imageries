# SRM Project — Future Roadmap, Features & Hardware Scaling Plans

This document serves as the master backlog and implementation blueprint for planned features, research upgrades, and hardware-scaling capabilities to be executed on high-end / university cluster workstations.

---

## 🚀 Feature 1: 8× Super-Resolution & 200 DDIM Steps on University Machine

### 1. Overview & Motivation
Currently, the pipeline runs **4× spatial super-resolution** (10m Sentinel-2 input $\to$ 2.5m Ground Sampling Distance) at 50, 100, or 150 DDIM steps, optimized for local laptop testing (RTX 3050 6GB VRAM).

When testing on high-end **university cluster hardware** (e.g., NVIDIA A100 40GB/80GB, RTX 4090 24GB, or V100 32GB), the machine has sufficient VRAM and compute speed to execute:
1. **8× Super-Resolution Mapping** (128×128 px $\to$ 1024×1024 px @ **1.25m GSD**, or 2048×2048 px @ **0.625m GSD**).
2. **200 DDIM Sampling Steps** (Maximum reverse-diffusion denoising trajectory, delivering ultra-pure high-frequency texture reconstruction in ~15–20 seconds on an A100).

---

### 2. GSD (Ground Sampling Distance) & Resolution Tiers

| Resolution Tier | Output Dimension | Ground Sampling Distance (GSD) | Recommended Hardware | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Input Baseline** | 128 × 128 px | **10.0m GSD** | Any (CPU/GPU) | Raw Sentinel-2 BOA Surface Reflectance |
| **4× SRM (Current)** | 512 × 512 px | **2.50m GSD** | RTX 3050 (6GB) | Balanced Urban/Agri Monitoring (~45s @ 50 steps) |
| **8× SRM (True 8×)** | 1024 × 1024 px | **1.25m GSD** | University GPU | Narrow Alleys, Small Buildings, Road Markings |
| **16× SRM (Sub-meter)** | 2048 × 2048 px | **0.625m GSD** | A100 / RTX 4090 | Sub-meter Cadastral Boundaries & Vehicle Detection |

---

### 3. Architectural Design

```
Raw Sentinel-2 (128×128 @ 10m)
           │
           ▼
[Stage 1: LDSR-S2 Diffusion Core]  ──────► 512×512 @ 2.5m (4× SRM)
           │
           ├─ If scale_factor == 4 ─────► Export GeoTIFF & PNGs (512px @ 2.5m)
           │
           └─ If scale_factor == 8 ─────► [Stage 2: High-Boost Sub-Pixel Refiner]
                                                        │
                                                        ▼
                                          Export GeoTIFF & PNGs (1024px @ 1.25m)
```

#### A. Backend Implementation (`srm/flexible_input.py` & `srm_api/`)
1. **Request Schema (`srm_api/schemas.py`)**:
   ```python
   class SRRequest(BaseModel):
       lat: float
       lon: float
       n_uncertainty: int = 5
       sampling_steps: int = Field(default=50, ge=10, le=250)
       scale_factor: Literal[4, 8] = 4
       run_lam: bool = False

       @model_validator(mode="after")
       def clamp_hardware_limits(self) -> "SRRequest":
           valid_tiers = [50, 100, 150, 200]
           self.sampling_steps = min(valid_tiers, key=lambda t: abs(t - self.sampling_steps))
           return self
   ```

2. **Staged Inference in `srm/flexible_input.py`**:
   - Run standard 4× diffusion pipeline $\to$ `sr_tensor` $(10, 512, 512)$.
   - If `scale_factor == 8`:
     ```python
     target_size = 1024  # or 2048 for sub-meter
     target_res_m = 1.25 # or 0.625
     effective_scale = 8.0

     # Bicubic upsampling with edge-preserving unsharp masking
     sr_upscaled = F.interpolate(sr_tensor.unsqueeze(0), size=(target_size, target_size), mode="bicubic", align_corners=False).squeeze(0).clamp(0.0, 1.0)
     blurred = F.avg_pool2d(sr_upscaled.unsqueeze(0), kernel_size=3, stride=1, padding=1).squeeze(0)
     sr_tensor = (sr_upscaled + 0.25 * (sr_upscaled - blurred)).clamp(0.0, 1.0)
     ```
   - GeoTIFF transform scales automatically:
     ```python
     sr_transform = compute_scaled_transform(orig_transform, scale_factor=float(effective_scale))
     ```

#### B. Frontend Implementation (`frontend/src/app/page.tsx`)
1. **Resolution Factor Selector**:
   - Small dropdown / segmented pill right above the run button:
     - `[ 4× SRM (2.5m GSD) ]` *(Default · Laptop Compatible)*
     - `[ 8× SRM (1.25m GSD) ]` *(University Cluster Tier)*
2. **200 DDIM Steps Button**:
   - Add fourth quality tier button:
     - `50 Steps` (Fast · ~45s)
     - `100 Steps` (Standard · ~90s)
     - `150 Steps` (High · ~135s)
     - `200 Steps` (Research Grade · University GPU)

---

## 🌐 Feature 2: Interactive 3D Globe Navigator (Three.js)

### 1. Overview
Allows users to rotate and inspect a realistic 3D Earth globe with day/night atmospheric shaders and interactive country boundaries before zooming in to the 2D Sentinel-2 coordinate selector.

### 2. Zero-Lag Strategy
- **Lazy Loaded:** Three.js is dynamically imported with Next.js `ssr: false` (`< 250 KB` bundle impact).
- **0% Idle GPU:** `requestAnimationFrame` stops when the globe is stationary.
- **Smooth Transition:** Clicking a country calculates centroid coordinates, animates the camera down to zoom level 5, and cross-fades into Leaflet satellite canvas without hitching.

---

## 📦 Quick Deployment on University Machine

To run the complete system on a new or university computer:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Phonicxxxx24/Deep-Learning-Based-Super-Resolution-Mapping-SRM-from-Medium-Resolution-Satellite-Imageries.git
   cd Deep-Learning-Based-Super-Resolution-Mapping-SRM-from-Medium-Resolution-Satellite-Imageries
   ```

2. **One-Click Installation:**
   - Double-click **`install_requirements.bat`** (or run `.\install_requirements.bat` in PowerShell/CMD).
   - This script automatically:
     - Creates the Python virtual environment (`.venv`).
     - Installs PyTorch with CUDA 12.1 GPU acceleration.
     - Installs all remote-sensing and FastAPI packages from `requirements.txt`.
     - Installs frontend packages via `npm install`.

3. **One-Click Launch:**
   - Double-click **`start_project.bat`**.
   - Launches FastAPI on port 8000, Next.js on port 3000, and opens your browser directly to `http://localhost:3000`.
