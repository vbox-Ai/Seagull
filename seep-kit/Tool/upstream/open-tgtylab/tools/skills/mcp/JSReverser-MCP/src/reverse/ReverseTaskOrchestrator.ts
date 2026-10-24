/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {recommendNextStep} from '../modules/workflows/NextStepAdvisor.js';

import {autoProgressReverseTask} from './ReverseTaskAutoProgress.js';
import {
  executeReverseTaskPlan,
  type ReverseTaskExecutableStep,
  type ReverseTaskExecutionOverride,
} from './ReverseTaskExecutor.js';
import {getReverseTaskState} from './ReverseTaskQuery.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

type OrchestrationStep = ReverseTaskExecutableStep;
type OutputMode = 'compact' | 'verbose';

function buildStepKey(tool: string, params: Record<string, unknown>): string {
  if (tool === 'manage_reverse_task') {
    return `manage_reverse_task:${String(params.action ?? 'get')}`;
  }
  return tool;
}

function inferTargetParam(...inputs: Array<string | undefined>): string {
  const merged = inputs.filter(Boolean).join(' ').toLowerCase();
  const knownTargets = [
    'h5st',
    'a_bogus',
    '_signature',
    'signature',
    'token',
    'sign',
    'nonce',
  ];
  return knownTargets.find(item => merged.includes(item)) ?? 'sign';
}

function inferRelatedParams(...inputs: Array<string | undefined>): string[] {
  const merged = inputs.filter(Boolean).join(' ').toLowerCase();
  const knownParams = [
    'appid',
    'body',
    'functionid',
    'client',
    'timestamp',
    't',
    'nonce',
    'token',
  ];
  return knownParams.filter(item =>
    new RegExp(`\\b${item}\\b`, 'i').test(merged),
  );
}

function buildPrimaryStep(
  taskId: string,
  nextStepHint: string,
  currentStage: string,
  options: {
    targetUrl?: string;
    targetParam?: string;
    locatedFunctionName?: string;
    locatedScriptUrl?: string;
    locatedScriptId?: string;
    functionSliceCode?: string;
  } = {},
): OrchestrationStep {
  if (nextStepHint.startsWith('manage_reverse_task:')) {
    const action = nextStepHint.split(':')[1] ?? 'summarize';
    return {
      key: buildStepKey('manage_reverse_task', {action, taskId}),
      tool: 'manage_reverse_task',
      reason: '下一步仍属于任务编排域，继续通过统一 task 入口完成。',
      params: {action, taskId},
    };
  }

  if (
    nextStepHint === 'locate_signature_function' ||
    nextStepHint === 'inject_hook'
  ) {
    if (options.functionSliceCode && options.locatedFunctionName) {
      return {
        key: buildStepKey('understand_code', {
          code: options.functionSliceCode,
          focus: 'structure',
        }),
        tool: 'understand_code',
        reason: `已拿到 ${options.locatedFunctionName} 的最小依赖闭包，优先进入结构理解而不是重复定位。`,
        params: {
          code: options.functionSliceCode,
          focus: 'structure',
        },
      };
    }
    if (options.locatedFunctionName && options.locatedScriptId) {
      return {
        key: buildStepKey('extract_function_tree', {
          scriptId: options.locatedScriptId,
          functionName: options.locatedFunctionName,
          maxDepth: 2,
        }),
        tool: 'extract_function_tree',
        reason: `已定位到 ${options.locatedFunctionName} 的源码命中，直接提取最小依赖闭包。`,
        params: {
          scriptId: options.locatedScriptId,
          functionName: options.locatedFunctionName,
          maxDepth: 2,
        },
      };
    }
    if (options.locatedFunctionName) {
      return {
        key: buildStepKey('search_in_sources', {
          query: options.locatedFunctionName,
          isRegex: false,
          caseSensitive: true,
          ...(options.locatedScriptUrl
            ? {urlFilter: options.locatedScriptUrl}
            : {}),
        }),
        tool: 'search_in_sources',
        reason: `已存在候选签名函数 ${options.locatedFunctionName}，先复用定位结果缩小到具体源码位置。`,
        params: {
          query: options.locatedFunctionName,
          isRegex: false,
          caseSensitive: true,
          maxResults: 10,
          ...(options.locatedScriptUrl
            ? {urlFilter: options.locatedScriptUrl}
            : {}),
        },
      };
    }
    return {
      key: buildStepKey('locate_signature_function', {
        url: options.targetUrl ?? '',
        targetParam: options.targetParam ?? 'sign',
      }),
      tool: 'locate_signature_function',
      reason: `当前阶段为 ${currentStage}，先定位候选签名函数，再决定 hook 与切片策略。`,
      params: {
        url: options.targetUrl,
        targetParam: options.targetParam ?? 'sign',
      },
    };
  }

  return {
    key: buildStepKey(nextStepHint, {taskId}),
    tool: nextStepHint,
    reason: `当前阶段为 ${currentStage}，优先执行状态机推断出的下一步。`,
    params: {taskId},
  };
}

