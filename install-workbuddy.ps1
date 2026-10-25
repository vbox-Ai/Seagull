# install-workbuddy.ps1 — WorkBuddy AI 破甲：全局记忆 + 文件记忆 + skills + 发送层 bundle 一键装/卸
#
# 注入方式自动分流（WorkBuddy 记忆载体上限 10000 字符）：
#   提示词 <=10000 字符 -> 记忆文件注入（云记忆档案 + MEMORY.md + 记忆总闸）
#   提示词 > 10000 字符 -> bundle 注入（改 app.asar.unpacked\cli\dist 的发送 bundle，
#                          每次发送现读人格文件，绕过记忆截断）；无 unpacked 锚点时回退记忆文件
#
# 注入点（全部实测确认，见 app.asar 内 user-memory-collector.ts / path-resolver.ts /
# working-memory-reminder-section.ts / domains-skills skill-overrides.ts）：
#   1) <ConfigDir>\memory\<uid>_memory.md          账号级云记忆档案；memoryBlock 每轮自动包成
#                                                  <memory>…</memory> 注入系统提示词（上限 10000 字符）
#                                                  写入 Version: 999999 触发 stale_version 守卫，防云端回写覆盖
#   2) <ConfigDir>\MEMORY.md                       用户级文件记忆（每轮提醒 AI 主动读，兜底）
#   3) <ConfigDir>\app\app-config.json             generateMemoryEnabled（云记忆总闸）/ localMemoryEnabled
#   4) <ConfigDir>\skills\<name>\SKILL.md          用户级 Skills；开关态在 settings.json 的 skillOverrides
#
# <ConfigDir> 解析：-ConfigDir > cli\product.json 的 dataFolderName > ~\.workbuddy-ai > ~\.workbuddy
# uid 解析：-Uid > <ConfigDir>\memory\*_memory.md 文件名 > 未找到则跳过云记忆（明确打印「未执行」）
#
# 用法：
#   .\install-workbuddy.ps1                                  # 一键：海鸥V8·破甲版V4 + V4 技能库
#   .\install-workbuddy.ps1 -SourcePrompt .\海鸥V8·破甲版v3.md        # 指定提示词
#   .\install-workbuddy.ps1 -SkillsSource codex-skills-v4    # 指定技能库目录
#   .\install-workbuddy.ps1 -NoSkills                        # 只注入记忆，不装 skills
#   .\install-workbuddy.ps1 -KillApp -Restart                # 注入前结束进程、注入后拉起
#   .\install-workbuddy.ps1 -Uninstall                       # 一键还原（记忆 + 开关 + skills）
#   .\install-workbuddy.ps1 -RestoreMemory                   # 只装回原始记忆（停重注入，保留 skills）
#   .\install-workbuddy.ps1 -Status                          # 只读状态

