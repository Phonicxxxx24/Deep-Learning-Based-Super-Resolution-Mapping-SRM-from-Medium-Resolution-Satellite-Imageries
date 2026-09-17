@echo off
title SRM — Sentinel-2 Super-Resolution Command Center
color 0B
cls

echo =======================================================================
echo          SRM — Sentinel-2 Super-Resolution Command Center
echo          4x Dual-Path Diffusion SR (10m -^> 2.5m) · SIH 2026
echo =======================================================================
echo.

:: Get directory of the bat script
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: Check Python Virtual Environment
if not exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment not found at: %ROOT_DIR%.venv
    echo Please create the virtual environment before launching.
    pause
    exit /b 1
)

:: Check Node.js / frontend
if not exist "%ROOT_DIR%frontend\package.json" (
    echo [ERROR] Frontend directory not found at: %ROOT_DIR%frontend
    pause
    exit /b 1
)

echo [1/3] Launching FastAPI Backend on http://127.0.0.1:8000...
start "SRM Backend (:8000)" cmd /k "cd /d "%ROOT_DIR%" && title SRM Backend (:8000) && color 0A && .venv\Scripts\python.exe -m uvicorn srm_api.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/3] Launching Next.js Frontend on http://localhost:3000...
start "SRM Frontend (:3000)" cmd /k "cd /d "%ROOT_DIR%frontend" && title SRM Frontend (:3000) && color 09 && npm run dev"

echo [3/3] Waiting for services to initialize...
timeout /t 4 /nobreak >nul

echo.
echo =======================================================================
echo   Services are running!
echo   - Frontend Interface : http://localhost:3000
echo   - Backend API        : http://127.0.0.1:8000
echo   - Interactive Docs   : http://127.0.0.1:8000/docs
echo   - Past Scans SQLite  : %ROOT_DIR%data\srm_scans.db
echo =======================================================================
echo.
echo Opening browser to http://localhost:3000 ...
start http://localhost:3000

echo.
echo Leave this window open or press any key to close this launcher.
echo (The background service windows will remain running)
pause >nul
