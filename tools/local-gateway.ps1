# local-gateway.ps1 —— 方案 C：本地模型 / 自建网关（彻底脱离云端组装）
#
# 做法：把规则原文写进 Ollama 的 Modelfile SYSTEM 段，创建一个专用模型。
#       规则直接成为"模型定义"的一部分，请求不经过任何云端规则组装。
#
# 用法：
#   .\local-gateway.ps1 -Check                       # 只看环境，不动手
#   .\local-gateway.ps1                              # 默认 base=qwen2.5-coder:14b
#   .\local-gateway.ps1 -Base qwen2.5-coder:32b
#   .\local-gateway.ps1 -Rules "D:\x\我的规则.md" -Name seagull-v8

[CmdletBinding()]
param(
    [string]$Base = 'qwen2.5-coder:14b',
    [string]$Name = 'seagull-v8',
    [string]$Rules = '',
    [switch]$Core,
    [switch]$Check
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch { }
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Write-Utf8([string]$Path, [string]$Text) {
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Text, $Utf8)
}

# ---------- 规则来源：默认读 config.json ----------
$cfgPath = Join-Path $PSScriptRoot 'config.json'
if (-not $Rules) {
    if (Test-Path -LiteralPath $cfgPath) {
        $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $Rules = $cfg.rulesFile
    }
}
# -Core：改用方案 D 产出的常驻块（约 12.8K），而不是整份 46K
if ($Core) {
    $coreFile = Join-Path $PSScriptRoot 'out\core.md'
    if (Test-Path -LiteralPath $coreFile) {
        $Rules = $coreFile
    } else {
        Say "[!] 没找到 out\core.md，先跑 node split-rules.js。本次仍用原规则。" 'Yellow'
    }
}

# 展开 %USERPROFILE% 等环境变量；国内版目录不存在时回退国际版
if ($Rules) {
    $Rules = [Environment]::ExpandEnvironmentVariables($Rules)
    if (-not (Test-Path -LiteralPath $Rules)) {
        $alt = $Rules.Replace('\.trae-cn\', '\.trae\')
        if (Test-Path -LiteralPath $alt) { $Rules = $alt }
    }
}

if ($Rules -and -not (Test-Path -LiteralPath $Rules)) {
    Say "[×] 找不到规则文件：$Rules" 'Red'
    exit 1
}

# ---------- 探测 Ollama ----------
$ollama = $null
$cmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($cmd) { $ollama = $cmd.Source }
if (-not $ollama) {
    $p = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path -LiteralPath $p) { $ollama = $p }
}

Say "== 方案 C 环境检查 ==" 'Cyan'
Say ("规则文件 : " + $(if ($Rules) { $Rules } else { '(未配置)' }))
if ($Rules) { Say ("规则体量 : " + (Get-Content -LiteralPath $Rules -Raw -Encoding UTF8).Length + " 字符") }
Say ("Ollama   : " + $(if ($ollama) { $ollama } else { '未安装' }))
Say ("基础模型 : " + $Base)

if ($Check) {
    Say ""
    if ($ollama) { Say "Ollama 已就绪，去掉 -Check 即可创建模型。" 'Green' }
    else { Say "未检测到 Ollama。装好后重跑，或改用 LM Studio（下方有说明）。" 'Yellow' }
    exit 0
}

if (-not $Rules) {
    Say "[×] 没有规则文件可嵌入。" 'Red'
    exit 1
}

# ---------- 生成 Modelfile ----------
$rulesText = Get-Content -LiteralPath $Rules -Raw -Encoding UTF8
# Modelfile 的 SYSTEM 用三引号块，规则里若出现三引号会破坏结构，做一次兜底提示
if ($rulesText -match '"""') {
    Say "[!] 规则文本里含有三引号，Modelfile 结构可能被破坏，请先检查。" 'Yellow'
}

$outDir = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$modelfile = Join-Path $outDir 'Modelfile'
$promptTxt = Join-Path $outDir 'system-prompt.txt'

$mf = @"
FROM $Base
PARAMETER temperature 0.7
PARAMETER num_ctx 32768
SYSTEM """
$rulesText
"""
"@
Write-Utf8 $modelfile $mf
Write-Utf8 $promptTxt $rulesText

Say ""
Say ("已生成 Modelfile : " + $modelfile)
Say ("已导出系统提示词 : " + $promptTxt) 'DarkGray'

# ---------- 创建模型 ----------
if ($ollama) {
    Say ""
    Say "正在创建模型（首次会拉取基础模型，可能较慢）…" 'Cyan'
    try {
        & $ollama create $Name -f $modelfile
        if ($LASTEXITCODE -ne 0) { throw "ollama create 返回 $LASTEXITCODE" }
        Say "[√] 模型已创建：$Name" 'Green'
    } catch {
        Say ("[×] 创建失败：" + $_.Exception.Message) 'Red'
        Say "    可手动执行：`"$ollama`" create $Name -f `"$modelfile`"" 'Yellow'
        exit 1
    }
} else {
    Say ""
    Say "未检测到 Ollama，已导出 Modelfile 与系统提示词，装好后再执行：" 'Yellow'
    Say "  ollama create $Name -f `"$modelfile`"" 'Yellow'
}

# ---------- 输出 Trae 配置 ----------
Say ""
Say "================ Trae 里这样填 ================" 'Cyan'
Say "  Base URL : http://127.0.0.1:11434/v1"
Say "  API Key  : ollama"
Say ("  模型名   : " + $Name)
Say ""
Say "LM Studio 路线（不想装 Ollama 就用这个）：" 'DarkGray'
Say ("  1. 载入任意 GGUF 模型，开 Local Server (1234 端口)" ) 'DarkGray'
Say ("  2. 把 " + $promptTxt + " 的内容粘进 Preset 的 System Prompt") 'DarkGray'
Say "  3. Trae 填 Base URL http://127.0.0.1:1234/v1，Key 留空" 'DarkGray'
