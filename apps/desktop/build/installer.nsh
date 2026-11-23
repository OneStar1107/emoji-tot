;
; EmojiTot installer hooks.
;
; Only one job is left here: the Desktop shortcut.
;
; This machine's Desktop is redirected into OneDrive under a Chinese name
; (C:\Users\<user>\OneDrive\桌面), and electron-builder's own
; createDesktopShortcut writes to $DESKTOP, which the shell no longer uses --
; the shortcut silently never appeared. Read the folder the shell actually
; reports instead of assuming %USERPROFILE%\Desktop.
;
; Nothing here draws a page or sets $INSTDIR: a custom welcome page stalled
; the assisted flow (the directory was created and nothing was extracted)
; and a hard-coded D:\ target was unwanted. The default location stands.
;

!macro customCheckAppRunning
  ; electron-builder checks process paths before the assisted installer has
  ; assigned $INSTDIR. At that point its own extraction process can match the
  ; temporary path and the installer asks the user to close itself forever.
  ; The release workflow closes EmojiTot before launching the installer, and
  ; file-copy failures still surface normally if an app was left running.
!macroend

!macro customInstall
  ; A user can install onto a virtual or shared drive whose folder label is
  ; Low integrity. The launcher must be able to populate its ASCII runtime
  ; cache, so make the installed tree Medium after extraction.
  ExecWait '"$SYSDIR\icacls.exe" "$INSTDIR" /setintegritylevel (OI)(CI)M /T'

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" "Desktop"
  ${If} $0 == ""
    StrCpy $0 "$PROFILE\Desktop"
  ${EndIf}
  ExpandEnvStrings $0 $0
  CreateShortCut "$0\EmojiTot.lnk" "$INSTDIR\EmojiTot.exe"
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" "Desktop"
  ${If} $0 != ""
    ExpandEnvStrings $0 $0
    Delete "$0\EmojiTot.lnk"
  ${EndIf}
!macroend
