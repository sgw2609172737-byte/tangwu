@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TangWu Server (LAN)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Please install Node.js from https://nodejs.org and retry.
  pause
  exit /b 1
)
if not exist "%~dp0server.js" (
  echo [ERROR] server.js not found. Keep this .bat inside the "tangwu" folder.
  pause
  exit /b 1
)

echo Starting TangWu server at http://localhost:8800 ...
echo Local / LAN play only. For public online play, use "online-play.bat".
echo Close this window or press Ctrl+C to stop.
node server.js
pause
