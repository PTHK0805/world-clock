; One-time migration from the pre-rename "World Clock" identity.
;
; The identifier changes from com.worldclock.app to com.meridian.app, so the
; WebView2 localStorage profile has to move to the new app-data folder before
; the new app starts. Caches and cookies are intentionally not copied.
;
; The old per-user NSIS install is removed afterwards, leaving the old
; com.worldclock.app profile in place as a rollback copy.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  Push $2
  Push $R0

  ; Close a running World Clock so its profile files are not locked.
  !insertmacro CheckIfAppIsRunning "$LOCALAPPDATA\World Clock\world-clock.exe" "World Clock"
  Sleep 1500

  ; Copy localStorage into the new profile, unless it is already migrated.
  IfFileExists "$LOCALAPPDATA\com.meridian.app\EBWebView\Default\Local Storage\leveldb\CURRENT" migrate_storage_done
  IfFileExists "$LOCALAPPDATA\com.worldclock.app\EBWebView\Default\Local Storage\leveldb\CURRENT" 0 migrate_storage_done
    DetailPrint "Migrating saved settings to Meridian..."
    CreateDirectory "$LOCALAPPDATA\com.meridian.app\EBWebView\Default\Local Storage\leveldb"
    nsExec::ExecToLog '"$SYSDIR\robocopy.exe" "$LOCALAPPDATA\com.worldclock.app\EBWebView\Default\Local Storage" "$LOCALAPPDATA\com.meridian.app\EBWebView\Default\Local Storage" /E /R:1 /W:1 /XF LOCK /NFL /NDL /NJH /NJS /NP'
    Pop $0
    StrCmp $0 "" migrate_storage_failed
    IntCmp $0 8 migrate_storage_failed migrate_storage_done migrate_storage_failed

  migrate_storage_failed:
    MessageBox MB_ICONSTOP|MB_OK "Meridian could not copy your saved settings. Close World Clock and run the installer again. Your existing data has not been changed." /SD IDOK
    Abort

  migrate_storage_done:

  ; Preserve the tray autostart opt-out marker.
  IfFileExists "$APPDATA\com.worldclock.app\autostart-optout" 0 migrate_marker_done
    CreateDirectory "$APPDATA\com.meridian.app"
    CopyFiles /SILENT "$APPDATA\com.worldclock.app\autostart-optout" "$APPDATA\com.meridian.app"
  migrate_marker_done:

  ; Remove the old per-user NSIS install. Its silent uninstaller leaves app
  ; data alone; the copied profile above is the new home.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\World Clock" "UninstallString"
  ${If} $R0 != ""
    DetailPrint "Removing the previous World Clock installation..."
    ExecWait '$R0 /S' $1
    Sleep 1500
  ${EndIf}

  IfFileExists "$LOCALAPPDATA\World Clock\world-clock.exe" 0 migrate_cleanup
    MessageBox MB_ICONSTOP|MB_OK "The old World Clock app could not be removed. Close it and run the installer again." /SD IDOK
    Abort

  migrate_cleanup:
  Delete "$SMPROGRAMS\World Clock.lnk"
  Delete "$DESKTOP\World Clock.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "World Clock"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\World Clock"
  DeleteRegKey HKCU "Software\worldclock\World Clock"
  DeleteRegKey /ifempty HKCU "Software\worldclock"
  RMDir /r "$LOCALAPPDATA\World Clock"

  Pop $R0
  Pop $2
  Pop $1
  Pop $0
!macroend
