# MCP client 自动续跑示例

这份文档给外部 **Node.js / TypeScript client** 用，演示如何：

1. 调用 `manage_reverse_task` / `orchestrate_reverse_task`
2. 按固定顺序读取响应
3. 自动执行 `continuation.invoke`
4. 在 `partial / blocked / strategy switch` 场景下正确分流

## 最小 TypeScript 示例

下面这段代码假设你已经有一个 `callTool(name, params)` 封装，它会返回 MCP 工具的 JSON 结果。

```ts
type ToolCall = {
  tool: string;
  params?: Record<string, unknown>;
};

type ReverseResponse = {
  schemaVersion?: string;
  responseSummary?: string;
  outcome?: 'success' | 'partial' | 'blocked';
  shouldResume?: boolean;
  shouldSwitchStrategy?: boolean;
  errorType?: string;
  retryable?: boolean;
  blockedBy?: string;
  routeGuard?: {
    preferredToolClass?: string;
    routeHint?: string;
    avoidTools?: string[];
  };
  continuation?: {
    ready?: boolean;
    strategy?: string;
    invoke?: ToolCall;
    invokeHint?: {
      requiredParams?: string[];
      optionalParams?: string[];
      example?: Record<string, unknown>;
    };
  };
  fallbackPlan?: {
    recommendedStrategy?: string;
    steps?: ToolCall[];
  };
};

async function runReverseLoop(taskId: string) {
  let response = (await callTool('manage_reverse_task', {
    action: 'summarize',
    taskId,
    outputMode: 'compact',
  })) as ReverseResponse;

  for (let step = 0; step < 8; step += 1) {
    if (response.schemaVersion !== '1.0') {
      return {
        status: 'unsupported_schema_version',
        schemaVersion: response.schemaVersion,
      };
    }

    console.log('[summary]', response.responseSummary ?? '(no summary)');

    if (response.outcome === 'blocked') {
      console.log('[blockedBy]', response.blockedBy ?? 'unknown');
      return {
        status: 'blocked',
        blockedBy: response.blockedBy,
        errorType: response.errorType,
      };
    }

    if (response.shouldSwitchStrategy) {
      console.log(
        '[switchStrategy]',
        response.continuation?.strategy ??
          response.fallbackPlan?.recommendedStrategy ??
          'unknown',
      );
    }

    const nextInvoke = response.continuation?.ready
      ? response.continuation?.invoke
      : response.fallbackPlan?.steps?.[0];

    if (!nextInvoke) {
      return {
        status: 'stopped',
        reason: 'no_continuation',
        errorType: response.errorType,
      };
    }

    const requiredParams =
      response.continuation?.invokeHint?.requiredParams ?? [];
    const missingRequiredParams = requiredParams.filter(
      key => !(key in (nextInvoke.params ?? {})),
    );
    if (missingRequiredParams.length > 0) {
      return {
        status: 'invalid_next_invoke',
        missingRequiredParams,
        nextInvoke,
      };
    }

    response = (await callTool(
      nextInvoke.tool,
      nextInvoke.params ?? {},
    )) as ReverseResponse;

    if (response.outcome === 'success' && !response.continuation?.invoke) {
      return {
        status: 'completed',
        finalSummary: response.responseSummary,
      };
    }
  }

  return {
    status: 'max_steps_reached',
  };
}
```

## 更贴近真实场景的入口

如果你希望让 orchestrator 来决定主链路，入口通常更像这样：

```ts
const first = await callTool('orchestrate_reverse_task', {
  taskId,
  outputMode: 'compact',
});
```

如果你当前更偏“先看状态，再决定是否编排”，入口通常更像这样：

```ts
const first = await callTool('manage_reverse_task', {
  action: 'progress',
  taskId,
  outputMode: 'compact',
});
```

## 实战分流规则

### 1. 正常成功

- `outcome=success`
- `continuation.ready=true`
- 直接执行 `continuation.invoke`

### 2. 可续跑失败

- `outcome=partial`
- `retryable=true`
- 优先执行 `continuation.invoke`
- 如果没有 `continuation.invoke`，再退回 `fallbackPlan.steps[0]`

### 3. 任务阻塞

- `outcome=blocked`
- 不要继续调用 `invoke`
- 先把 `blockedBy` 暴露给上层 agent / UI

### 4. 需要切策略

- `shouldSwitchStrategy=true`
- 优先看：
  - `continuation.strategy`
  - `fallbackPlan.recommendedStrategy`

## 建议先做 schema 版本校验

- 当前运行时响应约定：`schemaVersion === "1.0"`
- 如果版本不匹配，优先停止自动续跑并上报给上层调用方
- schema 文件可配合：`docs/reference/reverse-agent-response.schema.json`

## 推荐日志字段

如果你在写 client，建议至少打印这些字段，便于排障：

```ts
console.log({
  summary: response.responseSummary,
  outcome: response.outcome,
  shouldResume: response.shouldResume,
  shouldSwitchStrategy: response.shouldSwitchStrategy,
  errorType: response.errorType,
  retryable: response.retryable,
  blockedBy: response.blockedBy,
  nextTool: response.continuation?.invoke?.tool,
});
```

## 常见错误

- 不检查 `continuation.ready`
- 不检查 `invokeHint.requiredParams`
- `blocked` 了还继续自动续跑
- `partial` 就当失败退出，不看 `retryable`
- 忽略 `fallbackPlan`

## 搭配阅读

- 速查页：`docs/guides/mcp-agent-quick-reference.md`
- 编排说明：`docs/guides/reverse-task-orchestration.md`
- machine-readable schema：`docs/reference/reverse-agent-response.schema.json`
- manage schema：`docs/reference/manage-response.schema.json`
- orchestrate schema：`docs/reference/orchestrate-response.schema.json`
- rebuild schema：`docs/reference/rebuild-health-response.schema.json`
- versioning：`docs/reference/reverse-agent-schema-versioning.md`
- 工具参考：`docs/reference/tool-reference.md`