[CmdletBinding()]
param(
    [ValidateSet('v4', 'v3', 'v2')]
    [string]$Version = 'v4',
    [string]$SourcePrompt,
    [string]$SkillsSource,
    [string]$Uid,
    [string]$ConfigDir,
    [string]$InstallRoot,
    [string]$ScriptRoot,
    [switch]$NoSkills,
    [switch]$KillApp,
    [switch]$Restart,
    [switch]$Uninstall,
    # 只把记忆装回安装前的原始版本（云记忆档案 + MEMORY.md），并停掉守护的自动重注入。
    # 技能库和记忆开关都不动 —— 界面上的「装回原始记忆」按钮走这条路径：
    # 用户想用回自己的记忆时，不必为了记忆把整套破甲连技能一起卸掉。
    [switch]$RestoreMemory,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'

# 诊断日志：出错时让对方把 %TEMP%\workbuddy-inject.log 发回来（UTF-8 落盘，不受控制台编码影响）
$LogFile = Join-Path $env:TEMP 'workbuddy-inject.log'
function Write-Log([string]$m) {
    try {
        Add-Content -LiteralPath $LogFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8
    } catch { }
}
trap {
    $errText = ($_ | Out-String)
    Write-Log "FATAL: $errText"
    Write-Host "[致命错误] 详情已写入 $LogFile" -ForegroundColor Red
    Write-Host $errText -ForegroundColor Red
    exit 1
}
Write-Log ("=== 启动 === PSVersion={0} UICulture={1} Script={2} Temp={3}" -f `
    $PSVersionTable.PSVersion, [System.Globalization.CultureInfo]::CurrentUICulture.Name, $PSCommandPath, $env:TEMP)

# 环境门槛：ConvertFrom-Json / [ordered] / Get-FileHash 需要 PowerShell 3+，这里按 5.1 要求
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "[环境不满足] 需要 PowerShell 5.1 及以上（当前 $($PSVersionTable.PSVersion.Major).$($PSVersionTable.PSVersion.Minor)）" -ForegroundColor Red
    Write-Host "             Win7 自带的 2.0 不支持，请先装 WMF 5.1（KB3191566）后重试" -ForegroundColor Red
    Write-Log "FATAL: PowerShell too old: $($PSVersionTable.PSVersion)"
    exit 3
}
$Root = if ($ScriptRoot) { $ScriptRoot } else { $PSScriptRoot }
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }
# 统一 UTF-8 输出：避免按系统代码页（GBK/437…）写 stdout 导致界面日志乱码
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch { }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$MEM_VERSION = 999999      # 高版本号：程序写档案时 incoming < existing 会被判 stale_version 拒绝
$SKILL_MANIFEST = '.seagull-skills.json'

function Write-Utf8([string]$Path, [string]$Text) {
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $tmp = "$Path.tmp"
    [System.IO.File]::WriteAllText($tmp, $Text, $Utf8NoBom)
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}
function Read-Utf8([string]$Path) { return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) }
function Get-Sha([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}
# 取 Memory Block 段正文。结束锚点必须盯 RAW_JSON 注释，**不能**盯「第一个空行+---」：
# 提示词正文自带 markdown 分隔线（实测这份有 17 个），非贪婪正则会在第一个 --- 处截断,
# 后果是校验误报「memoryBlock 不可解析」，卸载/清理也只清掉前半段。
function Get-MemoryBlockBody([string]$Text) {
    if ([string]::IsNullOrEmpty($Text)) { return '' }
    $m = [regex]::Match($Text, '(?s)## Memory Block[ \t]*\r?\n\r?\n(?<b>.*?)\r?\n\r?\n---\r?\n\r?\n<!--\s*RAW_JSON_START')
    if ($m.Success) { return $m.Groups['b'].Value }
    # 兜底：没有 RAW_JSON 标记的旧格式，只能按第一个分隔线截断
    $m2 = [regex]::Match($Text, '(?s)## Memory Block[ \t]*\r?\n\r?\n(?<b>.*?)\r?\n\r?\n---')
    if ($m2.Success) { return $m2.Groups['b'].Value }
    return ''
}
function Set-ArchiveReadOnly([string]$Path, [bool]$ReadOnly) {
    # 只读锁属于加固项：文件被运行中的应用占用 / 权限不足时会失败，
    # 这种情况只告警不中断（守护线程仍会按需补注入）
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
        Set-ItemProperty -LiteralPath $Path -Name IsReadOnly -Value $ReadOnly -ErrorAction Stop
    } catch {
        Write-Host "  [提示] 只读锁设置失败(不影响注入生效): $(Split-Path -Leaf $Path)" -ForegroundColor Yellow
        Write-Log "只读锁失败 $Path"
    }
}
function Set-AppConfigFlags([string]$Path, [hashtable]$Patch) {
    # 不假设原文件结构：对象就合并，数组/字符串/坏 JSON 就留证据后重建，
    # 避免 `Add-Member`（对非对象会静默无效）或属性赋值（PropertyAssignmentException）出问题
    $cfg = $null
    if (Test-Path -LiteralPath $Path) {
        try { $cfg = Read-Utf8 $Path | ConvertFrom-Json } catch { $cfg = $null }
    }
    $merged = [ordered]@{}
    if ($cfg -is [System.Management.Automation.PSCustomObject]) {
        foreach ($prop in $cfg.PSObject.Properties) { $merged[$prop.Name] = $prop.Value }
    } elseif ($null -ne $cfg) {
        if (Test-Path -LiteralPath $Path) { Copy-Item -LiteralPath $Path -Destination "$Path.broken-inject" -Force }
        Write-Host "  [警告] app-config.json 结构异常，已另存 .broken-inject 并重建" -ForegroundColor Yellow
        Write-Log "app-config 结构异常，已重建"
    }
    foreach ($k in $Patch.Keys) { $merged[$k] = $Patch[$k] }
    if (-not $merged.Contains('locale')) { $merged['locale'] = 'zh-CN' }
    Write-Utf8 $Path (([pscustomobject]$merged | ConvertTo-Json -Depth 100) + "`n")
}

function Get-NowIso { return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z') }

function Resolve-InstallRoot([string]$explicit, [string]$productName = '') {
    # 只返回"真实存在"的目录：注册表常残留指向已卸载盘符的 InstallLocation
    # （例如 D:\ 但机器没有 D 盘），直接拿去 Join-Path 会抛 DriveNotFoundException 把安装打断。
    # productName = WorkBuddy（国版）/ WorkBuddyAI（国际版）/ 空（两版都找）
    $exeNames = @()
    if ($productName -eq 'WorkBuddy') { $exeNames = @('WorkBuddy.exe') }
    elseif ($productName -eq 'WorkBuddyAI') { $exeNames = @('WorkBuddyAI.exe') }
    else { $exeNames = @('WorkBuddyAI.exe', 'WorkBuddy.exe') }
    $cands = @()
    if ($explicit) { $cands += $explicit }
    foreach ($en in $exeNames) {
        $pn = [System.IO.Path]::GetFileNameWithoutExtension($en)
        $proc = Get-Process -Name $pn -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($proc -and $proc.Path) { $cands += (Split-Path -Parent $proc.Path) }
    }
    $displayPattern = if ($productName -eq 'WorkBuddy') { '^WorkBuddy(?!\s*AI)(?:\s|$)' }
                      elseif ($productName -eq 'WorkBuddyAI') { '^WorkBuddy\s*AI(?:\s|$)' }
                      else { '' }
    foreach ($rp in @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                      'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                      'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
        $items = Get-ItemProperty $rp -ErrorAction SilentlyContinue
        $item = $null
        if ($displayPattern) {
            $item = $items | Where-Object { $_.DisplayName -and ($_.DisplayName -match $displayPattern) -and $_.InstallLocation } | Select-Object -First 1
        } else {
            $item = $items | Where-Object { $_.DisplayName -like '*WorkBuddy*' -and $_.InstallLocation } | Select-Object -First 1
        }
        if ($item) { $cands += ($item.InstallLocation -replace '^"|"$', '').TrimEnd('\') }
    }
    foreach ($c in $cands) {
        if (-not $c) { continue }
        try {
            if (Test-Path -LiteralPath $c -ErrorAction SilentlyContinue) { return (Resolve-Path -LiteralPath $c).Path }
            Write-Log "跳过无效安装目录(不存在): $c"
        } catch { Write-Log "跳过无效安装目录(异常): $c" }
    }
    return ''
}
function Resolve-ConfigDir([string]$explicit, [string]$root) {
    if ($explicit) { return $explicit }
    if ($root) {
        try {
            $pj = Join-Path $root 'resources\app.asar.unpacked\cli\product.json'
            if (Test-Path -LiteralPath $pj) {
                $name = (Read-Utf8 $pj | ConvertFrom-Json).dataFolderName
                if ($name) { return (Join-Path $env:USERPROFILE $name) }
            }
        } catch { Write-Log "读取 product.json 失败(忽略, 走默认目录)" }
    }
    foreach ($cand in @('.workbuddy-ai', '.workbuddy')) {
        $p = Join-Path $env:USERPROFILE $cand
        if (Test-Path -LiteralPath $p) { return $p }
    }
    return (Join-Path $env:USERPROFILE '.workbuddy')
}
function Find-OtherProfileConfigDirs([string]$primary) {
    # 以管理员身份运行时 $env:USERPROFILE 可能是 Administrator，
    # 而 WorkBuddy 的真实数据在别的 Windows 账户目录下 —— 这里把其它账户的配置目录也找出来
    $found = @()
    $usersRoot = Join-Path $env:SystemDrive 'Users'
    if (-not (Test-Path -LiteralPath $usersRoot)) { return $found }
    foreach ($u in (Get-ChildItem -LiteralPath $usersRoot -Directory -ErrorAction SilentlyContinue)) {
        foreach ($n in @('.workbuddy-ai', '.workbuddy')) {
            $cand = Join-Path $u.FullName $n
            if ((Test-Path -LiteralPath $cand) -and ($cand -ne $primary)) { $found += $cand }
        }
    }
    return $found
}

function Resolve-Uid([string]$explicit, [string]$configDir, [string]$root) {
    if ($explicit) { return $explicit }
    $memDir = Join-Path $configDir 'memory'
    if (Test-Path -LiteralPath $memDir) {
        $f = Get-ChildItem -LiteralPath $memDir -Filter '*_memory.md' -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($f) { return ($f.Name -replace '_memory\.md$', '') }
    }
    if ($root) {
        $st = Join-Path $configDir 'settings.json'
        if (Test-Path -LiteralPath $st) {
            try {
                $s = Read-Utf8 $st | ConvertFrom-Json
                if ($s.claw.legacyOwnerUid) { return $s.claw.legacyOwnerUid }
            } catch { }
        }
    }
    return ''
}

# ---------- 解析 ----------
$promptMap = @{ 'v4' = '海鸥V8·破甲版v4.md'; 'v3' = '海鸥V8·破甲版v3.md'; 'v2' = '海鸥V8·破甲版v1.2.md' }
# 本构建不再随包分发提示词：卸载/还原模式跳过提示词解析（还原逻辑对提示词缺失已有
# 安全降级 —— 内容比对不上就保留用户记忆，见 -Uninstall 分支里的 $unSrc 说明）。
if (-not ($Uninstall -or $RestoreMemory)) {
    if (-not $SourcePrompt) { $SourcePrompt = Join-Path $Root $promptMap[$Version] }
    if (-not (Test-Path -LiteralPath $SourcePrompt)) { throw "提示词文件不存在: $SourcePrompt" }
}
if (-not $SkillsSource) { $SkillsSource = if ($Version -eq 'v4') { 'codex-skills-v4' } else { 'codex-skills' } }
$skillsSourceDir = Join-Path $Root $SkillsSource

# 版本判定（先猜后校准）：数据目录名决定客户端主程序名。
#   国版   ~/.workbuddy    -> WorkBuddy.exe
#   国际版 ~/.workbuddy-ai -> WorkBuddyAI.exe
$productGuess = ''
if ($ConfigDir) {
    $leafGuess = Split-Path -Leaf $ConfigDir
    if ($leafGuess -eq '.workbuddy') { $productGuess = 'WorkBuddy' }
    elseif ($leafGuess -eq '.workbuddy-ai') { $productGuess = 'WorkBuddyAI' }
}
$InstallRoot = Resolve-InstallRoot $InstallRoot $productGuess
# 是否由调用方显式指定了数据目录（国内版固定传 ~/.workbuddy）
$configDirPinned = -not [string]::IsNullOrWhiteSpace($ConfigDir)
$ConfigDir = Resolve-ConfigDir $ConfigDir $InstallRoot
# 数据目录落定后再校准版本名与安装目录，避免国际版目录名被起成别的名字时串到另一版
$ProductName = ''
$leafFinal = Split-Path -Leaf $ConfigDir
if ($leafFinal -eq '.workbuddy') { $ProductName = 'WorkBuddy' }
elseif ($leafFinal -eq '.workbuddy-ai') { $ProductName = 'WorkBuddyAI' }
else { $ProductName = $productGuess }
if ($ProductName -and ($ProductName -ne $productGuess -or -not $InstallRoot)) {
    $InstallRoot = Resolve-InstallRoot '' $ProductName
}
# 跨账户兜底：本账户目录里没有 WorkBuddy 数据（memory 子目录）时，改用它账户下真实存在的那份。
# 但显式指定数据目录时不能兜底：国内版固定 ~/.workbuddy，该目录在首次登录前还没有 memory，
# 一兜底就会切到国际版 ~/.workbuddy-ai（或别的 Windows 账户），整份注入跑到另一个版本上，
# 表现为「只装国内版时注入有时失败」。
if (-not $configDirPinned -and -not (Test-Path -LiteralPath (Join-Path $ConfigDir 'memory'))) {
    $others = @(Find-OtherProfileConfigDirs $ConfigDir |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'memory') })
    if ($others.Count -gt 0) {
        Write-Host "  [跨账户] 本账户($env:USERPROFILE)无 WorkBuddy 数据，改用: $($others[0])" -ForegroundColor Yellow
        Write-Log "跨账户切换: $ConfigDir -> $($others[0])"
        $ConfigDir = $others[0]
    }
}
$Uid = Resolve-Uid $Uid $ConfigDir $InstallRoot
$memDir = Join-Path $ConfigDir 'memory'
# 云记忆档案：指定 uid 时用该 uid 的文件（不存在则新建）；未指定则扫描该目录下所有 <uid>_memory.md
# （换机器/换账号时 uid 不同，靠扫描而不是硬编码，别人的机器同样能用）
$archFiles = @()
if ($Uid) {
    $archFiles = @(Join-Path $memDir "$Uid`_memory.md")
} elseif (Test-Path -LiteralPath $memDir) {
    $archFiles = @(Get-ChildItem -LiteralPath $memDir -Filter '*_memory.md' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike '*.bak*' } |
        Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName })
}
$fileMem = Join-Path $ConfigDir 'MEMORY.md'
$fileMemBak = "$fileMem.bak-inject"
$cfgFile = Join-Path $ConfigDir 'app\app-config.json'
$cfgBak = "$cfgFile.bak-inject"
$skillsDir = Join-Path $ConfigDir 'skills'
$settingsFile = Join-Path $ConfigDir 'settings.json'
$manifestFile = Join-Path $skillsDir $SKILL_MANIFEST
$stateFile = Join-Path $ConfigDir '.seagull-state.json'   # 给 fj_tool 守护线程读的注入状态

