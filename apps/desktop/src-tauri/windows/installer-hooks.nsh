!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToLog 'taskkill /IM "knownext-ai-desktop.exe" /F'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  IfSilent 0 +2
  Exec "$INSTDIR\knownext-ai-desktop.exe"
!macroend
