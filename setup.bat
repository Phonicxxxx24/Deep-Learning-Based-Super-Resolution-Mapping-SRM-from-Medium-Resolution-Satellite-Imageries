@echo off
:: SRM Root Setup - Forwards to windows\setup.bat
if exist "%~dp0windows\setup.bat" (
    call "%~dp0windows\setup.bat" %*
) else (
    echo [ERROR] windows\setup.bat not found.
    pause
)
