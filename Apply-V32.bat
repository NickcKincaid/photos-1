@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-V32.ps1"
set "result=%ERRORLEVEL%"
echo.
if not "%result%"=="0" (
  echo Installation checks failed. Review the message above. Do not push until fixed.
) else (
  echo Open GitHub Desktop, inspect the changed files, then Commit and Push origin.
)
pause
exit /b %result%
