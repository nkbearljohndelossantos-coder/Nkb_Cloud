@echo off
TITLE NKB Cloud Storage Agent - Windows Service Installer
echo =========================================================================
echo               NKB CLOUD - WINDOWS STORAGE AGENT INSTALLER
echo                       NKB Manufacturing (C) 2026
echo =========================================================================
echo.

:: Check for Administrator elevation
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This installer must be executed as Administrator!
    echo Right-click this file and select 'Run as administrator'.
    pause
    exit /b 1
)

echo [1/3] Checking Node.js runtime...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js v18+ from https://nodejs.org
    pause
    exit /b 1
)

echo [2/3] Installing dependencies...
cd /d "%~dp0"
call npm.cmd install --production

echo [3/3] Registering NKB Storage Agent as Windows Service...
node service-install.js

echo.
echo =========================================================================
echo  Installation Complete!
echo  The NKB Storage Agent is now registered to start automatically on boot.
echo =========================================================================
pause
