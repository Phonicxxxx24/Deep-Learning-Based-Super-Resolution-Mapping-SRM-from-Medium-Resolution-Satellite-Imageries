#!/usr/bin/env bash
# ==============================================================================
# SRM — Sentinel-2 Super-Resolution Command Center Launcher
# 4x & 8x Dual-Path Diffusion SR (10m -> 2.5m & 1.25m) · Next.js Command Center
# ==============================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}=======================================================================${NC}"
echo -e "${CYAN}${BOLD}         SRM — Sentinel-2 Super-Resolution Command Center             ${NC}"
echo -e "${CYAN}         Multi-Scale Diffusion SR (10m -> 2.5m / 1.25m) · SIH 2026     ${NC}"
echo -e "${CYAN}=======================================================================${NC}"
echo ""

# Resolve root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 1. Verify Python Virtual Environment
VENV_PYTHON="$ROOT_DIR/.venv/bin/python"
if [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${RED}[ERROR] Python virtual environment not found at: $ROOT_DIR/.venv${NC}"
    echo -e "Please run the setup script first:"
    echo -e "${YELLOW}  ./setup.sh${NC}"
    exit 1
fi

# 2. Verify Frontend Directory
if [ ! -f "$ROOT_DIR/frontend/package.json" ]; then
    echo -e "${RED}[ERROR] Frontend directory not found at: $ROOT_DIR/frontend${NC}"
    exit 1
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo -e "${YELLOW}[NOTICE] frontend/node_modules not found. Running npm install...${NC}"
    (cd "$ROOT_DIR/frontend" && npm install)
fi

# 3. Check for existing processes on ports 8000 and 3000
check_and_free_port() {
    local port=$1
    local name=$2
    local pid
    pid=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}[WARNING] Port $port ($name) is currently used by PID $pid.${NC}"
        echo -e "Stopping previous instance..."
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
    fi
}

check_and_free_port 8000 "SRM Backend"
check_and_free_port 3000 "Next.js Command Center"

# Process IDs
BACKEND_PID=""
FRONTEND_PID=""

# Cleanup handler on exit or Ctrl+C
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down SRM services...${NC}"
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Stopping Backend (PID: $BACKEND_PID)..."
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "Stopping Frontend (PID: $FRONTEND_PID)..."
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    wait "$BACKEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
    echo -e "${GREEN}All services have been gracefully stopped.${NC}"
}
trap cleanup SIGINT SIGTERM EXIT

# 4. Launch FastAPI Backend
echo -e "${YELLOW}[1/2] Launching FastAPI Backend on http://127.0.0.1:8000...${NC}"
"$VENV_PYTHON" -m uvicorn srm_api.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# 5. Launch Next.js Frontend
echo -e "${YELLOW}[2/2] Launching Next.js Command Center on http://localhost:3000...${NC}"
(
    cd "$ROOT_DIR/frontend"
    if [ -d ".next" ] && [ -f ".next/BUILD_ID" ]; then
        npm run start -- -p 3000
    else
        npm run dev -- -p 3000
    fi
) &
FRONTEND_PID=$!

# 6. Wait for services to initialize
echo -e "${YELLOW}Waiting for services to initialize...${NC}"
sleep 4

echo ""
echo -e "${CYAN}=======================================================================${NC}"
echo -e "${GREEN}${BOLD}  ✓ SRM Enterprise Command Center is now running!                      ${NC}"
echo -e "${CYAN}-----------------------------------------------------------------------${NC}"
echo -e "  ${BOLD}• Next.js Command Center:${NC} ${CYAN}http://localhost:3000${NC} ${GREEN}(Interactive Swipe, 4x/8x Multi-Scale)${NC}"
echo -e "  ${BOLD}• Backend API           :${NC} ${CYAN}http://127.0.0.1:8000${NC}"
echo -e "  ${BOLD}• Interactive Docs      :${NC} ${CYAN}http://127.0.0.1:8000/docs${NC}"
echo -e "  ${BOLD}• Past Scans SQLite     :${NC} $ROOT_DIR/data/srm_scans.db"
echo -e "${CYAN}=======================================================================${NC}"
echo ""

# Attempt to open browser if GUI display is available
if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        echo "Opening browser to http://localhost:3000 ..."
        xdg-open http://localhost:3000 >/dev/null 2>&1 &
    fi
fi

echo -e "Press ${BOLD}Ctrl+C${NC} in this terminal to stop both services."
echo ""

# Wait for background processes
wait "$BACKEND_PID" "$FRONTEND_PID"
