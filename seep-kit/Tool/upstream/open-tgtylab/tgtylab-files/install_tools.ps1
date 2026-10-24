<#
.SYNOPSIS
    open-tgtylab Tool Installer
.DESCRIPTION
    Auto-download reverse engineering tools to tools/windows/ or tools/common/.
    Each tool download is independent - failures don't block other tools.
.PARAMETER All
    Install all tools.
.PARAMETER Ghidra
    Install Ghidra (NSA reverse engineering suite).
.PARAMETER Cutter
    Install Cutter + Rizin (disassembler/decompiler GUI).
.PARAMETER X64dbg
    Install x64dbg snapshot (debugger).
.PARAMETER DiE
    Install Detect It Easy (file type/packer identifier).
.PARAMETER PEBear
    Install PE-bear (PE file viewer/editor).
.PARAMETER Procmon
    Install Process Monitor (SysInternals).
.EXAMPLE
    .\install_tools.ps1 -All
    .\install_tools.ps1 -Ghidra -Cutter
#>

param(
    [switch]$All,
    [switch]$Ghidra,
    [switch]$Cutter,
    [switch]$X64dbg,
    [switch]$DiE,
    [switch]$PEBear,
    [switch]$Procmon,
    [switch]$Nmap,
    [switch]$Apktool,
    [switch]$Jadx
)

# -- Setup --
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

# Resolve root: script is at open-tgtylab/tgtylab-files/, root is open-tgtylab/
$SCRIPT_DIR = $PSScriptRoot
if (!$SCRIPT_DIR) {
    try { $SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path } catch {}
    if (!$SCRIPT_DIR) { $SCRIPT_DIR = (Get-Location).Path }
}
$ROOT_DIR = Split-Path -Parent $SCRIPT_DIR
$TOOLS_DIR = Join-Path $ROOT_DIR 'tools'
$WIN_TOOLS = Join-Path $TOOLS_DIR 'windows'
$COMMON_TOOLS = Join-Path $TOOLS_DIR 'common'
$DOWNLOADS = Join-Path $TOOLS_DIR 'downloads'

# Ensure directories
foreach ($d in @($TOOLS_DIR, $WIN_TOOLS, $COMMON_TOOLS, $DOWNLOADS)) {
    if (!(Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

# -- Counters --
$script:installed = 0
$script:skipped = 0
$script:failed = 0

# -- Helper: Download with retry and fallback URLs --
function Invoke-SafeDownload {
    param([string[]]$Urls, [string]$Output, [int]$Retries = 2)
    foreach ($Url in $Urls) {
        for ($i = 0; $i -le $Retries; $i++) {
            try {
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
                $wc.DownloadFile($Url, $Output)
                $wc.Dispose()
                if ((Test-Path $Output) -and (Get-Item $Output).Length -gt 100) {
                    return $true
                }
            } catch {
                if ($i -eq $Retries) {
                    Write-Warning "    Failed: $Url"
                }
            }
        }
    }
    return $false
}
                Write-Warning "    Error: $_"
            } else {
                Start-Sleep -Seconds 2
            }
        }
    }
    return $false
}

# -- Helper: GitHub latest release asset --
function Get-GitHubAssetUrl {
    param([string]$Repo, [string]$Pattern)
    $apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add('User-Agent', 'open-tgtylab-installer')
        $json = $wc.DownloadString($apiUrl)
        $wc.Dispose()
        $release = $json | ConvertFrom-Json
        foreach ($asset in $release.assets) {
            if ($asset.name -match $Pattern) {
                return $asset.browser_download_url
            }
        }
        Write-Warning "    No asset matching '$Pattern' in $Repo latest release"
    } catch {
        Write-Warning "    Failed to query GitHub API for $Repo : $_"
    }
    return $null
}

# -- Helper: Safe expand archive --
function Expand-Safe {
    param([string]$ZipPath, [string]$DestDir)
    try {
        Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Warning "    Extract failed: $_"
        return $false
    }
}

# ============================================
# TOOL INSTALLERS
# ============================================