Write-Host "== WorkBuddy 破甲 ==" -ForegroundColor Cyan
Write-Host "  安装目录 : $(if ($InstallRoot) { $InstallRoot } else { '未找到（不影响注入）' })"
Write-Host "  配置目录 : $ConfigDir"
$variant = if ((Split-Path -Leaf $ConfigDir) -eq '.workbuddy') { '国版' } elseif ((Split-Path -Leaf $ConfigDir) -eq '.workbuddy-ai') { '国际版' } else { '自定义/品牌版' }
Write-Host "  版本判定 : $variant（数据目录 $(Split-Path -Leaf $ConfigDir)，主程序 $(if ($ProductName) { $ProductName } else { 'WorkBuddyAI' })）" -ForegroundColor Cyan
Write-Host "  用户 uid : $(if ($Uid) { $Uid } elseif ($archFiles.Count -gt 0) { "自动扫描到 $($archFiles.Count) 个记忆档案" } else { '未找到 → 云记忆注入将跳过（脚本会自动重扫）' })"
Write-Host "  提示词   : $SourcePrompt"
Write-Host "  技能库   : $(if ($NoSkills) { '已禁用 (-NoSkills)' } elseif (Test-Path -LiteralPath $skillsSourceDir) { $skillsSourceDir } else { "找不到 $skillsSourceDir → 跳过" })"
if (-not $InstallRoot -and -not (Test-Path -LiteralPath $ConfigDir)) {
    Write-Host "  [警告] 未检测到 WorkBuddy 安装或其数据目录 —— 目标机器可能没装 WorkBuddy，注入将无效" -ForegroundColor Yellow
}

$procName = if ($ProductName) { $ProductName } else { 'WorkBuddyAI' }
$proc = Get-Process -Name $procName -ErrorAction SilentlyContinue
if ($proc) { Write-Host "  [注意] $procName 正在运行（$($proc.Count) 个进程），写入后需重启才生效" -ForegroundColor Yellow }
Write-Log ("解析结果 InstallRoot={0} ConfigDir={1} ProductName={2} Uid={3} 档案数={4}" -f $InstallRoot, $ConfigDir, $ProductName, $Uid, $archFiles.Count)

function Set-SkillOverrides([string]$path, [string[]]$keys, [bool]$remove) {
    if (-not (Test-Path -LiteralPath $path)) { return }
    try { $obj = Read-Utf8 $path | ConvertFrom-Json } catch { return }
    if (-not $obj.skillOverrides) { return }
    $changed = $false
    foreach ($k in $keys) {
        if ($obj.skillOverrides.PSObject.Properties.Name -contains $k) {
            $obj.skillOverrides.PSObject.Properties.Remove($k); $changed = $true
        }
    }
    if ($changed) { Write-Utf8 $path (($obj | ConvertTo-Json -Depth 100) + "`n") }
}
function Get-SkillNames([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir)) { return @() }
    return @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } | ForEach-Object { $_.Name })
}

# 汇总随包分发的各版本技能库里的技能名（识别历史遗留用）。
# 不能只看安装清单：清单只记录最后一次，装新版后旧记录就被覆盖了。
function Get-ShippedSkillNames {
    $names = @()
    foreach ($lib in @('codex-skills', 'codex-skills-v3', 'codex-skills-v4', 'codex-skills-v5')) {
        $dir = Join-Path $PSScriptRoot $lib
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        $names += @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } |
            Select-Object -ExpandProperty Name)
    }
    return @($names | Select-Object -Unique)
}

# 清理旧版本遗留技能。候选 = 上次安装清单 ∪ 随包各版本技能库；
# 只删同时满足：属于候选、当前版本已没有、目录下确实有 SKILL.md。
# 用户自己放进 skills 目录、海鸥V8·破甲版从未分发过的，一条都不沾。
function Prune-StaleSkills([string]$Target, [string[]]$Previous, [string[]]$Current) {
    $removed = @()
    $candidates = @()
    if ($Previous) { $candidates += $Previous }
    $candidates += Get-ShippedSkillNames
    $candidates = @($candidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    foreach ($n in $candidates) {
        if ($Current -contains $n) { continue }
        $dest = Join-Path $Target $n
        if (-not (Test-Path -LiteralPath $dest)) { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $dest 'SKILL.md'))) { continue }
        Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
        $removed += $n
    }
    return $removed
}

