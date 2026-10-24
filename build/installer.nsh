# =============================================================================
#  寒霜破甲工具 - custom NSIS hooks
#
#  electron-builder auto-detects this file as build/installer.nsh and injects it
#  into the generated .nsi for BOTH the installer and the uninstaller pass.
#
#  Hook points used (names come from app-builder-lib/templates/nsis/*.nsh):
#    customUnInit     -> inserted at the end of un.onInit
#    customUnInstall  -> inserted at the very end of Section "un.install"
#
#  WHY THIS FILE EXISTS (the uninstall-residue bug):
#    1. nsis.deleteAppDataOnUninstall was false, so the generated uninstaller
#       skipped %APPDATA%\<name> entirely.
#    2. electron-builder only removes %APPDATA%\<APP_FILENAME> /
#       <APP_PRODUCT_FILENAME> / <APP_PACKAGE_NAME>. It NEVER removes
#       %LOCALAPPDATA%\<name>-updater (the installer cache), nor the alias
#       directories left behind by older builds (hanshuang-desktop, ...-pro).
#    3. RMDir /r $INSTDIR gives up silently when a file is still locked by a
#       running tray process, leaving a partial install dir behind.
#    4. The AUMID / jump list and the tool's own state files under ~/.codex
#       were never touched.
#
#  ENCODING NOTE - KEEP THIS FILE PURE ASCII.
#    NSIS decodes an included file using the ANSI code page unless the file
#    carries a UTF-8 BOM. Chinese literals written here would be mangled into
#    garbage paths on a non-Chinese machine. Every Chinese name is therefore
#    referenced through electron-builder's own defines, which are emitted into
#    the generated (UTF-8) script where the encoding is already correct:
#      ${PRODUCT_FILENAME}  = "寒霜破甲工具"        (or "... Pro")
#      ${APP_FILENAME}      = "hanshuang-free"      (or "hanshuang-pro")
#      ${APP_PACKAGE_NAME}  = package.json "name"
#      ${APP_ID}            = "com.hanshuang.desktop"[".pro"]
# =============================================================================

# -----------------------------------------------------------------------------
#  Everything below is uninstaller-only code.
#
#  electron-builder compiles the script twice: once with BUILD_UNINSTALLER
#  defined (this produces the uninstaller binary) and once without it (this
#  produces the installer, which embeds the already-built uninstaller). Any
#  `Function un.` or `customUnInstall` code present in the second pass makes
#  makensis emit "warning 6020: Uninstaller script code found but
#  WriteUninstaller never used", and electron-builder treats warnings as
#  errors. The stock uninstaller.nsh is wrapped in the same guard - match it.
#
#  A future installer-side hook (customInstall, customHeader, ...) must go
#  OUTSIDE this block.
# -----------------------------------------------------------------------------
!ifdef BUILD_UNINSTALLER

Var /GLOBAL hsRmdirTry
Var /GLOBAL hsRmdirPath

# -----------------------------------------------------------------------------
#  Kill the tray process before the uninstall section touches $INSTDIR.
#  taskkill matches the exact image name, so "${APP_EXECUTABLE_FILENAME}"
#  ("寒霜破甲工具.exe") does NOT match the running uninstaller
#  ("Uninstall 寒霜破甲工具.exe") - we never kill ourselves here. Do not add a
#  taskkill for the uninstaller image name: the running uninstaller is a copy
#  of itself under exactly that name and would terminate this uninstall.
# -----------------------------------------------------------------------------
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 1200

  # ---------------------------------------------------------------------------
  #  Purge injected prompts from every supported AI tool.
  #
  #  Why here and not in customUnInstall:
  #    customUnInstall runs at the very end of Section "un.install", by which time
  #    the template has already done `RMDir /r $INSTDIR` - and the cleanup script
  #    itself lives under $INSTDIR\resources\scripts\, so it would be gone by then.
  #    At un.onInit time $INSTDIR is still intact.
  #
  #  Why skipped during an update:
  #    An in-place upgrade runs the old uninstaller first (with --updated). That is
  #    "remove old, install new" - purging here would wipe the prompts the user is
  #    upgrading in order to keep.
  #
  #  The cleanup script decides by content and removes prompts only: the user's
  #  AGENTS.md / CLAUDE.md / config.toml / own backups are left alone (see its own
  #  header comment). nsExec::Exec waits for it to finish; a failure only leaves
  #  residue behind, it never blocks the uninstall.
  #
  #  KEEP THE STRINGS HERE ASCII - this file has no BOM, so NSIS decodes it using
  #  the ANSI code page and any Chinese literal would show up as garbage.
  # ---------------------------------------------------------------------------
  ${ifNot} ${isUpdated}
    DetailPrint "Purging injected prompts..."
    nsExec::Exec 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\clear-injected-prompts.ps1" -Apply'
    Pop $0
  ${endIf}
!macroend

# -----------------------------------------------------------------------------
#  RMDir /r with retries. $INSTDIR survives removal when a handle is still open
#  (antivirus scan, Explorer preview, a slow process exit), so retry until the
#  directory is really empty instead of failing silently.
# -----------------------------------------------------------------------------
Function un.hsRemoveTree
  # $hsRmdirPath = full path to remove
  Push $R1
  StrCpy $hsRmdirTry 0
  SetOutPath $TEMP

  # Never operate on an empty/truncated path: "RMDir /r" on an empty string
  # would be resolved relative to the current drive and IfFileExists "\*.*"
  # matches the drive root. Bail out instead.
  #
  # IntCmp <len> 5 <eq> <lt> <gt>: keep going when len >= 5, bail only when
  # shorter. Do NOT be tempted to write the "no jump" 0 form here - a jump
  # target of 0 silently skips the deletion for every path.
  StrLen $R1 "$hsRmdirPath"
  IntCmp $R1 5 hs_rmdir_loop hs_rmdir_done hs_rmdir_loop

  hs_rmdir_loop:
    RMDir /r "$hsRmdirPath"
    IfFileExists "$hsRmdirPath\*.*" 0 hs_rmdir_done
    IntOp $hsRmdirTry $hsRmdirTry + 1
    IntCmp $hsRmdirTry 6 hs_rmdir_done hs_rmdir_wait hs_rmdir_wait

  hs_rmdir_wait:
    Sleep 900
    Goto hs_rmdir_loop

  hs_rmdir_done:
    # Remove the (now empty) directory itself, and again with /r in case the
    # retry loop gave up while files were still locked.
    RMDir "$hsRmdirPath"
    Pop $R1
