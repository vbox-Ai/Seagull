# =============================================================================
#  海鸥V8·破甲版 - 历史残留一键清理
#
#  给「已经踩过旧版卸载 bug」的机器用：旧版卸载器不删 userData、不删
#  %LOCALAPPDATA%\<name>-updater，还会在卸载后留下一个空的安装目录；多次改名
#  换目录构建还会留下指向失效路径的僵尸卸载项（控制面板里点不动的那个）。
#
#  安全策略：
#    * 默认只做 dry-run，只打印不删除；确认无误后加 -Apply 才真删。
#    * 名称匹配是「精确匹配」而不是「包含」：磁盘上叫
#      「gpt5.6-...-gemini破甲越狱」这类只是碰巧含「破甲」二字的目录不会被误删。
#    * 正在使用的安装（卸载器文件仍然存在的）一律保留，只报告；要连它一起清，
#      加 -Force。
#    * 绝不触碰 ~/.codex 下的其它内容（那是 Codex CLI 本体）。只清本工具自己
#      写的 seagull_desktop_state.json / seagull_settings.json。
#
#  用法：
#    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\purge-residue.ps1
#    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\purge-residue.ps1 -Apply
# =============================================================================
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [switch]$KeepCodexState
)

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

# 只认这几个名字，别用「包含海鸥V8·破甲版/破甲」这种宽松规则去扫用户磁盘。
#   seagull-v8 / -pro / -desktop  <- 打包后 package.json 的 name（Electron 的 userData 目录名）
#   海鸥V8·破甲版 / 海鸥V8·破甲版 Pro     <- productName（安装目录名、快捷方式名）
$exactNames = @(
  'seagull-v8', 'seagull-pro', 'seagull-desktop',
  'seagull-v8-updater', 'seagull-pro-updater', 'seagull-desktop-updater',
  '海鸥V8·破甲版', '海鸥V8·破甲版 Pro',
  '海鸥V8·破甲版-updater', '海鸥V8·破甲版 Pro-updater'
)
# 精确匹配：整名相等，或「产品名 + .lnk」
function Test-Ours([string]$name) {
  if ($exactNames -contains $name) { return $true }
  if ($name -like '*.lnk' -and ($exactNames -contains $name.Substring(0, $name.Length - 4))) { return $true }
  return $false
}
# 注册表里的 DisplayName 用宽松一点的锚定式匹配（历史版本可能带后缀）
$displayPattern = '^(海鸥V8·破甲版|seagull-(free|pro|desktop))(\s.*)?$'

$mode = if ($Apply) { 'APPLY（真删）' } else { 'DRY-RUN（只看不删，加 -Apply 执行）' }
$doomed = New-Object System.Collections.Generic.List[object]
$kept = New-Object System.Collections.Generic.List[string]

function Plan([string]$kind, [string]$path, [string]$note) {
  $script:doomed.Add([pscustomobject]@{ Kind = $kind; Path = $path; Note = $note })
}
function Keep([string]$what) { $script:kept.Add($what) }

# Codex 配置目录的全部候选位置。不能只认 ~/.codex：用户可能把 CODEX_HOME 指到别的盘，
# 也可能迁移过数据目录（旧位置还留着状态文件）。清理要把候选位置都过一遍。
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

Write-Host ("=== 海鸥V8·破甲版 残留清理 [{0}] ===" -f $mode) -ForegroundColor Cyan

