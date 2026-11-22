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

!macro customInstall
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
