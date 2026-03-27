; See installer.nsi for comments

!define APP_NAME "DatumRevitAgent"
!define APP_VERSION "1.5.0"
!define EXE_NAME "DatumRevitAgent.exe"
!define INSTALLER_NAME "DatumRevitAgent-Installer-v${APP_VERSION}.exe"
!define PRODUCT_NAME "Datum Revit Agent"
!define PRODUCT_VERSION "${APP_VERSION}"
!define PRODUCT_PUBLISHER "Datumm"
!define PRODUCT_WEB_SITE "https://datumm.ai"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define MUI_ABORTWARNING
; Icons are relative to the scripts folder
; !define MUI_ICON "icons\installer_icon.ico"
; !define MUI_UNICON "icons\uninstaller_icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\public\downloads\${INSTALLER_NAME}"
InstallDir "$PROGRAMFILES64\Datumm\RevitAgent"
InstallDirRegKey HKLM "${PRODUCT_UNINST_KEY}" "InstallLocation"
ShowInstDetails show

Section "MainSection" SEC01
  nsExec::Exec 'taskkill /F /IM ${EXE_NAME}'
  SetOutPath "$INSTDIR"
  Delete "$APPDATA\DatumRevitAgent\config.json"
  RMDir /r "$APPDATA\DatumRevitAgent" ; Recursively delete to clear all old cache
  
  File /r "build\"

  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoRepair" 1
  
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  CreateDirectory "$SMPROGRAMS\Datumm"
  CreateShortCut "$SMPROGRAMS\Datumm\Datum Revit Agent.lnk" "$INSTDIR\${EXE_NAME}"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM ${EXE_NAME}'
  Delete "$INSTDIR\${EXE_NAME}"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR" ; Use recursive delete
  Delete "$SMPROGRAMS\Datumm\Datum Revit Agent.lnk"
  RMDir /r "$SMPROGRAMS\Datumm"
  DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
SectionEnd

Function .onInit
    UserInfo::GetAccountType
    Pop $0
    ${If} $0 != "admin"
        MessageBox MB_OK|MB_ICONEXCLAMATION "Administrator rights required."
        Abort
    ${EndIf}
FunctionEnd
