# JS Reverse MCP

[English README](README.en.md)

一个把前端 JavaScript 逆向流程标准化的 MCP 服务。  
目标不是只做页面调试，而是把页面观察、运行时采样、本地复现、补环境和证据沉淀串成一套可复用工作流。

## 核心方法论

本项目默认遵循以下方法论：

- `Observe-first`
- `Hook-preferred`
- `Breakpoint-last`
- `Rebuild-oriented`
- `Evidence-first`
- `Pure-extraction-after-pass`

这意味着：

1. 先在浏览器里确认请求、脚本、函数和依赖来源
2. 再做最小化 Hook 采样
3. 再导出 local rebuild
4. 再在 Node 里逐项补环境
5. 每一步都沉淀为 task artifact，而不是只留在对话里

## 已沉淀链路

以下参数链路已有公开索引，可作为仓库内复用入口：

- 某东 `h5st` 参数
  - 索引：[scripts/cases/README.md](scripts/cases/README.md)
  - Case：[scripts/cases/jd-h5st-pure-node.mjs](scripts/cases/jd-h5st-pure-node.mjs)

- 某手 `falcon` 风控参数
  - 索引：[scripts/cases/README.md](scripts/cases/README.md)
  - Case：[scripts/cases/ks-hxfalcon-pure-node.mjs](scripts/cases/ks-hxfalcon-pure-node.mjs)

- 某音 `a-bogus` 参数
  - 索引：[scripts/cases/README.md](scripts/cases/README.md)
  - Case：[scripts/cases/douyin-a-bogus-pure-node.mjs](scripts/cases/douyin-a-bogus-pure-node.mjs)

说明：

- README 首页只展示脱敏后的参数类型和公开入口
- 真实 `artifacts/tasks/<task-id>/` 默认视为本地私有任务目录
- Git 默认只提交 `artifacts/tasks/_TEMPLATE/`

### 参数蓝图库

公开参数方法已沉淀到 [docs/knowledge/parameter-blueprints/](docs/knowledge/parameter-blueprints/)，用于替代旧的可运行 case 入口。查看和贡献方式：

```bash
node build/src/index.js --list-parameter-workflows
node build/src/index.js --show-parameter-workflow jd-h5st
node build/src/index.js --export-parameter-workflow-template
node build/src/index.js --validate-parameter-workflow docs/knowledge/parameter-blueprints/jd-h5st
```

贡献规范见 [docs/guides/parameter-workflow-contribution.md](docs/guides/parameter-workflow-contribution.md)。

## 支持的能力

### 页面观察与脚本定位

先回答“页面里有哪些脚本、目标代码大概在哪”。

- `list_scripts`：列出当前页面已加载的脚本，先建立脚本范围。
- `get_script_source`：查看指定脚本源码，适合继续阅读具体实现。
- `find_in_script`：在单个脚本里定位字符串、变量名或特征片段。
- `search_in_scripts`：在已采集脚本缓存中批量搜索，适合缩小候选脚本范围。

### Hook 与运行时采样

先做最小侵入式观测，确认运行时到底调用了什么。

- `create_hook`：创建可复用的 hook 定义，用于后续注入页面。
- `inject_hook`：把已有 hook 注入当前页面，开始采样目标行为。
- `get_hook_data`：读取 hook 采集到的调用记录和摘要结果。
- `hook_function`：直接 hook 全局函数或对象方法，记录参数和返回值。
- `trace_function`：按源码函数名做调用追踪，适合跟调用链。

### 断点与调试控制

当 hook 不够时，再进入暂停式调试。

- `set_breakpoint`：按脚本 URL 和行号设置断点。
- `set_breakpoint_on_text`：按代码文本自动定位并设置断点。
- `resume`：继续执行到下一个断点或执行结束。
- `pause`：手动暂停当前页面的 JavaScript 执行。
- `step_over` / `step_into` / `step_out`：单步控制执行路径，分别对应跳过、进入、跳出函数。

### 请求链路与网络分析

定位目标请求，确认是谁发起、带了什么参数。

