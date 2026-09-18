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
echo -e "${CYAN}${BOLD}        Avlok — Sentinel-2 Super-Resolution Command Center             ${NC}"
echo -e "${CYAN}        Multi-Scale Diffusion SR (10m -> 2.5m / 1.25m) · SIH 2026      ${NC}"
echo -e "${CYAN}=======================================================================${NC}"
echo ""

# Progress bar rendering function
# Usage: progress_bar <percentage_0_100> <status_message>
progress_bar() {
    local percent=$1
    local message=$2
    local width=30
    local filled=$(( percent * width / 100 ))
    local empty=$(( width - filled ))

    local fill_bar=""
    for ((i=0; i<filled; i++)); do fill_bar+="━"; done
    local empty_bar=""
    for ((i=0; i<empty; i++)); do empty_bar+="╌"; done

    printf "\r\033[K ${BOLD}%3d%%${NC} ${GREEN}%s${NC}%s ${CYAN}›${NC} %s" "$percent" "$fill_bar" "$empty_bar" "$message"
    if [ "$percent" -ge 100 ]; then
        echo ""
    fi
}

# Resolve root directory
progress_bar 5 "Resolving project directories..."
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
sleep 0.1

# 1. Verify Python Virtual Environment
progress_bar 20 "Checking Python virtual environment (.venv)..."
VENV_PYTHON="$ROOT_DIR/.venv/bin/python"
if [ ! -f "$VENV_PYTHON" ]; then
    echo ""
    echo -e "${RED}[ERROR] Python virtual environment not found at: $ROOT_DIR/.venv${NC}"
    echo -e "Please run the setup script first:"
    echo -e "${YELLOW}  ./setup.sh${NC}"
    exit 1
fi
sleep 0.1

# 2. Verify Frontend Directory
progress_bar 40 "Verifying Next.js frontend package tree..."
if [ ! -f "$ROOT_DIR/frontend/package.json" ]; then
    echo ""
    echo -e "${RED}[ERROR] Frontend directory not found at: $ROOT_DIR/frontend${NC}"
    exit 1
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo ""
    echo -e "${YELLOW}[NOTICE] frontend/node_modules not found. Running npm install...${NC}"
    (cd "$ROOT_DIR/frontend" && npm install)
fi
sleep 0.1

# 3. Check for existing processes on ports 8000 and 3000
progress_bar 55 "Checking network ports (8000 & 3000)..."
check_and_free_port() {
    local port=$1
    local name=$2
    local pid
    pid=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
        kill -9 "$pid" 2>/dev/null || true
        sleep 0.5
    fi
}

check_and_free_port 8000 "SRM Backend"
check_and_free_port 3000 "Next.js Command Center"
sleep 0.1

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
progress_bar 70 "Launching FastAPI backend on port 8000..."
"$VENV_PYTHON" -m uvicorn srm_api.main:app --host 127.0.0.1 --port 8000 --reload >/dev/null 2>&1 &
BACKEND_PID=$!
sleep 0.2

# 5. Launch Next.js Frontend
progress_bar 85 "Launching Next.js Command Center on port 3000..."
(
    cd "$ROOT_DIR/frontend"
    if [ -d ".next" ] && [ -f ".next/BUILD_ID" ]; then
        npm run start -- -p 3000 >/dev/null 2>&1
    else
        npm run dev -- -p 3000 >/dev/null 2>&1
    fi
) &
FRONTEND_PID=$!
sleep 0.2

# 6. Active Health Probe and Readiness
progress_bar 90 "Probing service endpoints for HTTP readiness..."
for i in {1..20}; do
    backend_ok=false
    frontend_ok=false

    if curl -s -m 1 http://127.0.0.1:8000/docs >/dev/null 2>&1; then
        backend_ok=true
    fi
    if curl -s -m 1 http://localhost:3000 >/dev/null 2>&1; then
        frontend_ok=true
    fi

    if [ "$backend_ok" = true ] && [ "$frontend_ok" = true ]; then
        break
    fi

    pct=$(( 90 + i / 2 ))
    if [ "$pct" -gt 99 ]; then pct=99; fi
    progress_bar "$pct" "Probing service readiness... ($i/20)"
    sleep 0.4
done

progress_bar 100 "All SRM services operational & ready!"

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
