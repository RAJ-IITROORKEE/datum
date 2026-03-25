@echo off
setlocal

set DATUM_URL=https://datumcopilot.vercel.app

echo Starting Datum Revit Agent...
echo Using DATUM_URL=%DATUM_URL%

if exist "%~dp0..\dist\DatumRevitAgent.exe" (
  "%~dp0..\dist\DatumRevitAgent.exe" --url %DATUM_URL%
) else (
  echo ERROR: DatumRevitAgent.exe not found in dist folder.
  echo Build it first using: npm run build:revit-agent:exe
)

endlocal
