@echo off
REM Lexigraph launcher — start vite preview + open Chrome --app window
chcp 65001 >nul 2>&1
title Lexigraph
cd /d "%~dp0"

REM ---- Check dist/ exists ----
if not exist "dist\index.html" (
    echo.
    echo  ERROR: dist\index.html not found.
    echo  Please run setup.bat first to install + build.
    echo.
    pause
    exit /b 1
)

REM ---- Check npx available ----
where npx >nul 2>nul
if errorlevel 1 (
    echo.
    echo  ERROR: npx not found. Install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM ---- Start vite preview server in a minimized window ----
REM   Bind to 127.0.0.1 (also reachable via http://localhost:5173/)
start "Lexigraph Server" /min cmd /c "chcp 65001 >nul & npx vite preview --port 5173 --host 127.0.0.1"

echo  Lexigraph starting...
echo  (server window minimized to taskbar)
echo.

REM ---- Wait for server to come up ----
timeout /t 3 /nobreak >nul

REM ---- Detect Chrome ----
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
    echo  Opening Chrome app window...
    start "" "%CHROME%" --app=http://localhost:5173 --new-window
) else (
    echo  Chrome not found, opening default browser...
    start "" "http://localhost:5173"
)

echo.
echo  Done. Close this window when finished.
echo  (To stop the server, close the minimized "Lexigraph Server" cmd window.)
echo.
timeout /t 5 /nobreak >nul
exit /b 0
