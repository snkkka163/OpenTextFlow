!macro customInstall
  StrCpy $0 "$INSTDIR\resources\logo.ico"

  ${if} ${FileExists} "$newDesktopLink"
    Delete "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$0" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}

  ${if} ${FileExists} "$newStartMenuLink"
    Delete "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$0" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endIf}
!macroend
