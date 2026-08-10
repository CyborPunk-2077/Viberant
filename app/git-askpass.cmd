@echo off
set "VIBERANT_GIT_PROMPT=%~1"
echo %VIBERANT_GIT_PROMPT%| findstr /i "username" >nul
if %errorlevel%==0 (
  echo %VIBERANT_GITHUB_USER%
) else (
  echo %VIBERANT_GITHUB_TOKEN%
)