- `list_network_requests`：列出当前页面的网络请求，先找到目标请求。
- `get_network_request`：查看单个请求的详细内容，包括请求头、响应和载荷。
- `get_request_initiator`：追溯某个请求是谁触发的，帮助定位调用链。
- `break_on_xhr`：在目标请求发出时中断，适合抓参数生成前的现场。

### 页面状态与运行前检查

补看页面运行状态、控制台输出和本地状态依赖。

- `check_browser_health`：检查浏览器连接和当前页是否可控，适合作为起手验证。
- `diagnose_environment`：输出 Node、浏览器、路径和依赖状态，适合第一次启动建议和故障排查。
- `recommend_next_step`：根据当前证据推荐下一步动作。
- `explain_reverse_stage`：解释当前逆向阶段、输入要求和退出条件。
- `list_console_messages`：查看当前页面 console 输出，适合回看 hook 和 trace 日志。
- `get_storage`：读取 cookie、`localStorage`、`sessionStorage`，确认状态依赖。
- `evaluate_script`：在当前选中 frame 内执行一段函数，做小范围运行时验证。
- `search_in_sources`：在所有已加载源码中搜索关键字，快速缩小可疑代码范围。

### WebSocket 观察与消息分组

处理长连接、直播流或二进制帧时，用这组工具先分流再细看。

- `list_websocket_connections`：列出当前页面的 WebSocket 连接，先拿到目标 `wsid`。
- `analyze_websocket_messages`：按帧特征做消息分组，适合先识别不同消息类型。
- `get_websocket_messages`：查看某个连接或某个分组下的消息摘要和内容。

### 本地复现与补环境

把页面证据带回本地，逐步补齐 Node 运行环境。

- `export_rebuild_bundle`：导出本地复现工程所需的入口、补环境和证据材料。
- `diff_env_requirements`：根据报错和观测能力比对当前缺失的环境能力。
- `record_reverse_evidence`：把关键观察结果写入 task artifact，避免证据只留在对话里。

### 页面自动化

做最小必要的页面操作，复现触发条件并辅助取证。

- `navigate_page`：跳转、回退、刷新当前页面。
- `query_dom`：查询页面元素，确认选择器和节点状态。
- `click_element`：按选择器触发点击，复现页面动作。
- `hover_element` / `select_option`：处理菜单悬停和原生下拉框选择。
- `type_text`：向输入框写入文本，驱动表单交互。
- `press_key` / `upload_file`：补齐键盘提交和文件上传场景。
- `scroll_page` / `wait_for_network_idle`：稳定触发懒加载和请求结束后的取证。
- `set_viewport` / `emulate_device`：复现移动端或特定视口下的签名链路。
- `get_all_links`：快速盘点页面链接，辅助发现跳转入口。
- `take_screenshot`：截取页面当前状态，保留可视化证据。

### 深度分析

在拿到代码和运行时证据后，继续做结构理解与去混淆。

- `collect_code`：采集页面代码，支持按优先级或范围控制采样量。
- `understand_code`：结合静态分析和 AI 做代码结构、业务逻辑与风险理解。
- `deobfuscate_code`：对混淆代码做清理、还原和辅助分析。
- `risk_panel`：聚合代码分析、加密检测和 hook 信号，输出综合风险视图。

### 会话与登录态复用

- `save_session_state`：保存当前页面的 cookie 和存储状态到内存快照。
- `restore_session_state`：把快照恢复到当前页面，复用登录态和现场。
- `dump_session_state`：把会话快照导出为 JSON 文件，便于持久化。
- `load_session_state`：从已有 JSON 或字符串重新载入会话快照。

### 逆向任务编排与 Agent 消费

