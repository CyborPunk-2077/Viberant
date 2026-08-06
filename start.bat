@echo off
rem  Viberant, started the way you would start any other app.
rem
rem  Double-click this. It opens the manager in your browser. Closing this
rem  window stops it. Nothing is installed and nothing is left behind.

setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Viberant needs Node on this computer, and it is not here yet.
  echo   Get it from https://nodejs.org, then start this again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Viberant is starting. Your browser will open on its own.
echo   Closing this window stops it.
echo.

set VIBERANT_OPEN=1
node "app\server.mjs"

rem  If the server stopped straight away, the window would vanish before anyone
rem  could read why. Hold it open instead.
if errorlevel 1 (
  echo.
  echo   Viberant stopped. The reason is above this line.
  echo.
  pause
)
