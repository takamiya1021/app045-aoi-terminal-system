@echo off
setlocal EnableDelayedExpansion

:: Aoi-Terminals "One-Click" Launcher
:: ==========================================
:: This script automates:
:: 1. Admin privilege elevation (UAC)
:: 2. Port Forwarding & Tailscale IP Sync (via setup-port-forwarding.ps1)
:: 3. Starting the Aoi-Terminals system (via WSL)

title Aoi-Terminals Launcher

:: Check for UNC path execution issue (running from \\wsl.localhost\...)
if "%~dp0"=="%CD%\" (
    rem Running from standard path
) else (
    pushd "%~dp0"
)

:: Admin Privilege Check
NET FILE 1>NUL 2>NUL
if '%errorlevel%' == '0' ( goto :run ) else ( goto :elevate )

:elevate
    echo [Launcher] Requesting administrator privileges...
    powershell Start-Process -FilePath "%0" -Verb RunAs
    exit /b

:run
    echo [Launcher] Aoi-Terminals Auto-Setup
    echo -----------------------------------
    
    set SCRIPT_DIR=%~dp0
    :: Remove trailing backslash
    if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

    echo [Launcher] Detecting WSL IP...
    for /f "usebackq tokens=1" %%i in (`wsl bash -c "hostname -I | awk '{print $1}'"`) do set WSL_IP=%%i
    
    if "%WSL_IP%"=="" (
        echo [Error] Failed to detect WSL IP. Is WSL running?
        pause
        exit /b 1
    )
    echo [Launcher] WSL IP: !WSL_IP!
    
    echo [Launcher] Running Port Forwarding & IP Sync...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\setup-port-forwarding.ps1" -WSL_IP !WSL_IP!
    
    echo.
    echo [Launcher] Starting Aoi-Terminals System...
    wsl ~/.aoi-terminals/aoi-terminals start
    
    echo.
    echo [Launcher] Done! You can close this window.
    pause
