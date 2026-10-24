# Changelog

> 本文件面向**已部署用户**，说明每次更新带来什么变化、需要注意什么。
> 更新操作见 [MANUAL/DEPLOYMENT.md — 更新指南](MANUAL/DEPLOYMENT.md#八-已有用户更新指南)。
>
> **模型选型与拒答排查**见 [MANUAL/MODEL-REFUSAL-MATRIX.md](MANUAL/MODEL-REFUSAL-MATRIX.md)（实测对照表）。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 变更

- **📦 项目D 案例更新至 v1.5.0**（跨版本补丁迁移 · 五版本 AOB 特征码）
  - 版本谱系由 3 个扩展到 **5 个**（新增 build 12 / build 15），位点偏移表与特征码表全面刷新。
  - 新增 **§8「静默自动更新 + 数据段填充漂移」**：记录官方内置更新器静默覆盖已打补丁主程序导致的授权失效链，
    以及数据段填充漂移使滑动汉明距离误命中（距离仅 2、位置早 2 字节）的陷阱与修正流程。
  - `docs/algorithm.md`：五版本指纹表、五版本位点偏移对照、新增 §3.2 填充漂移专项。
  - `tools/` 流水线脚本改为**基于脚本位置自动解析路径**，去除作者本地绝对路径。
  - 回归断言由 61 项扩充至 **89 项**（五版本端到端），并断言既有版本产物哈希零变化。
- **📚 知识库新增笔记**：`pe-reverse/10-license-keygen/10-multiversion-signature-narrowing.md`
  —— 多版本特征码收窄与数据段填充漂移陷阱（含三重确认流程与零回归断言清单）。

---

## [Unreleased]

### 新增

- **🌐 项目D 案例更新至 v1.6.0**（全栈中英双语国际化架构）
  - 纯代码内嵌双语字典（零 `.resx` / 零附属程序集），保持单源码 `csc.exe` 秒级编译。
  - 首启自动探测 `CultureInfo.CurrentUICulture`，非中文系统直接呈现专业英文。
  - 侧边栏 `[ 🌐 EN / 简 ]` 胶囊按钮实现毫秒级内存热重绘（保留 Tab 状态与控制台日志）。
  - 运行日志实时翻译层（`TranslateLog`）：115+ 条模式替换，覆盖 AOB 补丁 / ACL 冻结 / 备份归档全链路。
  - 回归断言由 89 项扩充至 **98 项**（新增 9 项国际化单元测试）。
  - 文档新增「全栈中英双语国际化架构」章节，含四项关键工程决策（为何弃用 `.resx`、为何热重绘而非重建、日志为何必须走翻译层、CLI 同步国际化）。

---

## [1.6.0] — 2026-10-11

### 新增

- **🔁 中继拒答自动重试**（`Tool/scripts/compliance-relay/refusal.py`）★
  - Gemini 对「命令式要求对具体目标执行攻击性分析」的请求会**静默拦截**：
    `HTTP 200 + {"choices": [], "usage": {"completion_tokens": 377}}` ——
    模型生成了 token 但内容被丢弃，**不报错、不提示**，异常处理根本捕获不到。
  - 中继现在会检测这类拒答，**自动换一种写法重发**，对客户端完全透明。
  - 策略级联（全部**保留用户指定的目标**）：
    `original` → `S1 评审清单式` → `S2 设计评审框架` → `S3 英文评审式`
  - 实测：原句被拦（377 tokens 丢弃）→ 改写后返回 **2611~3324 字**完整回答。
  - 支持非流式（OpenAI / Anthropic / Google 原生形状）与流式 SSE 两类拒答检测。
  - 性能保障：只缓冲到「可判定」为止（SSE 8KB / JSON 4MB），超出上限即视为肯定没被拦，直接透传。
  - 可配置：`relay-config.json` 中 `refusalRetry` / `refusalRetryAttempts`（默认开、3 次）。
  - 新增 **40 项单元与集成测试**（共 84 项全绿），含「上游先拒答再放行」的端到端验证。

### 变更

- `relay.py` 响应转发改为「缓冲到可判定 → 需要时重试 → 再透传」，
  非拒答的正常长回答仍为流式透传。

---

## [1.5.0] — 2026-10-11

### 新增

- **🔍 L1 可观测性日志**（`security-audit-interceptor.ts`）
  - 动机：L1 有两类**不会报错的失效方式** —— 对 OpenAI 兼容端点乱注入会 400；
    对「名字叫 gemini 但实际走 OpenAI 格式」的链路注入则**被中转静默丢弃**。
  - 设 `PI_SAFETY_LOG=1` 后，每次判定写入 `~/.pi/agent/logs/l1-safety.log`，
    判定分为 `INJECT` / `SKIP` / **`SKIP-INEFFECTIVE`**（名字像 Gemini 但形状是 `messages`，
    注入必然无效的告警）。日志超 512KB 自动截断。
- **🧪 Gemini 安全设置验证工具**（`Tool/scripts/check-gemini-safety.py`）
  - 用同一提示词分别以「不注入 / 注入 `BLOCK_NONE`」请求 Google 原生接口，
    对比 `finishReason` 给出**可证伪的结论**：有效 / 无法区分 / 无效。
  - 纯标准库，密钥仅从 `GEMINI_API_KEY` 环境变量读取，**绝不打印、绝不落盘**。
  - 支持 `--list-models` / `--model` / `--prompt`。
- **🗑️ 一键卸载脚本**（`setup/uninstall.ps1` / `setup/uninstall.sh`）—— 回应 Issue #8
  - 原则：**只移除工作台自己装的东西，绝不碰你的数据**
  - 移除范围：工作台自带的 9 大技能、`AGENTS.md` / `SYSTEM.md`、`extensions/*.ts`、
    `mcp.json` 中的 `seep` / `js-reverse` / `playwright`、工作台加入的 12 个 packages、`lab-mode.flag`
  - **永不触碰**：`models.json` / `auth.json` / `sessions/` / `logs/`、
    你自己添加的 Skill 与 MCP 条目、`settings.json` 的其他字段
  - MCP 条目采用**外科手术式**判定：只有 `args` 确实指向工作台组件时才认为归工作台所有
  - 支持 `-DryRun` 预览、逐项 `-Keep*` 保留、`-Purge` 深度清理、`-Restore` 反向恢复
  - 卸载前自动整体备份到 `~/.pi/agent/backup-uninstall-<时间戳>/`
  - 手册：[MANUAL/DEPLOYMENT.md — 卸载与回滚](MANUAL/DEPLOYMENT.md)
- **🔁 已有用户一键更新机制**（`setup/update.ps1` / `update.sh` + `VERSION` + 本 CHANGELOG）
  - 自动 `git stash` 保护本地改动 → `git pull` → 预览变更 → 备份 → 幂等增量同步 → 校验零丢失 → 全量自检

### 修复

- **🚨 安装/更新会静默覆盖用户 `mcp.json`（严重）**
  - 根因：`$raw.StartsWith([char]0xFEFF)` 在**无 BOM** 的文件上也会返回 `TRUE`。
    .NET 默认 `StartsWith` 使用**文化敏感比较**，而 `U+FEFF`（BOM 字符）是
    「可忽略字符」，等价于空字符串，因此**任何字符串都「以它开头」**，
    随后的 `Substring(1)` 便削掉了首个 `{`，把合法 JSON 破坏成非法。
  - 后果：`install-pi.ps1` 读取失败后静默回退到空配置，
    用模板**覆盖**用户 `mcp.json`，丢失自定义 MCP 条目（如 `ida`）与真实 Playwright token。
  - 修复：`install-pi.ps1`（mcp.json + settings.json）、`install-ida.ps1`、`update.ps1`
    共 4 处改为序数/字符比较。
- **🧩 3 个技能被 Agent 静默跳过**（Issue #6，由 @xiaozhi1218 报告）
  - 根因：`safe-skills/{apk-reverse,ida-reverse,radare2}/SKILL.md` 带 UTF-8 BOM，
    而 DSH 的 frontmatter 解析要求首行**严格等于** `---`，于是整条技能被静默丢弃（9 条只发现 6 条）。
  - 修复：`setup/clean-format.py` 新增 Markdown / JSON **剥离 BOM** 规则（`.ps1` 仍保留 BOM），
    并排除 `Tool/upstream/` 以保持上游镜像字节保真；共修复 8 个文件。
  - 新增门禁：`verify.ps1` / `verify.sh` 会阻断任何带 BOM 的 `SKILL.md`，防止回归。
- **🛑 Ctrl+C 退出时 MCP 子进程打印 KeyboardInterrupt 堆栈**（Issue #7）
  - `seep_mcp_server.py` 现在捕获 `KeyboardInterrupt` / `BrokenPipeError` / `EOFError` 静默收尾，
    并为 POSIX 注册 `SIGTERM` 处理器。
- **🔌 Gemini 私有字段被注入到所有 provider（由 PR #9 @linbei0 贡献）**
  - L1 底座级解封不再无差别写入 `safetySettings` / `config`，
    改为**仅对 Google/Gemini 端点注入**；OpenAI 兼容网关不再返回 `400 UNKNOWN_FIELD`。
  - 可用环境变量 `PI_SAFETY_PAYLOAD=off|all|auto` 覆盖（默认 `auto`）。
- **🍎 macOS / Linux 自动安装 radare2（由 PR #5 @iscodeminister 贡献）**
  - `setup/install.sh` 新增引擎探测：macOS + Homebrew 自动安装，其他平台给出清晰指引；幂等且非致命。
- **🔒 隐私门禁改为只扫描 git 跟踪文件**
  - 本地已 gitignore 的生成配置不再造成误报，同时更准确地反映「实际会发布的内容」。

### 变更

- `verify.ps1` 增至 **52 项**核心检查，`verify.sh` 增至 **51 项**。

---

## [1.4.0] — 2026-09-30

### 新增

- **🌐 链路层合规转译中继**（`Tool/scripts/compliance-relay/`）
  - 本机回环中继，在请求离开本机前把口语平滑转译为合规术语
  - 覆盖三种协议：`openai-completions`（Pi Agent 主力）、`anthropic-messages`（Claude Code）、`openai-responses`（Codex）
  - 纯 Python 标准库实现，**零新增依赖**；**零落盘**（日志只记命中条数）
  - 默认关闭，需显式运行 `python relay.py`；受 `lab-mode.flag` 门控，mtime 热加载
  - 手册：[MANUAL/COMPLIANCE-RELAY.md](MANUAL/COMPLIANCE-RELAY.md)
- **🔒 脱敏与个人隐私门禁**（`verify.ps1` / `verify.sh` 第 9 节）
  - 全深度递归扫描个人路径、身份标识、私有域名、凭据
  - 生成物追踪检查（含本机路径的配置文件不得入库）
  - 脱敏基准表 D1–D6 记录于 `MANUAL/DEPLOYMENT-CHECKLIST.md`
- **🖥️ 跨平台支持**（macOS / Linux）
  - 新增 `setup/install.sh`、`setup/verify.sh` 原生 Bash 脚本
  - `seep_mcp_server.py` 自动探测系统 `radare2` / `rabin2` 与各平台 JDK 路径
  - 手册：[MANUAL/CROSS-PLATFORM.md](MANUAL/CROSS-PLATFORM.md)
- **📖 部署与校验体系**
  - `MANUAL/DEPLOYMENT.md` 全景部署手册（含 4 大 Agent 接入 SOP 与排障 FAQ）
  - `MANUAL/DEPLOYMENT-CHECKLIST.md` 官方基准核验清单（单一真值源）
  - `verify.ps1 -Detailed` 输出结构化基准校对看板
- **📦 案例库扩充至 14 个**（项目 A ~ 项目 N）
  - 新增 项目M（Java + install4j 双层鉴权）、项目N（.NET x64 + VM 混淆加固）

### 变更

- **⚙️ 安装脚本重构为幂等 + 无损模式**
  - `install-pi.ps1` 改为**增量合并** `mcp.json` / `settings.json`，不再覆盖用户自定义 MCP
  - 所有 JSON 配置统一以 **UTF-8 无 BOM** 写入，修复 Node.js `JSON.parse` 报错
  - 路径统一转为正斜杠，修复 Windows 反斜杠导致的 JSON 非法转义
- **🛡️ 安全审计扩展双加固**（`security-audit-interceptor.ts`）
  - 新增 25 项 `INJECTED_PREFIXES` 上下文守卫：Agent 自注入的环境 / AGENTS.md / 技能清单**不再被误改写**
  - 顺序 `replace` 改为**单趟最长优先匹配**：算法保证「绕过会员」优先于「绕过」，且替换产物不回扫（杜绝级联污染）
- **🔍 IDA Pro 探测强化**（`install-ida.ps1`）
  - 支持 `-IdaRoot` 参数、注册表探测、交互式输入自定义路径
  - 支持 IDA 9.x 原生 `idalib_supervisor` 模块模式
- **🔗 上游镜像归位**
  - `apk-reverse`、`open-tgtylab`、`open-reverselab` 三大开源项目完整镜像至 `Tool/upstream/`
- **⚖️ 许可证更正为 GPL-3.0**
  - 因整合了两个 GPL-3.0 上游项目，整体许可证由 MIT 更正为 **GNU GPL-3.0**

### 修复

- 修复 Windows PowerShell 5.1 下 `Set-Content -Encoding UTF8` 写入 BOM 导致 Node.js JSON 解析崩溃
- 修复 Windows 路径反斜杠未转义导致的 `Bad escaped character in JSON`
- 修复 `install-pi.ps1` 全量覆盖导致用户自定义 MCP（如 x64dbg）被抹除
- 修复 IDA 路径写死 `D:\Tool\IDA Pro`、非标准安装位置无法识别
- 修复 Bash 脚本 CRLF 换行污染导致的 `bad interpreter` 报错（13 个脚本）
- 修复 70 个 PowerShell 脚本缺失 UTF-8 BOM 导致的中文乱码与语法解析中断

### 安全

- **清理个人隐私与凭据残留**（发布前强制门禁）
  - 移除全部个人绝对路径、个人身份标识、私有中转站域名
  - 移除案例中残留的真实产品名 / 厂商域名 / **真实加密 Salt**
  - 含本机路径的生成物（`opencode.jsonc`、`cordis.generated.yml`）不再入库
  - 中继运行配置 `relay-config.json`（含访问 token）纳入 `.gitignore`

---

## [1.3.0] — 2026-09-28

### 新增

- 案例库扩充至 13 个（新增 项目L Qt5 C++、项目M Java + install4j）
- `seep_r2_xrefs` 工具：交叉引用查询，内置分页与统计摘要
- 上下文预算控制：`seep_r2_decompile` 支持 `fold`（省 ~60% Token）/ `summary`（省 ~90%）

### 变更

- `MANUAL/` 战术手册扩充至 6 份

---

## [1.2.0] — 2026-09-26

### 新增

- `MANUAL/ANTI-DEBUG.md`：反调试绕过字典与代理 DLL 框架
- `MANUAL/UNPACKING.md`：UPX / MPRESS / Themida / VMP 脱壳 SOP
- `MANUAL/POC-VALIDATION.md`：Frida 自愈循环与 PoC 沙箱验证

### 变更

- `verify.ps1` 升级为 7 大维度体检

---

## [1.1.0] — 2026-09-25

### 新增

- `check.bat` / `check.ps1` 根目录一键体检入口
- `setup/verify.ps1 -Detailed` 结构化基准校对看板
- 部署完备性校验体系（7 大维度）

---

## [1.0.0] — 2026-09-24

### 新增

- 首个公开版本
- 9 大逆向 Skill（`softseep` 总控 + `apkseep` + `ida-reverse` + `safe-skills` 5 组）
- 自研 `seep` MCP 服务（23 项原生工具）
- 289+ 篇攻防知识库
- 9 个脱敏工业案例范式（项目 A ~ 项目 I）
- Lab Mode 磁盘状态机与三层防拒体系

---

## 更新类型说明

| 变更类型 | 含义 | 用户需要做什么 |
|---|---|---|
| **新增** | 新功能、新工具、新案例 | 跑一次更新脚本即可 |
| **变更** | 行为或接口调整 | 建议读一下具体条目 |
| **修复** | 缺陷修复 | 跑一次更新脚本即可 |
| **安全** | 安全或隐私相关 | **强烈建议立即更新** |

> **兼容性承诺**：本工作台的用户自有数据（`models.json`、`auth.json`、自定义 MCP 条目、
> `lab-mode.flag`）在更新过程中**永不被覆盖**。若某次更新需要用户手工干预，
> 会在对应条目中显式标注「**需要手工操作**」。
