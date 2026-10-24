# reverse task 自动化编排

这份文档说明 `orchestrate_reverse_task` / `--orchestrateReverseTask` 的职责、执行方式、checkpoint 行为，以及它和 `codex --resume` 的边界。

如果你只想要给大模型看的极简版，先看：

- `docs/guides/mcp-agent-quick-reference.md`

## 适用场景

当你已经有一个 `taskId`，并且希望系统按逆向阶段自动决定下一批步骤时，用它。

它适合：

- 先同步 task 状态，再生成下一批步骤
- 直接串行执行 `manage_reverse_task`、`export_rebuild_bundle`、`diff_env_requirements` 等标准步骤
- 失败后从 checkpoint 续跑，而不是重新手工拼步骤
- 直接消费返回里的 `agentGuidance`，让大模型少自己推断下一步
- 同时读 `routeGuard` / `agentGuidance.toolClass` / `agentGuidance.routeHint`，优先停留在 reverse 主链路

只想查状态时，优先继续用 `manage_reverse_task`。

## 生命周期

一次 orchestration 通常包含 4 个阶段：

1. 读取 task artifact 与最近 evidence
2. 通过 `manage_reverse_task` 同步阶段 / 状态 / 下一步
3. 生成 `plannedSteps`
4. 可选执行 `plannedSteps`，并把结果写回 checkpoint

执行结果会落到 task 目录下的 `orchestration-checkpoint.json`，用于后续 `resume=true` 或 CLI `--resume`。

## `manage_reverse_task` 和 `orchestrate_reverse_task` 的区别

- `manage_reverse_task`：单步 task 管理入口，适合 `list/get/summarize/progress/update/timeline/archive/restore/search/tag/prune/compare`
- `orchestrate_reverse_task`：编排入口，适合“先判断下一步，再批量执行标准步骤”

建议分工：

- 日常查看状态：`manage_reverse_task`
- 想减少 tool 选择、按阶段连续推进：`orchestrate_reverse_task`

## `record_reverse_evidence` 在这套流程里的作用

`record_reverse_evidence` 不是另一个编排器，它的作用是把本轮观察写回 task artifact，避免关键信息只留在对话里。

典型用途：

- 记录 hook / network / script 的关键命中
- 给后续 `manage_reverse_task summarize` / `progress` 提供稳定输入
- 让下次 `orchestrate_reverse_task` 规划时能复用已沉淀证据

可以把它理解成“证据落盘”，而 `orchestrate_reverse_task` 负责“决定下一步并执行”。

## MCP 调用方式

只做规划，不立即执行：

```json
{
  "taskId": "task-001"
}
```

生成步骤并直接执行：

```json
{
  "taskId": "task-001",
  "execute": true,
  "includeSummary": true,
  "persistState": true
}
```

从上次失败步骤续跑：

```json
{
  "taskId": "task-001",
  "execute": true,
  "resume": true
}
```

遇到错误继续跑后续步骤：

```json
{
  "taskId": "task-001",
  "execute": true,
  "stopOnError": false
}
```

只执行指定步骤：

```json
{
  "taskId": "task-001",
  "execute": true,
  "onlySteps": ["understand_code"]
}
```

压缩输出，减少 token：

```json
{
  "taskId": "task-001",
  "outputMode": "compact"
}
```

`compact` 模式下：

- 默认不返回 `summary`
- `suggestedSteps` 只保留最关键字段
- 优先保留 `continuation`，可能裁掉重复的顶层 next-step 字段与 `agentGuidance`
- `detailLevel` 会降到 `minimal`
- 更适合大模型把结果当作“下一步决策输入”

从指定步骤开始：

```json
{
  "taskId": "task-001",
  "execute": true,
  "fromStep": "diff_env_requirements"
}
```

跳过某一步继续跑：

```json
{
  "taskId": "task-001",
  "execute": true,
  "skipSteps": ["export_rebuild_bundle"]
}
```

切换策略模板：

```json
{
  "taskId": "task-001",
  "strategy": "env-fix"
}
```

可选 `strategy`：