# ---------- 状态 ----------
if ($Status) {
    $srcHash = if ($SourcePrompt) { Get-Sha $SourcePrompt } else { '' }
    Write-Host "`n[状态]" -ForegroundColor Cyan
    $live = @($archFiles | Where-Object { Test-Path -LiteralPath $_ })
    if ($live.Count -eq 0) { Write-Host "  云记忆档案          : 未找到（该账号还没生成过记忆档案，或 WorkBuddy 未登录过）" }
    foreach ($af in $live) {
        $archText = Read-Utf8 $af
        $ver = [regex]::Match($archText, '(?m)^>\s*Version:\s*(\d+)').Groups[1].Value
        $mb = Get-MemoryBlockBody $archText
        Write-Host "  云记忆档案          : $af"
        Write-Host "  档案 Version        : $(if ($ver) { $ver } else { '-' })"
        Write-Host "  memoryBlock 字符数  : $($mb.Trim().Length)  (上限 10000)"
        Write-Host "  memoryBlock 首行    : $(($mb.Trim() -split "`n")[0])"
        Write-Host "  档案只读锁          : $((Get-Item -LiteralPath $af).IsReadOnly)   (True = 已挡住程序回写)"
    }
    Write-Host "  注入状态文件        : $(if (Test-Path -LiteralPath $stateFile) { '存在（守护会重注入）' } else { '不存在（守护不工作）' })"
    $stStatus = $null
    if (Test-Path -LiteralPath $stateFile) { try { $stStatus = Read-Utf8 $stateFile | ConvertFrom-Json } catch { } }
    if ($stStatus) {
        Write-Host "  注入方式            : $(if ($stStatus.method) { $stStatus.method } else { 'memory（旧状态）' })"
        $bundleFiles = @()
        if ($stStatus.bundles) { $bundleFiles = @($stStatus.bundles) }
        foreach ($bf in $bundleFiles) {
            $bInjected = 0
            if (Test-Path -LiteralPath $bf) { $bInjected = ([regex]::Matches(([System.IO.File]::ReadAllText($bf)), [regex]::Escape('let __p=__fs.readFileSync('))).Count }
            Write-Host "  bundle $([System.IO.Path]::GetFileName($bf)) : 注入点=$bInjected 备份=$(Test-Path -LiteralPath "$bf.bak")"
        }
    }
    $cfg = if (Test-Path -LiteralPath $cfgFile) { Read-Utf8 $cfgFile | ConvertFrom-Json } else { $null }
    Write-Host "  generateMemoryEnabled: $(if ($cfg) { $cfg.generateMemoryEnabled } else { '-' })   (必须是 True 否则整条链路 skip)"
    Write-Host "  localMemoryEnabled  : $(if ($cfg) { $cfg.localMemoryEnabled } else { '-' })"
    Write-Host "  disableLocalSkillsMemory: $(if ($cfg) { $cfg.disableLocalSkillsMemory } else { '-' })   (必须是 False 否则 MEMORY.md 不注入)"
    Write-Host "  MEMORY.md           : $(if (Test-Path -LiteralPath $fileMem) { "$((Get-Item $fileMem).Length) bytes / 与提示词一致=$((Get-Sha $fileMem) -eq $srcHash)" } else { '不存在' })"
    $names = Get-SkillNames $skillsDir
    Write-Host "  skills 已装         : $($names.Count) 个  ($($names -join ', '))"
    $archBakCount = @($archFiles | Where-Object { Test-Path -LiteralPath "$_.bak-inject" }).Count
    Write-Host "  备份                : 档案=$archBakCount 个 开关=$(Test-Path -LiteralPath $cfgBak) 记忆=$(Test-Path -LiteralPath $fileMemBak)"
    return
}

# ---------- 卸载 / 装回原始记忆 ----------
# 两条路径共用同一套还原逻辑：-Uninstall 全还原（含技能与记忆开关）；
# -RestoreMemory 只还原记忆内容并停掉重注入，技能库与记忆开关原样保留。
if ($Uninstall -or $RestoreMemory) {
    $done = @()
    $anyRestore = $false
    # 目标档案 = 本次扫描到的 + 状态文件里记录过的（换账号/换机器后仍能清干净）
    $targets = New-Object System.Collections.Generic.List[string]
    foreach ($a in $archFiles) { if ($a) { $targets.Add($a) } }
    $st = $null
    $bundleList = @()
    if (Test-Path -LiteralPath $stateFile) {
        try {
            $st = Read-Utf8 $stateFile | ConvertFrom-Json
            foreach ($a in @($st.archives)) { if ($a -and -not $targets.Contains($a)) { $targets.Add($a) } }
            if ($st.archive -and -not $targets.Contains($st.archive)) { $targets.Add($st.archive) }
            if ($st.bundles) { $bundleList = @($st.bundles) }
        } catch { }
    }
    # 卸载全程只读一次提示词原文：判「档案 / MEMORY.md 里是不是本工具的提示词」要用它。
    # 读不到就留空串 —— 那时任何非空段都会被判成「不是提示词」而保留，方向是安全的。
    $unSrc = ''
    try { $unSrc = (Read-Utf8 $SourcePrompt).Trim() } catch { }

    foreach ($af in $targets) {
        Set-ArchiveReadOnly $af $false
        $bak = "$af.bak-inject"
        if (Test-Path -LiteralPath $bak) {
            Move-Item -LiteralPath $bak -Destination $af -Force
            $anyRestore = $true
            $done += "档案已从备份还原: $(Split-Path -Leaf $af)"
        } elseif (Test-Path -LiteralPath $af) {
            # 同 MEMORY.md：无备份时不能默认「档案是本工具建的」。安装时档案可能还不存在，
            # 而现在的段内容已经不是提示词（记忆本来就存在 RAW_JSON 里，或 WorkBuddy 后续
            # 写入了新记忆）—— 这时清空等于删用户的记忆，必须原样保留。
    $curBlock = (Get-MemoryBlockBody (Read-Utf8 $af)).Trim()
            if ($curBlock -ne $unSrc) {
                $done += "档案已保留（无备份且内容不是提示词，是用户记忆）: $(Split-Path -Leaf $af)"
            } else {
                $uidNow = (Split-Path -Leaf $af) -replace '_memory\.md$', ''
                $now = Get-NowIso
                $empty = "# User Memory Profile`n> Last updated: $now`n> Version: $MEM_VERSION`n`n## Memory Block`n`n`n`n---`n`n<!-- RAW_JSON_START`n{`n  `"uid`": `"$uidNow`",`n  `"memoryBlock`": `"`",`n  `"updatedAt`": `"$now`",`n  `"version`": $MEM_VERSION`n}`nRAW_JSON_END -->`n"
                Write-Utf8 $af $empty
                $done += "档案 memoryBlock 已清空: $(Split-Path -Leaf $af)"
            }
        }
    }
    if ($targets.Count -eq 0) { $done += '云记忆档案未执行（该账号还没有档案文件）' }

    # bundle 注入还原：按状态文件登记的 bundle 路径，用 .bak 还原；无备份则提示（可能升级后被替换）。
    if ($bundleList.Count -gt 0) {
        foreach ($bp in $bundleList) {
            if (-not $bp) { continue }
            $bak = "$bp.bak"
            if (Test-Path -LiteralPath $bak) {
                Copy-Item -LiteralPath $bak -Destination $bp -Force
                $anyRestore = $true
                $done += "bundle 已从备份还原: $(Split-Path -Leaf $bp)"
            } else {
                $done += "bundle 无备份，跳过（可能升级后被替换）: $(Split-Path -Leaf $bp)"
            }
        }
    }
    # 本工具写入的人格文件（发送层注入用它），名字固定，删掉即可
    $personaDefault = Join-Path $ConfigDir '.seagull-persona.md'
    if (Test-Path -LiteralPath $personaDefault) {
        Remove-Item -LiteralPath $personaDefault -Force -ErrorAction SilentlyContinue
        $done += 'bundle 人格文件已删除'
    }

    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force; $done += '注入状态文件已删除（守护停止重注入）' }

    if (Test-Path -LiteralPath $fileMemBak) {
        Move-Item -LiteralPath $fileMemBak -Destination $fileMem -Force
        $anyRestore = $true
        $done += 'MEMORY.md 已从备份还原'
    } elseif (Test-Path -LiteralPath $fileMem) {
        # 「没有安装前备份」不等于「这文件是本工具建的」：安装时它可能还不存在，是
        # WorkBuddy 之后按会话重新写出来的用户记忆。只有内容确实等于随包提示词才删，
        # 否则一律保留 —— 删掉就再也找不回来，用户看到的现象是「卸载把记忆一起卸了」。
        if ($SourcePrompt -and (Get-Sha $fileMem) -eq (Get-Sha $SourcePrompt)) {
            Remove-Item -LiteralPath $fileMem -Force
            $done += 'MEMORY.md 已删除（内容是提示词，无备份）'
        } else {
            $done += 'MEMORY.md 已保留（无备份且内容不是提示词 —— 是用户自己的记忆）'
        }
    }

    # 记忆开关只在真卸载时还原。装回原始记忆的意图是「用回我自己的记忆」——
    # 把总闸关掉正好适得其反：记忆换回来了，却不再被读进对话。
    if ($RestoreMemory) {
        $done += 'app-config.json 未改动（记忆开关保持开启，装回的原始记忆才会被读进去）'
    } elseif (Test-Path -LiteralPath $cfgBak) {
        Move-Item -LiteralPath $cfgBak -Destination $cfgFile -Force
        $done += 'app-config.json 已从备份还原'
    } elseif (Test-Path -LiteralPath $cfgFile) {
        Set-AppConfigFlags $cfgFile @{ generateMemoryEnabled = $false; localMemoryEnabled = $false }
        $done += 'app-config.json 无备份：两个记忆开关已置 false'
    }

    if (Test-Path -LiteralPath $manifestFile) {
        $manifest = Read-Utf8 $manifestFile | ConvertFrom-Json
        $names = @($manifest.skills.PSObject.Properties.Name)
        if ($RestoreMemory) {
            $done += "skills 目录保留（$($names.Count) 个，只装回记忆）"
        } else {
            $removed = 0; $kept = 0
            foreach ($p in $manifest.skills.PSObject.Properties) {
                $name = $p.Name; $sha = $p.Value.sha256
                $dir = Join-Path $skillsDir $name
                $skillMd = Join-Path $dir 'SKILL.md'
                if ((Test-Path -LiteralPath $skillMd) -and (Get-Sha $skillMd) -eq $sha) {
                    Remove-Item -LiteralPath $dir -Recurse -Force; $removed++
                } elseif (Test-Path -LiteralPath $dir) { $kept++ }
            }
            Remove-Item -LiteralPath $manifestFile -Force
            $done += "skills 已卸载 $removed 个（用户自行改过的保留 $kept 个）"
            # 还原安装前被挪走的用户同名技能（安装时挪成了 <名>.bak-<时间戳>）
            if ($manifest.backups) {
                foreach ($p in $manifest.backups.PSObject.Properties) {
                    $bak = [string]$p.Value
                    if (-not (Test-Path -LiteralPath $bak)) { continue }
                    $dest = Join-Path $skillsDir $p.Name
                    if (Test-Path -LiteralPath $dest) {
                        Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
                    }
                    Move-Item -LiteralPath $bak -Destination $dest -Force
                    $done += "已还原用户原有技能: $($p.Name)"
                }
            }
        }
        # 两种模式都要还原技能开关：装回原始记忆时海鸥V8·破甲版技能同样该回到默认状态，
        # 否则用户点完「装回」会发现自己的技能在 WorkBuddy 里依然是关着的。
        Set-SkillOverrides $settingsFile $names $true
    } else { $done += 'skills 未执行（无安装清单）' }

    if ($RestoreMemory -and -not $anyRestore) {
        $done += '未找到安装前的记忆备份：当前记忆未被改动（本来就没注入过，或备份已被清理）'
    }
    Write-Host ("`n[{0}]" -f $(if ($RestoreMemory) { '装回原始记忆' } else { '还原结果' })) -ForegroundColor Green
    $done | ForEach-Object { Write-Host "  - $_" }
    if (Test-Path -LiteralPath $cfgFile) {
        $c = Read-Utf8 $cfgFile | ConvertFrom-Json
        Write-Host "  现值: generateMemoryEnabled=$($c.generateMemoryEnabled) localMemoryEnabled=$($c.localMemoryEnabled)"
    }
    return
}

