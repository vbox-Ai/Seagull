@echo off
setlocal EnableExtensions
title [Lab] Burp Suite Professional - PoC Setup

set "WORKDIR=%~dp0"
set "STATE=%WORKDIR%.poc_state"

echo ================================================================
echo   Burp Suite Professional - Whitebox Audit PoC  [SETUP]
echo   Client Reproduction Toolkit / One-Click Setup
echo ================================================================
echo.

:: Strategy 0: Command line parameter or Drag-and-Drop
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

:: Strategy 1: State file from previous run
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

:: Strategy 2: Common default installation directories
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

:: Strategy 3: Prompt user for directory
echo [?] Could not locate Burp Suite installation automatically.
echo     Please drag-and-drop BurpSuite.exe into this window, or type path:
echo.
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
echo   Work dir : "%WORKDIR%"
echo.

if not exist "%BURP_DIR%\burpsuite.jar" (
    echo [ERROR] burpsuite.jar not found in "%BURP_DIR%"
    goto :HALT_ERROR
)

set "JRE=%BURP_DIR%\jre\bin\java.exe"
if not exist "%JRE%" (
    for /f "delims=" %%J in ('where java 2^>nul') do (
        if not defined JRE_FALLBACK set "JRE_FALLBACK=%%J"
    )
    if defined JRE_FALLBACK (
        set "JRE=%JRE_FALLBACK%"
        echo [!] Using system Java: %JRE%
    ) else (
        echo [ERROR] Bundled JRE not found in "%BURP_DIR%\jre\bin\java.exe", and no system Java
        goto :HALT_ERROR
    )
)

echo [1/4] Preparing JavaAgent [BurpLoaderAgent.jar] ...
cd /d "%WORKDIR%"

if not exist "%WORKDIR%BurpLoaderAgent.jar" (
    echo       Compiling BurpLoaderAgent.java with JRE ...
    "%JRE%" BuildAgent.java "%BURP_DIR%\burpsuite.jar"
)

if not exist "%WORKDIR%BurpLoaderAgent.jar" (
    echo [ERROR] BurpLoaderAgent.jar build failed
    goto :HALT_ERROR
)
echo       [+] BurpLoaderAgent.jar is ready.

echo [2/4] Preparing native hijack DLL [version.dll] ...

if not exist "%WORKDIR%hijack\version.dll" (
    set "RUSTC="
    if exist "D:\Tool\Rust\cargo\bin\rustc.exe" set "RUSTC=D:\Tool\Rust\cargo\bin\rustc.exe"
    if not defined RUSTC if exist "%USERPROFILE%\.cargo\bin\rustc.exe" set "RUSTC=%USERPROFILE%\.cargo\bin\rustc.exe"
    if not defined RUSTC (
        for /f "delims=" %%P in ('where rustc 2^>nul') do if not defined RUSTC set "RUSTC=%%P"
    )
    if defined RUSTC (
        echo       Rust toolchain detected: %RUSTC%, compiling version.rs ...
        "%RUSTC%" --crate-type=cdylib -O -C panic=abort -C strip=symbols -o "%WORKDIR%hijack\version.dll" "%WORKDIR%hijack\version.rs"
    )
)

if not exist "%WORKDIR%hijack\version.dll" (
    echo [ERROR] Prebuilt hijack\version.dll missing and no Rust compiler
    goto :HALT_ERROR
)
echo       [+] version.dll is ready.

echo [3/4] Deploying payload to Burp directory ...

if exist "%BURP_DIR%\version.dll" (
    if not exist "%BURP_DIR%\version.dll.orig.bak" (
        copy /y "%BURP_DIR%\version.dll" "%BURP_DIR%\version.dll.orig.bak" >nul
        echo       [+] Backed up original: version.dll -^> version.dll.orig.bak
    )
)

if exist "%BURP_DIR%\jre\bin\version.dll" (
    del /f /q "%BURP_DIR%\jre\bin\version.dll" >nul 2>&1
)

if exist "%BURP_DIR%\user.vmoptions" (
    move /y "%BURP_DIR%\user.vmoptions" "%BURP_DIR%\user.vmoptions.poc.bak" >nul
)

copy /y "%WORKDIR%BurpLoaderAgent.jar" "%BURP_DIR%\BurpLoaderAgent.jar" >nul
if errorlevel 1 goto :HALT_COPY_AGENT

copy /y "%WORKDIR%hijack\version.dll" "%BURP_DIR%\version.dll" >nul
if errorlevel 1 goto :HALT_COPY_DLL

echo       [+] Deployed: BurpLoaderAgent.jar + version.dll

echo [4/4] Seeding license state in Preferences ...
del /f /q "%BURP_DIR%\agent_verify.log" "%BURP_DIR%\hijack_proof.log" >nul 2>&1
"%JRE%" --add-opens java.base/java.lang=ALL-UNNAMED -cp "%WORKDIR%;%BURP_DIR%\burpsuite.jar" ClearPrefs.java >nul 2>&1

> "%STATE%" echo BURP_DIR=%BURP_DIR%
>> "%STATE%" echo STATUS=DEPLOYED

echo.
echo ================================================================
echo   [SUCCESS] Deployment completed successfully
echo.
echo   Launch Burp by double-clicking:
echo       "%BURP_DIR%\BurpSuite.exe"
echo.
echo   Verification Checklist:
echo     1. No activation dialog, no Guice or activationToken error
echo     2. Title bar: Burp Suite Professional - 100000000000
echo     3. Scanner, Unlimited Intruder, Save Project all work
echo.
echo   Evidence Logs:
echo     - "%BURP_DIR%\hijack_proof.log"  [Native DLL hijack log]
echo     - "%BURP_DIR%\agent_verify.log"  [JavaAgent license status]
echo.
echo   To restore to original clean state, run:
echo       "%WORKDIR%clean_poc.bat"
echo ================================================================
echo.
pause
exit /b 0

:HALT_COPY_AGENT
echo [ERROR] Failed to copy BurpLoaderAgent.jar into "%BURP_DIR%"
echo         Make sure BurpSuite.exe is closed and you have write permissions.
goto :HALT_ERROR

:HALT_COPY_DLL
echo [ERROR] Failed to copy version.dll into "%BURP_DIR%"
echo         Make sure BurpSuite.exe is closed and you have write permissions.
goto :HALT_ERROR

:HALT_ERROR
echo.
echo ================================================================
echo   [FAILED] Setup was not completed
echo   Troubleshooting:
echo     1. Make sure BurpSuite.exe is completely closed
echo     2. Check if Antivirus blocked version.dll
echo     3. Try right-clicking this script and select Run as administrator
echo ================================================================
echo.
pause
exit /b 1