function Install-Ghidra {
    Write-Host "`n[*] Ghidra (NSA RE suite)" -ForegroundColor Cyan
    $dir = Join-Path $COMMON_TOOLS 'ghidra'

    # Check existing
    $existing = Get-ChildItem -Path $COMMON_TOOLS -Directory -Filter "ghidra_*" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "    Already installed: $($existing[0].Name)" -ForegroundColor Yellow
        $script:skipped++
        return
    }

    # Find latest release URL
    $url = Get-GitHubAssetUrl -Repo 'NationalSecurityAgency/ghidra' -Pattern '^ghidra_.*_PUBLIC_\d{8}\.zip$'
    if (!$url) {
        Write-Warning "    Could not find Ghidra release. Download manually from https://github.com/NationalSecurityAgency/ghidra/releases"
        $script:failed++
        return
    }

    $zip = Join-Path $DOWNLOADS 'ghidra-latest.zip'
    Write-Host "    Downloading Ghidra..." -ForegroundColor Gray
    if (!(Invoke-SafeDownload -Url $url -Output $zip)) { $script:failed++; return }

    Write-Host "    Extracting (this may take a minute)..." -ForegroundColor Gray
    if (Expand-Safe -ZipPath $zip -DestDir $COMMON_TOOLS) {
        Write-Host "    Ghidra installed to: $COMMON_TOOLS" -ForegroundColor Green
        $script:installed++
    } else {
        $script:failed++
    }
}

function Install-Cutter {
    Write-Host "`n[*] Cutter + Rizin" -ForegroundColor Cyan
    $dir = Join-Path $WIN_TOOLS 'Cutter'

    if (Test-Path $dir) {
        $exe = Get-ChildItem -Path $dir -Recurse -Filter 'Cutter.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($exe) {
            Write-Host "    Already installed: $($exe.FullName)" -ForegroundColor Yellow
            $script:skipped++
            return
        }
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    $url = Get-GitHubAssetUrl -Repo 'rizinorg/cutter' -Pattern 'Cutter-.*-Windows-x86_64\.zip'
    if (!$url) {
        # Fallback: try broader pattern
        $url = Get-GitHubAssetUrl -Repo 'rizinorg/cutter' -Pattern 'Cutter-.*Windows.*\.zip'
    }
    if (!$url) {
        Write-Warning "    Could not find Cutter release. Download manually from https://github.com/rizinorg/cutter/releases"
        $script:failed++
        return
    }

    $zip = Join-Path $DOWNLOADS 'cutter-latest.zip'
    Write-Host "    Downloading Cutter..." -ForegroundColor Gray
    if (!(Invoke-SafeDownload -Url $url -Output $zip)) { $script:failed++; return }

    Write-Host "    Extracting..." -ForegroundColor Gray
    if (Expand-Safe -ZipPath $zip -DestDir $dir) {
        Write-Host "    Cutter installed to: $dir" -ForegroundColor Green
        $script:installed++
    } else {
        $script:failed++
    }
}

