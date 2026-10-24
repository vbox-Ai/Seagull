#Requires -Version 5.1
<#
  Seep 工作台 — 各 Agent 配置一键自愈与绝对路径展开生成器 (Config Generator)
  用于自动生成：
  1. Claude Code 项目级配置 (.mcp.json)
  2. OpenCode 官方格式工作区配置 (opencode.jsonc)
  3. DeepSeek Harness (DSH) 官方 Cordis Overlay 补丁 (cordis.generated.yml，采用 - insert: 语法)
#>
[CmdletBinding()]
param(
    [switch]$PrintOnly
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Split-Path -Parent $ScriptDir
$NormalizedRoot = $Root.Replace('\', '/')
$ToolDir   = Join-Path $Root 'Tool'
$McpServerPy = "$NormalizedRoot/Tool/mcp/seep_mcp_server.py"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "          Seep Reverse Lab — 多 Agent 配置文件生成与自愈器" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  检测到工作台物理根目录: $Root" -ForegroundColor White
Write-Host "  标准化 POSIX 路径表示: $NormalizedRoot" -ForegroundColor Gray

# -----------------------------------------------------------------------------
# 1. 生成 Claude Code 项目级 .mcp.json
# -----------------------------------------------------------------------------
Write-Host "`n[1/3] 正在生成 Claude Code 项目级配置 (.mcp.json)..." -ForegroundColor White
$claudeMcpJson = @"
{
  "mcpServers": {
    "seep": {
      "command": "python",
      "args": [
        "Tool/mcp/seep_mcp_server.py"
      ],
      "env": {
        "PYTHONIOENCODING": "utf-8"
      },
      "transport": "stdio"
    },
    "js-reverse": {
      "command": "npx",
      "args": [
        "-y",
        "js-reverse-mcp"
      ],
      "transport": "stdio"
    }
  }
}
"@
$claudeDest = Join-Path $Root '.mcp.json'
if (-not $PrintOnly) {
    [System.IO.File]::WriteAllText($claudeDest, $claudeMcpJson, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  [√] 已更新: $claudeDest" -ForegroundColor Green
}

# -----------------------------------------------------------------------------
# 2. 生成 OpenCode 官方标准工作区配置 (opencode.jsonc)
# -----------------------------------------------------------------------------
Write-Host "`n[2/3] 正在生成 OpenCode 官方标准配置 (opencode.jsonc)..." -ForegroundColor White
$openCodeJsonc = @"
{
  "`$schema": "https://opencode.ai/config.json",
  "mcp": {
    "seep": {
      "type": "local",
      "command": [
        "python",
        "$McpServerPy"
      ],
      "enabled": true,
      "environment": {
        "PYTHONIOENCODING": "utf-8"
      }
    }
  }
}
"@
$openCodeDest = Join-Path $Root 'opencode.jsonc'
if (-not $PrintOnly) {
    [System.IO.File]::WriteAllText($openCodeDest, $openCodeJsonc, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  [√] 已更新: $openCodeDest (符合 OpenCode 官方 mcp 顶层与数组 command 标准)" -ForegroundColor Green
}

# -----------------------------------------------------------------------------
# 3. 生成 DeepSeek Harness 官方 Cordis Overlay 补丁 (cordis.generated.yml)
# -----------------------------------------------------------------------------
Write-Host "`n[3/3] 正在生成 DeepSeek Harness (DSH) 官方补丁 (cordis.generated.yml)..." -ForegroundColor White
$dshYaml = @"
# ==============================================================================
# DeepSeek Harness (Cordis) Overlay 补丁 — 遵循 DSH 官方 - insert: 规范
# 生成基准目录: $NormalizedRoot
# 使用方法:
#   1. 命令行启动: dsh web --patch "$NormalizedRoot/setup/cordis.generated.yml"
#   2. 配置文件合并: 写入 `$DSH_HOME/profiles/<name>/cordis.patch.yml 或 `$DSH_HOME/cordis.patch.yml
# ==============================================================================
- insert:
    - id: seep-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: seep
        transport: stdio
        command: python
        args:
          - '$McpServerPy'
        env:
          PYTHONIOENCODING: utf-8
        cwd: !!js process.cwd()
"@
$dshDest = Join-Path $ScriptDir 'cordis.generated.yml'
if (-not $PrintOnly) {
    [System.IO.File]::WriteAllText($dshDest, $dshYaml, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  [√] 已生成: $dshDest (顶层采用官方 - insert: 语法)" -ForegroundColor Green
}

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "  🎉 所有 Agent 配置文件生成完毕！" -ForegroundColor Green
Write-Host "  - OpenCode: 直接启动 opencode，自动识别根目录 opencode.jsonc" -ForegroundColor White
Write-Host "  - DSH: 可执行 dsh web --patch `"$NormalizedRoot/setup/cordis.generated.yml`"" -ForegroundColor White
Write-Host "================================================================================" -ForegroundColor Cyan
