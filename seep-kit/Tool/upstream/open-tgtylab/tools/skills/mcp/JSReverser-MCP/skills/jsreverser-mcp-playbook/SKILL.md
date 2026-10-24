---
name: jsreverser-mcp-playbook
description: 在使用 MCP 做前端 JavaScript 逆向时使用，适用于签名链路定位、页面观察取证、本地补环境复现、VMP 类插桩分析、AST 去混淆与证据化输出。
---

# MCP 前端 JS 逆向作业规范

> 定位说明：
>
> - `skills/jsreverser-mcp-playbook/references/*` 是 **AI 快速执行版**，用于任务中按需快速读取。
> - `docs/reference/*` 是 **正式权威版**，适合源码或已打包安装场景与仓库外部查阅。
> - 如果两者表述出现差异，**以 `docs/reference/*` 为准**。

## 核心原则

- `Observe-first`
- `Hook-preferred`
- `Breakpoint-last`
- `Rebuild-oriented`
- `Evidence-first`
- `Task-driven`

先页面观察，再最小化采样，再做本地补环境，不要跳过取证直接猜环境。

## 目标场景

默认主场景是：

1. 定位接口签名、加密参数、关键请求字段
2. 在页面里确认哪个请求、哪个脚本、哪个函数参与参数生成
3. 导出本地复现材料
4. 在 Node 里按“代理 env log + first divergence + 最小因果单元”补环境跑通
5. 跑通后再做 AST 去混淆、VMP 插桩或逻辑提纯

## 五阶段工作流

### 1. Observe

目标：

- 先确认目标请求、相关脚本、候选函数，不猜环境。

默认入口：

- `docs/reference/reverse-bootstrap.md`
- `references/automation-entry.md`
- `references/mcp-task-template.md`

必须产出：

- 目标请求
- initiator 线索
- 可疑脚本 URL / scriptId
- 初始 task artifact

### 2. Capture

目标：

- 对目标请求做最小侵入采样，拿到参数样例、调用顺序、运行时证据。

规则：

- 优先 fetch/xhr hook
- 如果目标发生在首屏初始化、首个请求前参数装配、页面首次执行阶段，先用 `inject_preload_script` 挂早期采样或补环境脚本
- 命中后先看 summary，再按需看 raw
- Hook 不足时再考虑断点

### 3. Rebuild

目标：

- 把页面证据导出为本地可迭代的 Node 复现工程。

参考：

- `references/local-rebuild.md`
- `references/task-artifacts.md`
- 正式规范：`docs/reference/reverse-workflow.md`

规则：

- 本地补环境必须以页面观测证据为依据
- 不允许空想式补 `window/document/navigator/crypto/storage`

### 4. Patch

目标：

- 按代理日志和 `first divergence` 驱动补环境，直到本地脚本能稳定跑出目标参数。

规则：

- 先读代理 env log，再记录当前 `first divergence`
- 一次只做一个补丁决策，不是机械地一次只改一个属性
- 一个补丁决策对应一个最小因果单元：值 / 函数壳 / 返回对象 / 最小对象契约
- `diff_env_requirements` 仅作辅助，不替代代理日志
- 每次补丁后立即复测，并记录 `first divergence` 是否前移
- 每次补丁都写入 task artifact
- 快速执行版看 `references/env-patching.md`，正式规范以 `docs/reference/env-patching.md` 为准

### 5. DeepDive

目标：

- 本地跑通后，再做去混淆、VMP、控制流还原、业务逻辑提纯。

规则：

- 如果当前任务只是出签名，这一阶段可以降级
- 如果要长期复用算法链路，这一阶段必须做
- 进入纯算法提纯阶段时，优先读取 `docs/reference/pure-extraction.md`

## 场景路由

### Task-driven 工具路由

当 MCP 已暴露 reverse task 工作流工具时，默认优先按下面顺序选工具，而不是先读参数 workflow 文档：

1. **新建任务**
   - `start_reverse_task`
2. **查状态 / 摘要 / timeline / compare / tag / update**
   - `manage_reverse_task`
3. **自动决定下一步并连续推进**
   - `orchestrate_reverse_task`
4. **一键跑“定位函数 -> 最小切片 -> pure 草稿 / port-ready 草稿”**
   - `run_reverse_agent`
5. **导出最少交付文件**
   - `export_portable_bundle`
6. **只查看参数蓝图 / 案例 workflow**
   - `get_parameter_workflow`
   - `list_parameter_workflows`
   - `recommend_parameter_workflow`

关键约束：

