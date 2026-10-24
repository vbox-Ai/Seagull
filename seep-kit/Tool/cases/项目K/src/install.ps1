# install.ps1 -- ProjectKUnlock 部署（安全版）
#
# ⚠️ 安全设计声明
# ---------------------------------------------------------------------------
# 本脚本 **绝不** 写入任何全局（User / Machine 级）环境变量。
#
# 原因：APPDOMAIN_MANAGER_ASM 是 CLR 级引导变量，一旦写入 HKCU\Environment，
#       之后启动的【每一个 .NET 程序】（PowerShell / 资源管理器 / 各类 .NET 应用）
#       都会被强制加载本 DLL；而那些进程的目录里没有该 DLL，会在 CLR 启动阶段
#       抛 FileNotFoundException -> TypeLoadException，表现为「窗口一闪而过」。
#
# 因此本脚本只做两件事：
#   1) 把 ProjectKUnlock.dll 复制到安装目录
#   2) 生成一个进程级启动器（环境变量只作用于该次启动的子进程）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Start
param(
    [string]$AppDir  = '',
    [string]$ExeName = '<App>.exe',
    [switch]$Start
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dll  = Join-Path $here 'ProjectKUnlock.dll'

if (-not (Test-Path $dll)) { throw "未找到 ProjectKUnlock.dll（应与本脚本同目录）" }

# 自动定位安装目录
if (-not $AppDir) {
    $AppDir = (Get-ItemProperty 'HKCU:\SOFTWARE\<App>' -ErrorAction SilentlyContinue).Path
    if (-not $AppDir) { $AppDir = 'D:\Data\Allen' }
}
$exe = Join-Path $AppDir $ExeName
if (-not (Test-Path $exe)) { throw "未找到目标程序: $exe" }

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " ProjectKUnlock 部署（安全版 · 不写全局环境变量）" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  安装目录 : $AppDir"
Write-Host "  目标程序 : $ExeName"
Write-Host ""

# ---- 0. 安全检查：确保当前没有全局污染 ----
Write-Host "[0/4] 安全检查：全局环境变量" -ForegroundColor Yellow
$bad = 0
foreach ($n in @('APPDOMAIN_MANAGER_ASM', 'APPDOMAIN_MANAGER_TYPE')) {
    $u = [Environment]::GetEnvironmentVariable($n, 'User')
    $m = [Environment]::GetEnvironmentVariable($n, 'Machine')
    if ($u) { Write-Host ("      [!] HKCU\\Environment 存在 " + $n + " -> 正在清除") -ForegroundColor Red; [Environment]::SetEnvironmentVariable($n, $null, 'User'); $bad++ }
    if ($m) { Write-Host ("      [!] HKLM 存在 " + $n + " -> 需要管理员清除") -ForegroundColor Red; $bad++ }
}
if ($bad -eq 0) { Write-Host "      [OK] 全局环境变量干净" -ForegroundColor Green }

# ---- 1. 部署 DLL ----
Write-Host "[1/4] 部署 ProjectKUnlock.dll"
Copy-Item $dll (Join-Path $AppDir 'ProjectKUnlock.dll') -Force
Write-Host "      [OK] -> $AppDir\ProjectKUnlock.dll" -ForegroundColor Green

# ---- 2. 生成进程级启动器 ----
Write-Host "[2/4] 生成进程级启动器（环境变量仅作用于该次启动）"
$asm  = 'ProjectKUnlock, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null'
$type = 'Manager'
$launcher = Join-Path $AppDir 'App_Unlock.cmd'
$lines = @(
    '@echo off',
    'rem 进程级引导：仅本次启动的子进程会加载 ProjectKUnlock.dll',
    'rem 绝不写入系统环境变量，避免影响其它 .NET 程序',
    "set `"APPDOMAIN_MANAGER_ASM=$asm`"",
    "set `"APPDOMAIN_MANAGER_TYPE=$type`"",
    "start `"`" `"%~dp0$ExeName`" %*"
)
Set-Content -Path $launcher -Value $lines -Encoding ASCII
Write-Host "      [OK] -> $launcher" -ForegroundColor Green

# ---- 3. 关闭旧实例 ----
Write-Host "[3/4] 关闭旧实例"
$pn = [IO.Path]::GetFileNameWithoutExtension($ExeName)
Get-Process $pn -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# ---- 4. 可选启动 ----
if ($Start) {
    Write-Host "[4/4] 通过启动器启动"
    Start-Process -FilePath $launcher
    Start-Sleep -Seconds 6
    $log = Join-Path $AppDir 'ProjectKUnlock.log'
    if (Test-Path $log) {
        Write-Host ""
        Write-Host "--- ProjectKUnlock 日志 ---"
        Get-Content $log -Tail 10
    }
} else {
    Write-Host "[4/4] 跳过启动（未指定 -Start）"
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " 完成。日常使用请双击：" -ForegroundColor Green
Write-Host "   $launcher"
Write-Host " 卸载还原： powershell -ExecutionPolicy Bypass -File .\uninstall.ps1"
Write-Host "======================================================================" -ForegroundColor Cyan
