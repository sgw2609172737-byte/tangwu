@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TangWu - Online

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Please install Node.js from https://nodejs.org
  echo and check "Add to PATH" during install, then run this again.
  pause
  exit /b 1
)

if not exist "%~dp0host.js" (
  echo [ERROR] host.js not found in: %~dp0
  echo.
  echo Please keep this .bat file INSIDE the "tangwu" folder, together with:
  echo   host.js, server.js, engine.js, skills.js, run.bat, and the "public" folder.
  echo Do NOT copy only this .bat file to another location.
  echo Copy the WHOLE "tangwu" folder instead.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0tools" mkdir "%~dp0tools"
if not exist "%~dp0tools\cloudflared.exe" (
  echo First run: downloading cloudflared ^(~40MB, one time only^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0tools\cloudflared.exe'"
)
if not exist "%~dp0tools\cloudflared.exe" (
  echo [ERROR] cloudflared download failed.
  echo Check your network and retry, or manually download
  echo cloudflared-windows-amd64.exe from https://github.com/cloudflare/cloudflared/releases
  echo and put it into the tools folder.
  pause
  exit /b 1
)

echo.
echo Starting game server and public tunnel...
echo A public link will open in your browser automatically.
echo Close this window to stop.
echo.
node host.js
pause
