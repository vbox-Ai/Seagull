#Requires -Version 5.1
<#
  Seep 工作台 —— 工具修复器（可选）
  ----------------------------------------------------------------
  工具已随包内置在 Tool\mcp\Tool\safe\，正常无需运行本脚本。
  仅当内置工具损坏/缺失时，用本脚本重新下载。
  官方源优先，失败自动回退国内镜像。
#>
[CmdletBinding()]
param(
    [string[]]$Only = @(),          # 只装指定工具，如 -Only jadx,radare2
    [switch]$Force                  # 已存在也重新下载
)

$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Split-Path -Parent $ScriptDir
# seep MCP 硬编码要求：TOOL_DIR = <脚本目录>/Tool → 工具必须落在 Tool\mcp\Tool\safe\
$ToolsDir  = Join-Path $Root 'Tool\mcp\Tool\safe'
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

$Mirrors = @(
    'https://gh-proxy.com/',             # 国内镜像优先：官方源在国内直连常超时，别让用户干等
    'https://ghproxy.net/',
    ''                                   # 官方源兜底
)

function Write-Ok($m)   { Write-Host "    [OK] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "    [!!] $m" -ForegroundColor Yellow }
function Write-Info($m) { Write-Host "    [..] $m" -ForegroundColor Gray }

# 带镜像回退的下载：用 .NET HttpWebRequest 流式读，每 500ms 刷一行进度。
# Invoke-WebRequest -OutFile 是整文件下载，过程静默，界面看着像卡死。
function Get-FileWithMirror {
    param([string]$Url, [string]$OutFile)
    foreach ($m in $Mirrors) {
        $u = if ($m -eq '' -or $Url -notmatch '^https?://github') { $Url } else { "$m$Url" }
        $tag = if ($m -eq '') { 'official' } else { $m.TrimEnd('/') }
        try {
            Write-Info "尝试 $tag ..."
            $req = [System.Net.HttpWebRequest]::Create($u)
            $req.UserAgent = 'seep-setup'
            $req.Timeout = 120000
            $req.ReadWriteTimeout = 120000
            $resp = $req.GetResponse()
            $total = $resp.ContentLength
            $src = $resp.GetResponseStream()
            $dst = [System.IO.File]::Create($OutFile)
            $buf = New-Object byte[] 65536
            $read = 0
            $lastTick = [DateTime]::Now
            while (($n = $src.Read($buf, 0, $buf.Length)) -gt 0) {
                $dst.Write($buf, 0, $n)
                $read += $n
                if (([DateTime]::Now - $lastTick).TotalMilliseconds -ge 500) {
                    $lastTick = [DateTime]::Now
                    if ($total -gt 0) {
                        $pct = [int]($read * 100 / $total)
                        Write-Info ("下载进度 {0}% ({1:N1} / {2:N1} MB)" -f $pct, ($read/1MB), ($total/1MB))
                    } else {
                        Write-Info ("下载中 ... {0:N1} MB" -f ($read/1MB))
                    }
                }
            }
            $dst.Close(); $src.Close(); $resp.Close()
            if ((Test-Path $OutFile) -and (Get-Item $OutFile).Length -gt 1024) {
                Write-Ok "下载成功 ($tag)"
                return $true
            }
        } catch {
            Write-Info "失败: $($_.Exception.Message.Split([Environment]::NewLine)[0])"
            # 半成品文件别留：下次重试或下一个镜像直接覆盖
            if (Test-Path $OutFile) { Remove-Item $OutFile -Force -ErrorAction SilentlyContinue }
        }
    }
    return $false
}

# 取 GitHub 最新 release 的 asset 下载地址
function Get-GitHubAsset {
    param([string]$Repo, [string]$Pattern)
    try {
        $api = "https://api.github.com/repos/$Repo/releases/latest"
        $rel = Invoke-RestMethod -Uri $api -TimeoutSec 30 -Headers @{ 'User-Agent' = 'seep-setup' }
        $asset = $rel.assets | Where-Object { $_.name -match $Pattern } | Select-Object -First 1
        if ($asset) { return @{ Url = $asset.browser_download_url; Name = $asset.name; Tag = $rel.tag_name } }
    } catch {
        Write-Warn "GitHub API 失败 ($Repo): $($_.Exception.Message.Split([Environment]::NewLine)[0])"
    }
    return $null
}

function Expand-ZipTo {
    param([string]$Zip, [string]$Dest)
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Expand-Archive -Path $Zip -DestinationPath $Dest -Force
}

function Should-Run($name) {
    if ($Only.Count -eq 0) { return $true }
    return ($Only -contains $name)
}

$results = @{}

# ---------------------------------------------------------------- jadx
if (Should-Run 'jadx') {
    Write-Host "`n  [1/6] jadx (Java 反编译)" -ForegroundColor Cyan
    $dst = Join-Path $ToolsDir 'jadx'
    if ((Test-Path $dst) -and -not $Force) { Write-Ok '已存在，跳过'; $results['jadx'] = $true }
    else {
        $a = Get-GitHubAsset -Repo 'skylot/jadx' -Pattern '^jadx-[\d.]+\.zip$'
        if ($a) {
            $zip = Join-Path $env:TEMP $a.Name
            if (Get-FileWithMirror -Url $a.Url -OutFile $zip) {
                if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
                Expand-ZipTo -Zip $zip -Dest $dst
                Remove-Item $zip -Force -ErrorAction SilentlyContinue
                Write-Ok "jadx $($a.Tag) -> tools\jadx"
                $results['jadx'] = $true
            } else { Write-Warn 'jadx 下载失败'; $results['jadx'] = $false }
        } else { Write-Warn 'jadx: 无法获取 release 信息'; $results['jadx'] = $false }
    }
}

# ---------------------------------------------------------------- radare2
if (Should-Run 'radare2') {
    Write-Host "`n  [2/6] radare2 (二进制逆向)" -ForegroundColor Cyan
    $dst = Join-Path $ToolsDir 'radare2'
    if ((Test-Path $dst) -and -not $Force) { Write-Ok '已存在，跳过'; $results['radare2'] = $true }
    else {
        $a = Get-GitHubAsset -Repo 'radareorg/radare2' -Pattern '^radare2-.*-w64\.zip$'
        if ($a) {
            $zip = Join-Path $env:TEMP $a.Name
            if (Get-FileWithMirror -Url $a.Url -OutFile $zip) {
                if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
                Expand-ZipTo -Zip $zip -Dest $dst
                Remove-Item $zip -Force -ErrorAction SilentlyContinue
                Write-Ok "radare2 $($a.Tag) -> tools\radare2"
                $results['radare2'] = $true
            } else { Write-Warn 'radare2 下载失败'; $results['radare2'] = $false }
        } else { Write-Warn 'radare2: 无法获取 release 信息'; $results['radare2'] = $false }
    }
}

# ---------------------------------------------------------------- apktool
if (Should-Run 'apktool') {
    Write-Host "`n  [3/6] apktool (APK 解包/重打包)" -ForegroundColor Cyan
    $dst = Join-Path $ToolsDir 'apktool'
    if ((Test-Path $dst) -and -not $Force) { Write-Ok '已存在，跳过'; $results['apktool'] = $true }
    else {
        New-Item -ItemType Directory -Force -Path $dst | Out-Null
        $a = Get-GitHubAsset -Repo 'iBotPeaches/Apktool' -Pattern '^apktool_[\d.]+\.jar$'
        if ($a) {
            $jar = Join-Path $dst 'apktool.jar'
            if (Get-FileWithMirror -Url $a.Url -OutFile $jar) {
                $bat = @'
@echo off
if "%JAVA_HOME%"=="" (set JAVA=java) else (set JAVA="%JAVA_HOME%\bin\java.exe")
%JAVA% -jar -Duser.language=en "%~dp0apktool.jar" %*
'@
                Set-Content -Path (Join-Path $dst 'apktool.bat') -Value $bat -Encoding ASCII
                Write-Ok "apktool $($a.Tag) -> tools\apktool"
                $results['apktool'] = $true
            } else { Write-Warn 'apktool 下载失败'; $results['apktool'] = $false }
        } else { Write-Warn 'apktool: 无法获取 release 信息'; $results['apktool'] = $false }
    }
}

# ---------------------------------------------------------------- 7z / 7za
if (Should-Run '7z') {
    Write-Host "`n  [4/10] 7-Zip (解包)" -ForegroundColor Cyan
    $dst = Join-Path $ToolsDir '7zip'
    if ((Test-Path (Join-Path $dst '7z.exe')) -and -not $Force) { Write-Ok '已存在，跳过'; $results['7z'] = $true }
    else {
        try {
            $winget = Get-Command winget -ErrorAction SilentlyContinue
            if ($winget) {
                Write-Info 'winget install 7zip.7zip ...'
                & winget install --id 7zip.7zip --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            }
            $exe = @(
                (Join-Path ${env:ProgramFiles} '7-Zip\7z.exe'),
                (Join-Path ${env:ProgramFiles(x86)} '7-Zip\7z.exe'),
                (Join-Path $env:LOCALAPPDATA 'Programs\7-Zip\7z.exe')
            ) | Where-Object { Test-Path $_ } | Select-Object -First 1
            if ($exe) {
                New-Item -ItemType Directory -Force -Path $dst | Out-Null
                Copy-Item $exe (Join-Path $dst '7z.exe') -Force
                Write-Ok '7z 已就位（winget 安装，拷入 tools\7zip）'
                $results['7z'] = $true
            } else {
                Write-Warn '7z 未安装成功（winget 不可用或安装失败，可手动装 7-Zip）'
                $results['7z'] = $false
            }
        } catch {
            Write-Warn "7z 安装失败: $($_.Exception.Message.Split([Environment]::NewLine)[0])"
            $results['7z'] = $false
        }
    }
}

# ---------------------------------------------------------------- git
if (Should-Run 'git') {
    Write-Host "`n  [5/10] git (版本控制)" -ForegroundColor Cyan
    if (Get-Command git -ErrorAction SilentlyContinue) { Write-Ok '已存在，跳过'; $results['git'] = $true }
    else {
        try {
            $winget = Get-Command winget -ErrorAction SilentlyContinue
            if (-not $winget) { throw 'winget 不可用' }
            Write-Info 'winget install Git.Git ...'
            & winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            if (Get-Command git -ErrorAction SilentlyContinue) { Write-Ok 'git 安装完成'; $results['git'] = $true }
            else { Write-Warn 'git 已装但当前 shell 未刷新 PATH（新开终端即可用）'; $results['git'] = $true }
        } catch {
            Write-Warn "git 安装失败: $($_.Exception.Message.Split([Environment]::NewLine)[0])"
            $results['git'] = $false
        }
    }
}

# ---------------------------------------------------------------- frida
if (Should-Run 'frida') {
    Write-Host "`n  [6/10] frida (动态插桩)" -ForegroundColor Cyan
    if (Get-Command frida -ErrorAction SilentlyContinue) { Write-Ok '已存在，跳过'; $results['frida'] = $true }
    else {
        try {
            $py = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
            if (-not $py) { throw '未找到 python，先装 Python 再装 frida' }
            Write-Info 'pip install frida-tools ...'
            & python -m pip install --quiet frida-tools 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Write-Ok 'frida-tools 安装完成'; $results['frida'] = $true }
            else { Write-Warn 'frida-tools 安装失败'; $results['frida'] = $false }
        } catch {
            Write-Warn "frida 安装失败: $($_.Exception.Message.Split([Environment]::NewLine)[0])"
            $results['frida'] = $false
        }
    }
}

