<div align="center">

# 🐙 open-tgtylab

> 一键部署的安全研究工作台（OpenTgtyLab + Hunter）

150+ MCP 工具 · 208 篇知识库 · 15 条自动化流水线 · 12 个 CVE 扫描器 · 9 个逆向工具

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-red.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20WSL-blue.svg)]()
[![MCP Tools](https://img.shields.io/badge/MCP_Tools-150+-9cf.svg)]()
[![Knowledge Base](https://img.shields.io/badge/KB-208%20Articles-brightgreen.svg)]()
[![Pipelines](https://img.shields.io/badge/CTF_Pipelines-15-orange.svg)]()

</div>

---

> [English version](README.md) · [Hunter](https://github.com/GeniusHu-tgty/Hunter)

## 🤖 一键安装

**方式 A — 单条命令（推荐，无需 AI 审阅）：**

```
bash <(curl -fsSL https://raw.githubusercontent.com/GeniusHu-tgty/Open-tgtylab/main/tgtylab-files/install.sh)
```

自动安装 OpenTgtyLab 和 Hunter、互相连接、并验证——全自动。你可以自己在终端运行，或让任意 AI 助手执行。

**方式 B — AI 提示词（aihot 风格）：**

```
请安装 OpenTgtyLab 安全研究工作台和 Hunter 安全框架（两个是一体的，需要搭配安装并互相连接）：
https://github.com/GeniusHu-tgty/Open-tgtylab
https://github.com/GeniusHu-tgty/Hunter
装完告诉我是否需要开启新会话。
```

AI 会自动读取 [AI-INSTALL.md](AI-INSTALL.md)（安装协议），检测你的环境现状（全新 / 已装旧版 / 只装了一个），完成两个项目的安装、互连、依赖与验证。

**装完后用 `tgty` 验证**——AI 应回复演习框架状态：

```
「红队演习」
代号：Ghost | 战队：open-tgtylab
框架：ACTIVE
状态：READY
```

## 这是什么

**OpenTgtyLab** 是安全研究工作台，**Hunter** 是它的 Web/API 评估引擎。两个仓库**本是一体**——OpenTgtyLab 提供工作台、知识库、Agent 协议和逆向工具；Hunter 提供 MCP 安全评估框架（179 个核心工具，含 12 个 CVE 专用扫描器）。

## 特性

- 🔧 150+ MCP 自动化工具（PE 逆向 / Android / CTF / 加密 / 调试）
- 🎯 12 个 CVE 专用扫描器（PAN-OS / IngressNightmare / Druid SSRF / Ivanti Sentry / MSSQL2025 / Redis UAF / Next.js SXSS / CSWSH / Cloudflare ACME / Aruba XXE / DOMPurify / Linux LPE）——全部走 RequestBroker、证据优先、只做安全探测
- 📚 208 篇技术知识库（Web / APK / PE / 密码学 / 游戏安全）
- 🔄 15 条 CTF 流水线（全链路 / 24h 无人值守 / 攻击路由 / 专项攻击）
- 🛠 9 个逆向工具自动下载（Ghidra / Cutter / x64dbg / DiE / PE-bear / Procmon / nmap / apktool / jadx）
- 🖥 全平台支持（Windows / macOS / Linux / WSL）
- 💾 自动备份现有配置
- 🎭 增强版 Agent 协议——演习场景框架 + 身份层逻辑 + `tgty` 验证器，模型无关（任何后端模型可用）

## 两个项目如何连接

| 约定 | 连接方式 |
|---|---|
| Hunter → `~/.agents/skills/hunter` | OpenTgtyLab 的 `.mcp.json` 从这里启动 `hunter_tools` |
| `OPEN_TGTYLAB_ROOT` 环境变量 | Hunter 在 OpenTgtyLab 里找 `reverse_lab_tools`（105 个逆向工具） |
| `mcp>=1.20,<1.29` | 共用 MCP SDK 版本（新版移除了 `mcp.server.fastmcp`） |
| `~/hunter-bin/` | 共用外部扫描器（nuclei / dalfox / sqlmap） |

## 路由

```
信号 → kb_router(board=) → kb_read_file → 技术文档 → MCP 工具映射 → 执行
```

| 信号类型 | Board | KB 分类/文件 | MCP 工具族 |
|---------|-------|-------------|-----------|
| HTTP/Web/API/CVE/Cloud | `ctf-website` | 26/118 | `http_probe` `run_ctf_tool` `kb_router` |
| APK/DEX/SO/Frida/Java | `apk-reverse` | 8/20 | `android_app_baseline` `android_crypto_unpack_recipe` `android_frida_*` |
| PE/x64/x86/malware/driver | `pe-reverse` | 9/22 | `triage_pe` `ghidra_headless_analyze` `make_x64dbg_breakpoint_script` `sample_full_workup` |
| Crypto/Protocol/Cheat/IoT/Radio | `general` | 5/17 | `die_scan` `ghidra_*` `rizin_*` `python_re_tool_*` |

## 知识库

```
kb/
├── ctf-website/techniques/   26 类 118 篇 — Web 安全全覆盖
├── apk-reverse/techniques/    8 类  20 篇 — APK/DEX 逆向
├── pe-reverse/techniques/     9 类  22 篇 — PE 二进制分析
├── general/techniques/        5 类  17 篇 — 密码学/协议/内核/游戏安全
└── windows/techniques/        1 类   2 篇 — Windows 安全
```

## 系统要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| **OS** | Windows 10/11 / macOS 12+ / Linux | WSL 自动检测 |
| **Python** | 3.11+ | MCP 工具运行时 |
| **Git** | 任意 | clone 项目 |
| **mcp** | 1.20-1.28 | Python MCP SDK（自动安装） |

| AI 工具 | 状态 |
|---------|------|
| Claude Code | ✅ 完整支持 |
| Codex App | ✅ 完整支持 |
| Hermes | ✅ 完整支持 |
| OpenCode | ✅ 完整支持 |

## Hunter MCP 协同

OpenTgtyLab 与 [Hunter](https://github.com/GeniusHu-tgty/Hunter) 是一体。Hunter 通过 `hunter_tools` 暴露 **179 个核心 MCP 工具**，包括：

- JavaScript 拆包、保守去混淆、API/路由提取、签名重建、JSHook 交接计划
- 加密持久化攻击会话、断点续跑、授权范围请求、证据门控的后渗透规划
- 有状态自适应 HTTP 控制（指纹 / WAF / 限流 / 验证码 / 代理池 / 审计时间线）
- 可恢复的 Workflow State v2 编排、浏览器与逆向桥接、本地记忆、七阶段 `hunter_auto_pentest`
- 12 个 CVE 专用扫描器——全部走 RequestBroker、证据优先、只做安全探测

## 文件结构

```
open-tgtylab/
├── AI-INSTALL.md                  AI 安装协议（全新/升级/补全/更新）
├── tgtylab-files/
│   ├── deploy.ps1                 Windows 部署引擎
│   ├── install_tools.ps1          逆向工具下载器
│   ├── install.sh / linux-install.sh / uninstall.sh
│   └── config-bundle/
│       ├── CLAUDE.md              增强版 Agent 协议（演习框架 + tgty）
│       └── system-prompt.md       系统提示词
├── tools/
│   ├── ctf-website/               CTF 工具 + 字典 + payload
│   ├── skills/mcp/                MCP Server（150+ 工具）
│   ├── common/                    Ghidra（自动下载）
│   ├── windows/                   x64dbg/DiE/PE-bear/Procmon（自动下载）
│   └── android/                   apktool/jadx（自动下载）
├── kb/                            知识库（208 篇）
├── .claude/                       Claude Code 配置 + 流水线 + skills
├── AGENTS.md                      Agent 协议
└── AI-USAGE.md                    任务路由
```

## 其他操作

| 操作 | 命令 |
|------|------|
| 验证 | 在 AI 会话里输入 `tgty` |
| 卸载 | `bash tgtylab-files/uninstall.sh` (macOS/Linux) |
| 更新 | 两个仓库 `git pull` 后重跑 install.sh |

## 相关项目

- [Hunter](https://github.com/GeniusHu-tgty/Hunter) — MCP-first 安全评估框架（179 个核心工具，12 个 CVE 扫描器，RequestBroker 统一出口）

## 许可

GPL-3.0-only. 详见 [LICENSE](LICENSE)。

## 免责声明

本项目仅供学习交流和授权安全研究使用。使用者应确保在合法授权范围内使用本项目，使用本项目造成的任何后果由使用者自行承担。

详见 [DISCLAIMER.md](DISCLAIMER.md)。

## Hunter MCP 协同

OpenTgtyLab 通过唯一完整 MCP 名称 `hunter_tools` 接入独立的 [Hunter](https://github.com/GeniusHu-tgty/Hunter) 仓库，共享 case state、项目知识库、evidence、notes 与 reports，同时保持和 `reverse_lab_tools` 的职责边界。

详见 `docs/hunter-tools-integration.md`，验证命令：

```bash
python scripts/misc/verify_hunter_tools_integration.py
```

### Integration v2 管理命令

```bash
python scripts/misc/hunter_tools_manager.py install --global-codex
python scripts/misc/hunter_tools_manager.py update --global-codex
python scripts/misc/hunter_tools_manager.py doctor
```

命令会自动克隆/更新 Hunter、移除旧 `hunter` 注册、动态写入当前 Python 与工作区绝对路径，并执行协同验证。
