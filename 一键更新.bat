@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TangWu - Push Update

rem Find git: check PATH first, then GitHub Desktop's bundled git
set "GIT="
where git >nul 2>nul && set "GIT=git"
if not defined GIT (
  for /d %%d in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%d\resources\app\git\cmd\git.exe" set "GIT=%%d\resources\app\git\cmd\git.exe"
  )
)
if not defined GIT (
  echo [ERROR] git not found on this computer.
  echo Option 1: Open GitHub Desktop, select your tangwu repo,
  echo           then click "Push origin" in the top bar.
  echo Option 2: On github.com open your tangwu repo - Add file -
  echo           Upload files - drag this whole folder in - Commit.
  pause
  exit /b 1
)

if not exist "%~dp0.git" (
  echo [ERROR] This folder is not a git repository yet.
  echo First: GitHub Desktop - File - Add local repository - choose this
  echo        folder - Publish it to GitHub. Then run this file again.
  pause
  exit /b 1
)

echo Uploading changes to GitHub...
"%GIT%" add -A
"%GIT%" commit -m "update %RANDOM%" >nul 2>nul
"%GIT%" push
echo.
echo Done! Vercel will redeploy automatically in about 1 minute.
echo The game link stays the same.
pause
