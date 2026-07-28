@echo off
setlocal
cd /d "%~dp0"

set "NODE=%~dp0runtime\node.exe"
set "LAUNCHER=%~dp0app\server\launcher.mjs"
set "SERVICE=%~dp0WebXrayService.exe"
set "WEBXRAY_DATA_DIR=%~dp0data"
set "WEBXRAY_FRONTEND_DIR=%~dp0app\frontend"
set "WEBXRAY_BUNDLED_XRAY_DIR=%~dp0defaults\xray"
set "WEBXRAY_HOST=127.0.0.1"
set "WEBXRAY_DISTRIBUTION=windows-portable"
set "NODE_ENV=production"

if /I "%~1"=="-s" goto service
if /I "%~1"=="token" goto token
if /I "%~1"=="url" goto url
if /I "%~1"=="doctor" goto doctor

"%NODE%" "%LAUNCHER%" %*
exit /b %ERRORLEVEL%

:token
"%NODE%" "%LAUNCHER%" --print-token
exit /b %ERRORLEVEL%

:url
"%NODE%" "%LAUNCHER%" --print-url
exit /b %ERRORLEVEL%

:doctor
"%NODE%" "%LAUNCHER%" --doctor
exit /b %ERRORLEVEL%

:service
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Please run this command in an Administrator terminal.
  exit /b 1
)

if /I "%~2"=="install" (
  if not exist "%WEBXRAY_DATA_DIR%" mkdir "%WEBXRAY_DATA_DIR%"
  echo Access token:
  "%NODE%" "%LAUNCHER%" --print-token
  "%SERVICE%" install
  if errorlevel 1 exit /b %ERRORLEVEL%
  "%SERVICE%" start
  if errorlevel 1 exit /b %ERRORLEVEL%
  for /f "delims=" %%U in ('call "%~f0" url') do set "WEBXRAY_URL=%%U"
  if not defined WEBXRAY_URL set "WEBXRAY_URL=http://127.0.0.1:3000"
  start "" "%WEBXRAY_URL%"
  exit /b 0
)
if /I "%~2"=="uninstall" (
  "%SERVICE%" stop
  "%SERVICE%" uninstall
  exit /b %ERRORLEVEL%
)
if /I "%~2"=="start" goto service-command
if /I "%~2"=="stop" goto service-command
if /I "%~2"=="restart" goto service-command
if /I "%~2"=="status" goto service-command
echo Usage: webxray.cmd -s install^|uninstall^|start^|stop^|restart^|status
exit /b 2

:service-command
"%SERVICE%" %~2
exit /b %ERRORLEVEL%