# ---------------------------------------------------------------- python
if (Should-Run 'python') {
    Write-Host "`n  [7/10] Python (脚本运行时)" -ForegroundColor Cyan
    $py = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
    # WindowsApps\python.exe 是 Store 占位 stub，一执行就弹商店，不算真 Python
    if ($py -and $py.Source -match 'WindowsApps') {
        Write-Warn '检测到 WindowsApps python.exe 占位符（非真 Python），走安装流程'
        $py = $null
    }
    if ($py) { Write-Ok '已存在，跳过'; $results['python'] = $true }
    else {
        try {
            $winget = Get-Command winget -ErrorAction SilentlyContinue
            if (-not $winget) { throw 'winget 不可用' }
            Write-Info 'winget install Python.Python.3.12 ...'
            & winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            Write-Warn 'Python 已发起安装；新 PATH 只对新终端生效，重开终端/应用后 python 才可用'
            $results['python'] = $true
        } catch {
            Write-Warn "python 安装失败: $($_.Exception.Message.Split([Environment]::NewLine)[0])"
            $results['python'] = $false
        }
    }
}

# ---------------------------------------------------------------- playwright-mcp
if (Should-Run 'playwright-mcp') {
    Write-Host "`n  [8/10] playwright-mcp (浏览器自动化)" -ForegroundColor Cyan
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Warn '未找到 npm，跳过'; $results['playwright-mcp'] = $false
    } else {
        $dst = Join-Path $ToolsDir 'playwright-mcp'
        New-Item -ItemType Directory -Force -Path $dst | Out-Null
        Push-Location $dst
        try {
            if (-not (Test-Path (Join-Path $dst 'package.json'))) {
                '{ "name": "playwright-mcp-local", "private": true }' | Set-Content -Path 'package.json' -Encoding UTF8
            }
            Write-Info 'npm install @playwright/mcp ...'
            & npm install '@playwright/mcp' --no-audit --no-fund 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Write-Ok 'playwright-mcp -> tools\playwright-mcp'; $results['playwright-mcp'] = $true }
            else { Write-Warn 'npm install 失败（可改用 npx 方式）'; $results['playwright-mcp'] = $false }
        } finally { Pop-Location }
    }
}

