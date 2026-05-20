@echo off
REM ============================================================
REM FLOW Mega Apps — Local Dev Server (v3.9) — Windows
REM
REM Usage:  start.bat             (defaults to port 8080)
REM         start.bat 9000        (custom port)
REM
REM Requires: Python 3 from python.org (check "Add Python to PATH"
REM           during install).
REM ============================================================

setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

cd /d "%~dp0"

if not exist "index.html" (
  echo [X] Must be run from the flow-mega-apps folder.
  pause & exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo [X] Python not found. Install from https://python.org
  echo     and tick "Add Python to PATH" during setup.
  pause & exit /b 1
)

echo.
echo   FLOW Mega Apps — local dev server
echo   ^> http://localhost:%PORT%/
echo.
echo   Demo accounts ^(click them on the login screen^):
echo     admin@demo                ^(read-only^)
echo     supervisor.sales@demo     ^(full edit^)
echo     supervisor.ss@demo        ^(full edit^)
echo     user.sales@demo           ^(limited^)
echo     user.ss@demo              ^(limited^)
echo   ^(password for all: demo^)
echo.
echo   Stop: press Ctrl+C
echo.

start "" "http://localhost:%PORT%/"
python -m http.server %PORT% --bind 127.0.0.1
endlocal