- `observe-first`：优先 `manage_reverse_task:get`
- `rebuild-first`：优先 `export_rebuild_bundle`
- `env-fix`：优先 `diff_env_requirements`
- `artifact-sync`：优先补一条 `manage_reverse_task:timeline`
- `evidence-only`：优先 `manage_reverse_task:summarize`

如果你想在补环境前先做一次聚合体检，可以再补一条：

- `get_rebuild_health_report`：直接返回 `currentStage`、`firstDivergence`、`patchSuggestions`、`evidenceAggregates` 和 `recommendedNextAction`
- 这几个 agent-first 工具还会统一返回 `responseSummary` / `diagnostics`，方便模型低 token 判断“这次调用做成了什么、下一轮是否继续”
- 同时也会统一返回 `outcome` / `shouldResume` / `shouldSwitchStrategy` / `nextBestTool` / `nextBestParams`
- 更进一步时，可直接读取统一的 `continuation.ready / continuation.tool / continuation.params / continuation.strategy / continuation.resumeCommand`
- 如果不想自己重新拼 tool 调用，直接取 `continuation.invoke.tool / continuation.invoke.params`
- 如果还想校验参数完整性，可再读 `continuation.invokeHint.requiredParams / optionalParams / example`
- 如果是失败/阻塞路径，还可以直接读 `errorType / retryable / blockedBy / continuation.actionKey / detailLevel`
- 如果想先做工具路由，再执行调用，可优先读 `routeGuard.preferredToolClass / routeGuard.routeHint / routeGuard.avoidTools`

如果执行失败，返回里还可能附带：

- `fallbackPlan`：按失败类型给出一组更稳的备选步骤，例如 env error 时先切到 `diff_env_requirements`

## agent-first JSON 示例

### `manage_reverse_task`：读取任务快照（compact）

请求：

```json
{
  "action": "get",
  "taskId": "task-demo-001",
  "outputMode": "compact"
}
```

典型响应：

```json
{
  "schemaVersion": "1.0",
  "responseSummary": "已返回任务 task-demo-001 的快照。",
  "diagnostics": {
    "responseStatus": "ok",
    "action": "get",
    "outputMode": "compact",
    "taskId": "task-demo-001"
  },
  "outcome": "partial",
  "shouldResume": false,
  "shouldSwitchStrategy": false,
  "detailLevel": "minimal",
  "routeGuard": {
    "preferredToolClass": "task",
    "routeHint": "stay_on_task_flow",
    "avoidTools": ["list_pages"]
  },
  "continuation": {
    "ready": true,
    "reason": "已返回任务 task-demo-001 的上下文快照。",
    "tool": "manage_reverse_task",
    "params": {
      "action": "progress",
      "taskId": "task-demo-001"
    },
    "invoke": {
      "tool": "manage_reverse_task",
      "params": {
        "action": "progress",
        "taskId": "task-demo-001"
      }
    },
    "invokeHint": {
      "requiredParams": ["action", "taskId"],
      "example": {
        "action": "progress",
        "taskId": "task-demo-001"
      }
    },
    "toolClass": "task",
    "routeHint": "stay_on_task_flow",
    "strategy": "observe-first"
  },
  "action": "get",
  "outputMode": "compact",
  "taskId": "task-demo-001",
  "currentStage": "Observe",
  "status": "partial",
  "artifacts": ["task.json"]
}
```

### `orchestrate_reverse_task`：返回下一跳（compact）

请求：

```json
{
  "taskId": "task-demo-001",
  "outputMode": "compact"
}
```

典型响应：