# ---------------------------------------------------------------- js-reverse-mcp
if (Should-Run 'js-reverse-mcp') {
    Write-Host "`n  [9/10] js-reverse-mcp (JS 逆向)" -ForegroundColor Cyan
    # 官方推荐 npx 免安装方式：无需下载，仅在 mcp.json 注册即可
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Warn '未找到 npm，跳过（js-reverse-mcp 依赖 npx）'
        $results['js-reverse-mcp'] = $false
    } else {
        Write-Info 'js-reverse-mcp 采用官方推荐的 npx 方式（无需本地下载）'
        Write-Info '注册方式：mcp.json 中 command=npx, args=["js-reverse-mcp"]'
        Write-Info '可选本地安装：git clone https://github.com/zhizhuodemao/js-reverse-mcp + npm i + npm run build'
        Write-Ok 'js-reverse-mcp -> 走 npx（已在 mcp.json.template 中预置）'
        $results['js-reverse-mcp'] = $true
    }
}

# ---------------------------------------------------------------- ida-pro-mcp
if (Should-Run 'ida-pro-mcp') {
    Write-Host "`n  [10/10] ida-pro-mcp (IDA 桥接)" -ForegroundColor Cyan
    $dst = Join-Path $ToolsDir 'ida-pro-mcp'
    if ((Test-Path $dst) -and -not $Force) { Write-Ok '已存在，跳过'; $results['ida-pro-mcp'] = $true }
    else {
        Write-Info 'pip install ida-pro-mcp ...'
        & python -m pip install --quiet ida-pro-mcp 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            New-Item -ItemType Directory -Force -Path $dst | Out-Null
            Write-Ok 'ida-pro-mcp 已装入 Python 环境'
            Write-Info '（IDA 本体需你自备，见 MANUAL\IDA-PRO.md）'
            $results['ida-pro-mcp'] = $true
        } else { Write-Warn 'ida-pro-mcp 安装失败'; $results['ida-pro-mcp'] = $false }
    }
}

