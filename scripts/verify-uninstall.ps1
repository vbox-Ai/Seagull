# =============================================================================
#  海鸥V8·破甲版 - 卸载残留检测
#
#  用法：
#    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-uninstall.ps1
#    powershell ... -File scripts\verify-uninstall.ps1 -InstallDir 'E:\hs-test'
#
#  退出码：0 = 无残留；1 = 发现残留（逐条列出）。
#  本脚本只读，不删除任何东西。清理用 scripts\purge-residue.ps1。
#
#  机器上本来就装着别的副本时，那些副本也会被列出来。做「装一次再卸掉」的
#  对比验收时，用 -OutFile 各存一份再 diff，只有新增的行才算这次卸载的残留：
#    ... -File scripts\verify-uninstall.ps1 -OutFile before.txt
#    （安装 -> 运行 -> 卸载）
#    ... -File scripts\verify-uninstall.ps1 -OutFile after.txt
#    git diff --no-index before.txt after.txt   # 期望：无输出
# =============================================================================
[CmdletBinding()]
param(
  [string]$InstallDir = '',
  [string]$OutFile = ''
)

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$residue = New-Object System.Collections.Generic.List[string]
function Add-Residue([string]$kind, [string]$path) {
  $script:residue.Add(("[{0}] {1}" -f $kind, $path))
}

# Codex 配置目录的全部候选位置。不能只认 ~/.codex：用户可能把 CODEX_HOME 指到别的盘，
# 也可能迁移过数据目录（旧位置还留着状态文件）。检测要把候选位置都过一遍。
function Get-CodexHomes {
  $list = New-Object System.Collections.Generic.List[string]
  if ($env:CODEX_HOME) { $list.Add($env:CODEX_HOME) }
  $list.Add((Join-Path $env:USERPROFILE '.codex'))
  try {
    foreach ($d in [IO.DriveInfo]::GetDrives()) {
      if ($d.DriveType -eq [IO.DriveType]::Fixed -and $d.IsReady) {
        $list.Add((Join-Path $d.RootDirectory.FullName '.codex'))
      }
    }
  } catch { }
  return ($list | Select-Object -Unique)
}

# 名称匹配必须精确：用「包含海鸥V8·破甲版/破甲」扫用户磁盘会误伤，
# 例如 C:\Users\...\AppData\Roaming\gpt5.6-...-gemini破甲越狱 只是碰巧含「破甲」二字。
#   seagull-v8 / -pro / -desktop  <- 打包后 package.json 的 name（userData 目录名）
#   海鸥V8·破甲版 / 海鸥V8·破甲版 Pro     <- productName（安装目录名、快捷方式名）
$exactNames = @(
  'seagull-v8', 'seagull-pro', 'seagull-desktop',
  'seagull-v8-updater', 'seagull-pro-updater', 'seagull-desktop-updater',
  '海鸥V8·破甲版', '海鸥V8·破甲版 Pro',
  '海鸥V8·破甲版-updater', '海鸥V8·破甲版 Pro-updater'
)
function Test-Ours([string]$name) {
  if ($exactNames -contains $name) { return $true }
  if ($name -like '*.lnk' -and ($exactNames -contains $name.Substring(0, $name.Length - 4))) { return $true }
  return $false
}
$displayPattern = '^(海鸥V8·破甲版|seagull-(free|pro|desktop))(\s.*)?$'

Write-Host '=== 1. 安装目录 ===' -ForegroundColor Cyan
if ($InstallDir) {
  if (Test-Path -LiteralPath $InstallDir) { Add-Residue '安装目录' $InstallDir }
  Write-Host ("  {0} -> {1}" -f $InstallDir, (Test-Path -LiteralPath $InstallDir))
} else {
  Write-Host '  （未指定 -InstallDir，跳过）'
}

Write-Host '=== 2. 进程 ===' -ForegroundColor Cyan
Get-Process | Where-Object { $_.ProcessName -match 'seagull|海鸥V8·破甲版破甲' } | ForEach-Object {
  Add-Residue '进程' ("{0} (PID {1})" -f $_.ProcessName, $_.Id)
}

