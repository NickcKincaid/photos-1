@echo off
setlocal
cd /d "%~dp0"
if not exist "build.py" (
  echo ERROR: Place this file in the photos-1 repository root, alongside build.py.
  pause
  exit /b 1
)
echo This removes only nine obsolete migration scripts/routes/tests.
echo It will NOT touch content, media, photos, notes, or the private uploader.
choice /m "Remove retired files"
if errorlevel 2 exit /b 0
del /q ".github\workflows\rename-project-photos.yml" 2>nul
del /q "functions\api\admin\standardize.js" 2>nul
del /q "functions\api\admin\migrate.js" 2>nul
del /q "functions\api\admin\purge.js" 2>nul
del /q "scripts\rename_project_photos.py" 2>nul
del /q "scripts\credit_project_photos.py" 2>nul
del /q "scripts\optimize_project_photos.py" 2>nul
del /q "tests\standardize.test.mjs" 2>nul
del /q "tests\browser_v21.py" 2>nul
echo Finished. Review deleted files in GitHub Desktop before committing.
pause
