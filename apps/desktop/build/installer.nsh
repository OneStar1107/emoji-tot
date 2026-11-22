;
; EmojiTot installer hooks.
;
; The welcome page used to be drawn here from a 500x262 brand bitmap. That
; page's callback stalled the assisted flow (the directory was created and
; then the install stopped before extracting), so the custom page is gone
; until it can be replaced by something the flow drives itself. What stays
; is the part that is load-bearing: where it installs, and the shortcut.
;

!macro customInit
  ; D:\EmojiTot is where this user wants it. The directory page still lets
  ; it be changed; this only seeds $INSTDIR before that page is shown.
  StrCpy $INSTDIR "D:\EmojiTot"
!macroend

!macro customInstall
  ; The Desktop here is redirected into OneDrive (a Chinese folder name) and
  ; electron-builder's own shortcut never appeared, so write it explicitly.
  SetShellVarContext current
  CreateShortCut "$DESKTOP\EmojiTot.lnk" "$INSTDIR\EmojiTot.exe"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\EmojiTot.lnk"
!macroend