function buildManageTaskStep(
  taskId: string,
  action: 'get' | 'summarize' | 'progress' | 'timeline',
  currentStage: string,
): OrchestrationStep {
  return {
    key: buildStepKey('manage_reverse_task', {action, taskId}),
    tool: 'manage_reverse_task',
    reason: `策略要求优先执行 manage_reverse_task:${action}。`,
    params:
      action === 'timeline'
        ? {
            action,
            taskId,
            stage: currentStage.toLowerCase(),
            timelineAction: 'artifact-sync',
            timelineStatus: 'ok',
          }
        : {action, taskId},
  };
}

function buildStrategyPrimaryStep(
  taskId: string,
  strategy:
    | 'observe-first'
    | 'rebuild-first'
    | 'env-fix'
    | 'artifact-sync'
    | 'evidence-only'
    | undefined,
  nextStepHint: string,
  currentStage: string,
  options: {
    targetUrl?: string;
    targetParam?: string;
    locatedFunctionName?: string;
    locatedScriptUrl?: string;
    locatedScriptId?: string;
    functionSliceCode?: string;
  } = {},
): OrchestrationStep {
  if (!strategy) {
    return buildPrimaryStep(taskId, nextStepHint, currentStage, options);
  }
  if (strategy === 'rebuild-first') {
    return {
      key: buildStepKey('export_rebuild_bundle', {taskId}),
      tool: 'export_rebuild_bundle',
      reason: 'rebuild-first 策略优先产出本地 rebuild bundle。',
      params: {taskId},
    };
  }
  if (strategy === 'env-fix') {
    return {
      key: buildStepKey('diff_env_requirements', {taskId}),
      tool: 'diff_env_requirements',
      reason: 'env-fix 策略优先分析当前补环境缺口。',
      params: {taskId},
    };
  }
  if (strategy === 'artifact-sync') {
    return buildManageTaskStep(taskId, 'timeline', currentStage);
  }
  if (strategy === 'evidence-only') {
    return buildManageTaskStep(taskId, 'summarize', currentStage);
  }
  if (strategy === 'observe-first') {
    return buildManageTaskStep(taskId, 'get', currentStage);
  }
  return buildPrimaryStep(taskId, nextStepHint, currentStage, options);
}

function buildFallbackPlan(
  taskId: string,
  execution: Awaited<ReturnType<typeof executeReverseTaskPlan>> | undefined,
):
  | {
      reason: string;
      recommendedStrategy?:
        | 'observe-first'
        | 'rebuild-first'
        | 'env-fix'
        | 'artifact-sync'
        | 'evidence-only';
      steps: OrchestrationStep[];
    }
  | undefined {
  if (!execution?.failedStep?.failureType) {
    return undefined;
  }
  if (execution.failedStep.failureType === 'env_error') {
    return {
      reason: '当前失败更像补环境缺口，优先切换到 env-fix 路径。',
      recommendedStrategy: 'env-fix',
      steps: [
        {
          key: buildStepKey('diff_env_requirements', {taskId}),
          tool: 'diff_env_requirements',
          reason: '先分析 runtime error 对应的环境能力缺口。',
          params: {taskId},
        },
        buildManageTaskStep(taskId, 'summarize', 'Patch'),
      ],
    };
  }
  if (execution.failedStep.failureType === 'tool_error') {
    return {
      reason: '当前失败更像工具执行问题，先回到任务摘要，再决定是否 resume。',
      recommendedStrategy: 'evidence-only',
      steps: [buildManageTaskStep(taskId, 'summarize', 'Observe')],
    };
  }
  return {
    reason: '当前失败需要先重新对齐任务上下文。',
    recommendedStrategy: 'observe-first',
    steps: [buildManageTaskStep(taskId, 'get', 'Observe')],
  };
}

