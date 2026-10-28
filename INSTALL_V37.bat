@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL_V37.ps1"
set "result=%ERRORLEVEL%"
echo.
pause
exit /b %result%