FunctionEnd

!macro hsPurgeDir path
  StrCpy $hsRmdirPath "${path}"
  Call un.hsRemoveTree
!macroend

!macro hsPurgeRegKey root key
  ClearErrors
  DeleteRegKey ${root} "${key}"
!macroend

# -----------------------------------------------------------------------------
#  Final sweep - runs after electron-builder's own cleanup.
# -----------------------------------------------------------------------------
!macro customUnInstall
  # --- 1. AppUserModelId + jump list -----------------------------------------
  # The template only does this when shortcuts were created at install time;
  # do it unconditionally, it is idempotent.
  WinShell::UninstAppUserModelId "${APP_ID}"
  !insertmacro hsPurgeRegKey HKCU "Software\Classes\AppUserModelId\${APP_ID}"
  !insertmacro hsPurgeRegKey HKCU "Software\Classes\${APP_ID}"

  # --- 2. shortcuts (per-user and all-users) ---------------------------------
  SetShellVarContext current
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  !insertmacro hsPurgeDir "$SMPROGRAMS\${PRODUCT_FILENAME}"
  !insertmacro hsPurgeRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\${APP_EXECUTABLE_FILENAME}"

  SetShellVarContext all
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  !insertmacro hsPurgeRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\${APP_EXECUTABLE_FILENAME}"
  SetShellVarContext current

  # --- 3. user data, caches, updater cache -----------------------------------
  # Guarded by isUpdated: during an in-place upgrade the old uninstaller runs
  # first, and wiping user data there would reset the freshly upgraded app.
  ${ifNot} ${isUpdated}
    # 3a. names electron-builder knows about. Redundant with
    #     deleteAppDataOnUninstall=true, but kept so a manual
    #     `Uninstall.exe /currentuser` (without --delete-app-data) is clean too.
    !insertmacro hsPurgeDir "$APPDATA\${APP_FILENAME}"
    !insertmacro hsPurgeDir "$APPDATA\${APP_PACKAGE_NAME}"
    !ifdef APP_PRODUCT_FILENAME
      !insertmacro hsPurgeDir "$APPDATA\${APP_PRODUCT_FILENAME}"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}-updater"
    !endif
    !insertmacro hsPurgeDir "$LOCALAPPDATA\${APP_FILENAME}"
    !insertmacro hsPurgeDir "$LOCALAPPDATA\${APP_FILENAME}-updater"
    # default per-user install location, in case the app was ever installed
    # there and later reinstalled into a custom directory
    !insertmacro hsPurgeDir "$LOCALAPPDATA\Programs\${APP_FILENAME}"
    !insertmacro hsPurgeDir "$LOCALAPPDATA\Programs\${PRODUCT_FILENAME}"

    # 3b. aliases left over from older builds of THIS variant.
    #     Branch on APP_ID so uninstalling the free build cannot delete the
    #     Pro build's data when both are installed side by side.
    StrCmp "${APP_ID}" "com.hanshuang.desktop.pro" 0 hs_alias_free
      # --- Pro variant ---
      !insertmacro hsPurgeDir "$APPDATA\hanshuang-pro"
      !insertmacro hsPurgeDir "$APPDATA\hanshuang-desktop"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\hanshuang-pro"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\hanshuang-desktop"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\hanshuang-pro-updater"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\hanshuang-desktop-updater"
      Goto hs_alias_done
    hs_alias_free:
      # --- free variant ---
      !insertmacro hsPurgeDir "$APPDATA\hanshuang-free"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\hanshuang-free"
      !insertmacro hsPurgeDir "$LOCALAPPDATA\hanshuang-free-updater"
    hs_alias_done:

    # 3c. the tool's own state files. These two are written by electron/main.cjs
    #     and belong to this tool alone - everything else under the Codex home is the
    #     user's Codex CLI data and must NOT be touched.
    #
    #     The Codex data directory is NOT always %USERPROFILE%\.codex: users short on
    #     C: drive space commonly relocate it via the CODEX_HOME environment variable.
    #     Honour that first, otherwise the state files survive on the other drive and
    #     the uninstall looks incomplete. ($hsRmdirPath is free until step 4.)
    ReadEnvStr $hsRmdirPath "CODEX_HOME"
    ${if} $hsRmdirPath != ""
      Delete "$hsRmdirPath\fj_desktop_state.json"
      Delete "$hsRmdirPath\fj_settings.json"
    ${else}
      Delete "$PROFILE\.codex\fj_desktop_state.json"
      Delete "$PROFILE\.codex\fj_settings.json"
    ${endIf}
  ${endIf}

  # --- 4. remove $INSTDIR for real -------------------------------------------
  StrCpy $hsRmdirPath "$INSTDIR"
  Call un.hsRemoveTree

  # --- 5. refresh Explorer so the dead shortcuts/icons disappear -------------
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

# end of BUILD_UNINSTALLER guard
!endif
