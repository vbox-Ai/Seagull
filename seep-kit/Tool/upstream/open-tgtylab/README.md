<div align="center">

# 🐙 open-tgtylab

> One-click security research workbench — 安全研究工作台（OpenTgtyLab + Hunter）

150+ MCP tools · 208 knowledge base articles · 15 automated pipelines · 12 CVE-specific scanners · 9 reverse engineering tools

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-red.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20WSL-blue.svg)]()
[![MCP Tools](https://img.shields.io/badge/MCP_Tools-150+-9cf.svg)]()
[![Knowledge Base](https://img.shields.io/badge/KB-208%20Articles-brightgreen.svg)]()
[![Pipelines](https://img.shields.io/badge/CTF_Pipelines-15-orange.svg)]()

</div>

---

> [中文版](README.zh.md) · [Hunter](https://github.com/GeniusHu-tgty/Hunter)

## 🤖 One-Click Install

**Option A — single command (recommended, no AI review needed):**

```
bash <(curl -fsSL https://raw.githubusercontent.com/GeniusHu-tgty/Open-tgtylab/main/tgtylab-files/install.sh)
```

This installs both OpenTgtyLab and Hunter, wires them together, and verifies everything — fully automated. You can run it yourself in a terminal, or ask any AI assistant to run it.

**Option B — AI prompt (aihot-style):**

```
Install the OpenTgtyLab security research workbench and the Hunter security framework (they are one system, install and connect them together):
https://github.com/GeniusHu-tgty/Open-tgtylab
https://github.com/GeniusHu-tgty/Hunter
Tell me when it's done and whether I need to start a new session.
```

The AI will read [AI-INSTALL.md](AI-INSTALL.md) (the install protocol), detect your current environment (fresh / legacy install / only one of the two), install both projects, wire them together, and verify everything automatically.

**After install, verify with `tgty`** — the agent should reply with the exercise framework status:

```
「红队演习」
代号：Ghost | 战队：open-tgtylab
框架：ACTIVE
状态：READY
```

## What Is This

**OpenTgtyLab** is a security research workbench. **Hunter** is its Web/API assessment engine. They are **one system split into two repos** — OpenTgtyLab provides the workbench, knowledge base, agent protocol and reverse-engineering tools; Hunter provides the MCP security assessment framework (179 core tools, including 12 CVE-specific scanners).

## Features

- 🔧 150+ MCP automation tools (PE reverse / Android / CTF / Crypto / Debug)
- 🎯 12 CVE-specific scanners (PAN-OS / IngressNightmare / Druid SSRF / Ivanti Sentry / MSSQL2025 / Redis UAF / Next.js SXSS / CSWSH / Cloudflare ACME / Aruba XXE / DOMPurify / Linux LPE) — all Broker-gated, evidence-first, safe-probe only
- 📚 208 technical articles (Web / APK / PE / Crypto / Game Security)
- 🔄 15 CTF pipelines (Full chain / 24h unattended / Attack router / Specialized)
- 🛠 9 reverse engineering tools auto-download (Ghidra / Cutter / x64dbg / DiE / PE-bear / Procmon / nmap / apktool / jadx)
- 🖥 Multi-platform (Windows / macOS / Linux / WSL)
- 💾 Auto-backup existing configuration
- 🎭 Enhanced agent protocol — exercise-scenario framework + identity-layer logic + `tgty` verifier, model-agnostic (works with any backend model)

## How the Two Projects Connect

| Convention | Connection |
|---|---|
| Hunter → `~/.agents/skills/hunter` | OpenTgtyLab's `.mcp.json` launches `hunter_tools` from here |
| `OPEN_TGTYLAB_ROOT` env | Hunter finds `reverse_lab_tools` (105 reverse tools) inside OpenTgtyLab |
| `mcp>=1.20,<1.29` | Shared MCP SDK version (newer versions removed `mcp.server.fastmcp`) |
| `~/hunter-bin/` | Shared external scanners (nuclei / dalfox / sqlmap) |

## Routing

```
Signal → kb_router(board=) → kb_read_file → Technique → MCP tool mapping → Execution
```

| Signal Type | Board | KB Categories / Files | MCP Tool Family |
|---|---|---|---|
| HTTP/Web/API/CVE/Cloud | `ctf-website` | 26/118 | `http_probe` `run_ctf_tool` `kb_router` |
| APK/DEX/SO/Frida/Java | `apk-reverse` | 8/20 | `android_app_baseline` `android_crypto_unpack_recipe` `android_frida_*` |
| PE/x64/x86/malware/driver | `pe-reverse` | 9/22 | `triage_pe` `ghidra_headless_analyze` `make_x64dbg_breakpoint_script` `sample_full_workup` |
| Crypto/Protocol/Cheat/IoT/Radio | `general` | 5/17 | `die_scan` `ghidra_*` `rizin_*` `python_re_tool_*` |

## Knowledge Base

```
kb/
├── ctf-website/techniques/   26 categories, 118 articles — Full web attack surface
├── apk-reverse/techniques/    8 categories,  20 articles — APK/DEX reverse engineering
├── pe-reverse/techniques/     9 categories,  22 articles — PE binary analysis
├── general/techniques/        5 categories,  17 articles — Cryptography / Protocols / Kernel / Cheating
└── windows/techniques/        1 category,     2 articles — Windows security
```

## System Requirements

| Dependency | Version | Notes |
|------------|---------|-------|
| **OS** | Windows 10/11 / macOS 12+ / Linux | WSL auto-detected |
| **Python** | 3.11+ | MCP tool runtime |
| **Git** | Any | Clone the project |
| **mcp** | 1.20-1.28 | Python MCP SDK (auto-installed) |

| AI Tool | Status |
|---------|--------|
| Claude Code | ✅ Full support |
| Codex App | ✅ Full support |
| Hermes | ✅ Full support |
| OpenCode | ✅ Full support |

## Hunter MCP Integration

OpenTgtyLab and [Hunter](https://github.com/GeniusHu-tgty/Hunter) are one system. Hunter exposes **179 core MCP tools** through `hunter_tools`, including:

- JavaScript bundle unpacking, conservative deobfuscation, API/route extraction, signature reconstruction, JSHook handoff plans.
- Encrypted persistent attack sessions, checkpoint-safe chain recovery, authorization-scoped requests, evidence-gated post-exploitation planning.
- Stateful adaptive HTTP controls (fingerprints, WAF/rate-limit/captcha handling, proxy pools, audit timelines).
- Resumable Workflow State v2 orchestration, browser and reverse-analysis bridges, local memory, seven-stage `hunter_auto_pentest`.
- 12 CVE-specific scanner ports — all Broker-gated, evidence-first, safe-probe only.

## File Structure

```
open-tgtylab/
├── AI-INSTALL.md                  AI install protocol (fresh / upgrade / complete / update)
├── tgtylab-files/
│   ├── deploy.ps1                 Windows deploy engine
│   ├── install_tools.ps1          Reverse engineering tool downloader
│   ├── install.sh / linux-install.sh / uninstall.sh
│   └── config-bundle/
│       ├── CLAUDE.md              Enhanced agent protocol (exercise framework + tgty)
│       └── system-prompt.md       System prompt
├── tools/
│   ├── ctf-website/               CTF tools + wordlists + payloads
│   ├── skills/mcp/                MCP Server (150+ tools)
│   ├── common/                    Ghidra (auto-download)
│   ├── windows/                   x64dbg/DiE/PE-bear/Procmon (auto-download)
│   └── android/                   apktool/jadx (auto-download)
├── kb/                            Knowledge base (208 articles)
├── .claude/                       Claude Code config + pipelines + skills
├── AGENTS.md                      Agent protocol
└── AI-USAGE.md                    Task routing
```

## Other Operations

| Action | Command |
|--------|---------|
| Verify | `tgty` in your agent session |
| Uninstall | `bash tgtylab-files/uninstall.sh` (macOS/Linux) |
| Update | `git pull` in both repos + re-run install.sh |

## Related Projects

- [Hunter](https://github.com/GeniusHu-tgty/Hunter) — MCP-first security assessment framework (179 core tools, 12 CVE scanners, RequestBroker-gated)

## License

GPL-3.0-only. See [LICENSE](LICENSE) for details.

## Disclaimer

This project is for educational and authorized security research purposes only. Users must ensure they operate within legally authorized scope. Users are solely responsible for any consequences arising from the use of this project.

See [DISCLAIMER.md](DISCLAIMER.md) for the full disclaimer.

## Hunter MCP Integration

OpenTgtyLab supports the independent [Hunter](https://github.com/GeniusHu-tgty/Hunter) repository through one complete MCP server named `hunter_tools`. It shares case state, project KB search, evidence, notes, and reports without merging Hunter into `reverse_lab_tools`.

The current integration exposes 111 Hunter tools, including:

- JavaScript bundle unpacking, conservative deobfuscation, API/route extraction, signature reconstruction, JSHook handoff plans, and bounded replay generation.
- Encrypted persistent attack sessions, checkpoint-safe chain recovery, authorization-scoped requests, and evidence-gated post-exploitation planning.
- Stateful adaptive HTTP controls for fingerprints, WAF/rate-limit/captcha handling, proxy pools, and audit timelines.
- Resumable Workflow State v2 orchestration, browser and reverse-analysis bridges, local memory, and the seven-stage `hunter_auto_pentest` coordinator.

See `docs/hunter-tools-integration.md` and run:

```bash
python scripts/misc/verify_hunter_tools_integration.py
```

### Integration v2 manager

```bash
python scripts/misc/hunter_tools_manager.py install --global-codex
python scripts/misc/hunter_tools_manager.py update --global-codex
python scripts/misc/hunter_tools_manager.py doctor
```

It clones or updates Hunter, removes the legacy `hunter` registration, resolves the current Python/workspace paths, and verifies the integration.