Write-Host '=== 3. %APPDATA% / %LOCALAPPDATA% ===' -ForegroundColor Cyan
foreach ($root in @($env:APPDATA, $env:LOCALAPPDATA, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -Directory | Where-Object { Test-Ours $_.Name } | ForEach-Object {
    Add-Residue '数据目录' $_.FullName
  }
}

Write-Host '=== 4. 注册表卸载项（HKCU / HKLM） ===' -ForegroundColor Cyan
$uninstallRoots = @(
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
foreach ($root in $uninstallRoots) {
  Get-ChildItem $root | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    if ($p.DisplayName -match $displayPattern) {
      $target = $p.UninstallString
      $alive = $false
      if ($target -match '"([^"]+)"') { $alive = Test-Path -LiteralPath $Matches[1] }
      Add-Residue '注册表卸载项' ("{0} | DisplayName={1} | UninstallString={2} | 卸载器存在={3}" -f $_.PSPath, $p.DisplayName, $target, $alive)
    }
  }
}

Write-Host '=== 5. 其它注册表痕迹 ===' -ForegroundColor Cyan
foreach ($k in @('HKCU:\Software\Classes\AppUserModelId', 'HKCU:\Software\Classes', 'HKCU:\Software')) {
  Get-ChildItem $k | Where-Object { $_.PSChildName -match '^com\.seagull\.' } | ForEach-Object {
    Add-Residue '注册表键' $_.Name
  }
}
foreach ($k in @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\海鸥V8·破甲版.exe',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\海鸥V8·破甲版.exe')) {
  if (Test-Path $k) { Add-Residue '注册表键' $k }
}

Write-Host '=== 6. 快捷方式 ===' -ForegroundColor Cyan
$lnkRoots = @(
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:PUBLIC 'Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
  (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
)
foreach ($r in $lnkRoots) {
  Get-ChildItem -LiteralPath $r -Recurse -Force | Where-Object { Test-Ours $_.Name } | ForEach-Object {
    Add-Residue '快捷方式' $_.FullName
  }
}

Write-Host '=== 6.5 electron-builder 安装键 HKCU\Software\<GUID> ===' -ForegroundColor Cyan
Get-ChildItem 'HKCU:\Software' | Where-Object { $_.PSChildName -match '^[0-9a-fA-F-]{36}$' } | ForEach-Object {
  $sn = (Get-ItemProperty $_.PSPath).ShortcutName
  if ($sn -and $sn -match $displayPattern) { Add-Residue '安装键' ("{0} | ShortcutName={1} | InstallLocation={2}" -f $_.Name, $sn, (Get-ItemProperty $_.PSPath).InstallLocation) }
}

Write-Host '=== 7. 工具自身状态文件（Codex 数据目录） ===' -ForegroundColor Cyan
# Codex 的数据目录可能在别的盘（CODEX_HOME 或迁移过），候选位置都查一遍
foreach ($codexHome in Get-CodexHomes) {
  foreach ($f in @('seagull_desktop_state.json', 'seagull_settings.json')) {
    $p = Join-Path $codexHome $f
    if (Test-Path -LiteralPath $p) { Add-Residue '状态文件' $p }
  }
}
Write-Host '  注：~/.codex 下其余内容属于 Codex CLI 本体，不属于本工具，不计入残留。'

Write-Host '=== 8. 注入提示词残留 ===' -ForegroundColor Cyan
# 这一节才是「卸载干净」的真正验收面：上面 1-7 查的是程序自身的痕迹，
# 这里查的是「提示词还会不会被 AI 工具读到」—— 主文件、注入块、备份副本、随附包、技能树都在内。
# 判定逻辑不在这里重复实现：直接调 clear-injected-prompts.ps1 的 -ListOnly，
# 保证「什么算提示词」全项目只有一处定义，不会两套结论打架。
$clearScript = Join-Path $PSScriptRoot 'clear-injected-prompts.ps1'
if (-not (Test-Path -LiteralPath $clearScript)) {
  Write-Host '  （未找到 clear-injected-prompts.ps1，跳过这一节）' -ForegroundColor Yellow
} else {
  Write-Host '  扫描中（WorkBuddy state 缺失时会限深扫盘，可能较慢）...'
  $hits = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $clearScript -ListOnly 2>$null |
            Where-Object { $_ -and (Test-Path -LiteralPath ([string]$_)) })
  foreach ($h in $hits) { Add-Residue '提示词' ([string]$h) }
  Write-Host ("  发现 {0} 处提示词残留" -f $hits.Count)
}

Write-Host ''
if ($OutFile) {
  $residue | Set-Content -LiteralPath $OutFile -Encoding UTF8
  Write-Host ("残留清单已写入 {0}（{1} 条）" -f $OutFile, $residue.Count)
}

if ($residue.Count -eq 0) {
  Write-Host '结果：无残留，卸载干净。' -ForegroundColor Green
  exit 0
}
Write-Host ("结果：发现 {0} 处残留 ——" -f $residue.Count) -ForegroundColor Red
$residue | ForEach-Object { Write-Host ("  " + $_) }
exit 1
