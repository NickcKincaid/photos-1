@echo off
setlocal
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3 "%~dp0scripts\v32_audit.py"
) else (
  where python >nul 2>nul
  if %ERRORLEVEL%==0 (
    python "%~dp0scripts\v32_audit.py"
  ) else (
    echo Python 3 is not installed on this PC. Skip this optional read-only audit.
    echo Cloudflare builds with Python when you push to GitHub.
  )
)
echo.
pause
