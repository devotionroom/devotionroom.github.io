@echo off
echo ====================================
echo  Devotion Room Site Updater
echo ====================================
node scripts\update-site.js
if errorlevel 1 (
  echo.
  echo Script exited with an error. See above.
)
pause
