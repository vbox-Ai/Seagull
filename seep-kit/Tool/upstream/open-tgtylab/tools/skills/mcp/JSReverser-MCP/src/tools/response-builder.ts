/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type OutputMode = 'compact' | 'verbose';
export type AgentOutcome = 'success' | 'partial' | 'blocked';
export const REVERSE_AGENT_SCHEMA_VERSION = '1.0';

export interface ContinuationInvokeHint {
  requiredParams: string[];
  optionalParams?: string[];
  example?: Record<string, unknown>;
}

export interface ContinuationShape {
  ready: boolean;
  reason: string;
  tool?: string;
  params?: Record<string, unknown>;
  invoke?: {
    tool: string;
    params?: Record<string, unknown>;
  };
  invokeHint?: ContinuationInvokeHint;
  toolClass?: 'task' | 'orchestration' | 'rebuild' | 'analysis';
  routeHint?:
    | 'stay_on_task_flow'
    | 'switch_to_orchestration'
    | 'switch_to_rebuild'
    | 'switch_to_analysis';
  strategy?: string;
  resumeCommand?: string;
  actionKey?: string;
}

export interface UnifiedContinuationFields {
  outcome: AgentOutcome;
  shouldResume: boolean;
  shouldSwitchStrategy: boolean;
  nextBestTool?: string;
  nextBestParams?: Record<string, unknown>;
  errorCode?: string;
  errorType?: string;
  retryable?: boolean;
  blockedBy?: string;
  detailLevel: 'minimal' | 'standard';
  routeGuard?: {
    preferredToolClass?: 'task' | 'orchestration' | 'rebuild' | 'analysis';
    routeHint?:
      | 'stay_on_task_flow'
      | 'switch_to_orchestration'
      | 'switch_to_rebuild'
      | 'switch_to_analysis';
    avoidTools?: string[];
  };
  continuation: ContinuationShape;
}

export function compactAgentPayload(
  payload: Record<string, unknown>,
  outputMode: OutputMode,
): Record<string, unknown> {
  if (outputMode !== 'compact') {
    return payload;
  }
  const {
    nextBestTool: _nextBestTool,
    nextBestParams: _nextBestParams,
    shouldSwitchStrategy: _shouldSwitchStrategy,
    agentGuidance: _agentGuidance,
    fallbackPlan: _fallbackPlan,
    routeGuard: _routeGuard,
    ...rest
  } = payload;
  return {
    ...rest,
    detailLevel: 'minimal',
  };
}

export function withSchemaVersion(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schemaVersion: REVERSE_AGENT_SCHEMA_VERSION,
    ...payload,
  };
}

function buildInvokeHint(
  tool: string | undefined,
  params: Record<string, unknown> | undefined,
): ContinuationInvokeHint | undefined {
  if (!tool) {
    return undefined;
  }

  const normalizedParams = params ?? {};
  const paramKeys = Object.keys(normalizedParams);

  if (tool === 'manage_reverse_task') {
    const action =
      typeof normalizedParams.action === 'string'
        ? normalizedParams.action
        : undefined;
    const taskScopedActions = new Set([
      'get',
      'summarize',
      'progress',
      'update',
      'timeline',
      'archive',
      'restore',
      'tag',
    ]);
    const requiredParams = [
      ...(action ? ['action'] : []),
      ...(action && taskScopedActions.has(action) ? ['taskId'] : []),
      ...(action == null && 'taskId' in normalizedParams ? ['taskId'] : []),
    ];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      ...(paramKeys.length ? {example: normalizedParams} : {}),
    };
  }

  if (tool === 'orchestrate_reverse_task') {
    const requiredParams = ['taskId'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      example: {
        taskId: normalizedParams.taskId ?? '<taskId>',
        ...normalizedParams,
      },
    };
  }

  if (tool === 'run_reverse_agent') {
    const requiredParams = ['taskId'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      example: {
        taskId: normalizedParams.taskId ?? '<taskId>',
        ...normalizedParams,
      },
    };
  }

  if (tool === 'get_rebuild_health_report') {
    const requiredParams = ['taskId'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      example: {
        taskId: normalizedParams.taskId ?? '<taskId>',
        outputMode: normalizedParams.outputMode ?? 'compact',
        ...normalizedParams,
      },
    };
  }

  if (tool === 'export_rebuild_bundle') {
    const requiredParams = ['taskId'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      ...(paramKeys.length ? {example: normalizedParams} : {}),
    };
  }

  if (tool === 'export_portable_bundle') {
    const requiredParams = ['taskId'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      ...(paramKeys.length ? {example: normalizedParams} : {}),
    };
  }

  if (tool === 'diff_env_requirements') {
    const requiredParams = ['runtimeError', 'observedCapabilities'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      ...(paramKeys.length ? {example: normalizedParams} : {}),
    };
  }

  if (tool === 'locate_signature_function') {
    const requiredParams = ['url', 'targetParam'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      example: {
        url: normalizedParams.url ?? 'https://example.com/api/sign',
        targetParam: normalizedParams.targetParam ?? 'sign',
        ...normalizedParams,
      },
    };
  }

  if (tool === 'extract_function_tree') {
    const requiredParams = ['scriptId', 'functionName'];
    const optionalParams = paramKeys.filter(
      key => !requiredParams.includes(key),
    );
    return {
      requiredParams,
      ...(optionalParams.length ? {optionalParams} : {}),
      example: {
        scriptId: normalizedParams.scriptId ?? '<scriptId>',
        functionName: normalizedParams.functionName ?? 'genSign',
        ...normalizedParams,
      },
    };
  }

  return paramKeys.length
    ? {requiredParams: [], example: normalizedParams}
    : {requiredParams: []};
}

