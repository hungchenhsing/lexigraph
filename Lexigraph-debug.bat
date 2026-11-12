@echo off
REM Lexigraph DEBUG launcher — verbose, never closes window
REM Use this when the normal Lexigraph.bat fails silently.
chcp 65001 >nul 2>&1
title Lexigraph Debug
cd /d "%~dp0"

echo ===================================================
echo  Lexigraph DEBUG launcher
echo ===================================================
echo  Current dir: %CD%
echo  Time: %DATE% %TIME%
echo.

REM ---- Diagnostics ----
echo [1] Check working directory contents:
dir /b *.bat *.json 2>&1
echo.

echo [2] Check Node / npm / npx:
where node 2>nul
where npm 2>nul
where npx 2>nul
node -v 2>nul
npm -v 2>nul
echo.

echo [3] Check dist/ folder:
if exist "dist\index.html" (
    echo   OK: dist\index.html exists.
) else (
    echo   MISSING: dist\index.html — must run setup.bat first.
)
echo.

echo [4] Check Chrome locations:
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" echo   FOUND %ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" echo   FOUND %ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" echo   FOUND %LocalAppData%\Google\Chrome\Application\chrome.exe
echo.

echo [5] Check port 5173 status (anything currently listening?):
netstat -ano | findstr :5173
echo.

echo ===================================================
echo  If above looks OK, attempting to start server...
echo ===================================================
echo.

if not exist "dist\index.html" (
    echo  Cannot start: dist\ missing. Run setup.bat first.
    echo.
    pause
    exit /b 1
)

echo  Running vite preview in foreground so you see errors:
echo.
npx vite preview --port 5173 --host 127.0.0.1

echo.
echo  Server stopped.
pause
exit /b 0
