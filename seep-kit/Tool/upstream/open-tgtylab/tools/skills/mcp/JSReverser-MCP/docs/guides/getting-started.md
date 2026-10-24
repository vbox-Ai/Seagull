# 快速开始

这份指南给第一次接触 `JSReverser-MCP` 的用户使用，目标是在 3 分钟内把服务跑起来。

## 1. 安装依赖并构建

```bash
npm install
npm run build
```

构建完成后入口文件为：

```bash
build/src/index.js
```

## 2. 最简单启动方式

如果你只是想先确认 MCP 服务可以工作，可以直接启动：

```bash
npm run start
```

这种方式适合：

- 先验证 MCP 服务能不能正常启动
- 先熟悉工具列表
- 暂时不需要复用已登录浏览器

如果你想先做静态自检，可以直接运行：

```bash
node build/src/index.js --doctor
```

或在 MCP 里先调用：

- `diagnose_environment`

## 3. 选择浏览器连接方式

常见有两种：

- 方式 A：让 MCP 自己管理浏览器
  - 最简单，适合首次试用
- 方式 B：接管你已经打开的 Chrome
  - 适合需要复用登录态、验证码、人机校验场景

如果你想接管已打开的浏览器，请看：

- `docs/guides/browser-connection.md`

## 4. 配置客户端

按你使用的客户端继续看：

- `docs/guides/client-configuration.md`

## 5. 建议的第一条验证命令

建议按下面顺序验证，而不是一上来就直接抓脚本或断点：

1. `diagnose_environment` 或 `node build/src/index.js --doctor`
2. `check_browser_health`
3. `start_reverse_task`
4. `list_pages`
5. `network_request`
6. `list_scripts`

如果上面这组都正常，说明：

- 启动环境没明显问题
- 浏览器链路已经通
- 页面上下文可控
- 可以开始进入 Observe 阶段

建议在进入正式 Observe 前先初始化一次任务：

- `start_reverse_task`
- 如果你已经从 `network_request action=get` 锁定了目标请求，也可以直接用 `create_reverse_task_from_request` 起手，减少手工填写 targetContext
- **默认就用 `manage_reverse_task`**，除初始化外，task 的查询、摘要、自动推进、状态更新、timeline 追加、archive / restore / search / tag / prune / compare 全部统一走它
- 如果你想减少 tool 选择开销，可优先用 `manage_reverse_task`
- 如果你是给大模型 / agent 接入，建议优先使用 `outputMode="compact"`，并先校验返回里的 `schemaVersion: "1.0"`
  - `action: "list"`：列任务
  - `action: "get"`：看 task 快照
  - `action: "summarize"`：看摘要
  - `action: "progress"`：自动推进
  - `action: "update"`：更新状态
  - `action: "timeline"`：追加时间线
  - `action: "search" / "tag"`：检索或标记任务
  - `action: "archive" / "restore" / "prune"`：做任务归档与清理
  - `action: "compare"`：对比两个任务的证据和链路差异
- 如果你想先拿到一组主步骤，再决定是否执行，用 `orchestrate_reverse_task`；要直接执行就传 `execute=true`，需要摘要再加 `includeSummary=true`，建议保留 `persistState=true`，中断后用 `resume=true` 续跑。现在失败返回里会带 recovery 建议，也支持 `skipSteps` / `fromStep` / `onlySteps` 做步骤级控制，还支持 `strategy` 快速切到 `observe-first` / `rebuild-first` / `env-fix` / `artifact-sync` / `evidence-only`
- 如果你已经要走“定位函数 -> 最小切片 -> understand/deobfuscate -> PureExtraction 草稿”整条链，直接用 `run_reverse_agent`
  - `goalMode=signature-only`：只推进到 `function-slice.json`
  - `goalMode=pure-draft`：默认，生成 PureExtraction 草稿
  - `goalMode=port-ready`：生成更适合 port 的返回契约草稿
  - `autoExportPortable=true`：配合 `goalMode=port-ready` 时，完成后直接自动导出 `run/portable.js`