# ---------- bundle 注入（发送层拦截，长提示词专用） ----------
# 长提示词会超出 WorkBuddy 记忆载体 10000 字符上限被截断，因此 >10000 时改打
# app.asar.unpacked 的发送 bundle：在 chat/completions 与 responses 请求体上把
# system 内容整段替换成人格文件。人格文件由本脚本写入 ConfigDir\.seagull-persona.md，
# 注入代码每次发送时 readFileSync 现读，天然绕过记忆截断。
$script:WBInjectionMarker = 'let __p=__fs.readFileSync('
$script:WBPersonaPathRegex = [regex]'let __p=__fs\.readFileSync\("(?<path>[^"\r\n]*)"'
# 锚点里请求体参数名是压缩后的变量名，必须用命名分组捕获后回填，不能硬编码
$script:WBChatAnchorRegex = [regex]'create\((?<a>[A-Za-z_$][A-Za-z0-9_$]*),(?<b>[A-Za-z_$][A-Za-z0-9_$]*)\)\{return this\._client\.post\("/chat/completions",\{body:\k<a>,\.\.\.\k<b>,stream:\k<a>\.stream\?\?!1\}\)'
$script:WBResponsesAnchorRegex = [regex]'create\((?<a>[A-Za-z_$][A-Za-z0-9_$]*),(?<b>[A-Za-z_$][A-Za-z0-9_$]*)\)\{return this\._client\.post\("/responses",\{body:\k<a>,\.\.\.\k<b>,stream:\k<a>\.stream\?\?!1\}\)'
# 同步取 fs：CJS / ESM / 任意作用域通吃
$script:WBFsBootstrap = 'let __fs=null;try{if(typeof process!=="undefined"&&typeof process.getBuiltinModule==="function")__fs=process.getBuiltinModule("fs")}catch(x){}if(!__fs){try{__fs=require("fs")}catch(x){}}if(!__fs&&typeof process!=="undefined"&&process.mainModule){try{__fs=process.mainModule.require("fs")}catch(x){}}'
# @A@ = 请求体参数名，@P@ = 人格文件路径（正斜杠，已转义）
$script:WBChatInjectTemplate = 'try{' + $script:WBFsBootstrap + 'if(__fs&&@A@&&Array.isArray(@A@.messages)&&@A@.messages.length>0){let __p=__fs.readFileSync("@P@","utf8");if(__p&&__p.trim()){let __done=false;for(let __m of @A@.messages){if(__m&&__m.role==="system"){__m.content=__p.trim();__done=true;break}}if(!__done)@A@.messages.unshift({role:"system",content:__p.trim()})}}}catch(__e){}'
$script:WBResponsesInjectTemplate = 'try{' + $script:WBFsBootstrap + 'if(__fs&&@A@&&typeof @A@==="object"){try{let __p=__fs.readFileSync("@P@","utf8");if(__p&&__p.trim()){if(typeof @A@.instructions==="string"){@A@.instructions=__p.trim()}else if(Array.isArray(@A@.input)){let __done=false;for(let __m of @A@.input){if(__m&&__m.role==="system"){__m.content=[{type:"input_text",text:__p.trim()}];__done=true;break}}if(!__done)@A@.input.unshift({role:"system",content:[{type:"input_text",text:__p.trim()}]})}}}catch(x2){}}}catch(__e){}'

