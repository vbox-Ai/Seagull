@echo off
rem ===========================================================================
rem  HanShuang portable edition - full uninstall (double-click this file)
rem
rem  ASCII-only on purpose: cmd.exe garbles non-ASCII batch content unless the
rem  console code page matches the file encoding. All Chinese output lives in
rem  portable-uninstall.ps1 (UTF-8 with BOM).
rem
rem  Why "start" and not a direct call: the uninstaller deletes the very folder
rem  this .bat lives in. cmd.exe re-reads a batch file as it executes, so the
rem  moment the folder disappears cmd dies with "The system cannot find the
rem  path specified" and reports a bogus non-zero exit code. Launching the work
rem  detached and exiting here releases the handle first.
rem ===========================================================================
setlocal
copy /y "%~dp0portable-uninstall.ps1" "%TEMP%\hs-portable-uninstall.ps1" >nul 2>&1
if not exist "%TEMP%\hs-portable-uninstall.ps1" (
  echo.
  echo [ERROR] portable-uninstall.ps1 not found next to this file.
  echo         Keep both files in the same folder.
  echo.
  pause
  exit /b 1
)
rem Extra arguments are passed through, e.g. "uninstall.bat -NoPause -KeepData"
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\hs-portable-uninstall.ps1" -AppDir "%~dp0." %*
exit /b 0