export function inferBlockedBy(reason: unknown): string | undefined {
  if (reason === 'blocked' || reason === 'task_blocked') {
    return 'task_state';
  }
  if (reason === 'env_error') {
    return 'environment';
  }
  if (reason === 'external_error') {
    return 'external_dependency';
  }
  if (reason === 'validation_error') {
    return 'input_validation';
  }
  if (reason === 'tool_error') {
    return 'tooling';
  }
  if (reason === 'unknown') {
    return 'unknown';
  }
  return undefined;
}

export function inferOutcomeFromStatus(status: unknown): AgentOutcome {
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'partial') {
    return 'partial';
  }
  return 'success';
}

export function buildTaskDiagnostics(
  action: string,
  outputMode: OutputMode,
  taskId?: string,
): Record<string, unknown> {
  return {
    responseStatus: 'ok',
    action,
    outputMode,
    ...(taskId ? {taskId} : {}),
  };
}

export function buildManageSummaryText(
  action: string,
  payload: Record<string, unknown>,
): string {
  if (action === 'list') {
    return `已返回 ${(payload.items as unknown[] | undefined)?.length ?? 0} 个 reverse task。`;
  }
  if (action === 'search') {
    return `已返回 ${(payload.items as unknown[] | undefined)?.length ?? 0} 个搜索命中。`;
  }
  if (action === 'get' || action === 'summarize') {
    return `已返回任务 ${String(payload.taskId ?? '')} 的 ${action === 'get' ? '快照' : '摘要'}。`;
  }
  if (action === 'compare') {
    return `已完成任务 ${String(payload.leftTaskId ?? '')} 与 ${String(payload.rightTaskId ?? '')} 的对比。`;
  }
  return `已完成 ${action} 动作。`;
}

export function compactManagePayload(
  action: string,
  payload: Record<string, unknown>,
  outputMode: OutputMode,
): Record<string, unknown> {
  if (outputMode !== 'compact') {
    return payload;
  }
  if (action === 'get') {
    const {
      recentTimeline: _recentTimeline,
      recentEvidence: _recentEvidence,
      targetContext: _targetContext,
      ...rest
    } = payload;
    return rest;
  }
  if (action === 'summarize') {
    const {
      recentTimeline: _recentTimeline,
      recentEvidence: _recentEvidence,
      reasoning: _reasoning,
      signals: _signals,
      ...rest
    } = payload;
    return rest;
  }
  return payload;
}

