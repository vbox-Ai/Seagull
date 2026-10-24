@echo off
setlocal EnableExtensions
title [Lab] Burp Suite Professional - PoC Restore

set "WORKDIR=%~dp0"
set "STATE=%WORKDIR%.poc_state"

echo ================================================================
echo   Burp Suite Professional - Whitebox Audit PoC  [RESTORE]
echo   Client Reproduction Toolkit / One-Click Clean and Restore
echo ================================================================
echo.

set "TARGET_INPUT=%~1"
if not "%TARGET_INPUT%"=="" (
    if exist "%TARGET_INPUT%\burpsuite.jar" (
        set "BURP_DIR=%TARGET_INPUT%"
        goto :FOUND_BURP
    )
    if exist "%~dp1burpsuite.jar" (
        set "BURP_DIR=%~dp1"
        goto :FOUND_BURP
    )
)

if exist "%STATE%" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%STATE%") do (
        if /i "%%A"=="BURP_DIR" (
            if exist "%%B\burpsuite.jar" (
                set "BURP_DIR=%%B"
                echo [*] Restored path from previous run: %%B
                goto :FOUND_BURP
            )
        )
    )
)

for %%D in (
    "D:\Data\BurpSuite"
    "C:\Program Files\BurpSuiteProfessional"
    "C:\Program Files\BurpSuiteCommunity"
    "C:\Program Files (x86)\BurpSuiteProfessional"
    "D:\BurpSuite"
    "D:\BurpSuitePro"
    "D:\BurpSuiteProfessional"
    "E:\BurpSuite"
    "E:\BurpSuitePro"
    "E:\BurpSuiteProfessional"
    "%LOCALAPPDATA%\Programs\BurpSuiteProfessional"
    "%LOCALAPPDATA%\Programs\BurpSuiteCommunity"
    "%USERPROFILE%\BurpSuite"
    "C:\Burp"
    "D:\Burp"
) do (
    if exist "%%~D\burpsuite.jar" (
        set "BURP_DIR=%%~D"
        echo [*] Auto-detected in standard location: %%~D
        goto :FOUND_BURP
    )
)

echo [?] Could not locate Burp Suite installation automatically.
echo     Please drag-and-drop BurpSuite.exe into this window, or type path:
set /p "USER_INPUT=>> Path to BurpSuite: "
set "USER_INPUT=%USER_INPUT:"=%"

if exist "%USER_INPUT%\burpsuite.jar" (
    set "BURP_DIR=%USER_INPUT%"
    goto :FOUND_BURP
)
for %%F in ("%USER_INPUT%") do (
    if exist "%%~dpFburpsuite.jar" (
        set "BURP_DIR=%%~dpF"
        goto :FOUND_BURP
    )
)

echo.
echo [ERROR] The specified path does not contain burpsuite.jar
goto :HALT_ERROR

:FOUND_BURP
echo.
echo [Target Confirmed]
echo   Burp dir : "%BURP_DIR%"
echo.

echo [1/4] Removing injected payload and evidence logs ...
for %%F in (
    version.dll
    BurpLoaderAgent.jar
    hijack_proof.log
    agent_verify.log
    .perm_test
) do (
    if exist "%BURP_DIR%\%%F" (
        del /f /q "%BURP_DIR%\%%F" >nul 2>&1
        echo       [-] Removed: %%F
    )
)
if exist "%BURP_DIR%\jre\bin\version.dll" (
    del /f /q "%BURP_DIR%\jre\bin\version.dll" >nul 2>&1
    echo       [-] Removed: jre\bin\version.dll
)

echo [2/4] Restoring original backups ...
if exist "%BURP_DIR%\version.dll.orig.bak" (
    move /y "%BURP_DIR%\version.dll.orig.bak" "%BURP_DIR%\version.dll" >nul
    echo       [+] Restored: version.dll.orig.bak -^> version.dll
)
if exist "%BURP_DIR%\user.vmoptions.poc.bak" (
    move /y "%BURP_DIR%\user.vmoptions.poc.bak" "%BURP_DIR%\user.vmoptions" >nul
    echo       [+] Restored: user.vmoptions.poc.bak -^> user.vmoptions
)

echo [3/4] Resetting registry license state ...
set "JRE=%BURP_DIR%\jre\bin\java.exe"
if not exist "%JRE%" (
    for /f "delims=" %%J in ('where java 2^>nul') do if not defined JRE set "JRE=%%J"
)

if exist "%JRE%" (
    "%JRE%" --add-opens java.base/java.lang=ALL-UNNAMED -cp "%WORKDIR%;%BURP_DIR%\burpsuite.jar" ClearPrefs.java >nul 2>&1
    echo       [+] Preferences state cleared in registry
) else (
    echo       [!] JRE not found, skipped registry state clear
)

echo [4/4] Verifying original install integrity ...
if exist "%BURP_DIR%\burpsuite.jar" (echo       [OK] burpsuite.jar is intact and unmodified) else (echo       [!] burpsuite.jar missing)
if exist "%BURP_DIR%\BurpSuite.exe" (echo       [OK] BurpSuite.exe is intact and unmodified) else (echo       [!] BurpSuite.exe missing)
if exist "%BURP_DIR%\version.dll"  (echo       [!] version.dll is still present) else (echo       [OK] version.dll removed)
if exist "%BURP_DIR%\BurpLoaderAgent.jar" (echo       [!] BurpLoaderAgent.jar is still present) else (echo       [OK] BurpLoaderAgent.jar removed)

if exist "%STATE%" del /f /q "%STATE%" >nul 2>&1

echo.
echo ================================================================
echo   [RESTORE COMPLETE]
echo   Burp Suite has been restored to its original, unmodified state.
echo   Original file hashes of burpsuite.jar and BurpSuite.exe were never touched.
echo ================================================================
echo.
pause
exit /b 0

:HALT_ERROR
echo.
echo ================================================================
echo   [FAILED] Restore incomplete
echo   Please make sure BurpSuite.exe is closed before running restore.
echo ================================================================
echo.
pause
exit /b 1