function Install-X64dbg {
    Write-Host "`n[*] x64dbg (debugger)" -ForegroundColor Cyan
    $dir = Join-Path $WIN_TOOLS 'x64dbg'

    # Check existing
    if ((Test-Path (Join-Path $dir 'x64\x64dbg.exe')) -or
        (Test-Path (Join-Path $dir 'x32\x32dbg.exe')) -or
        (Test-Path (Join-Path $dir 'release\x64\x64dbg.exe'))) {
        Write-Host "    Already installed" -ForegroundColor Yellow
        $script:skipped++
        return
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    $url = Get-GitHubAssetUrl -Repo 'x64dbg/x64dbg' -Pattern 'snapshot_.*\.zip'
    if (!$url) {
        Write-Warning "    Could not find x64dbg release. Download manually from https://github.com/x64dbg/x64dbg/releases"
        $script:failed++
        return
    }

    $zip = Join-Path $DOWNLOADS 'x64dbg-snapshot.zip'
    Write-Host "    Downloading x64dbg snapshot..." -ForegroundColor Gray
    if (!(Invoke-SafeDownload -Url $url -Output $zip)) { $script:failed++; return }

    Write-Host "    Extracting..." -ForegroundColor Gray
    if (Expand-Safe -ZipPath $zip -DestDir $dir) {
        Write-Host "    x64dbg installed to: $dir" -ForegroundColor Green
        $script:installed++
    } else {
        $script:failed++
    }
}

function Install-DiE {
    Write-Host "`n[*] Detect It Easy (DiE)" -ForegroundColor Cyan
    $dir = Join-Path $WIN_TOOLS 'die'

    # Check existing
    if (Test-Path (Join-Path $dir 'diec.exe')) {
        Write-Host "    Already installed" -ForegroundColor Yellow
        $script:skipped++
        return
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    $url = Get-GitHubAssetUrl -Repo 'horsicq/DIE-engine' -Pattern 'die_win64_portable_.*\.zip'
    if (!$url) {
        # Fallback: try win32 or broader pattern
        $url = Get-GitHubAssetUrl -Repo 'horsicq/DIE-engine' -Pattern 'die_win.*portable.*\.zip'
    }
    if (!$url) {
        Write-Warning "    Could not find DiE release. Download manually from https://github.com/horsicq/DIE-engine/releases"
        $script:failed++
        return
    }

    $zip = Join-Path $DOWNLOADS 'die-latest.zip'
    Write-Host "    Downloading DiE..." -ForegroundColor Gray
    if (!(Invoke-SafeDownload -Url $url -Output $zip)) { $script:failed++; return }

    Write-Host "    Extracting..." -ForegroundColor Gray
    if (Expand-Safe -ZipPath $zip -DestDir $dir) {
        Write-Host "    DiE installed to: $dir" -ForegroundColor Green
        $script:installed++
    } else {
        $script:failed++
    }
}

function Install-PEBear {
    Write-Host "`n[*] PE-bear" -ForegroundColor Cyan
    $dir = Join-Path $WIN_TOOLS 'PE-bear'

    # Check existing
    if (Test-Path (Join-Path $dir 'PE-bear.exe')) {
        Write-Host "    Already installed" -ForegroundColor Yellow
        $script:skipped++
        return
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    $url = Get-GitHubAssetUrl -Repo 'hasherezade/pe-bear' -Pattern 'PE-bear_.*_win_.*\.zip'
    if (!$url) {
        # Fallback: broader match
        $url = Get-GitHubAssetUrl -Repo 'hasherezade/pe-bear' -Pattern 'PE-bear.*\.zip'
    }
    if (!$url) {
        Write-Warning "    Could not find PE-bear release. Download manually from https://github.com/hasherezade/pe-bear/releases"
        $script:failed++
        return
    }

    $zip = Join-Path $DOWNLOADS 'pebear-latest.zip'
    Write-Host "    Downloading PE-bear..." -ForegroundColor Gray
    if (!(Invoke-SafeDownload -Url $url -Output $zip)) { $script:failed++; return }

    Write-Host "    Extracting..." -ForegroundColor Gray
    if (Expand-Safe -ZipPath $zip -DestDir $dir) {
        Write-Host "    PE-bear installed to: $dir" -ForegroundColor Green
        $script:installed++
    } else {
        $script:failed++
    }
}

function Install-Procmon {
    Write-Host "`n[*] Process Monitor (SysInternals)" -ForegroundColor Cyan
    $dir = Join-Path $WIN_TOOLS 'ProcessMonitor'

    # Check existing
    if (Test-Path (Join-Path $dir 'Procmon.exe')) {
        Write-Host "    Already installed" -ForegroundColor Yellow
        $script:skipped++
        return
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    $url = 'https://download.sysinternals.com/files/ProcessMonitor.zip'
    $zip = Join-Path $DOWNLOADS 'procmon.zip'
    Write-Host "    Downloading Procmon..." -ForegroundColor Gray
    if (!(Invoke-SafeDownload -Url $url -Output $zip)) { $script:failed++; return }

    Write-Host "    Extracting..." -ForegroundColor Gray
    if (Expand-Safe -ZipPath $zip -DestDir $dir) {
        Write-Host "    Procmon installed to: $dir" -ForegroundColor Green
        $script:installed++
    } else {
        $script:failed++
    }
}

# ============================================
# NMAP
# ============================================
function Install-Nmap {
    $dir = Join-Path $TOOLS_DIR 'windows\nmap'
    if (Test-Path (Join-Path $dir 'nmap.exe')) {
        Write-Host "    Nmap already installed" -ForegroundColor DarkGray
        $script:skipped++; return
    }
    Write-Host "[*] Nmap" -ForegroundColor Cyan
    Write-Host "    Downloading..." -ForegroundColor Gray
    $zip = Join-Path $DOWNLOADS 'nmap.zip'
    # Multiple mirror URLs for resilience
    $urls = @(
        'https://nmap.org/dist/nmap-7.92-win32.zip',
        'https://nmap.org/dist/nmap-7.91-win32.zip',
        'https://nmap.org/dist/nmap-7.90-win32.zip'
    )
    if (!(Invoke-SafeDownload $urls $zip)) {
        Write-Warning "    Nmap download failed from all mirrors"
        $script:failed++; return
    }
    Expand-Safe $zip $dir
    # Move contents up if nested
    $sub = Get-ChildItem $dir -Directory -Filter 'nmap-*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($sub) {
        Move-Item "$($sub.FullName)\*" $dir -Force -ErrorAction SilentlyContinue
        Remove-Item $sub.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "    Installed to: $dir" -ForegroundColor Green
    $script:installed++
}

# ============================================
# APKTOOL
# ============================================
function Install-Apktool {
    $dir = Join-Path $TOOLS_DIR 'android\apktool'
    if (Test-Path (Join-Path $dir 'apktool.jar')) {
        Write-Host "    Apktool already installed" -ForegroundColor DarkGray
        $script:skipped++; return
    }
    Write-Host "[*] Apktool" -ForegroundColor Cyan
    Write-Host "    Downloading..." -ForegroundColor Gray
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $jarUrl = 'https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.11.0.jar'
    $jarPath = Join-Path $dir 'apktool.jar'
    Invoke-SafeDownload $jarUrl $jarPath
    # Create wrapper bat
    $batContent = "@echo off`njava -jar `"%~dp0apktool.jar`" %*"
    $batContent | Out-File -FilePath (Join-Path $dir 'apktool.bat') -Encoding ASCII
    Write-Host "    Installed to: $dir" -ForegroundColor Green
    $script:installed++
}

# ============================================
# JADX
# ============================================
function Install-Jadx {
    $dir = Join-Path $TOOLS_DIR 'android\jadx'
    if (Test-Path (Join-Path $dir 'bin\jadx.bat')) {
        Write-Host "    Jadx already installed" -ForegroundColor DarkGray
        $script:skipped++; return
    }
    Write-Host "[*] Jadx" -ForegroundColor Cyan
    Write-Host "    Downloading..." -ForegroundColor Gray
    $url = Get-GitHubAssetUrl 'skylot/jadx' 'jadx-gui-.*-with-jre-win\.zip'
    if (!$url) { Write-Warning "    Could not find Jadx release"; $script:failed++; return }
    $zip = Join-Path $DOWNLOADS 'jadx.zip'
    Invoke-SafeDownload $url $zip
    Expand-Safe $zip $dir
    Write-Host "    Installed to: $dir" -ForegroundColor Green
    $script:installed++
}

# ============================================
# MAIN DISPATCH
# ============================================

# If no flags, default to -All
if (!($All -or $Ghidra -or $Cutter -or $X64dbg -or $DiE -or $PEBear -or $Procmon -or $Nmap -or $Apktool -or $Jadx)) {
    $All = $true
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  open-tgtylab Tool Installer' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

$installGhidra  = $All -or $Ghidra
$installCutter  = $All -or $Cutter
$installX64dbg  = $All -or $X64dbg
$installDiE     = $All -or $DiE
$installPEBear  = $All -or $PEBear
$installProcmon = $All -or $Procmon
$installNmap    = $All -or $Nmap
$installApktool = $All -or $Apktool
$installJadx    = $All -or $Jadx

# Run each installer independently - catch errors so one failure doesn't block others
if ($installGhidra)  { try { Install-Ghidra  } catch { Write-Warning "Ghidra failed: $_";  $script:failed++ } }
if ($installCutter)  { try { Install-Cutter  } catch { Write-Warning "Cutter failed: $_";  $script:failed++ } }
if ($installX64dbg)  { try { Install-X64dbg  } catch { Write-Warning "x64dbg failed: $_";  $script:failed++ } }
if ($installDiE)     { try { Install-DiE     } catch { Write-Warning "DiE failed: $_";     $script:failed++ } }
if ($installPEBear)  { try { Install-PEBear  } catch { Write-Warning "PE-bear failed: $_"; $script:failed++ } }
if ($installProcmon) { try { Install-Procmon } catch { Write-Warning "Procmon failed: $_"; $script:failed++ } }
if ($installNmap)    { try { Install-Nmap    } catch { Write-Warning "Nmap failed: $_";    $script:failed++ } }
if ($installApktool) { try { Install-Apktool } catch { Write-Warning "Apktool failed: $_"; $script:failed++ } }
if ($installJadx)    { try { Install-Jadx    } catch { Write-Warning "Jadx failed: $_";    $script:failed++ } }

# Summary
Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
$msg = "  Installed: $script:installed  Skipped: $script:skipped  Failed: $script:failed"
Write-Host $msg -ForegroundColor $(if ($script:failed -eq 0) { 'Green' } else { 'Yellow' })
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