- `start_reverse_task` / `create_reverse_task_from_request`：从目标、请求或页面证据创建 task artifact，供后续 summarize / progress / orchestration 复用。
- `manage_reverse_task`：默认入口就是 `manage_reverse_task`，支持 `get / summarize` 以及 `archive / restore / search / tag / prune / compare`。
- `orchestrate_reverse_task`：按阶段推进观察、采样、重建、验证和提纯，输出 `recommendedStrategy`、`agentGuidance`、`fallbackPlan` 和 `skipSteps`。
- `run_reverse_agent`：提供面向 agent 的一站式任务运行入口。
- `query_reverse_task`：读取 compact 摘要、下一步建议、`outputMode`、`artifacts`、`patchSuggestions`、`evidenceAggregates` 和可续跑 payload。
- `get_rebuild_health_report`：汇总 local rebuild 健康状态，辅助 env-fix。
- `export_rebuild_bundle` 支持 portable bundle / replay bundle 导出，便于把 `env-pass` 结果交给后续纯算法提取。

CLI cheatsheet：

```bash
node build/src/index.js --doctor
node build/src/index.js --manageReverseTask list
node build/src/index.js --manageReverseTask get --taskId <taskId>
node build/src/index.js --manageReverseTask summarize --taskId <taskId>
node build/src/index.js --manageReverseTask progress --taskId <taskId>
node build/src/index.js --manageReverseTask search --query sign --tag jd
node build/src/index.js --manageReverseTask compare --taskId <taskId> --otherTaskId <otherTaskId>
node build/src/index.js --orchestrateReverseTask <taskId>
node build/src/index.js --orchestrateReverseTask <taskId> --execute --resume
node build/src/index.js --orchestrateReverseTask <taskId> --strategy env-fix
node build/src/index.js --orchestrateReverseTask <taskId> --executionOverrides '{"resume":true}'
node build/src/index.js --runReverseAgent <taskId>
```

更多细节见：

- [docs/guides/reverse-task-orchestration.md](docs/guides/reverse-task-orchestration.md)
- [docs/guides/mcp-agent-quick-reference.md](docs/guides/mcp-agent-quick-reference.md)
- [docs/guides/mcp-client-auto-resume-example.md](docs/guides/mcp-client-auto-resume-example.md)
- [docs/reference/reverse-agent-response.schema.json](docs/reference/reverse-agent-response.schema.json)
- [docs/reference/reverse-agent-schema-versioning.md](docs/reference/reverse-agent-schema-versioning.md)

完整参数说明见 [docs/reference/tool-reference.md](docs/reference/tool-reference.md)。
按逆向流程选工具可继续看 [docs/reference/reverse-workflow.md](docs/reference/reverse-workflow.md)。

### 外部 AI 怎么配置

这个项目支持把外部 LLM 作为“分析增强层”接进来，当前支持：

- `openai`
- `anthropic`
- `gemini`

配置入口本质上是进程环境变量。  
通过 MCP 客户端启动时，优先在 MCP server 配置里的 `env` 传入；`.env` 只适合你直接本地运行 `node build/src/index.js` 或 `npm run start` 的场景。

推荐方式示例：

```toml
[mcp_servers.js-reverse]
command = "node"
args = ["/ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js"]

[mcp_servers.js-reverse.env]
DEFAULT_LLM_PROVIDER = "anthropic"
ANTHROPIC_API_KEY = "your_key"
ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022"
```

如果你是直接在项目目录本地启动，也可以使用 `.env`：

```bash
# 三选一：openai / anthropic / gemini
DEFAULT_LLM_PROVIDER=gemini

# OpenAI
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o
OPENAI_BASE_URL=

# Anthropic / Claude
ANTHROPIC_API_KEY=your_key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_BASE_URL=

# Gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.0-flash-exp

# 如果不用 API，也可以走本地 CLI
GEMINI_CLI_PATH=gemini-cli
```

说明：

- `DEFAULT_LLM_PROVIDER` 决定默认走哪个 provider
- `gemini` 支持两种模式：有 `GEMINI_API_KEY` 时走 API；没有时会尝试走 `GEMINI_CLI_PATH`
- `openai` 和 `anthropic` 需要对应 API key
- 如果你配了多个 provider，实际使用哪个，仍由 `DEFAULT_LLM_PROVIDER` 决定

### 哪些功能依赖外部 AI

强依赖外部 AI 的功能：

- `understand_code`
  - 内部会调用 LLM 做代码语义理解、业务逻辑提取、安全风险补充