function ConvertTo-WBJsStringBody {
    param([Parameter(Mandatory)][string]$Path)
    $value = $Path.Replace('\', '/')
    $value = $value.Replace('"', '\"')
    $value = $value.Replace("`r", '').Replace("`n", '')
    return $value
}
function New-WBChatInjection {
    param([Parameter(Mandatory)][string]$BodyVar, [Parameter(Mandatory)][string]$PromptJs)
    return $script:WBChatInjectTemplate.Replace('@A@', $BodyVar).Replace('@P@', $PromptJs)
}
function New-WBResponsesInjection {
    param([Parameter(Mandatory)][string]$BodyVar, [Parameter(Mandatory)][string]$PromptJs)
    return $script:WBResponsesInjectTemplate.Replace('@A@', $BodyVar).Replace('@P@', $PromptJs)
}
function Get-WBCliDistDir {
    param([Parameter(Mandatory)][string]$WBRoot)
    return (Join-Path $WBRoot 'resources\app.asar.unpacked\cli\dist')
}

# 纯 PowerShell 解析 Electron app.asar 头（不依赖 node / npx，彻底避开本会话被 WorkBuddy
# 注入的 NODE_OPTIONS / ELECTRON_RUN_AS_NODE 环境污染）。asar 头格式（@electron/asar）：
#   偏移 0  ：8 字节 size pickle —— 其中偏移 4 的 UInt32LE = 头 buffer 长度
#   偏移 8  ：头 buffer —— 其中偏移 0 的 UInt32LE = JSON 字符串长度，随后是 JSON 正文
function Read-AsarHeader([Parameter(Mandatory)][string]$AsarPath) {
    if (-not (Test-Path -LiteralPath $AsarPath)) { return $null }
    $fs = [System.IO.File]::OpenRead($AsarPath)
    try {
        $sizeBuf = New-Object byte[] 8
        if ($fs.Read($sizeBuf, 0, 8) -ne 8) { return $null }
        $headerBufLen = [BitConverter]::ToUInt32($sizeBuf, 4)
        if ($headerBufLen -le 0 -or $headerBufLen -gt 256MB) { return $null }
        $headerBuf = New-Object byte[] $headerBufLen
        if ($fs.Read($headerBuf, 0, $headerBufLen) -ne $headerBufLen) { return $null }
        # 头 buffer 本身也是一个 Pickle：偏移 4 才是 JSON 字符串字节长，正文从偏移 8 开始
        $jsonLen = [BitConverter]::ToUInt32($headerBuf, 4)
        if ($jsonLen -le 0 -or $jsonLen -gt $headerBufLen) { return $null }
        $json = [System.Text.Encoding]::UTF8.GetString($headerBuf, 8, [int]$jsonLen)
        return ($json | ConvertFrom-Json)
    } catch {
        Write-Log "Read-AsarHeader 失败: $AsarPath"
        return $null
    } finally { $fs.Close() }
}

# 诊断国际版 app.asar 里 cli/dist 的真实形态：
#   - 头部把 cli/dist 标成 unpacked=true 且侧车(app.asar.unpacked\cli\dist)缺失
#       => 安装不完整，既不能 unpacked 扫描补丁、也无法回填（数据不在 asar 内）
#   - 头部把 cli/dist 打包进 asar（有 offset）
#       => 当前 unpacked 扫描看不到，需 repack（暂未实现，给出明确提示）
function Get-WBAsarCliState([Parameter(Mandatory)][string]$WBRoot) {
    $asar = Join-Path $WBRoot 'resources\app.asar'
    if (-not (Test-Path -LiteralPath $asar)) { return $null }
    $header = Read-AsarHeader $asar
    if (-not $header -or -not $header.files -or -not $header.files.cli -or -not $header.files.cli.files.dist) {
        return [pscustomobject]@{ HasCli = $false }
    }
    $dist = $header.files.cli.files.dist
    $anyUnpacked = $false
    $anyPacked = $false
    $distFiles = @()
    foreach ($p in $dist.files.PSObject.Properties) { $distFiles += $p.Value }
    foreach ($f in $distFiles) {
        if ($f.PSObject.Properties['unpacked'] -and $f.unpacked -eq $true) { $anyUnpacked = $true }
        if ($f.PSObject.Properties['offset']) { $anyPacked = $true }
    }
    # 递归看 lazy 子目录（lazy-headless / lazy-lite-wb 等）
    $sub = @($dist.files.PSObject.Properties | Where-Object { $_.Value.files })
    foreach ($d in $sub) {
        foreach ($p in $d.Value.files.PSObject.Properties) {
            $f = $p.Value
            if ($f.PSObject.Properties['unpacked'] -and $f.unpacked -eq $true) { $anyUnpacked = $true }
            if ($f.PSObject.Properties['offset']) { $anyPacked = $true }
        }
    }
    $sidecarDir = Join-Path $WBRoot 'resources\app.asar.unpacked\cli\dist'
    return [pscustomobject]@{
        HasCli        = $true
        AnyUnpacked   = $anyUnpacked
        AnyPacked     = $anyPacked
        SidecarExists = (Test-Path -LiteralPath $sidecarDir)
        SidecarDir    = $sidecarDir
    }
}
function Get-WBScanFiles {
    param([Parameter(Mandatory)][string]$WBRoot)
    $dist = Get-WBCliDistDir -WBRoot $WBRoot
    if (-not (Test-Path -LiteralPath $dist)) { return @() }
    $files = @()
    $files += Get-ChildItem -LiteralPath $dist -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @('.js', '.mjs') -and $_.Name -notlike '*.bak' -and $_.Name -like 'codebuddy*' }
    foreach ($chunkDir in @(Get-ChildItem -LiteralPath $dist -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like 'lazy-*' })) {
        $files += Get-ChildItem -LiteralPath $chunkDir.FullName -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in @('.js', '.mjs') -and $_.Name -notlike '*.bak' }
    }
    return @($files | Sort-Object FullName -Unique)
}
function Get-WBBundles {
    param([Parameter(Mandatory)][string]$WBRoot)
    $dist = Get-WBCliDistDir -WBRoot $WBRoot
    $markerEscaped = [regex]::Escape($script:WBInjectionMarker)
    $bundles = @()
    foreach ($file in Get-WBScanFiles -WBRoot $WBRoot) {
        $content = [System.IO.File]::ReadAllText($file.FullName)
        $injected = ([regex]::Matches($content, $markerEscaped)).Count
        $anchors = $script:WBChatAnchorRegex.Matches($content).Count + $script:WBResponsesAnchorRegex.Matches($content).Count
        if ($injected -eq 0 -and $anchors -eq 0) { continue }
        $relName = $file.FullName
        if ($relName.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relName = $relName.Substring($dist.Length).TrimStart('\', '/')
        }
        $bundles += [pscustomobject]@{
            Name     = $file.Name
            RelName  = $relName
            Path     = $file.FullName
            Backup   = $file.FullName + '.bak'
            Injected = $injected
            Anchors  = $anchors
        }
    }
    return @($bundles)
}
function Get-WBBundlePatchedContent {
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory)][string]$PromptJs,
        [switch]$InjectAnchors
    )
    $chatRx = $script:WBChatAnchorRegex
    $responsesRx = $script:WBResponsesAnchorRegex
    $markerEscaped = [regex]::Escape($script:WBInjectionMarker)
    $chatMatches = $chatRx.Matches($Content)
    $responsesMatches = $responsesRx.Matches($Content)
    $injectedBefore = ([regex]::Matches($Content, $markerEscaped)).Count
    # 已部署过则只迁移人格文件路径（换人格后重跑走这里）
    $newContent = [regex]::Replace($Content, $script:WBPersonaPathRegex, ('let __p=__fs.readFileSync("' + $PromptJs + '"'))
    if ($InjectAnchors) {
        $newContent = $chatRx.Replace($newContent, [System.Text.RegularExpressions.MatchEvaluator] {
                param($match)
                $bodyVar = $match.Groups['a'].Value
                $optVar = $match.Groups['b'].Value
                $injection = New-WBChatInjection -BodyVar $bodyVar -PromptJs $PromptJs
                return 'create(' + $bodyVar + ',' + $optVar + '){' + $injection +
                    'return this._client.post("/chat/completions",{body:' + $bodyVar + ',...' + $optVar + ',stream:' + $bodyVar + '.stream??!1})'
            })
        $newContent = $responsesRx.Replace($newContent, [System.Text.RegularExpressions.MatchEvaluator] {
                param($match)
                $bodyVar = $match.Groups['a'].Value
                $optVar = $match.Groups['b'].Value
                $injection = New-WBResponsesInjection -BodyVar $bodyVar -PromptJs $PromptJs
                return 'create(' + $bodyVar + ',' + $optVar + '){' + $injection +
                    'return this._client.post("/responses",{body:' + $bodyVar + ',...' + $optVar + ',stream:' + $bodyVar + '.stream??!1})'
            })
    }
    $injectedAfter = ([regex]::Matches($newContent, $markerEscaped)).Count
    return [pscustomobject]@{
        Content       = $newContent
        ChatAnchors   = $chatMatches.Count
        RespAnchors   = $responsesMatches.Count
        Injected      = $injectedBefore
        Expected      = $injectedBefore + $chatMatches.Count + $responsesMatches.Count
        InjectedAfter = $injectedAfter
        Changed       = ($newContent -cne $Content)
    }
}

function Invoke-WBMemoryInjection {
    # 记忆文件注入（短提示词专用；bundle 不可用时的回退）。修改 $script:steps / $script:archFailed。
    if ($archFiles.Count -gt 0) {
        if (-not (Test-Path -LiteralPath $memDir)) { New-Item -ItemType Directory -Path $memDir -Force | Out-Null }
        foreach ($af in $archFiles) {
            $afBak = "$af.bak-inject"
            if ((Test-Path -LiteralPath $af) -and -not (Test-Path -LiteralPath $afBak)) {
                try {
                    $oldBlock = (Get-MemoryBlockBody (Read-Utf8 $af)).Trim()
                    if ($oldBlock -ne $srcText.Trim()) { Copy-Item -LiteralPath $af -Destination $afBak -Force }
                } catch { Write-Log "读取/备份档案失败(继续): $af" }
            }
            Set-ArchiveReadOnly $af $false
            $uidOfFile = if (Test-Path -LiteralPath $af) { ((Read-Utf8 $af) | Select-String -Pattern '"uid"\s*:\s*"([^"]+)"' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1) } else { $null }
            if (-not $uidOfFile) { $uidOfFile = (Split-Path -Leaf $af) -replace '_memory\.md$', '' }
            $raw = [ordered]@{ uid = $uidOfFile; memoryBlock = $srcText; updatedAt = $now; version = $MEM_VERSION }
            $md = "# User Memory Profile`n> Last updated: $now`n> Version: $MEM_VERSION`n`n## Memory Block`n`n$srcText`n`n---`n`n<!-- RAW_JSON_START`n" +
                  ($raw | ConvertTo-Json -Depth 6) + "`nRAW_JSON_END -->`n"
            $written = $false
            for ($try = 1; $try -le 3; $try++) {
                try { Write-Utf8 $af $md; $written = $true; break }
                catch { Write-Log "档案写入失败(第 $try 次): $af"; Start-Sleep -Milliseconds 800 }
            }
            if (-not $written) {
                $script:archFailed += $af
                Write-Host "  [失败] 档案被占用，写入失败: $(Split-Path -Leaf $af)" -ForegroundColor Red
                continue
            }
            Set-ArchiveReadOnly $af $true
        }
        $script:steps++
        Write-Host "[$($script:steps)] 云记忆档案已注入 memoryBlock：$($archFiles.Count) 个（$($srcText.Trim().Length) 字符，Version $MEM_VERSION，已设只读）" -ForegroundColor Green
        foreach ($af in $archFiles) { Write-Host "      - $af" -ForegroundColor DarkGray }
    } else {
        Write-Host "  [提示] 云记忆档案未执行：该账号还没有记忆档案文件（WorkBuddy 未登录或从未产生记忆）" -ForegroundColor Yellow
    }

    if ((Test-Path -LiteralPath $fileMem) -and -not (Test-Path -LiteralPath $fileMemBak) -and (Get-Sha $fileMem) -ne $srcHash) {
        Copy-Item -LiteralPath $fileMem -Destination $fileMemBak -Force
    }
    try { Write-Utf8 $fileMem $srcText }
    catch { Write-Host "  [提示] MEMORY.md 写入失败（可能被占用），已跳过" -ForegroundColor Yellow; Write-Log "MEMORY.md 写入失败" }
    $script:steps++
    Write-Host "[$($script:steps)] MEMORY.md 已写入 $((Get-Item $fileMem).Length) bytes" -ForegroundColor Green

    if (-not (Test-Path -LiteralPath (Split-Path -Parent $cfgFile))) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $cfgFile) -Force | Out-Null
    }
    if ((Test-Path -LiteralPath $cfgFile) -and -not (Test-Path -LiteralPath $cfgBak)) {
        Copy-Item -LiteralPath $cfgFile -Destination $cfgBak -Force
    }
    Set-AppConfigFlags $cfgFile @{ generateMemoryEnabled = $true; localMemoryEnabled = $true; disableLocalSkillsMemory = $false }
    $script:steps++
    Write-Host "[$($script:steps)] generateMemoryEnabled = true（备份: $cfgBak）" -ForegroundColor Green
}