# --- 1. 卸载项：分出「活的」和「僵尸的」 --------------------------------------
$liveNames = New-Object System.Collections.Generic.HashSet[string]
$uninstallRoots = @(
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
foreach ($root in $uninstallRoots) {
  foreach ($key in Get-ChildItem $root) {
    $p = Get-ItemProperty $key.PSPath
    if ($p.DisplayName -notmatch $displayPattern) { continue }

    $target = ''
    if ($p.UninstallString -match '"([^"]+)"') { $target = $Matches[1] }
    elseif ($p.UninstallString) { $target = ($p.UninstallString -split '\s+')[0] }

    if ($target -and (Test-Path -LiteralPath $target)) {
      foreach ($n in $exactNames) { if ($target -like "*$n*") { [void]$liveNames.Add($n) } }
      Keep ("在用安装：{0} -> {1}" -f $p.DisplayName, $target)
      if ($Force) { Plan '卸载项(在用, -Force)' $key.PSPath ("{0} | {1}" -f $p.DisplayName, $target) }
    } else {
      Plan '僵尸卸载项' $key.PSPath ("{0} | 指向不存在的 {1}" -f $p.DisplayName, $target)
    }
  }
}

# --- 2. 数据目录 --------------------------------------------------------------
foreach ($root in @($env:APPDATA, $env:LOCALAPPDATA, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  foreach ($d in (Get-ChildItem -LiteralPath $root -Directory | Where-Object { Test-Ours $_.Name })) {
    $isLive = $false
    foreach ($v in $liveNames) { if ($d.Name -like "*$v*") { $isLive = $true } }
    if ($isLive -and -not $Force) { Keep ("在用安装的数据目录：{0}" -f $d.FullName); continue }
    Plan '数据目录' $d.FullName ''
  }
}

# --- 3. 快捷方式（只删指向已失效目标的） --------------------------------------
$lnkRoots = @(
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:PUBLIC 'Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
  (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
)
$sh = New-Object -ComObject WScript.Shell
foreach ($r in $lnkRoots) {
  foreach ($f in (Get-ChildItem -LiteralPath $r -Recurse -Force | Where-Object { Test-Ours $_.Name })) {
    $targetAlive = $false
    try {
      $t = $sh.CreateShortcut($f.FullName).TargetPath
      if ($t -and (Test-Path -LiteralPath $t)) { $targetAlive = $true }
    } catch {}
    if ($targetAlive -and -not $Force) { Keep ("在用快捷方式：{0}" -f $f.FullName); continue }
    Plan '快捷方式' $f.FullName ''
  }
}

# --- 4. 注册表杂项 ------------------------------------------------------------
foreach ($k in @('HKCU:\Software\Classes\AppUserModelId', 'HKCU:\Software\Classes')) {
  foreach ($s in (Get-ChildItem $k | Where-Object { $_.PSChildName -match '^com\.seagull\.' })) {
    Plan '注册表键' $s.Name ''
  }
}
foreach ($k in @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\海鸥V8·破甲版.exe',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\海鸥V8·破甲版 Pro.exe',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\海鸥V8·破甲版.exe')) {
  if (Test-Path $k) { Plan '注册表键' $k '' }
}
# electron-builder 的安装键 HKCU\Software\<GUID>：靠 ShortcutName 认领，不靠 GUID 常量
foreach ($s in (Get-ChildItem 'HKCU:\Software' | Where-Object { $_.PSChildName -match '^[0-9a-fA-F-]{36}$' })) {
  $sn = (Get-ItemProperty $s.PSPath).ShortcutName
  if ($sn -and $sn -match $displayPattern) {
    $loc = (Get-ItemProperty $s.PSPath).InstallLocation
    $alive = $loc -and (Test-Path -LiteralPath $loc)
    if ($alive -and -not $Force) { Keep ("在用安装键：{0} -> {1}" -f $s.Name, $loc); continue }
    Plan '安装键' $s.Name ("ShortcutName={0} InstallLocation={1}" -f $sn, $loc)
  }
}

# --- 5. 工具自身状态文件 ------------------------------------------------------
if (-not $KeepCodexState) {
  # Codex 的数据目录可能在别的盘（CODEX_HOME 或迁移过），候选位置都过一遍
  foreach ($codexHome in Get-CodexHomes) {
    foreach ($f in @('seagull_desktop_state.json', 'seagull_settings.json')) {
      $p = Join-Path $codexHome $f
      if (Test-Path -LiteralPath $p) { Plan '状态文件' $p '仅此两文件属于本工具，该目录其余内容不动' }
    }
  }
}

# --- 报告 ---------------------------------------------------------------------
Write-Host ''
if ($kept.Count) {
  Write-Host '--- 保留（在用安装相关，未列入清理） ---' -ForegroundColor Yellow
  $kept | ForEach-Object { Write-Host ("  " + $_) }
  Write-Host '  （要连这些一起清，加 -Force；正常做法是对着它的卸载器走一遍卸载）'
  Write-Host ''
}
if (-not $doomed.Count) {
  Write-Host '没有需要清理的残留。' -ForegroundColor Green
  exit 0
}

Write-Host ("--- 待清理 {0} 项 ---" -f $doomed.Count) -ForegroundColor Cyan
foreach ($d in $doomed) { Write-Host ("  [{0}] {1} {2}" -f $d.Kind, $d.Path, $d.Note) }

if (-not $Apply) {
  Write-Host ''
  Write-Host 'DRY-RUN 结束，未改动任何东西。确认后加 -Apply 执行。' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
Write-Host '--- 开始清理 ---' -ForegroundColor Cyan
$fail = 0
foreach ($d in $doomed) {
  try {
    if ($d.Path -match 'Registry::|^HKEY_|^HKCU:|^HKLM:') {
      # 统一成 HKCU:\ / HKLM:\ 形式：Remove-Item 认不了裸的 HKEY_CURRENT_USER\...
      $psPath = $d.Path -replace '^Microsoft\.PowerShell\.Core\\Registry::', ''
      $psPath = $psPath -replace '^HKEY_CURRENT_USER\\', 'HKCU:\'
      $psPath = $psPath -replace '^HKEY_LOCAL_MACHINE\\', 'HKLM:\'
      Remove-Item -LiteralPath $psPath -Recurse -Force -ErrorAction Stop
    } else {
      Remove-Item -LiteralPath $d.Path -Recurse -Force -ErrorAction Stop
    }
    Write-Host ("  OK   {0}" -f $d.Path) -ForegroundColor Green
  } catch {
    $fail++
    Write-Host ("  FAIL {0} :: {1}" -f $d.Path, $_.Exception.Message) -ForegroundColor Red
  }
}

Write-Host ''
Write-Host ("清理完成，失败 {0} 项。复查：scripts\verify-uninstall.ps1" -f $fail)
if ($fail -gt 0) { exit 1 }
exit 0