可选启用外部 AI 的功能：

- `detect_crypto`
  - 只有传 `useAI=true` 时才会额外调用 LLM；不传时主要依赖本地规则和 AST 分析
- `analyze_target`
  - 传 `useAI=true` 时会在一站式分析里启用更深的 AI 辅助分析
- `risk_panel`
  - 参数里有 `useAI`，但当前实现主体仍以本地分析结果聚合为主

有 AI 时效果更好，但不配也能运行的功能：

- `deobfuscate_code`
  - 本地规则、AST 优化、专项反混淆管线始终可用；配置外部 AI 后，复杂语义清理、VM 结构理解、部分编码型混淆降级分析会更完整

完全不依赖外部 AI 的功能：

- 浏览器接管
- Hook / 断点 / Console / Storage / Network / WebSocket
- `collect_code`
- `export_rebuild_bundle`
- `diff_env_requirements`
- `record_reverse_evidence`

如果没配外部 AI，典型影响是：

- `understand_code` 会先返回本地静态分析结果，并在 `aiRuntime` 里提示 provider / CLI fallback 状态
- `detect_crypto(useAI=true)` 会退回本地分析或忽略 AI 增强
- `deobfuscate_code` 仍可跑，但某些高难度混淆的解释和清理质量会下降

## 标准任务结构

任务目录统一使用：

- `artifacts/tasks/_TEMPLATE/`
- `artifacts/tasks/<task-id>/`

推荐目录结构：

- `task.json`
- `runtime-evidence.jsonl`
- `network.jsonl`
- `scripts.jsonl`
- `env/env.js`
- `env/polyfills.js`
- `env/entry.js`
- `env/capture.json`
- `run/`
- `report.md`

职责边界：

- `env.js`
  - 基础宿主对象和最小 shim
- `polyfills.js`
  - 代理诊断层、`watch`、`safeFunction`、`makeFunction`
- `entry.js`
  - 运行入口、目标脚本加载、first divergence 输出

## 标准执行流程

推荐流程：

1. 页面观察
2. 运行时采样
3. 证据入库
4. local rebuild
5. 逐项补环境
6. first divergence 定位
7. `env-pass` 后再进入纯算法 / 风控逻辑提纯

默认原则：

- 不要跳过页面证据直接猜环境
- 不要一次性全量模拟浏览器
- 不要把真实任务目录直接提交 Git

## 参数沉淀与安全边界

参数链路沉淀遵循以下规则：

1. 先读本地 task artifact

- `artifacts/tasks/<task-id>/`

2. 本地没有时再读抽象 case

- `scripts/cases/*`

3. 仍不足时按模板新建

- `docs/reference/parameter-methodology-template.md`
- `docs/reference/parameter-site-mapping-template.md`

安全边界：

- case 只保留抽象方法和流程
- 真实任务目录默认本地保留
- 敏感值必须脱敏后才允许共享
- Git 默认只提交 `_TEMPLATE`

详见：

- [docs/reference/case-safety-policy.md](docs/reference/case-safety-policy.md)
- [docs/reference/reverse-artifacts.md](docs/reference/reverse-artifacts.md)
- [docs/reference/env-patching.md](docs/reference/env-patching.md)

## 第一次启动建议

先运行 `npm ci` 和 `npm run build`，再用 `node build/src/index.js --doctor` 检查本地 Node、浏览器连接、路径和外部 AI 配置。

## 工具暴露模式

默认启动使用 `--toolProfile kernel`。
该模式只暴露 35 个自动化优先工具，用来减少 MCP tool list 占用的 token，同时保留任务编排、请求追踪、代码定位、诊断和产物导出入口。
这不是缺工具，而是默认把低频手工调试工具隐藏起来。

需要更宽的常用工作流工具时，使用 `--toolProfile compact`。
`compact` 会暴露 63 个高频工具，适合需要手动页面操作、Hook、截图和环境微调的场景。

需要全量工具时，使用 `--toolProfile full`。
`full` 会暴露全部 110 个工具，包括暂停、单步、断点、WebSocket 细节和 DOM 细调工具。
深度人工调试、精确断点排查、WebSocket 消息深挖时再切换到 `full`。

