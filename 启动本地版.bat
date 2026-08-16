@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  echo [ERROR] 未找到 Microsoft Edge，请先安装 Edge 再运行。
  pause
  exit /b 1
)
set "DIR=%~dp0"
set "URL=file:///%DIR:\=/%public/local.html"
start "" "%EDGE%" --app="%URL%"
