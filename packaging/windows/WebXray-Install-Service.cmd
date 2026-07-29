@echo off
setlocal
cd /d "%~dp0"
title WebXray - Install Service

echo WebXray service mode
echo.
echo This installs WebXray as an automatic Windows service.
echo Service data will be stored in %ProgramData%\WebXray.
echo Stop any directly running WebXray window before continuing.
echo.

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Administrator permission is required.
  echo Right-click this file and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)

call "%~dp0webxray.cmd" -s install
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if "%EXIT_CODE%"=="0" (
  echo WebXray is installed and running as a Windows service.
  echo Service data: %ProgramData%\WebXray
) else (
  echo Service installation failed with error code %EXIT_CODE%.
)
pause
exit /b %EXIT_CODE%
