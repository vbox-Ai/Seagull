# =============================================================================
#  海鸥V8·破甲版 - 卸载残留回归测试
#
#  流程：静默安装 -> 启动一次（产生 userData）-> 静默卸载 -> 对比残留清单。
#  对比基准是「安装前」的机器状态，所以机器上已有的其它副本不会干扰结论。
#
#  用法：
#    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-uninstall.ps1 `
#      -Installer 'release\海鸥V8·破甲版-安装版-4.4.0.exe' `
#      -InstallDir 'E:\hs-test' `
#      -Label before
# =============================================================================
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [Parameter(Mandatory = $true)][string]$Label,
  [int]$AppRunSeconds = 20,
  # 卸载是否删掉 %APPDATA%\seagull-v8 是这个 bug 的核心之一。机器上原本就
  # 装着别的副本时该目录本来就存在，差异对比会把它掩盖掉，所以测试前先把它和
  # updater 缓存清空，让「卸载后是否残留」变成一个非黑即白的判定。
  # 里面只有 Chromium 缓存，应用下次启动会重建；关掉这个开关用 -PurgeUserData:$false。
  [bool]$PurgeUserData = $true
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$root = Split-Path -Parent $PSScriptRoot
$verify = Join-Path $PSScriptRoot 'verify-uninstall.ps1'
$outDir = Join-Path $root "release\uninstall-test"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$before = Join-Path $outDir "$Label.before.txt"
$after = Join-Path $outDir "$Label.after.txt"
$log = Join-Path $outDir "$Label.log.txt"

function Say($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

Set-Content -LiteralPath $log -Value "=== 卸载残留测试 label=$Label ===" -Encoding UTF8
Say "安装包: $Installer"
Say "安装目录: $InstallDir"

# --- 0. 基线 ---------------------------------------------------------------
Say '步骤 0/5 采集安装前基线'
& powershell -NoProfile -ExecutionPolicy Bypass -File $verify -InstallDir $InstallDir -OutFile $before | Out-Null

$userDataDir = Join-Path $env:APPDATA 'seagull-v8'
$updaterDir = Join-Path $env:LOCALAPPDATA 'seagull-v8-updater'
if ($PurgeUserData) {
  Say '步骤 0.5/5 清空本次测试目标的 userData 与 updater 缓存（仅 Chromium 缓存，可重建）'
  foreach ($d in @($userDataDir, $updaterDir)) {
    if (Test-Path -LiteralPath $d) {
      Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue
      Say ("  已清空: {0}" -f $d)
    }
  }
  # 基线重采一次，清空后的状态才是真正的对比基准
  & powershell -NoProfile -ExecutionPolicy Bypass -File $verify -InstallDir $InstallDir -OutFile $before | Out-Null
}

# --- 1. 静默安装 -----------------------------------------------------------
Say '步骤 1/5 静默安装'
if (Test-Path -LiteralPath $InstallDir) {
  Say "  目录已存在，先清理: $InstallDir"
  Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}
# 这台机器上 NSIS 安装器会间歇性 0xC0000005（%TEMP% 里从 9/14 起就有异常终止留下的
# ns*.tmp 目录，属既有现象）。重试并逐次记录，不掩盖失败次数。
$p = $null
for ($i = 1; $i -le 4; $i++) {
  if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction SilentlyContinue }
  $p = Start-Process -FilePath $Installer -ArgumentList '/S', "/D=$InstallDir" -Wait -PassThru
  Say ("  安装器第 {0} 次退出码: {1} (0x{2:X8})" -f $i, $p.ExitCode, $p.ExitCode)
  if (Test-Path -LiteralPath (Join-Path $InstallDir '海鸥V8·破甲版.exe')) { break }
  Say '  本次安装未成功，重试'
  Start-Sleep -Seconds 2
}

$exe = Join-Path $InstallDir '海鸥V8·破甲版.exe'
if (-not (Test-Path -LiteralPath $exe)) {
  Say "安装失败：找不到 $exe"
  exit 2
}
Say "  已安装: $exe"

# --- 2. 启动一次，产生 userData --------------------------------------------
Say "步骤 2/5 启动应用 ${AppRunSeconds}s 以产生 userData"
$app = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds $AppRunSeconds
Say ("  %APPDATA%\seagull-v8 已生成: {0}" -f (Test-Path -LiteralPath $userDataDir))
& taskkill /F /T /IM '海鸥V8·破甲版.exe' 2>&1 | Out-Null
Start-Sleep -Seconds 3

# --- 3. 静默卸载 -----------------------------------------------------------
Say '步骤 3/5 静默卸载'
$uninst = Join-Path $InstallDir 'Uninstall 海鸥V8·破甲版.exe'
if (-not (Test-Path -LiteralPath $uninst)) {
  Say "卸载失败：找不到 $uninst"
  exit 3
}
Start-Process -FilePath $uninst -ArgumentList '/currentuser', '/S' | Out-Null

# 卸载器会把自己复制到 %TEMP% 再执行，Start-Process 立刻返回，必须轮询等待
$deadline = (Get-Date).AddSeconds(180)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $stillRunning = Get-Process | Where-Object { $_.ProcessName -like 'Uninstall*' }
  $dirGone = -not (Test-Path -LiteralPath $InstallDir)
  if (-not $stillRunning -and $dirGone) { break }
}
Say ("  卸载后安装目录仍存在: {0}" -f (Test-Path -LiteralPath $InstallDir))

# --- 4. 复查 ---------------------------------------------------------------
Say '步骤 4/5 采集卸载后状态'
& powershell -NoProfile -ExecutionPolicy Bypass -File $verify -InstallDir $InstallDir -OutFile $after | Out-Null

Say '步骤 5/5 差异对比 + 关键项硬校验'
$b = Get-Content -LiteralPath $before -ErrorAction SilentlyContinue
$a = Get-Content -LiteralPath $after -ErrorAction SilentlyContinue
$new = Compare-Object -ReferenceObject $b -DifferenceObject $a | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject }

# 关键项逐条硬校验：这几项任意一项残留都直接判失败，不依赖差异对比
$checks = [ordered]@{
  '安装目录已删除'      = -not (Test-Path -LiteralPath $InstallDir)
  'userData 已删除'     = -not (Test-Path -LiteralPath $userDataDir)
  'updater 缓存已删除'  = -not (Test-Path -LiteralPath $updaterDir)
  '开始菜单快捷方式已删除' = -not (Test-Path -LiteralPath (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\海鸥V8·破甲版.lnk'))
  '桌面快捷方式已删除'  = -not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE 'Desktop\海鸥V8·破甲版.lnk'))
  '卸载项已删除'        = -not (Get-ChildItem 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall' |
      Where-Object { (Get-ItemProperty $_.PSPath).UninstallString -like "*$InstallDir*" })
}
$bad = 0
foreach ($k in $checks.Keys) {
  $ok = [bool]$checks[$k]
  if (-not $ok) { $bad++ }
  Say ("  {0} {1}" -f $(if ($ok) { '[OK]  ' } else { '[FAIL]' }), $k)
}
Say ("  新增残留条目数: {0}" -f @($new).Count)
$new | ForEach-Object { Say ("    " + $_) }

if ($bad -eq 0 -and -not $new) {
  Say '结论：卸载干净，零残留。'
  exit 0
}
Say ("结论：失败 —— 关键项 {0} 项未通过，新增残留 {1} 条。" -f $bad, @($new).Count)
exit 1