function compactStep(step: OrchestrationStep): OrchestrationStep {
  return {
    key: step.key,
    tool: step.tool,
    params: step.params,
    reason: undefined as unknown as string,
  };
}

export async function orchestrateReverseTask(
  store: ReverseTaskStore,
  taskId: string,
  options: {
    persistState?: boolean;
    includeSummary?: boolean;
    execute?: boolean;
    resume?: boolean;
    stopOnError?: boolean;
    executionOverrides?: Record<string, ReverseTaskExecutionOverride>;
    strategy?:
      | 'observe-first'
      | 'rebuild-first'
      | 'env-fix'
      | 'artifact-sync'
      | 'evidence-only';
    outputMode?: OutputMode;
    skipSteps?: string[];
    fromStep?: string;
    onlySteps?: string[];
  } = {},
): Promise<{
  taskId: string;
  currentStage: string;
  status: string;
  nextStepHint: string;
  currentSummary: string;
  advice: {
    stage: string;
    confidence: number;
    nextStep: string;
    why: string;
    alternatives: string[];
    avoid: string[];
  };
  orchestration: {
    primaryStep: OrchestrationStep;
    suggestedSteps: OrchestrationStep[];
  };
  outputMode: OutputMode;
  fallbackPlan?: {
    reason: string;
    recommendedStrategy?:
      | 'observe-first'
      | 'rebuild-first'
      | 'env-fix'
      | 'artifact-sync'
      | 'evidence-only';
    steps: OrchestrationStep[];
  };
  execution?: Awaited<ReturnType<typeof executeReverseTaskPlan>>;
  summary?: Awaited<ReturnType<typeof getReverseTaskState>>;
}> {
  const outputMode = options.outputMode ?? 'verbose';
  const persistState = options.persistState ?? true;
  const progressed = persistState
    ? await autoProgressReverseTask(store, taskId)
    : undefined;
  const snapshot = await getReverseTaskState(store, taskId, {
    timelineLimit: 20,
    evidenceLimit: 20,
  });
  const functionSlice = await store.readSnapshot<Record<string, unknown>>(
    taskId,
    'function-slice.json',
  );
  const successCriteria = (snapshot.state?.successCriteria ??
    snapshot.task?.successCriteria ??
    {}) as Record<string, unknown>;
  const advice = recommendNextStep({
    taskId,
    currentStage:
      progressed?.currentStage ??
      String(
        snapshot.state?.currentStage ??
          snapshot.task?.currentStage ??
          'Observe',
      ),
    taskStatus:
      progressed?.status ?? String(snapshot.state?.status ?? 'active'),
    taskGoal: String(snapshot.task?.goal ?? ''),
    hasTargetRequest: Boolean(
      snapshot.targetContext?.targetRequest ||
        snapshot.recentEvidence.some(entry => Boolean(entry.request)),
    ),
    hookRecordCount: snapshot.recentEvidence.filter(
      entry => entry.kind === 'hook-hit' || entry.source === 'hook',
    ).length,
    hasRebuildBundle:
      ['Rebuild', 'Patch', 'PureExtraction', 'Port'].includes(
        String(
          progressed?.currentStage ??
            snapshot.state?.currentStage ??
            snapshot.task?.currentStage ??
            '',
        ),
      ) ||
      ['partial', 'pass'].includes(String(successCriteria.localRebuild ?? '')),
    hasPassingRebuild: String(successCriteria.localRebuild ?? '') === 'pass',
    firstDivergenceKnown:
      snapshot.recentEvidence.some(entry => entry.kind === 'env-gap') ||
      snapshot.recentTimeline.some(entry =>
        String(entry.result ?? '')
          .toLowerCase()
          .includes('divergence'),
      ),
  });

  const currentStage =
    progressed?.currentStage ??
    String(
      snapshot.state?.currentStage ??
        snapshot.task?.currentStage ??
        advice.stage,
    );
  const status =
    progressed?.status ?? String(snapshot.state?.status ?? 'active');
  const nextStepHint = progressed?.nextStepHint ?? advice.nextStep;
  const currentSummary =
    progressed?.currentSummary ??
    String(
      snapshot.state?.currentSummary ??
        snapshot.task?.currentSummary ??
        '任务已初始化，等待补充更多证据。',
    );
  const targetRequest = (
    snapshot.targetContext as {targetRequest?: {url?: string}} | undefined
  )?.targetRequest;
  const targetUrl = String(
    targetRequest?.url ?? snapshot.task?.targetUrl ?? '',
  );
  const targetParam = inferTargetParam(
    String(snapshot.task?.goal ?? ''),
    currentSummary,
    targetUrl,
  );
  const topFunctionsText = snapshot.evidenceAggregates.topFunctions
    .map(entry => entry.value)
    .join(' ');
  const relatedParams = inferRelatedParams(
    String(snapshot.task?.goal ?? ''),
    currentSummary,
    targetUrl,
    topFunctionsText,
    JSON.stringify(snapshot.targetContext ?? {}),
  );
  const targetContext = snapshot.targetContext as
    | {
        candidateScripts?: string[];
        targetRequest?: {url?: string};
        locatedSignature?: {functionName?: string; scriptUrl?: string};
        locatedSource?: {
          scriptId?: string;
          url?: string;
          query?: string;
          lineNumber?: number;
        };
      }
    | undefined;
  const candidateScripts = Array.isArray(targetContext?.candidateScripts)
    ? targetContext.candidateScripts.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : [];
  const observedFunctions = snapshot.evidenceAggregates.topFunctions
    .map(entry => entry.value)
    .filter(item => item.length > 0);
  const preferredUrlPatterns = [
    ...snapshot.evidenceAggregates.topUrls.map(entry => entry.value),
    ...candidateScripts,
  ].filter(
    (item, index, arr) => item.length > 0 && arr.indexOf(item) === index,
  );
  const primaryStep = buildStrategyPrimaryStep(
    taskId,
    options.strategy,
    nextStepHint,
    currentStage,
    {
      targetUrl,
      targetParam,
      locatedFunctionName: targetContext?.locatedSignature?.functionName,
      locatedScriptUrl:
        targetContext?.locatedSource?.url ??
        targetContext?.locatedSignature?.scriptUrl,
      locatedScriptId: targetContext?.locatedSource?.scriptId,
      functionSliceCode:
        typeof functionSlice?.code === 'string'
          ? String(functionSlice.code).slice(0, 12000)
          : undefined,
    },
  );
  if (
    primaryStep.tool === 'locate_signature_function' &&
    relatedParams.length > 0
  ) {
    primaryStep.params = {
      ...primaryStep.params,
      relatedParams,
    };
  }
  if (primaryStep.tool === 'locate_signature_function') {
    primaryStep.params = {
      ...primaryStep.params,
      ...(candidateScripts.length > 0 ? {candidateScripts} : {}),
      ...(observedFunctions.length > 0 ? {observedFunctions} : {}),
      ...(preferredUrlPatterns.length > 0 ? {preferredUrlPatterns} : {}),
    };
  }
  const suggestedSteps: OrchestrationStep[] = [
    {
      key: buildStepKey('manage_reverse_task', {
        action: persistState ? 'progress' : 'get',
        taskId,
      }),
      tool: 'manage_reverse_task',
      reason: persistState
        ? '先同步任务状态，避免基于旧状态继续执行。'
        : '先读取最新任务快照，避免误判当前阶段。',
      params: {action: persistState ? 'progress' : 'get', taskId},
    },
    primaryStep,
  ];

  if (primaryStep.tool !== 'manage_reverse_task') {
    suggestedSteps.push({
      key: buildStepKey('manage_reverse_task', {action: 'timeline', taskId}),
      tool: 'manage_reverse_task',
      reason: '执行主步骤后，建议把结论写回 task artifact，保证可续跑。',
      params: {
        action: 'timeline',
        taskId,
        stage: currentStage.toLowerCase(),
        timelineAction: primaryStep.tool,
        timelineStatus: 'ok',
      },
    });
  }

  const filteredSteps = filterPlannedSteps(suggestedSteps, {
    skipSteps: options.skipSteps,
    fromStep: options.fromStep,
    onlySteps: options.onlySteps,
  });

  const execution = options.execute
    ? await executeReverseTaskPlan(store, taskId, filteredSteps, {
        resume: options.resume,
        stopOnError: options.stopOnError,
        currentStage,
        executionOverrides: options.executionOverrides,
      })
    : undefined;
  const postExecution = options.execute
    ? await getReverseTaskState(store, taskId, {
        timelineLimit: 20,
        evidenceLimit: 20,
      })
    : snapshot;
  const summary =
    options.includeSummary === false || outputMode === 'compact'
      ? undefined
      : postExecution;
  const filtersApplied = Boolean(
    (options.skipSteps && options.skipSteps.length > 0) ||
      options.fromStep ||
      (options.onlySteps && options.onlySteps.length > 0),
  );

  return {
    taskId,
    currentStage,
    status,
    nextStepHint,
    currentSummary,
    advice,
    outputMode,
    orchestration: {
      primaryStep:
        outputMode === 'compact'
          ? compactStep(
              filtersApplied ? (filteredSteps[0] ?? primaryStep) : primaryStep,
            )
          : filtersApplied
            ? (filteredSteps[0] ?? primaryStep)
            : primaryStep,
      suggestedSteps:
        outputMode === 'compact'
          ? filteredSteps.map(compactStep)
          : filteredSteps,
    },
    ...(buildFallbackPlan(taskId, execution)
      ? {fallbackPlan: buildFallbackPlan(taskId, execution)}
      : {}),
    ...(execution ? {execution} : {}),
    ...(summary ? {summary} : {}),
  };
}