```bash
node build/src/index.js --toolProfile full
```

成功响应默认使用 `--traceOutput errors`，只在错误响应中携带 `traceId`。
需要每次成功响应也携带 `traceId` 时，使用 `--traceOutput all`。

## 3 分钟快速开始

### 1) 安装依赖并构建

```bash
npm ci
npm run build
```

构建入口：

```bash
build/src/index.js
```

### 2) 最简单启动方式

```bash
npm run start
```

### 3) 配置客户端

最小配置示例：

#### Claude Code

```bash
claude mcp add js-reverse node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js
```

#### Cursor

- Command: `node`
- Args: `[/ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js]`

#### Codex

```toml
[mcp_servers.js-reverse]
command = "node"
args = ["/ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js"]
```

如果你需要接管已经打开的浏览器，请继续看：

- [docs/guides/browser-connection.md](docs/guides/browser-connection.md)
- [docs/guides/client-configuration.md](docs/guides/client-configuration.md)

完整可直接复制的 MCP 配置实例，包括：

- `mcpServers` JSON 结构示例
- Codex `config.toml` 示例
- `--browserUrl` 接管浏览器示例
- Gemini / Claude / OpenAI 的 API `env` 示例

都放在 [docs/guides/client-configuration.md](docs/guides/client-configuration.md)。

## 文档入口

逆向相关任务开场先读：`docs/reference/reverse-bootstrap.md`。
该入口会继续要求模型读取 `docs/reference/case-safety-policy.md`、`docs/reference/reverse-workflow.md`。
若已进入 `env-pass` 后的提纯阶段，再读 `docs/reference/pure-extraction.md`。

### Guides

- 快速开始：[docs/guides/getting-started.md](docs/guides/getting-started.md)
- 浏览器连接：[docs/guides/browser-connection.md](docs/guides/browser-connection.md)
- 客户端配置：[docs/guides/client-configuration.md](docs/guides/client-configuration.md)
- 逆向工作流：[docs/reference/reverse-workflow.md](docs/reference/reverse-workflow.md)
- 补环境规范：[docs/reference/env-patching.md](docs/reference/env-patching.md)

### Reference

- 模型首读入口：[docs/reference/reverse-bootstrap.md](docs/reference/reverse-bootstrap.md)
- 逆向任务索引：[docs/reference/reverse-task-index.md](docs/reference/reverse-task-index.md)
- 工具参数总表：[docs/reference/tool-reference.md](docs/reference/tool-reference.md)
- 工具读写契约：[docs/reference/tool-io-contract.md](docs/reference/tool-io-contract.md)
- 任务产物说明：[docs/reference/reverse-artifacts.md](docs/reference/reverse-artifacts.md)

### Templates And Supporting Docs

- [docs/reference/reverse-update-prompt-template.md](docs/reference/reverse-update-prompt-template.md)
- [docs/reference/reverse-report-template.md](docs/reference/reverse-report-template.md)
- [docs/reference/algorithm-upgrade-template.md](docs/reference/algorithm-upgrade-template.md)
- [docs/reference/parameter-methodology-template.md](docs/reference/parameter-methodology-template.md)
- [docs/reference/parameter-site-mapping-template.md](docs/reference/parameter-site-mapping-template.md)

## 开发与测试

```bash
npm run build
npm run test:unit
npm run test:property
npm run coverage:full
```

## 故障排查

更多问题排查请看：

- [docs/guides/browser-connection.md](docs/guides/browser-connection.md)
- [docs/guides/client-configuration.md](docs/guides/client-configuration.md)
- [docs/guides/troubleshooting.md](docs/guides/troubleshooting.md)

## 参考项目

本项目在设计和实现过程中参考了以下项目，具体协议声明（如 MIT 等）以对应上游仓库为准：

- https://github.com/wuji66dde/jshook-skill
- https://github.com/zhizhuodemao/js-reverse-mcp
- https://github.com/ChromeDevTools/chrome-devtools-mcp

## License

Apache-2.0