export function buildManageContinuation(
  action: string,
  payload: Record<string, unknown>,
  fallbackReason: string,
): UnifiedContinuationFields {
  const hints = payload.agentGuidance as
    | {
        summary?: string;
        recommendedTool?: string;
        recommendedParams?: Record<string, unknown>;
        recommendedStrategy?: string;
        resumeHint?: string;
        toolClass?: 'task' | 'orchestration' | 'rebuild' | 'analysis';
        routeHint?:
          | 'stay_on_task_flow'
          | 'switch_to_orchestration'
          | 'switch_to_rebuild'
          | 'switch_to_analysis';
        avoidTools?: string[];
      }
    | undefined;
  const status =
    payload.status ??
    (payload.state && typeof payload.state === 'object'
      ? (payload.state as Record<string, unknown>).status
      : undefined);
  const outcome =
    action === 'get' ||
    action === 'summarize' ||
    action === 'progress' ||
    action === 'update'
      ? inferOutcomeFromStatus(status)
      : 'success';
  const nextBestTool = hints?.recommendedTool;
  const nextBestParams = hints?.recommendedParams;
  return {
    outcome,
    shouldResume: Boolean(
      action === 'progress' && outcome !== 'blocked' && nextBestTool,
    ),
    shouldSwitchStrategy: [
      'rebuild-first',
      'env-fix',
      'artifact-sync',
      'evidence-only',
    ].includes(String(hints?.recommendedStrategy ?? '')),
    ...(nextBestTool ? {nextBestTool} : {}),
    ...(nextBestParams ? {nextBestParams} : {}),
    ...(outcome === 'blocked'
      ? {
          errorCode: 'task_blocked',
          errorType: 'task_blocked',
          retryable: false,
          blockedBy: inferBlockedBy(status),
        }
      : {}),
    detailLevel: 'standard',
    ...(hints?.toolClass || hints?.routeHint || hints?.avoidTools?.length
      ? {
          routeGuard: {
            ...(hints?.toolClass ? {preferredToolClass: hints.toolClass} : {}),
            ...(hints?.routeHint ? {routeHint: hints.routeHint} : {}),
            ...(hints?.avoidTools?.length
              ? {avoidTools: hints.avoidTools}
              : {}),
          },
        }
      : {}),
    continuation: {
      ready: outcome !== 'blocked',
      reason: hints?.summary ?? fallbackReason,
      ...(nextBestTool ? {tool: nextBestTool, actionKey: nextBestTool} : {}),
      ...(nextBestParams ? {params: nextBestParams} : {}),
      ...(nextBestTool
        ? {
            invoke: {
              tool: nextBestTool,
              ...(nextBestParams ? {params: nextBestParams} : {}),
            },
          }
        : {}),
      ...(nextBestTool
        ? {invokeHint: buildInvokeHint(nextBestTool, nextBestParams)}
        : {}),
      ...(hints?.toolClass ? {toolClass: hints.toolClass} : {}),
      ...(hints?.routeHint ? {routeHint: hints.routeHint} : {}),
      ...(hints?.recommendedStrategy
        ? {strategy: hints.recommendedStrategy}
        : {}),
      ...(hints?.resumeHint ? {resumeCommand: hints.resumeHint} : {}),
    },
  };
}

export function buildOrchestrationContinuation(input: {
  failedStep?: {failureType?: string; retryable?: boolean};
  shouldResume: boolean;
  fallbackPlan?: {
    steps: Array<{tool: string; params: Record<string, unknown>}>;
    recommendedStrategy?: string;
  };
  agentGuidance?: {
    summary?: string;
    recommendedTool?: string;
    recommendedParams?: Record<string, unknown>;
    recommendedStrategy?: string;
    resumeHint?: string;
    toolClass?: 'task' | 'orchestration' | 'rebuild' | 'analysis';
    routeHint?:
      | 'stay_on_task_flow'
      | 'switch_to_orchestration'
      | 'switch_to_rebuild'
      | 'switch_to_analysis';
    avoidTools?: string[];
  };
}): UnifiedContinuationFields {
  const nextStep = input.fallbackPlan?.steps[0];
  const outcome = input.failedStep
    ? input.shouldResume
      ? 'partial'
      : 'blocked'
    : 'success';
  const nextBestTool = nextStep?.tool ?? input.agentGuidance?.recommendedTool;
  const nextBestParams =
    nextStep?.params ?? input.agentGuidance?.recommendedParams;
  const strategy =
    input.fallbackPlan?.recommendedStrategy ??
    input.agentGuidance?.recommendedStrategy;
  return {
    outcome,
    shouldResume: input.shouldResume,
    shouldSwitchStrategy: Boolean(input.fallbackPlan?.recommendedStrategy),
    ...(nextBestTool ? {nextBestTool} : {}),
    ...(nextBestParams ? {nextBestParams} : {}),
    ...(input.failedStep?.failureType
      ? {
          errorCode: input.failedStep.failureType,
          errorType: input.failedStep.failureType,
        }
      : {}),
    ...(input.failedStep?.retryable !== undefined
      ? {retryable: input.failedStep.retryable}
      : {}),
    ...(inferBlockedBy(input.failedStep?.failureType)
      ? {blockedBy: inferBlockedBy(input.failedStep?.failureType)}
      : {}),
    detailLevel: 'standard',
    ...(input.agentGuidance?.toolClass ||
    input.agentGuidance?.routeHint ||
    input.agentGuidance?.avoidTools?.length
      ? {
          routeGuard: {
            ...(input.agentGuidance?.toolClass
              ? {preferredToolClass: input.agentGuidance.toolClass}
              : {}),
            ...(input.agentGuidance?.routeHint
              ? {routeHint: input.agentGuidance.routeHint}
              : {}),
            ...(input.agentGuidance?.avoidTools?.length
              ? {avoidTools: input.agentGuidance.avoidTools}
              : {}),
          },
        }
      : {}),
    continuation: {
      ready: outcome !== 'blocked',
      reason: input.agentGuidance?.summary ?? '已生成下一步编排建议。',
      ...(nextBestTool ? {tool: nextBestTool, actionKey: nextBestTool} : {}),
      ...(nextBestParams ? {params: nextBestParams} : {}),
      ...(nextBestTool
        ? {
            invoke: {
              tool: nextBestTool,
              ...(nextBestParams ? {params: nextBestParams} : {}),
            },
          }
        : {}),
      ...(nextBestTool
        ? {invokeHint: buildInvokeHint(nextBestTool, nextBestParams)}
        : {}),
      ...(input.agentGuidance?.toolClass
        ? {toolClass: input.agentGuidance.toolClass}
        : {}),
      ...(input.agentGuidance?.routeHint
        ? {routeHint: input.agentGuidance.routeHint}
        : {}),
      ...(strategy ? {strategy} : {}),
      ...(input.agentGuidance?.resumeHint
        ? {resumeCommand: input.agentGuidance.resumeHint}
        : {}),
    },
  };
}