- 如果你暂时不想走 MCP，也可以直接用本仓库构建产物跑统一 CLI：
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --manageReverseTask list`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --manageReverseTask get --taskId <taskId>`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --manageReverseTask summarize --taskId <taskId>`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --manageReverseTask progress --taskId <taskId>`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --manageReverseTask search --query sign --tag jd`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --manageReverseTask archive --taskId <taskId>`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --orchestrateReverseTask <taskId>`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --orchestrateReverseTask <taskId> --execute --resume`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --orchestrateReverseTask <taskId> --strategy env-fix`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --orchestrateReverseTask <taskId> --execute --stopOnError=false`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --orchestrateReverseTask <taskId> --execute --executionOverrides '{"inject_hook":{"status":"ok","result":"done"}}'`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --runReverseAgent <taskId>`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --runReverseAgent <taskId> --goalMode signature-only`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --runReverseAgent <taskId> --maxRounds 4 --outputMode compact`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --runReverseAgent <taskId> --goalMode port-ready --outputMode compact`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --runReverseAgent <taskId> --goalMode port-ready --autoExportPortable`
- `run_reverse_agent` 进入 `PureExtraction` 后，会自动落：
  - `run/fixtures.json`
  - `run/pure-main.js`
  - `run/pure-selftest.test.mjs`
- 如果你要把分析态产物压成便携交付文件，直接用 `export_portable_bundle`
  - `artifactMode=portable`：同时导出 `run/portable.js` 和 `env/replay.js`
  - `artifactMode=pure`：只导出 `run/portable.js`
  - `artifactMode=rebuild`：只导出 `env/replay.js`
- CLI 例子：
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --exportPortableBundle <taskId>`
  - `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --exportPortableBundle <taskId> --artifactMode pure`
- 编排 checkpoint、`orchestration-checkpoint.json` 结构，以及它和 `codex --resume` 的区别见 [docs/guides/reverse-task-orchestration.md](./reverse-task-orchestration.md)
- 如果你是给大模型 / agent 接 MCP，先看一页版速查：[docs/guides/mcp-agent-quick-reference.md](./mcp-agent-quick-reference.md)
- 如果你要自己写 Node.js / TypeScript client 自动续跑，可直接抄：[docs/guides/mcp-client-auto-resume-example.md](./mcp-client-auto-resume-example.md)
- 如果你要按 machine-readable 契约做消费，可再配合 `docs/reference/*response.schema.json` 和 `docs/reference/reverse-agent-schema-versioning.md` 一起看
- `record_reverse_evidence` 用来把 hook / network / script 观察正式写回 artifact；它不负责编排，但会影响后续 summarize / progress / orchestration 的判断。现在 `summarize` / `get` 还会返回 `evidenceAggregates`，方便快速看 top URLs、top functions 和 blockers；补环境前还可以直接调用 `get_rebuild_health_report`

## 6. 可选：查看内置参数蓝图库

如果你希望按参数流程来使用 MCP，而不是手动组织工具顺序，可以直接查看内置 workflow：

```bash
node build/src/index.js --list-parameter-workflows
node build/src/index.js --show-parameter-workflow jd-h5st
```

公开知识库存放在：

- `docs/knowledge/parameter-blueprints/`

贡献方式可看：

- `docs/guides/parameter-workflow-contribution.md`

任务证据默认写到当前源码仓库的 `artifacts/tasks`。如果要改位置，设置：

```bash
export JSREVERSER_ARTIFACTS_DIR=/your/path/artifacts/tasks
```

## 7. 可选：配置外部 AI 分析能力

如果你要使用 `understand_code`，或者希望 `deobfuscate_code` / `detect_crypto` 拿到更强的 AI 辅助结果，优先在 MCP server 配置里通过 `env` 传入环境变量。

例如在支持 `env` 的 MCP 客户端里，传入：

```toml
[mcp_servers.jsreverser-mcp.env]
DEFAULT_LLM_PROVIDER = "gemini"
GEMINI_API_KEY = "your_key"
GEMINI_MODEL = "gemini-2.0-flash-exp"
```

如果你是直接在项目目录本地运行 `npm run start` 或 `node build/src/index.js`，再使用 `.env`：

```bash
DEFAULT_LLM_PROVIDER=gemini

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# Anthropic / Claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash-exp
GEMINI_CLI_PATH=gemini-cli
```

使用建议：

- 只想跑核心逆向链路，不配也可以
- 要用 `understand_code`，建议先配一个 provider
- `detect_crypto` 只有在传 `useAI=true` 时才会启用 AI 增强
- `gemini` 没有 `GEMINI_API_KEY` 时，会尝试走本地 CLI
- 现在相关工具响应里会额外给出 `aiRuntime`，告诉你当前是 provider 模式、CLI fallback，还是配置缺失