```json
{
  "schemaVersion": "1.0",
  "ok": true,
  "taskId": "task-demo-001",
  "currentStage": "Rebuild",
  "responseSummary": "已生成任务 task-demo-001 的 compact orchestration plan。",
  "diagnostics": {
    "responseStatus": "ok",
    "action": "orchestrate_reverse_task",
    "outputMode": "compact",
    "taskId": "task-demo-001"
  },
  "outcome": "success",
  "shouldResume": false,
  "shouldSwitchStrategy": false,
  "detailLevel": "minimal",
  "routeGuard": {
    "preferredToolClass": "rebuild",
    "routeHint": "switch_to_rebuild",
    "avoidTools": ["search_websocket_messages"]
  },
  "continuation": {
    "ready": true,
    "reason": "已生成 task-demo-001 的下一步编排建议。",
    "tool": "export_rebuild_bundle",
    "params": {
      "taskId": "task-demo-001"
    },
    "invoke": {
      "tool": "export_rebuild_bundle",
      "params": {
        "taskId": "task-demo-001"
      }
    },
    "invokeHint": {
      "requiredParams": ["taskId"],
      "example": {
        "taskId": "task-demo-001"
      }
    },
    "toolClass": "rebuild",
    "routeHint": "switch_to_rebuild",
    "strategy": "rebuild-first"
  },
  "orchestration": {
    "primaryStep": {
      "tool": "export_rebuild_bundle"
    },
    "suggestedSteps": [
      {"tool": "manage_reverse_task"},
      {"tool": "export_rebuild_bundle"}
    ]
  }
}
```

### `get_rebuild_health_report`：env gap 诊断（compact）

请求：

```json
{
  "taskId": "task-demo-001",
  "outputMode": "compact",
  "observedCapabilities": ["window", "document"]
}
```

典型响应：

```json
{
  "schemaVersion": "1.0",
  "taskId": "task-demo-001",
  "outputMode": "compact",
  "responseSummary": "已生成任务 task-demo-001 的 rebuild health report。",
  "diagnostics": {
    "responseStatus": "ok",
    "action": "get_rebuild_health_report",
    "outputMode": "compact",
    "taskId": "task-demo-001"
  },
  "outcome": "partial",
  "shouldResume": false,
  "shouldSwitchStrategy": true,
  "detailLevel": "minimal",
  "routeGuard": {
    "preferredToolClass": "rebuild",
    "routeHint": "switch_to_rebuild",
    "avoidTools": ["understand_code"]
  },
  "continuation": {
    "ready": true,
    "reason": "已识别 task-demo-001 的补环境缺口，可直接转到 diff_env_requirements。",
    "tool": "diff_env_requirements",
    "params": {
      "runtimeError": "window is not defined",
      "observedCapabilities": ["window", "document"]
    },
    "invoke": {
      "tool": "diff_env_requirements",
      "params": {
        "runtimeError": "window is not defined",
        "observedCapabilities": ["window", "document"]
      }
    },
    "invokeHint": {
      "requiredParams": ["runtimeError", "observedCapabilities"],
      "example": {
        "runtimeError": "window is not defined",
        "observedCapabilities": ["window", "document"]
      }
    },
    "toolClass": "rebuild",
    "routeHint": "switch_to_rebuild",
    "strategy": "env-fix"
  },
  "missingCapabilities": ["window"]
}
```

### `orchestrate_reverse_task`：env error fallback（失败但可续跑）

```json
{
  "schemaVersion": "1.0",
  "responseSummary": "已生成任务 task-demo-001 的下一步恢复建议。",
  "outcome": "partial",
  "shouldResume": true,
  "shouldSwitchStrategy": true,
  "errorCode": "env_error",
  "errorType": "env_error",
  "retryable": true,
  "blockedBy": "environment",
  "detailLevel": "standard",
  "routeGuard": {
    "preferredToolClass": "task",
    "routeHint": "stay_on_task_flow"
  },
  "continuation": {
    "ready": true,
    "tool": "diff_env_requirements",
    "invoke": {
      "tool": "diff_env_requirements",
      "params": {
        "runtimeError": "window is not defined",
        "observedCapabilities": ["window", "document"]
      }
    },
    "invokeHint": {
      "requiredParams": ["runtimeError", "observedCapabilities"]
    },
    "strategy": "env-fix"
  },
  "fallbackPlan": {
    "recommendedStrategy": "env-fix",
    "steps": [
      {"tool": "diff_env_requirements"},
      {"tool": "manage_reverse_task"}
    ]
  }
}
```

