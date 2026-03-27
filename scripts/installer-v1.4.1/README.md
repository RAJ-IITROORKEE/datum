# Datum Revit Agent v1.4.1 Installer

## Installation Options

### Option 1: Run Installer (Recommended)
1. Right-click `install.bat` 
2. Choose "Run as administrator"
3. Follow the prompts

This will:
- Install to `C:\Program Files\Datumm\RevitAgent\`
- Create Start Menu shortcut
- Clean old configuration for fresh pairing

### Option 2: Run Directly
Just double-click `DatumRevitAgent.exe` to run without installing.

## Features in v1.4.1
- ✅ Auto-detects localhost:3000 for development
- ✅ Falls back to production automatically  
- ✅ `--kill` flag to terminate existing processes
- ✅ Enhanced debug logging
- ✅ Improved error handling

## Usage
After installation, generate a pairing code in Copilot (/copilot → Revit button) and enter it when prompted.

## Troubleshooting
- If you see "already running" error, use: `DatumRevitAgent.exe --kill`
- For localhost development, no flags needed - auto-detects
- For production only, use: `DatumRevitAgent.exe --url https://datumcopilot.vercel.app`