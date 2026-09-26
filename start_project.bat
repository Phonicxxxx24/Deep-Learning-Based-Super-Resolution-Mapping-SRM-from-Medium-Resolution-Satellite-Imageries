@echo off
:: SRM Root Launcher - Forwards to windows\start_project.bat
if exist "%~dp0windows\start_project.bat" (
    call "%~dp0windows\start_project.bat" %*
) else (
    echo [ERROR] windows\start_project.bat not found.
    pause
)