### `manage_reverse_task`：task blocked（不可续跑）

```json
{
  "schemaVersion": "1.0",
  "responseSummary": "已返回任务 task-demo-001 的摘要。",
  "outcome": "blocked",
  "shouldResume": false,
  "shouldSwitchStrategy": false,
  "errorCode": "task_blocked",
  "errorType": "task_blocked",
  "retryable": false,
  "blockedBy": "task_state",
  "detailLevel": "standard",
  "continuation": {
    "ready": false,
    "reason": "任务当前处于 blocked 状态，需先解除阻塞。"
  },
  "taskId": "task-demo-001",
  "status": "blocked"
}
```

### 怎么消费这些状态

- `outcome=success`：可直接走 `continuation.invoke`
- `outcome=partial` 且 `retryable=true`：优先按 `continuation` 或 `fallbackPlan` 续跑
- `outcome=blocked`：先处理 `blockedBy`，不要盲目 `resume`
- `shouldSwitchStrategy=true`：说明该换模板，不要机械重试上一跳
- `detailLevel=minimal`：偏向低 token 续推输入
- `detailLevel=standard`：偏向诊断 / 人工介入

### 推荐消费顺序

建议大模型按下面顺序读取响应，避免“字段很多但顺序混乱”：

1. **先读 `responseSummary`**
   - 用一句话判断“这次调用完成了什么”
   - 不要一上来就遍历整份 JSON

2. **再读 `outcome / shouldResume / shouldSwitchStrategy`**
   - `success`：通常可直接执行下一跳
   - `partial`：说明要续跑或切策略
   - `blocked`：说明先处理阻塞，不应继续执行

3. **失败路径再读 `errorType / retryable / blockedBy`**
   - 判断是参数错、环境缺失、工具未实现，还是任务状态阻塞
   - `retryable=false` 时，不要机械重试

4. **做工具路由时读 `routeGuard`**
   - 优先看 `preferredToolClass`
   - 再看 `routeHint`
   - 最后看 `avoidTools`

5. **真正执行前读 `continuation`**
   - `continuation.ready=false`：不要执行
   - `continuation.invoke`：直接作为下一跳 MCP 调用
   - `continuation.invokeHint`：检查必填参数是否齐全

6. **最后再读扩展字段**
   - 如 `fallbackPlan`、`agentGuidance`、`orchestration`
   - 这些更适合诊断、解释或生成备选计划，不一定是第一优先级

### 最小状态机

可把响应粗略当成下面这个状态机：

```text
read responseSummary
  -> read outcome
    -> success  -> routeGuard -> continuation.invoke
    -> partial  -> retryable? yes -> continuation / fallbackPlan
    -> partial  -> retryable? no  -> inspect errorType / blockedBy
    -> blocked  -> stop invoke, resolve blockedBy first
```

### agent 执行模板

如果你在写外部 agent / client，推荐固定成这套伪流程：

```text
1. read responseSummary
2. if outcome == blocked: stop and surface blockedBy
3. if shouldSwitchStrategy == true: prefer continuation.strategy or fallbackPlan.recommendedStrategy
4. if routeGuard exists: keep tool selection inside preferredToolClass
5. if continuation.ready == true and continuation.invoke exists: execute continuation.invoke
6. else: fall back to fallbackPlan or request more evidence
```

### 工具选择决策表

下面这张表适合在“还没决定先调哪个 MCP 工具”时直接套用：

