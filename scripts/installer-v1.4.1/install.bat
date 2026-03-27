@echo off
echo Creating Datum Revit Agent v1.4.1 Installer...

REM Kill any running agent
taskkill /F /IM DatumRevitAgent.exe 2>nul

REM Create installation directory
mkdir "C:\Program Files\Datumm\RevitAgent" 2>nul

REM Copy the new agent
echo Copying DatumRevitAgent.exe...
copy /Y "%~dp0DatumRevitAgent.exe" "C:\Program Files\Datumm\RevitAgent\DatumRevitAgent.exe"

REM Create Start Menu shortcut
echo Creating shortcut...
mkdir "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Datumm" 2>nul
powershell "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Datumm\Datum Revit Agent.lnk'); $Shortcut.TargetPath = 'C:\Program Files\Datumm\RevitAgent\DatumRevitAgent.exe'; $Shortcut.Save()"

REM Clean old config to force re-pairing with new version
rd /s /q "%APPDATA%\DatumRevitAgent" 2>nul

echo.
echo ✓ Datum Revit Agent v1.4.1 installed successfully!
echo ✓ You can now run it from Start Menu or directly
echo.
echo Location: C:\Program Files\Datumm\RevitAgent\DatumRevitAgent.exe
echo.
pause