# ---------------------------------------------------------------- PATH
Write-Host "`n  [PATH] 加入工具目录" -ForegroundColor Cyan
$addPaths = @()
foreach ($p in @('radare2\bin', 'jadx\bin', 'apktool')) {
    $full = Join-Path $ToolsDir $p
    if (Test-Path $full) { $addPaths += $full }
}
if ($addPaths.Count -gt 0) {
    $old = [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts = $old -split ';' | Where-Object { $_ -ne '' }
    $added = 0
    foreach ($p in $addPaths) {
        if ($parts -notcontains $p) { $parts += $p; $added++ }
    }
    if ($added -gt 0) {
        [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
        Write-Ok "已向用户 PATH 追加 $added 个目录（原 PATH 未备份，如需回滚请手动移除）"
    } else { Write-Ok 'PATH 已包含这些目录' }
} else { Write-Warn '未发现可加入 PATH 的目录' }

# ---------------------------------------------------------------- 汇总
Write-Host "`n  ---------- 工具下载汇总 ----------" -ForegroundColor White
foreach ($k in $results.Keys | Sort-Object) {
    $v = $results[$k]
    $mark = if ($v -eq $true) { '[OK]  ' } elseif ($v -eq $false) { '[FAIL]' } else { '[SKIP]' }
    Write-Host ("    {0} {1}" -f $mark, $k)
}

$failed = @($results.Keys | Where-Object { $results[$_] -eq $false })
$ok = @($results.Keys | Where-Object { $results[$_] -eq $true })
if ($failed.Count -gt 0) {
    Write-Host "`n    失败项: $($failed -join ', ')" -ForegroundColor Yellow
    Write-Host '    可重跑本脚本，或按 MANUAL\PREREQUISITES.md 手动下载' -ForegroundColor Yellow
}

# 机器可读结果：主进程解析这一行做分项展示，别再拿「退出码」一刀切。
# 部分成功时退出码 0（有收获就不算致命），全部失败才 1。
$resultJson = @{
    ok      = @($ok | Sort-Object)
    failed  = @($failed | Sort-Object)
    partial = ($failed.Count -gt 0 -and $ok.Count -gt 0)
} | ConvertTo-Json -Compress
Write-Host ("RESULT_JSON=" + $resultJson)

if ($ok.Count -eq 0 -and $results.Count -gt 0) {
    exit 1
}
exit 0
