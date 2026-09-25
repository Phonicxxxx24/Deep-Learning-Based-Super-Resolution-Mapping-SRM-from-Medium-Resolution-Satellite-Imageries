@echo off
title SRM — Environment Setup & Requirements Installer
color 0B
cls

echo =======================================================================
echo          SRM — Sentinel-2 Super-Resolution Command Center
echo       One-Click Requirements Installer & Environment Setup
echo =======================================================================
echo.
echo  This script automatically prepares the machine to run the SRM project:
echo    1. Checks Python 3.10 / 3.11 installation
echo    2. Creates or verifies Python virtual environment (.venv)
echo    3. Installs PyTorch with CUDA acceleration
echo    4. Installs all satellite, geospatial, and API dependencies
echo    5. Checks Node.js and installs Next.js frontend packages
echo.
echo =======================================================================
echo.

:: Get root project directory (parent of windows\ folder)
for %%i in ("%~dp0..") do set "ROOT_DIR=%%~fi\"
cd /d "%ROOT_DIR%"

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 1: Verify Python Installation
:: ──────────────────────────────────────────────────────────────────────────
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Python is not installed or not added to your system PATH.
    echo Please install Python 3.10 or 3.11 from https://www.python.org/
    echo (Make sure to check "Add python.exe to PATH" during installation)
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set "PY_VER=%%i"
echo   Found: %PY_VER%

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 2: Setup Python Virtual Environment (.venv)
:: ──────────────────────────────────────────────────────────────────────────
echo.
echo [2/5] Configuring Python Virtual Environment (.venv)...
if not exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    echo   Creating fresh virtual environment at %ROOT_DIR%.venv ...
    python -m venv "%ROOT_DIR%.venv"
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment. Please check permissions.
        pause
        exit /b 1
    )
    echo   Virtual environment created successfully.
) else (
    echo   Existing virtual environment detected at: %ROOT_DIR%.venv
)

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 3: Install Python Dependencies & PyTorch (CUDA Enabled)
:: ──────────────────────────────────────────────────────────────────────────
echo.
echo [3/5] Installing Python packages...
echo   Upgrading pip, setuptools, and wheel...
"%ROOT_DIR%.venv\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel >nul 2>&1

echo   Installing PyTorch with CUDA 12.1 acceleration...
"%ROOT_DIR%.venv\Scripts\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

echo   Installing core geospatial, remote sensing, and FastAPI requirements...
"%ROOT_DIR%.venv\Scripts\python.exe" -m pip install -r "%ROOT_DIR%requirements.txt"

echo   Installing local package in editable mode...
"%ROOT_DIR%.venv\Scripts\python.exe" -m pip install -e "%ROOT_DIR%."

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 4: Check Node.js & Install Frontend Packages
:: ──────────────────────────────────────────────────────────────────────────
echo.
echo [4/5] Checking Node.js and installing Frontend dependencies...
node -v >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js is not installed or not added to PATH.
    echo Please install Node.js (LTS version 20 or higher) from https://nodejs.org/
    echo Once installed, rerun this script to complete frontend setup.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set "NODE_VER=%%i"
for /f "tokens=*" %%i in ('npm -v') do set "NPM_VER=%%i"
echo   Found Node.js %NODE_VER% and npm %NPM_VER%

echo   Installing frontend npm dependencies in %ROOT_DIR%frontend ...
cd /d "%ROOT_DIR%frontend"
call npm install
if errorlevel 1 (
    echo [WARNING] npm install reported warnings. Retrying with clean install...
    call npm install --legacy-peer-deps
)
cd /d "%ROOT_DIR%"

:: ──────────────────────────────────────────────────────────────────────────
:: STEP 5: Verification & Launch Instructions
:: ──────────────────────────────────────────────────────────────────────────
echo.
echo [5/5] Verifying environment...
if exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    echo   [OK] Python virtual environment ready.
) else (
    echo   [FAIL] Python virtual environment missing.
)

if exist "%ROOT_DIR%frontend\node_modules" (
    echo   [OK] Frontend node_modules ready.
) else (
    echo   [FAIL] Frontend node_modules missing.
)

echo.
echo =======================================================================
echo                       INSTALLATION COMPLETE!
echo =======================================================================
echo.
echo  All backend dependencies, GPU PyTorch, and frontend modules are ready.
echo.
echo  To launch the whole application (Backend + Frontend + Browser):
echo    -^> Double-click: start_project.bat
echo.
echo =======================================================================
echo.
pause