export function buildRebuildContinuation(input: {
  status: string;
  missingCapabilitiesCount: number;
  patchSuggestionCount: number;
  agentGuidance: {
    summary: string;
    recommendedTool?: string;
    recommendedParams?: Record<string, unknown>;
    recommendedStrategy?: string;
    resumeHint?: string;
    toolClass?: 'task' | 'orchestration' | 'rebuild' | 'analysis';
    routeHint?:
      | 'stay_on_task_flow'
      | 'switch_to_orchestration'
      | 'switch_to_rebuild'
      | 'switch_to_analysis';
    avoidTools?: string[];
  };
}): UnifiedContinuationFields {
  const outcome =
    input.status === 'blocked'
      ? 'blocked'
      : input.missingCapabilitiesCount > 0 || input.patchSuggestionCount > 0
        ? 'partial'
        : 'success';
  const nextBestTool = input.agentGuidance.recommendedTool;
  const nextBestParams = input.agentGuidance.recommendedParams;
  return {
    outcome,
    shouldResume:
      input.missingCapabilitiesCount === 0 && input.status !== 'blocked',
    shouldSwitchStrategy: input.patchSuggestionCount > 0,
    ...(input.status === 'blocked'
      ? {
          errorCode: 'task_blocked',
          errorType: 'task_blocked',
          retryable: false,
          blockedBy: 'task_state',
        }
      : {}),
    detailLevel: 'standard',
    ...(input.agentGuidance.toolClass ||
    input.agentGuidance.routeHint ||
    input.agentGuidance.avoidTools?.length
      ? {
          routeGuard: {
            ...(input.agentGuidance.toolClass
              ? {preferredToolClass: input.agentGuidance.toolClass}
              : {}),
            ...(input.agentGuidance.routeHint
              ? {routeHint: input.agentGuidance.routeHint}
              : {}),
            ...(input.agentGuidance.avoidTools?.length
              ? {avoidTools: input.agentGuidance.avoidTools}
              : {}),
          },
        }
      : {}),
    ...(nextBestTool ? {nextBestTool} : {}),
    ...(nextBestParams ? {nextBestParams} : {}),
    continuation: {
      ready: outcome !== 'blocked',
      reason: input.agentGuidance.summary,
      ...(nextBestTool ? {tool: nextBestTool, actionKey: nextBestTool} : {}),
      ...(nextBestParams ? {params: nextBestParams} : {}),
      ...(nextBestTool
        ? {
            invoke: {
              tool: nextBestTool,
              ...(nextBestParams ? {params: nextBestParams} : {}),
            },
          }
        : {}),
      ...(nextBestTool
        ? {invokeHint: buildInvokeHint(nextBestTool, nextBestParams)}
        : {}),
      ...(input.agentGuidance.toolClass
        ? {toolClass: input.agentGuidance.toolClass}
        : {}),
      ...(input.agentGuidance.routeHint
        ? {routeHint: input.agentGuidance.routeHint}
        : {}),
      ...(input.agentGuidance.recommendedStrategy
        ? {strategy: input.agentGuidance.recommendedStrategy}
        : {}),
      ...(input.agentGuidance.resumeHint
        ? {resumeCommand: input.agentGuidance.resumeHint}
        : {}),
    },
  };
}
