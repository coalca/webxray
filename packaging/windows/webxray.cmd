@echo off
setlocal
cd /d "%~dp0"

set "NODE=%~dp0runtime\node.exe"
set "LAUNCHER=%~dp0app\server\launcher.mjs"
set "SERVICE=%~dp0WebXrayService.exe"
set "WEBXRAY_PORTABLE_DATA_DIR=%~dp0data"
set "WEBXRAY_SERVICE_DATA_DIR=%ProgramData%\WebXray"
set "WEBXRAY_FRONTEND_DIR=%~dp0app\frontend"
set "WEBXRAY_BUNDLED_XRAY_DIR=%~dp0defaults\xray"
set "WEBXRAY_HOST=127.0.0.1"
set "NODE_ENV=production"

if /I "%~1"=="-s" goto service

set "WEBXRAY_DATA_DIR=%WEBXRAY_PORTABLE_DATA_DIR%"
set "WEBXRAY_DISTRIBUTION=windows-portable"
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

set "WEBXRAY_DATA_DIR=%WEBXRAY_SERVICE_DATA_DIR%"
set "WEBXRAY_DISTRIBUTION=windows-service"
if /I "%~2"=="token" set "WEBXRAY_SERVICE_UTILITY=--print-token"
if /I "%~2"=="url" set "WEBXRAY_SERVICE_UTILITY=--print-url"
if /I "%~2"=="doctor" set "WEBXRAY_SERVICE_UTILITY=--doctor"
if defined WEBXRAY_SERVICE_UTILITY goto service-utility
if /I "%~2"=="install" goto service-install
if /I "%~2"=="uninstall" goto service-uninstall
if /I "%~2"=="start" goto service-command
if /I "%~2"=="stop" goto service-command
if /I "%~2"=="restart" goto service-command
if /I "%~2"=="status" goto service-command
echo Usage: webxray.cmd -s install^|uninstall^|start^|stop^|restart^|status^|token^|url^|doctor
exit /b 2

:service-install
call :prepare-service-data
if errorlevel 1 exit /b 1
echo Service data: %WEBXRAY_SERVICE_DATA_DIR%
echo Access token:
"%NODE%" "%LAUNCHER%" --print-token
if errorlevel 1 exit /b 1
"%SERVICE%" install
if errorlevel 1 exit /b 1
"%SERVICE%" start
if errorlevel 1 exit /b 1
for /f "delims=" %%U in ('call "%~f0" -s url') do set "WEBXRAY_URL=%%U"
if not defined WEBXRAY_URL set "WEBXRAY_URL=http://127.0.0.1:3000"
if /I not "%WEBXRAY_NO_BROWSER%"=="1" start "" "%WEBXRAY_URL%"
exit /b 0

:service-uninstall
"%SERVICE%" stop >nul 2>&1
"%SERVICE%" uninstall
if errorlevel 1 exit /b 1
if exist "%WEBXRAY_SERVICE_DATA_DIR%" rmdir /s /q "%WEBXRAY_SERVICE_DATA_DIR%"
if exist "%WEBXRAY_SERVICE_DATA_DIR%" (
  echo Service was removed, but its data directory could not be deleted: %WEBXRAY_SERVICE_DATA_DIR%
  exit /b 1
)
echo Service data was permanently deleted: %WEBXRAY_SERVICE_DATA_DIR%
exit /b 0

:service-utility
call :prepare-service-data
if errorlevel 1 exit /b 1
"%NODE%" "%LAUNCHER%" %WEBXRAY_SERVICE_UTILITY%
exit /b %ERRORLEVEL%

:service-command
"%SERVICE%" %~2
exit /b %ERRORLEVEL%

:prepare-service-data
if not exist "%WEBXRAY_SERVICE_DATA_DIR%" mkdir "%WEBXRAY_SERVICE_DATA_DIR%"
if not exist "%WEBXRAY_SERVICE_DATA_DIR%" (
  echo Could not create service data directory: %WEBXRAY_SERVICE_DATA_DIR%
  exit /b 1
)
call :secure-service-data
exit /b %ERRORLEVEL%

:secure-service-data
icacls "%WEBXRAY_SERVICE_DATA_DIR%" /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" >nul
if errorlevel 1 (
  echo Could not grant service data access to SYSTEM and Administrators.
  exit /b 1
)
icacls "%WEBXRAY_SERVICE_DATA_DIR%" /inheritance:r >nul
if errorlevel 1 (
  echo Could not protect the service data directory.
  exit /b 1
)
exit /b 0
