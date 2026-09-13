@echo off
setlocal
cd /d "%~dp0"

echo Creating Desktop Shortcut for Policy Manager...

set "TARGET_BAT=%~dp0launch_app.bat"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\Policy Manager.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Description = 'Document & Policy Manager'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [OK] Shortcut created successfully on your Desktop!
    echo Look for "Policy Manager" on your Desktop.
) else (
    echo [ERROR] Failed to create shortcut.
)

pause
