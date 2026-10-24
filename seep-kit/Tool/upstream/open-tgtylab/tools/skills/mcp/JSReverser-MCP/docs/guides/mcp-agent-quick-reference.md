# MCP agent 速查页

这份文档给 **大模型 / agent / 外部 MCP client** 用，是一页版速查，目标是：在上下文很紧时，仍然能快速决定：

1. 先选哪个工具
2. 响应先读哪些字段
3. 下一跳怎么执行
4. 失败时怎么分流

## 1. 工具怎么选

| 目标                                   | 优先工具                    |
| -------------------------------------- | --------------------------- |
| 查任务状态 / 摘要 / timeline / compare | `manage_reverse_task`       |
| 自动推进 reverse 主链路                | `orchestrate_reverse_task`  |
| 诊断 env gap / rebuild 缺口            | `get_rebuild_health_report` |
| 把 hook / network / runtime 证据落盘   | `record_reverse_evidence`   |
| 只拿轻量 next-step 建议                | `recommend_next_step`       |

## 2. 响应先读什么

固定按这个顺序：

0. `schemaVersion`（当前应为 `"1.0"`）
1. `responseSummary`
2. `outcome / shouldResume / shouldSwitchStrategy`
3. `errorType / retryable / blockedBy`
4. `routeGuard`
5. `continuation`
6. `fallbackPlan / agentGuidance / orchestration`

## 3. 最小决策规则

- `outcome=success` -> 直接看 `continuation.invoke`
- `outcome=partial` 且 `retryable=true` -> 优先续跑
- `outcome=blocked` -> 先处理 `blockedBy`
- `shouldSwitchStrategy=true` -> 优先换策略，不要硬重试
- `continuation.ready=false` -> 不要执行下一跳

## 4. 下一跳怎么执行

优先直接消费：

```json
{
  "continuation": {
    "invoke": {
      "tool": "manage_reverse_task",
      "params": {
        "action": "progress",
        "taskId": "task-demo-001"
      }
    }
  }
}
```

如果是外部 client，建议先确认 `schemaVersion === "1.0"`，再消费后续字段。

如果担心参数不完整，再看：

```json
{
  "continuation": {
    "invokeHint": {
      "requiredParams": ["action", "taskId"],
      "optionalParams": [],
      "example": {
        "action": "progress",
        "taskId": "task-demo-001"
      }
    }
  }
}
```

## 5. 最小状态机

```text
read responseSummary
  -> read outcome
    -> success  -> routeGuard -> continuation.invoke
    -> partial  -> retryable? yes -> continuation / fallbackPlan
    -> partial  -> retryable? no  -> inspect errorType / blockedBy
    -> blocked  -> stop invoke, resolve blockedBy first
```

## 6. 最常见组合

### 观察 -> 落盘 -> 摘要 -> 编排

1. `record_reverse_evidence`
2. `manage_reverse_task` with `action="summarize"`
3. `orchestrate_reverse_task`

### env error -> 体检 -> 补环境 -> 续跑

1. `get_rebuild_health_report`
2. `diff_env_requirements`
3. `orchestrate_reverse_task` with `resume=true`

### 状态阻塞 -> 先查原因 -> 再决定是否恢复

1. `manage_reverse_task` with `action="summarize"`
2. 读取 `blockedBy`
3. 只有阻塞解除后再考虑 `orchestrate_reverse_task`

## 7. 反模式

- 不要一上来就 `orchestrate_reverse_task`
- 不要忽略 `blockedBy`
- 不要把 `recommend_next_step` 当持久化编排器
- 不要把证据只留在对话里，不落 `record_reverse_evidence`
- 不要在 `continuation.ready=false` 时继续执行
- 不要忽略 `routeGuard` 后乱切工具

## 8. 一句话记忆版

- 查状态 -> `manage_reverse_task`
- 自动推进 -> `orchestrate_reverse_task`
- 补环境 -> `get_rebuild_health_report`
- 落证据 -> `record_reverse_evidence`
- 轻建议 -> `recommend_next_step`

## 9. 详细文档入口

- 快速开始：`docs/guides/getting-started.md`
- 客户端 system prompt：`docs/guides/client-system-prompt.md`
- 编排与恢复：`docs/guides/reverse-task-orchestration.md`
- Node/TS 自动续跑示例：`docs/guides/mcp-client-auto-resume-example.md`
- 运行时版本：响应体里的 `schemaVersion` 当前固定为 `"1.0"`
- machine-readable schema：`docs/reference/reverse-agent-response.schema.json`
- manage schema：`docs/reference/manage-response.schema.json`
- orchestrate schema：`docs/reference/orchestrate-response.schema.json`
- rebuild schema：`docs/reference/rebuild-health-response.schema.json`
- versioning：`docs/reference/reverse-agent-schema-versioning.md`
- 全量工具参考：`docs/reference/tool-reference.md`

## 10. 可直接嵌入的 system prompt 片段

如果你要把规则直接塞进外部 agent / system prompt，可先用这个最短版本：

```text
你在调用 JSReverser-MCP。

选工具规则：
- 查状态/摘要/timeline -> manage_reverse_task
- 自动推进 -> orchestrate_reverse_task
- env gap/补环境诊断 -> get_rebuild_health_report
- 新证据落盘 -> record_reverse_evidence
- 只要轻量建议 -> recommend_next_step

读响应顺序：
1. responseSummary
2. outcome / shouldResume / shouldSwitchStrategy
3. errorType / retryable / blockedBy
4. routeGuard
5. continuation
6. fallbackPlan / agentGuidance / orchestration

执行规则：
- outcome=success -> 优先执行 continuation.invoke
- outcome=partial 且 retryable=true -> 按 continuation 或 fallbackPlan 续跑
- outcome=blocked -> 停止执行，先处理 blockedBy
- shouldSwitchStrategy=true -> 优先切 strategy，不要机械重试
- continuation.ready=false -> 不要执行 invoke
- 执行前优先遵守 routeGuard.preferredToolClass / routeHint / avoidTools

禁止：
- 不要一上来就 orchestrate_reverse_task
- 不要忽略 blockedBy
- 不要把 recommend_next_step 当持久化编排器
- 不要把证据只留在对话里
- 不要忽略 continuation.ready=false
```

如果上下文再紧一点，可以继续压缩成：

```text
JSReverser-MCP: 状态看 manage_reverse_task，自动推进用 orchestrate_reverse_task，env gap 用 get_rebuild_health_report，证据落盘用 record_reverse_evidence。先读 responseSummary，再读 outcome，再读 errorType/blockedBy，再读 routeGuard，最后执行 continuation.invoke。blocked 就先解阻塞，partial+retryable 就续跑，shouldSwitchStrategy=true 就换策略，continuation.ready=false 就停止。
```

如果你要一版更完整、直接可复制到客户端配置里的提示词，看：

- `docs/guides/client-system-prompt.md`
