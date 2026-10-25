# =============================================================================
#  海鸥V8·破甲版 · 便携版完全卸载
#
#  便携版没有安装器，删掉文件夹就等于卸载 —— 但直接删文件夹会留下：
#    %APPDATA%\seagull-v8          （运行过就会生成，Chromium 用户数据）
#    %LOCALAPPDATA%\seagull-v8-updater
#    ~/.codex\seagull_desktop_state.json / seagull_settings.json（本工具自己的状态文件）
#    桌面 / 开始菜单快捷方式、AppUserModelId 注册表项
#  这个脚本把这些一并清掉，最后删掉自己所在的目录，做到零残留。
#
#  正常用法是双击同目录下的「卸载-便携版.bat」，不要直接右键运行本文件
#  （本文件就在要删的目录里，必须由 bat 复制到 %TEMP% 后再执行）。
#
#  参数：
#    -AppDir   便携版所在目录（bat 会自动传进来）
#    -KeepData 只删程序目录，保留用户数据与状态文件
# =============================================================================
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [switch]$KeepData,
  [switch]$NoPause
)

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$AppDir = (Resolve-Path -LiteralPath $AppDir).Path.TrimEnd('\')
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  海鸥V8·破甲版 · 便携版完全卸载' -ForegroundColor Cyan
Write-Host ("  目录: {0}" -f $AppDir) -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

$removed = 0
$failed = New-Object System.Collections.Generic.List[string]

function Remove-Target([string]$kind, [string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  try {
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
    Write-Host ("  OK   [{0}] {1}" -f $kind, $path) -ForegroundColor Green
    $script:removed++
  } catch {
    Write-Host ("  FAIL [{0}] {1} :: {2}" -f $kind, $path, $_.Exception.Message) -ForegroundColor Red
    $script:failed.Add($path)
  }
}

# Codex 配置目录的**全部候选位置**。不能只认 ~/.codex：
#   * 用户可能把 CODEX_HOME 指到别的盘（C 盘紧张时的常见做法，Codex 官方支持）
#   * 也可能迁移过数据目录，旧位置还留着本工具的状态文件
# 所以清理时把候选位置都过一遍，每个盘根目录下的 .codex 也算候选。
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

# --- 1. 结束正在运行的程序 ----------------------------------------------------
Write-Host '[1/6] 结束正在运行的程序'
foreach ($exe in '海鸥V8·破甲版.exe', '海鸥V8·破甲版 Pro.exe') {
  $procs = Get-Process | Where-Object { $_.ProcessName + '.exe' -eq $exe }
  if ($procs) {
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host ("  已结束进程: {0}" -f $exe)
  }
}
Start-Sleep -Seconds 2

# --- 2. 注入的提示词 ----------------------------------------------------------
# 必须排在删除程序目录之前：清理脚本本体就在 <AppDir>\resources\scripts\ 下面。
# 便携版没有安装器，「卸载」就是本脚本，所以这一步只能在这里完成 ——
# 少了它，注入到 Codex / Claude / ZCode / DSH / WorkBuddy / Cursor 里的提示词会全部留下。
# 脚本按内容判定，只删提示词；用户的 AGENTS.md / CLAUDE.md / config.toml /
# 自己的备份一律不动（详见脚本头部注释）。失败不阻断后续清理。
Write-Host '[2/6] 清除注入到 AI 工具里的提示词'
$clearScript = Join-Path $AppDir 'resources\scripts\clear-injected-prompts.ps1'
if (Test-Path -LiteralPath $clearScript) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $clearScript -Apply
  Write-Host ("  清理脚本退出码: {0}（0=已完成）" -f $LASTEXITCODE)
} else {
  Write-Host ("  未找到清理脚本，跳过：{0}" -f $clearScript) -ForegroundColor Yellow
}

# --- 2.5 Seep 逆向工作台残留（~/.pi/agent）----------------------------------
# 便携卸载只负责删程序目录，但 Seep 工作台部署会往 ~/.pi/agent 写技能、提示词、
# mcp.json 条目与 settings.json packages。这些不在 clear-injected-prompts 的
# 目标清单里（它只管 codex/zcode/cursor/opencode/claude/workbuddy/dsh），
# 必须单独跑工作台自带的卸载脚本，否则卸载后 Pi Agent 还满身海鸥的东西。
Write-Host '[2.5/6] 清除 Seep 工作台残留（~/.pi/agent）'
$seepUninstall = Join-Path $AppDir 'resources\seep-kit\setup\uninstall.ps1'
if (Test-Path -LiteralPath $seepUninstall) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $seepUninstall -Yes -Purge
  Write-Host ("  Seep 卸载退出码: {0}（0=已完成）" -f $LASTEXITCODE)
} else {
  Write-Host ("  未找到 Seep 卸载脚本，跳过：{0}" -f $seepUninstall) -ForegroundColor Yellow
}

