@echo off
REM Lexigraph first-time setup: npm install + npm run build
chcp 65001 >nul 2>&1
title Lexigraph Setup
cd /d "%~dp0"

echo.
echo =====================================================
echo  Lexigraph Setup [Step 1/2] npm install
echo =====================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo  ERROR: npm not found.
    echo  Install Node.js LTS from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo.
    echo  ERROR: npm install failed. Check network or proxy.
    echo.
    pause
    exit /b 1
)

echo.
echo =====================================================
echo  Lexigraph Setup [Step 2/2] vite build
echo =====================================================
echo.

call npm run build
if errorlevel 1 (
    echo.
    echo  ERROR: vite build failed. Check the messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo =====================================================
echo  DONE.  dist/ produced.
echo  Now double-click  Lexigraph.bat  to launch.
echo =====================================================
echo.
pause
exit /b 0