| 目标                                          | 优先工具                    | 什么时候用                                                                                     | 不要先用什么                           |
| --------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| 看任务状态 / 摘要 / 标签 / timeline / compare | `manage_reverse_task`       | 你已经有 `taskId`，但还在查状态、补上下文、做轻量管理                                          | 不要先上 `orchestrate_reverse_task`    |
| 想自动决定下一步并连续推进                    | `orchestrate_reverse_task`  | 你已经确认 task 目标稳定，想减少 tool 选择并直接续跑                                           | 不要先手工乱选 analysis 类工具         |
| 想诊断补环境缺口                              | `get_rebuild_health_report` | 已经进入 rebuild / env-fix 阶段，或者报了典型 runtime env error                                | 不要先盲目重试 `export_rebuild_bundle` |
| 想把观察结果正式写回 artifact                 | `record_reverse_evidence`   | 本轮拿到了 hook / network / script / runtime 证据，想沉淀给后续 summarize / orchestration 复用 | 不要把证据只留在对话里                 |
| 只想拿一个轻量 next step 提示                 | `recommend_next_step`       | 你还不想跑完整编排，只想快速拿一个方向性建议                                                   | 不要把它当成持久化编排器               |

### 简化决策树

如果想更快一点，可以直接按这棵树判断：

```text
已有 taskId?
  -> 否: 先建任务 / 先补证据
  -> 是:
      只是想看状态? -> manage_reverse_task
      想自动推进?   -> orchestrate_reverse_task
      卡在 env error? -> get_rebuild_health_report
      刚拿到新证据? -> record_reverse_evidence
      只想轻量建议? -> recommend_next_step
```

### 典型组合

- **观察 -> 落盘 -> 摘要 -> 编排**
  - `record_reverse_evidence`
  - `manage_reverse_task:summarize`
  - `orchestrate_reverse_task`

- **env error -> 体检 -> 补环境 -> 续跑**
  - `get_rebuild_health_report`
  - `diff_env_requirements`
  - `orchestrate_reverse_task --resume`

- **状态阻塞 -> 先看摘要 -> 再决定是否恢复**
  - `manage_reverse_task:summarize`
  - 看 `blockedBy`
  - 必要时再 `orchestrate_reverse_task`

### 反模式 / 常见误用

下面这些做法最容易让大模型把 reverse 主链路跑偏：

- **一上来就调 `orchestrate_reverse_task`，但连 task 目标都没确认**
  - 结果：会把“状态查看”问题错误升级成“执行编排”问题
  - 正解：先 `manage_reverse_task:get` 或 `summarize`

- **拿到 `outcome=blocked` 还继续盲目 `resume`**
  - 结果：反复重试同一个阻塞态
  - 正解：先读 `blockedBy`，优先解除阻塞原因

- **看到 `env_error` 就直接重跑原步骤，不先补环境**
  - 结果：在同样的缺口上循环失败
  - 正解：先 `get_rebuild_health_report` 或直接走 `diff_env_requirements`

- **把 `recommend_next_step` 当成持久化编排器**
  - 结果：拿到的只是轻量建议，没有 checkpoint / orchestration 上下文
  - 正解：它只适合轻量分流；真正连续推进用 `orchestrate_reverse_task`

- **拿到新证据但不调用 `record_reverse_evidence`**
  - 结果：关键观察只留在对话里，后续 summarize / orchestration 无法复用
  - 正解：把 hook / network / runtime 证据正式落盘

- **忽略 `continuation.ready=false` 还强行执行 `continuation.invoke`**
  - 结果：调用链会进入不一致状态
  - 正解：`ready=false` 就停下来，先处理错误或阻塞原因

- **完全不看 `routeGuard`，随手切到不相关工具**
  - 结果：从 reverse 主链路跳到无关 analysis / browser 工具
  - 正解：先用 `preferredToolClass` / `routeHint` 约束下一跳

### 一句话记忆版

- **查状态** 用 `manage_reverse_task`
- **自动推进** 用 `orchestrate_reverse_task`
- **补环境诊断** 用 `get_rebuild_health_report`
- **证据落盘** 用 `record_reverse_evidence`
- **轻量提示** 用 `recommend_next_step`

## CLI 调用方式

只生成当前任务的编排结果：

```bash
node build/src/index.js --orchestrateReverseTask task-001
```

直接执行并把状态写回 artifact：

```bash
node build/src/index.js --orchestrateReverseTask task-001 --execute --includeSummary --persistState
```

从 checkpoint 续跑：

```bash
node build/src/index.js --orchestrateReverseTask task-001 --execute --resume
```

失败后不中断整批步骤：