function Invoke-WBBundleInjection {
    # 发送层 bundle 注入（长提示词专用）。返回 $true 表示成功/已最新；$false 表示不可用需回退。
    $WBRoot = $InstallRoot
    if (-not $WBRoot) {
        Write-Host "  [提示] 未找到 WorkBuddy 安装目录，bundle 注入不可用，回退记忆文件注入。" -ForegroundColor Yellow
        Write-Log "bundle 不可用: 未找到安装目录 (ProductName=$ProductName)"
        return $false
    }
    $bundles = @(Get-WBBundles -WBRoot $WBRoot)
    if ($bundles.Count -eq 0) {
        # 用 asar 头诊断真实原因，给出能落地的修复方向，而不是笼统一句「打包在 asar 内」。
        # 实测国际版 WorkBuddyAI：头部把 cli/dist 标成 unpacked=true，但侧车目录缺失
        # （app.asar.unpacked 里只有 native 和 node_modules，没有 cli），且 asar 内也没有
        # 打包数据（无 offset）—— 这是「安装不完整」，repack 无米下锅，必须修复安装。
        $diag = Get-WBAsarCliState -WBRoot $WBRoot
        if ($diag -and $diag.HasCli -and $diag.AnyUnpacked -and -not $diag.AnyPacked -and -not $diag.SidecarExists) {
            Write-Host "  [诊断] 该版本头部把 cli/dist 标为 unpacked，但侧车目录缺失：" -ForegroundColor Yellow
            Write-Host "         $($diag.SidecarDir)" -ForegroundColor Yellow
            Write-Host "         这是安装不完整（缺 app.asar.unpacked\cli 侧车），asar 内也没有打包数据可回填。" -ForegroundColor Yellow
            Write-Host "         请修复/重装 WorkBuddy 国际版后再注入；本次回退到记忆文件注入。" -ForegroundColor Yellow
            Write-Log "bundle 不可用: 国际版侧车缺失(安装不完整) $WBRoot"
        } elseif ($diag -and $diag.HasCli -and $diag.AnyPacked) {
            Write-Host "  [诊断] cli/dist 确实打包在 app.asar 内（头部有 offset），当前 unpacked 扫描无法覆盖。" -ForegroundColor Yellow
            Write-Host "         需要 asar repack 注入（暂未实现）；本次回退到记忆文件注入，>10000 字符会被截断。" -ForegroundColor Yellow
            Write-Log "bundle 不可用: cli/dist 打包在 app.asar 内(需 repack) $WBRoot"
        } else {
            Write-Host "  [提示] 无 unpacked 锚点可补（无法确定 cli/dist 形态），回退到记忆文件注入。" -ForegroundColor Yellow
            Write-Host "         若提示词 >10000 字符会被截断到前 10000 字符。" -ForegroundColor Yellow
            Write-Log "bundle 不可用: 无 unpacked 锚点 $WBRoot"
        }
        return $false
    }

    $pf = Join-Path $ConfigDir '.seagull-persona.md'
    if (-not (Test-Path -LiteralPath $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null }
    Write-Utf8 $pf $srcText
    $script:personaFile = $pf
    $script:steps++
    Write-Host "[$($script:steps)] 人格文件已写入 $pf（$($srcText.Length) 字符）" -ForegroundColor Green

    $promptJs = ConvertTo-WBJsStringBody $pf
    $written = @()
    foreach ($b in $bundles) {
        $content = [System.IO.File]::ReadAllText($b.Path)
        $patch = Get-WBBundlePatchedContent -Content $content -PromptJs $promptJs -InjectAnchors
        if ($patch.Expected -eq 0) { Write-Host "  [错误] 无锚点: $($b.RelName)" -ForegroundColor Red; Write-Log "bundle 无锚点: $($b.RelName)"; return $false }
        if ($patch.InjectedAfter -ne $patch.Expected) { Write-Host "  [错误] 注入点不匹配: $($b.RelName)" -ForegroundColor Red; Write-Log "bundle 注入点不匹配: $($b.RelName)"; return $false }
        if (-not $patch.Changed) {
            Write-Host "  [跳过] 已是最新: $($b.RelName)" -ForegroundColor Gray
            $written += $b.Path
            continue
        }
        if (-not (Test-Path -LiteralPath $b.Backup)) { Copy-Item -LiteralPath $b.Path -Destination $b.Backup -Force }
        [System.IO.File]::WriteAllText($b.Path, $patch.Content, [System.Text.UTF8Encoding]::new($false))
        $written += $b.Path
        Write-Host "  [完成] $($b.RelName)（chat=$($patch.ChatAnchors) responses=$($patch.RespAnchors)）" -ForegroundColor Green
    }
    $script:writtenBundles = @($written)
    $script:steps++
    Write-Host "[$($script:steps)] bundle 注入完成：$($written.Count) 个程序包" -ForegroundColor Green
    return $true
}

# ---------- 安装 ----------
if ($KillApp -and $proc) {
    Stop-Process -Name $procName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Write-Host "  已结束 $procName 进程" -ForegroundColor Yellow
}

$srcText = Read-Utf8 $SourcePrompt
$srcHash = Get-Sha $SourcePrompt
$now = Get-NowIso
$steps = 0
$archFailed = @()

# 注入方式判定（WorkBuddy 37.x 记忆载体长度上限，实测 app.asar）：
#   云记忆 memoryBlock（<memory>）10000 字符；用户级 MEMORY.md（<user_memory>）4000 字符；
#   工作区 MEMORY.md（<working_memory_content>）10000 字符。
# 提示词 <=10000 -> 走记忆文件注入；>10000 -> 走 bundle 注入（发送层拦截，绕过截断）。
$useBundle = ($srcText.Length -gt 10000)
if ($useBundle) {
    Write-Host "  [判定] 提示词 $($srcText.Length) 字符 > 10000，改用 bundle 注入（发送层拦截，不经过记忆截断）" -ForegroundColor Yellow
    Write-Log "提示词超长: $($srcText.Length) chars -> bundle 注入"
} else {
    Write-Host "  [判定] 提示词 $($srcText.Length) 字符 <= 10000，走记忆文件注入" -ForegroundColor DarkGray
}

# 执行注入：短提示词 -> 记忆文件；长提示词 -> bundle（不可用时回退记忆文件）。
$script:personaFile = ''
$script:writtenBundles = @()
$personaFile = ''
$writtenBundles = @()
if ($useBundle) {
    $bundleOk = Invoke-WBBundleInjection
    if (-not $bundleOk) {
        $useBundle = $false
        Write-Host "  [回退] 改为记忆文件注入（长提示词会按 10000 字符上限截断）。" -ForegroundColor Yellow
        Invoke-WBMemoryInjection
    }
} else {
    Invoke-WBMemoryInjection
}
$personaFile = $script:personaFile
$writtenBundles = @($script:writtenBundles)

# 5) Skills（两种模式共用）
$installedNames = @()
if ($NoSkills) {
    Write-Host "[$steps] skills 未执行（-NoSkills）" -ForegroundColor DarkGray
} elseif (-not (Test-Path -LiteralPath $skillsSourceDir)) {
    Write-Host "[$steps] skills 未执行（找不到 $skillsSourceDir）" -ForegroundColor Yellow
} else {
    New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null
    $prevSkills = @()
    if (Test-Path -LiteralPath $manifestFile) {
        try {
            $prevManifest = Read-Utf8 $manifestFile | ConvertFrom-Json
            if ($prevManifest.skills) { $prevSkills = @($prevManifest.skills.PSObject.Properties.Name) }
        } catch {}
    }
    $manifest = [ordered]@{ source = $SkillsSource; installedAt = $now; prompt = (Split-Path -Leaf $SourcePrompt); skills = [ordered]@{}; backups = [ordered]@{} }
    foreach ($name in Get-SkillNames $skillsSourceDir) {
        $s = Join-Path $skillsSourceDir $name; $d = Join-Path $skillsDir $name
        if ((Test-Path -LiteralPath $d) -and ($prevSkills -notcontains $name)) {
            $bak = Join-Path $skillsDir ($name + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
            Move-Item -LiteralPath $d -Destination $bak -Force
            $manifest.backups[$name] = $bak
            Write-Host "[$steps] 已备份同名技能 $name -> $(Split-Path -Leaf $bak)" -ForegroundColor Yellow
        }
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
        Copy-Item -Path (Join-Path $s '*') -Destination $d -Recurse -Force
        $manifest.skills[$name] = [ordered]@{ sha256 = (Get-Sha (Join-Path $d 'SKILL.md')) }
    }
    Write-Utf8 $manifestFile (($manifest | ConvertTo-Json -Depth 6) + "`n")
    $installedNames = @($manifest.skills.Keys)
    $staleSkills = Prune-StaleSkills $skillsDir $prevSkills $installedNames
    if ($staleSkills.Count -gt 0) {
        Write-Host "[$steps] 已清理旧版遗留 skills $($staleSkills.Count) 个" -ForegroundColor DarkGray
    }
    Set-SkillOverrides $settingsFile $installedNames $true
    $steps++
    Write-Host "[$steps] skills 已装 $($installedNames.Count) 个 → $skillsDir" -ForegroundColor Green
}

# 6) 注入状态文件（fj_tool 守护线程据此自动重注入）
$state = [ordered]@{
    prompt       = (Split-Path -Leaf $SourcePrompt)
    promptSha256 = $srcHash
    configDir    = $ConfigDir
    productName  = $ProductName
    installRoot  = $InstallRoot
    method       = $(if ($useBundle) { 'bundle' } else { 'memory' })
    uid          = $Uid
    memoryDir    = $memDir
    archives     = $archFiles
    archive      = $(if ($archFiles.Count -gt 0) { $archFiles[0] } else { '' })
    memoryFile   = $fileMem
    appConfig    = $cfgFile
    personaFile  = $personaFile
    bundles      = @($writtenBundles)
    version      = $MEM_VERSION
    skills       = $installedNames
    installedAt  = $now
}
Write-Utf8 $stateFile (($state | ConvertTo-Json -Depth 6) + "`n")
$steps++
Write-Host "[$steps] 注入状态已记录 → $stateFile（方式：$(if ($useBundle) { 'bundle' } else { 'memory' })）" -ForegroundColor Green

# ---------- 校验 ----------
Write-Host "`n[校验]" -ForegroundColor Cyan
$ok = $true
if ($useBundle) {
    $personaOk = (Test-Path -LiteralPath $personaFile) -and ((Get-Sha $personaFile) -eq $srcHash)
    Write-Host "  人格文件落盘且哈希一致 : $personaOk  ($personaFile)"
    if (-not $personaOk) { $ok = $false }
    foreach ($bp in $writtenBundles) {
        $bText = [System.IO.File]::ReadAllText($bp)
        $bOk = $bText.Contains($script:WBInjectionMarker)
        Write-Host "  bundle 含注入标记      : $bOk  ($(Split-Path -Leaf $bp))"
        if (-not $bOk) { $ok = $false }
    }
    if ($installedNames.Count -gt 0) { Write-Host "  skills 落盘             : $((Get-SkillNames $skillsDir).Count) 个" }
} else {
    foreach ($af in @($archFiles | Where-Object { Test-Path -LiteralPath $_ })) {
        $t = Read-Utf8 $af
        $blockOk = (Get-MemoryBlockBody $t).Trim() -eq $srcText.Trim()
        $rawOk = $t -match '"memoryBlock"'
        Write-Host "  档案 memoryBlock 可解析 : $blockOk  ($(Split-Path -Leaf $af))"
        Write-Host "  档案 RAW_JSON 存在      : $rawOk"
        if (-not ($blockOk -and $rawOk)) { $ok = $false }
    }
    $c = Read-Utf8 $cfgFile | ConvertFrom-Json
    Write-Host "  generateMemoryEnabled   : $($c.generateMemoryEnabled)"
    if ($c.generateMemoryEnabled -ne $true) { $ok = $false }
    Write-Host "  MEMORY.md 哈希一致      : $((Get-Sha $fileMem) -eq $srcHash)"
    if ($installedNames.Count -gt 0) { Write-Host "  skills 落盘             : $((Get-SkillNames $skillsDir).Count) 个" }
}

if ($ok -and $archFailed.Count -gt 0) {
    Write-Log "部分完成: 档案写入失败 $($archFailed.Count) 个"
    Write-Host "`n[部分完成] 云记忆档案被占用，未能写入：" -ForegroundColor Yellow
    foreach ($x in $archFailed) { Write-Host "           - $x" -ForegroundColor Yellow }
    Write-Host "           最常见原因：WorkBuddy 正在运行并占用该文件。" -ForegroundColor Yellow
    Write-Host "           处理：完全退出 WorkBuddy（托盘右键退出）后重跑；开关/记忆文件/skills 已生效。" -ForegroundColor Yellow
    exit 2
}
if ($ok) {
    Write-Log ("完成: 校验全部通过 (method={0})" -f $(if ($useBundle) { 'bundle' } else { 'memory' }))
    Write-Host "`n[完成] WorkBuddy 破甲注入成功" -ForegroundColor Green
    if ($useBundle) {
        Write-Host "  本次方式：bundle 注入（发送层拦截，不受 10000 字符记忆上限影响）" -ForegroundColor Green
        Write-Host "  注意：WorkBuddy 升级会覆盖被打补丁的程序包，升级后需重新注入一次。" -ForegroundColor Yellow
        Write-Host "  生效：完全退出 $procName（托盘右键退出）后重新启动，再发一句话验证。" -ForegroundColor Yellow
    } else {
        if ($proc -and -not $KillApp) { Write-Host "  下一步：完全退出 $procName（托盘右键退出）后重新启动" -ForegroundColor Yellow }
        Write-Host "  生效验证：发一句话后看日志 memory_injection_success" -ForegroundColor DarkGray
    }
    if ($Restart) {
        $exe = if ($InstallRoot -and $ProductName) { Join-Path $InstallRoot "$ProductName.exe" } elseif ($InstallRoot) { Join-Path $InstallRoot 'WorkBuddyAI.exe' } else { '' }
        if ($exe -and (Test-Path -LiteralPath $exe)) {
            Start-Process -FilePath $exe | Out-Null
            Write-Host "  已重新拉起 $procName" -ForegroundColor Green
        } else { Write-Host "  未执行：未找到 $procName 主程序，请手动启动" -ForegroundColor Yellow }
    }
    Write-Host "  还原命令：.\install-workbuddy.ps1 -Uninstall" -ForegroundColor DarkGray
} else {
    Write-Log "中断: 校验未通过（见上方失败项）"
    Write-Host "`n[中断] 校验未通过，检查上面的失败项" -ForegroundColor Red
    exit 1
}
