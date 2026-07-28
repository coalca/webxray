@echo off
setlocal
cd /d "%~dp0"
title WebXray - Direct Mode

echo WebXray direct mode
echo.
echo Access token:
call "%~dp0webxray.cmd" token
if errorlevel 1 goto failed

echo.
echo Opening http://127.0.0.1:3000
echo Keep this window open. Closing it stops WebXray.
echo Do not use direct mode while the WebXray service is running.
echo.
start "" "http://127.0.0.1:3000"
call "%~dp0webxray.cmd"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo WebXray stopped with error code %EXIT_CODE%.
  echo Check whether the WebXray service is already using port 3000.
  pause
)
exit /b %EXIT_CODE%

:failed
echo.
echo WebXray could not prepare its data directory.
pause
exit /b 1
