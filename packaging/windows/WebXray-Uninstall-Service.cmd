@echo off
setlocal
cd /d "%~dp0"
title WebXray - Uninstall Service

echo WebXray service removal
echo.
echo This stops and removes the Windows service.
echo WARNING: This permanently deletes %ProgramData%\WebXray.
echo Tokens, nodes, subscriptions, Xray, Geo files, configuration, and logs will be erased.
echo.

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Administrator permission is required.
  echo Right-click this file and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)

call "%~dp0webxray.cmd" -s uninstall
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" (
  echo WebXray service and all service data were removed.
) else (
  echo Service removal failed with error code %EXIT_CODE%.
)
pause
exit /b %EXIT_CODE%
