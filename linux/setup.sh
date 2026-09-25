#!/usr/bin/env bash
# ==============================================================================
# SRM — Sentinel-2 Super-Resolution Command Center Setup Script
# ==============================================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}=======================================================================${NC}"
echo -e "${CYAN}     SRM — Sentinel-2 Super-Resolution Command Center Setup            ${NC}"
echo -e "${CYAN}     Dual-Path Diffusion SR (10m -> 2.5m) Environment Provisioning     ${NC}"
echo -e "${CYAN}=======================================================================${NC}"
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ------------------------------------------------------------------------------
# 1. Detect Python Version
# ------------------------------------------------------------------------------
echo -e "${YELLOW}[1/7] Detecting suitable Python interpreter...${NC}"

find_python() {
    # Check explicitly for python3.12, python3.11, python3.10 first (best ML wheel support)
    for candidate in python3.12 /usr/bin/python3.12 python3.11 /usr/bin/python3.11 python3.10 /usr/bin/python3.10 python3; do
        if command -v "$candidate" >/dev/null 2>&1; then
            local ver
            ver=$("$candidate" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
            local major=${ver%.*}
            local minor=${ver#*.}
            if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ] && [ "$minor" -le 13 ]; then
                echo "$candidate"
                return 0
            fi
        fi
    done

    # Fallback to default python3 if >= 3.10
    if command -v python3 >/dev/null 2>&1; then
        local ver
        ver=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
        local major=${ver%.*}
        local minor=${ver#*.}
        if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ]; then
            echo "python3"
            return 0
        fi
    fi

    return 1
}

PYTHON_BIN=$(find_python || true)

if [ -z "$PYTHON_BIN" ]; then
    echo -e "${RED}[ERROR] Compatible Python interpreter (>=3.10, <=3.13 recommended) not found!${NC}"
    echo "Please install Python 3.10, 3.11, or 3.12 (e.g., sudo apt install python3.12 python3.12-venv)."
    exit 1
fi

PY_VERSION=$("$PYTHON_BIN" --version)
echo -e "${GREEN}✓ Found compatible Python: $PYTHON_BIN ($PY_VERSION)${NC}"

# ------------------------------------------------------------------------------
# 2. Check Node.js and npm
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/7] Checking Node.js and npm for frontend...${NC}"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Node.js and npm are required for Next.js frontend!${NC}"
    echo "Please install Node.js >= 18 via nvm or package manager."
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ Node.js: $NODE_VERSION, npm: $NPM_VERSION${NC}"

# ------------------------------------------------------------------------------
# 3. Create / Verify Python Virtual Environment
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/7] Setting up Python virtual environment (.venv)...${NC}"

if [ ! -d ".venv" ] || [ ! -f ".venv/bin/python" ]; then
    echo "Creating virtual environment at $ROOT_DIR/.venv using $PYTHON_BIN..."
    "$PYTHON_BIN" -m venv .venv
else
    echo "Virtual environment already exists at $ROOT_DIR/.venv"
fi

VENV_PYTHON="$ROOT_DIR/.venv/bin/python"
VENV_PIP="$ROOT_DIR/.venv/bin/pip"

echo "Upgrading pip, setuptools, and wheel..."
"$VENV_PIP" install --quiet --upgrade pip setuptools wheel
echo -e "${GREEN}✓ Virtual environment is ready.${NC}"

# ------------------------------------------------------------------------------
# 4. Install PyTorch with CUDA or CPU Support
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/7] Installing PyTorch with hardware acceleration detection...${NC}"

CUDA_AVAILABLE=false
if command -v nvidia-smi >/dev/null 2>&1; then
    if nvidia-smi >/dev/null 2>&1; then
        CUDA_AVAILABLE=true
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
        echo -e "${GREEN}✓ NVIDIA GPU detected: $GPU_NAME${NC}"
    fi
fi

if [ "$CUDA_AVAILABLE" = true ]; then
    echo "Installing PyTorch with CUDA 12.4 support..."
    "$VENV_PIP" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 || \
    "$VENV_PIP" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 || \
    "$VENV_PIP" install torch torchvision torchaudio
else
    echo -e "${YELLOW}No NVIDIA GPU detected; installing PyTorch (CPU mode)...${NC}"
    "$VENV_PIP" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu || \
    "$VENV_PIP" install torch torchvision torchaudio
fi

# ------------------------------------------------------------------------------
# 5. Install Python Project Dependencies
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[5/7] Installing SRM ML, Geospatial, Backend, and Dashboard libraries...${NC}"

"$VENV_PIP" install \
    rasterio \
    rioxarray \
    scikit-image \
    lpips \
    opensr-model \
    sen2sr \
    mlstac \
    opensr-utils \
    opensr-test \
    cubo \
    pyyaml \
    omegaconf \
    fastapi \
    "uvicorn[standard]" \
    pydantic \
    requests \
    matplotlib \
    scipy \
    pandas \
    plotly \
    streamlit \
    folium \
    streamlit-folium \
    pytest

echo "Installing SRM package in editable mode..."
"$VENV_PIP" install -e .
echo -e "${GREEN}✓ Python dependencies installed successfully.${NC}"

# ------------------------------------------------------------------------------
# 6. Initialize Directories and SQLite Telemetry DB
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[6/7] Initializing directories and SQLite database...${NC}"

mkdir -p outputs data verification

"$VENV_PYTHON" -c "
try:
    from srm_api.db import init_db, backfill_from_outputs
    init_db()
    backfill_from_outputs()
    print('✓ Database initialized and historical scans indexed.')
except Exception as e:
    print(f'Note: DB initialization notice: {e}')
"
echo -e "${GREEN}✓ Runtime directories and database ready.${NC}"

# ------------------------------------------------------------------------------
# 7. Setup Frontend Dependencies
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}[7/7] Installing Next.js frontend dependencies...${NC}"

if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
    cd frontend
    echo "Running npm install in frontend directory..."
    npm install
    cd "$ROOT_DIR"
    echo -e "${GREEN}✓ Frontend dependencies installed.${NC}"
else
    echo -e "${RED}[WARNING] frontend directory or package.json not found!${NC}"
fi

# Ensure launcher scripts are executable
chmod +x setup.sh start_project.sh 2>/dev/null || true
if [ -f "start+project.sh" ]; then
    chmod +x "start+project.sh" 2>/dev/null || true
fi

echo ""
echo -e "${CYAN}=======================================================================${NC}"
echo -e "${GREEN}  ✓ SRM Setup Completed Successfully!                                 ${NC}"
echo -e "${CYAN}=======================================================================${NC}"
echo "To start both the FastAPI backend and Next.js frontend, run:"
echo -e "${YELLOW}  ./start_project.sh${NC}"
echo ""
echo "To run the environment diagnostic check:"
echo -e "${YELLOW}  ./.venv/bin/python scripts/run_env_check.py${NC}"
echo -e "${CYAN}=======================================================================${NC}"