function matchesStepSelector(
  step: OrchestrationStep,
  selector: string,
): boolean {
  return step.key === selector || step.tool === selector;
}

function ensureStepExists(
  steps: OrchestrationStep[],
  selector: string,
  optionName: string,
): void {
  if (!steps.some(step => matchesStepSelector(step, selector))) {
    throw new Error(`${optionName} references unknown step: ${selector}`);
  }
}

function filterPlannedSteps(
  steps: OrchestrationStep[],
  options: {
    skipSteps?: string[];
    fromStep?: string;
    onlySteps?: string[];
  },
): OrchestrationStep[] {
  let filtered = [...steps];
  const onlySteps = options.onlySteps ?? [];
  const skipSteps = options.skipSteps ?? [];

  for (const selector of onlySteps) {
    ensureStepExists(steps, selector, 'onlySteps');
  }
  for (const selector of skipSteps) {
    ensureStepExists(steps, selector, 'skipSteps');
  }
  if (options.fromStep) {
    ensureStepExists(steps, options.fromStep, 'fromStep');
  }

  if (onlySteps.length > 0) {
    filtered = filtered.filter(step =>
      onlySteps.some(selector => matchesStepSelector(step, selector)),
    );
  }

  if (options.fromStep) {
    const startIndex = filtered.findIndex(step =>
      matchesStepSelector(step, options.fromStep!),
    );
    if (startIndex < 0) {
      throw new Error(
        `fromStep references a step excluded by onlySteps: ${options.fromStep}`,
      );
    }
    filtered = filtered.slice(startIndex);
  }

  if (skipSteps.length > 0) {
    filtered = filtered.filter(
      step => !skipSteps.some(selector => matchesStepSelector(step, selector)),
    );
  }

  if (filtered.length === 0) {
    throw new Error(
      'Step filters removed every planned step; adjust onlySteps/fromStep/skipSteps.',
    );
  }

  return filtered;
}