- `get_parameter_workflow` 只是**蓝图/文档工具**，不是默认执行入口
- 用户真正想“继续逆向任务”时，优先 `manage_reverse_task` / `orchestrate_reverse_task`
- 用户真正想“直接提 pure / port-ready”时，优先 `run_reverse_agent`
- 用户真正想“压缩交付文件数量”时，优先 `export_portable_bundle`

### 常见入口选择

- 用户说“继续这个 task / 看看现在到哪一步了”
  - 先 `manage_reverse_task` with `action="summarize"`
- 用户说“帮我自动推进 / 继续跑”
  - `orchestrate_reverse_task`
- 用户说“直接把 pure 草稿做出来 / 出 port-ready”
  - `run_reverse_agent`
- 用户说“最后只想带最少文件”
  - `export_portable_bundle`

- 新任务开场：
  - 先读 `docs/reference/reverse-bootstrap.md`
  - 再读 `references/automation-entry.md`
- 进入补环境：
  - 先读 `references/env-patching.md`
  - 正式规范以 `docs/reference/env-patching.md` 为准
- 进入本地复现：
  - 先读 `references/local-rebuild.md`
- 进入纯算法提纯：
  - 读 `docs/reference/pure-extraction.md`
- 遇到版本升级 / `first divergence` 漂移：
  - 读 `docs/reference/algorithm-upgrade-template.md`
- 写结论与报告：
  - 先读 `references/output-contract.md`
  - 模板以 `docs/reference/reverse-report-template.md` 与 `docs/reference/reverse-update-prompt-template.md` 为准

## 执行要求

- 所有重要步骤都要写入本地 task artifact
- 如果无法解释为什么调用某个工具，就不要调用
- 输出必须满足 `references/output-contract.md`
- 失败时按照 `references/fallbacks.md` 回退
- 参数默认值按 `references/tool-defaults.md`
- `skills/references/cases/*` 只允许抽象 case（映射/判定口径）
- 站点级可复用流程统一维护在 `scripts/cases/*`，不要把实操工作流写回 `skills/references/cases/*`
- 新增正式文档时遵循仓库分层：规则/模板放 `docs/reference/`，人类教程放 `docs/guides/`，公开参数索引更新 `scripts/cases/README.md`

## 响应读取协议

当调用 `manage_reverse_task` / `orchestrate_reverse_task` / `run_reverse_agent` / `get_rebuild_health_report` 后，优先按这个顺序理解结果：

1. `responseSummary`
2. `outcome / status`
3. `errorType / retryable / blockedBy`
4. `routeGuard`
5. `continuation`
6. `fallbackPlan / agentGuidance / compactDelivery`

执行规则：

- `continuation.ready=true`：优先继续执行 `continuation.invoke`
- `outcome=blocked`：先解决 `blockedBy`，不要硬跑下一跳
- `outcome=partial` 且 `retryable=true`：优先 resume / 续跑
- `shouldSwitchStrategy=true`：优先换 strategy，不要机械重试
- `continuation.ready=false`：停止自动执行
- 如果 `compactDelivery.portablePureReady` / `portableReplayReady` 已就绪，可以直接提示用户导出或使用便携产物

## 外部客户端 system prompt 建议

如果客户端不支持 skill 机制，就把下面这条短提示直接塞进 system prompt：

```text
JSReverser-MCP 默认不是先看 get_parameter_workflow。

优先级：
1. 新任务 -> start_reverse_task
2. 查状态/摘要/更新/timeline -> manage_reverse_task
3. 自动推进 -> orchestrate_reverse_task
4. 一键 pure/port-ready -> run_reverse_agent
5. 最小交付导出 -> export_portable_bundle
6. 只有用户明确要看参数蓝图/案例文档时，才用 get_parameter_workflow

读取结果时：
先看 responseSummary，再看 outcome/status，再看 errorType/blockedBy/retryable，再看 routeGuard，最后看 continuation.invoke。
如果 continuation.ready=true，优先继续执行 continuation.invoke。
```

## 必读引用

- 自动化入口：`references/automation-entry.md`
- 参数默认值：`references/tool-defaults.md`
- 任务输入模板：`references/task-input-template.md`
- MCP 专用任务编排：`references/mcp-task-template.md`
- 任务产物：`references/task-artifacts.md`
- 本地复现：`references/local-rebuild.md`
- 补环境：`references/env-patching.md`、`references/node-env-rebuild.md`
- 插桩：`references/instrumentation.md`
- AST 去混淆：`references/ast-deobfuscation.md`
- 回退：`references/fallbacks.md`
- 输出契约：`references/output-contract.md`
- 案例库：`references/cases/`

## 配套模板

- 更新提示词：`docs/reference/reverse-update-prompt-template.md`
- 报告模板：`docs/reference/reverse-report-template.md`
- 算法升级 / first divergence：`docs/reference/algorithm-upgrade-template.md`