```bash
node build/src/index.js --orchestrateReverseTask task-001 --execute --stopOnError=false
```

注入步骤级 override，适合测试、演示或临时跳过尚未实现的执行器：

```bash
node build/src/index.js   --orchestrateReverseTask task-001   --execute   --resume   --executionOverrides '{"inject_hook":{"status":"ok","result":"done"}}'
```

## CLI cheatsheet

最常抄的几条命令：

```bash
# 只看当前编排建议
node build/src/index.js --orchestrateReverseTask task-001

# 直接执行
node build/src/index.js --orchestrateReverseTask task-001 --execute

# 从失败点续跑
node build/src/index.js --orchestrateReverseTask task-001 --execute --resume

# 不中断，尽量跑完整批步骤
node build/src/index.js --orchestrateReverseTask task-001 --execute --stopOnError=false

# 执行后顺带返回 summary
node build/src/index.js --orchestrateReverseTask task-001 --execute --includeSummary

# 只执行某一个步骤
node build/src/index.js --orchestrateReverseTask task-001 --execute --onlyStep understand_code

# 从指定步骤开始
node build/src/index.js --orchestrateReverseTask task-001 --execute --fromStep diff_env_requirements

# 跳过某一步
node build/src/index.js --orchestrateReverseTask task-001 --execute --skipStep export_rebuild_bundle
```

## checkpoint 与失败分类

执行阶段会为每个 step 记录：

- 失败时还会返回 recovery 建议，包括 `recommendedNextAction`、`recommendedCommand`、`shouldResume`、`shouldInspectSummary`

- `status`
- `startedAt` / `finishedAt`
- `failureType`
- `retryable`
- `retryCount`
- `lastErrorAt`

当前失败分类包括：

| failureType        | 常见含义                 | 默认 retryable | 典型例子                                                |
| ------------------ | ------------------------ | -------------- | ------------------------------------------------------- |
| `tool_error`       | 执行器未实现或工具侧失败 | `true`         | `not implemented`                                       |
| `env_error`        | 本地补环境缺失           | `true`         | `window is not defined` / `localStorage is not defined` |
| `validation_error` | 参数或输入不合法         | `false`        | `invalid` / `required`                                  |
| `external_error`   | 外部依赖或浏览器链路异常 | `true`         | `timed out` / `fetch failed` / `browser failed`         |
| `unknown`          | 目前规则未命中的异常     | `false`        | 其他未分类错误                                          |

这让你可以快速判断：

- 是工具未实现 / 参数错误
- 还是页面环境缺失
- 还是外部依赖超时
- 以及该失败是否适合重试

## `executionOverrides` 有什么用

`executionOverrides` 的优先级高于真实执行器，主要用于：

- 在测试里稳定复现某一步成功 / 失败
- 某个 adapter 尚未实现时，先占位打通整体编排
- 演示流程时跳过昂贵或依赖真实浏览器上下文的步骤

注意：它更适合测试、回放、过渡期接线，不建议长期替代真实执行器。

## 和 `codex --resume` 会不会冲突

不会，二者恢复的层级不同：

- `codex --resume`：恢复 Codex CLI 自己的会话上下文
- `orchestrate_reverse_task resume=true` / `--resume`：恢复某个 reverse task 的执行 checkpoint

推荐组合：

1. 先用 `codex --resume` 回到之前的工作会话
2. 再执行 `--orchestrateReverseTask <taskId> --execute --resume`
3. 这样既保留会话上下文，也从 task 的失败步骤继续跑

换句话说，前者恢复“你和 Codex 的对话现场”，后者恢复“task artifact 的执行现场”。

## 实践建议

- 首次跑编排时保留 `stopOnError=true`，先让第一处失败暴露出来
- 需要批量收集更多失败信号时，再改成 `--stopOnError=false`
- 对真实任务建议保留 `persistState=true`
- 续跑前先看一次 `manage_reverse_task summarize`，确认 task 目标没有漂移
- 如果步骤规划本身需要重算，先不要 `resume=true`，而是重新做一次 fresh orchestration