# --- 2.6 临时目录残留 ---------------------------------------------------------
# 提示词 zip 解压临时目录 seagull-prompt-*、REA 下载临时包 seagull-rea-main.zip
# 正常会被主进程 finally 删掉，异常中断时可能留下，这里兜底清一次。
Write-Host '[2.6/6] 清除临时文件'
Remove-Target '临时文件' (Join-Path $env:TEMP 'seagull-rea-main.zip')
Get-ChildItem $env:TEMP -Directory -Filter 'seagull-prompt-*' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Target '临时目录' $_.FullName }

# --- 3. 用户数据与缓存 --------------------------------------------------------
Write-Host '[3/6] 清理用户数据与缓存'
if ($KeepData) {
  Write-Host '  （-KeepData：保留用户数据）' -ForegroundColor Yellow
} else {
  # 只认这几个确切名字，不做「包含海鸥V8·破甲版/破甲」的模糊匹配，避免误删无关目录
  $names = @('seagull-v8', 'seagull-pro', 'seagull-desktop', '海鸥V8·破甲版', '海鸥V8·破甲版 Pro')
  foreach ($root in @($env:APPDATA, $env:LOCALAPPDATA, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    foreach ($n in $names) {
      Remove-Target '数据目录' (Join-Path $root $n)
      Remove-Target '缓存目录' (Join-Path $root ($n + '-updater'))
    }
  }
  # Codex 的数据目录可能在别的盘（CODEX_HOME 或迁移过），候选位置都过一遍
  foreach ($codexHome in Get-CodexHomes) {
    foreach ($f in 'seagull_desktop_state.json', 'seagull_settings.json') {
      Remove-Target '状态文件' (Join-Path $codexHome $f)
    }
  }
  # 用户自定义技能真源（决策点1：~/.seagull/custom-skills），默认卸载一并清掉
  Remove-Target '自定义技能源' (Join-Path $env:USERPROFILE '.seagull')
}

# --- 3. 快捷方式 --------------------------------------------------------------
Write-Host '[4/6] 清理快捷方式'
$lnkRoots = @(
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:PUBLIC 'Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
  (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
)
$shortcutNames = @('海鸥V8·破甲版.lnk', '海鸥V8·破甲版 Pro.lnk', 'seagull-v8.lnk', 'seagull-pro.lnk')
foreach ($r in $lnkRoots) {
  foreach ($n in $shortcutNames) { Remove-Target '快捷方式' (Join-Path $r $n) }
}

# --- 4. 注册表残留（便携版一般没有，装了安装版才会有） -------------------------
Write-Host '[5/6] 清理注册表残留'
foreach ($k in @(
    'HKCU:\Software\Classes\AppUserModelId\com.seagull.v8',
    'HKCU:\Software\Classes\AppUserModelId\com.seagull.v8.pro',
    'HKCU:\Software\Classes\com.seagull.v8',
    'HKCU:\Software\Classes\com.seagull.v8.pro',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\海鸥V8·破甲版.exe',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\海鸥V8·破甲版 Pro.exe')) {
  Remove-Target '注册表键' $k
}
# 指向已经不在的卸载器的僵尸卸载项（旧版卸载 bug 的遗留）
Get-ChildItem 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall' | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  if ($p.DisplayName -notmatch '^(海鸥V8·破甲版|seagull-(free|pro|desktop))(\s.*)?$') { return }
  $target = ''
  if ($p.UninstallString -match '"([^"]+)"') { $target = $Matches[1] }
  if (-not $target -or -not (Test-Path -LiteralPath $target)) {
    Remove-Target '僵尸卸载项' $_.PSPath
  }
}

# --- 5. 程序目录 --------------------------------------------------------------
Write-Host '[6/6] 删除程序目录'
Remove-Target '程序目录' $AppDir

# --- 结果 ---------------------------------------------------------------------
Write-Host ''
$code = 0
if ($failed.Count -eq 0) {
  Write-Host ("完成：已清理 {0} 项，零残留。" -f $removed) -ForegroundColor Green
} else {
  Write-Host ("完成，但有 {0} 项没删掉（多半是被占用）：" -f $failed.Count) -ForegroundColor Yellow
  $failed | ForEach-Object { Write-Host ("  " + $_) }
  Write-Host '关掉占用这些文件的程序后再跑一次即可。'
  $code = 1
}

if (-not $NoPause) {
  Write-Host ''
  Read-Host '按回车关闭窗口' | Out-Null
}

# 自删 %TEMP% 里的副本（由 .bat 复制过来执行）。
# PowerShell 正在执行这个文件时不一定肯放手，所以先直接删一次，删不掉就交给一个
# 分离的 cmd 在退出后删 —— 否则 %TEMP% 里会留下一个脚本副本，那就还是残留。
if ($PSCommandPath -like (Join-Path $env:TEMP '*')) {
  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $PSCommandPath) {
    Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" `
      -ArgumentList '/c', "ping -n 3 127.0.0.1 >nul & del /f /q `"$PSCommandPath`"" `
      -WindowStyle Hidden
  }
}
exit $code
