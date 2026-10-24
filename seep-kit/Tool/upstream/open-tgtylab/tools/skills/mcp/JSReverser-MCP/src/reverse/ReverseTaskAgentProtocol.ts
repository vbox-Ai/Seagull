/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {buildLocalCliCommand} from '../utils/projectPaths.js';

import type {
  ReverseTaskExecutionResult,
  ReverseTaskExecutableStep,
} from './ReverseTaskExecutor.js';

export interface ReverseTaskAgentHints {
  status: 'ok' | 'needs_input';
  summary: string;
  recommendedNextAction: string;
  recommendedTool?: string;
  toolClass?: 'task' | 'orchestration' | 'rebuild' | 'analysis';
  routeHint?:
    | 'stay_on_task_flow'
    | 'switch_to_orchestration'
    | 'switch_to_rebuild'
    | 'switch_to_analysis';
  avoidTools?: string[];
  recommendedStrategy?:
    | 'observe-first'
    | 'rebuild-first'
    | 'env-fix'
    | 'artifact-sync'
    | 'evidence-only';
  recommendedParams?: Record<string, unknown>;
  confidence: number;
  resumeHint?: string;
}

function inferStrategyFromStep(
  step: string | undefined,
): ReverseTaskAgentHints['recommendedStrategy'] {
  if (!step) {
    return undefined;
  }
  if (step === 'export_rebuild_bundle') {
    return 'rebuild-first';
  }
  if (step === 'diff_env_requirements') {
    return 'env-fix';
  }
  if (step === 'manage_reverse_task:get') {
    return 'observe-first';
  }
  if (step === 'manage_reverse_task:summarize') {
    return 'evidence-only';
  }
  if (step === 'manage_reverse_task:timeline') {
    return 'artifact-sync';
  }
  return undefined;
}

export function buildManageTaskAgentHints(args: {
  action: string;
  taskId?: string;
  itemCount?: number;
  nextStepHint?: string;
  currentStage?: string;
  status?: string;
  otherTaskId?: string;
}): ReverseTaskAgentHints {
  const {
    action,
    taskId,
    itemCount,
    nextStepHint,
    currentStage,
    status,
    otherTaskId,
  } = args;

  if (action === 'list') {
    return {
      status: 'ok',
      summary: `已返回任务列表，可继续选择一个 taskId 深入查看。`,
      recommendedNextAction:
        '对最相关任务执行 get 或 summarize，压缩上下文后再决定下一步。',
      recommendedTool: 'manage_reverse_task',
      toolClass: 'task',
      routeHint: 'stay_on_task_flow',
      avoidTools: ['understand_code', 'collect_code'],
      recommendedStrategy: 'observe-first',
      recommendedParams: {action: 'get'},
      confidence: 0.84,
      resumeHint:
        '如需续跑，优先先 get / summarize，再决定是否 orchestration。',
    };
  }

  if (action === 'search') {
    return {
      status: 'ok',
      summary: `已返回 ${itemCount ?? 0} 条命中任务，可继续读取其中一个任务快照。`,
      recommendedNextAction:
        (itemCount ?? 0) > 0
          ? '优先对首个命中任务执行 get 或 summarize。'
          : '当前无命中，建议放宽 query / tag 或改用 list 查看全量任务。',
      recommendedTool: 'manage_reverse_task',
      toolClass: 'task',
      routeHint: 'stay_on_task_flow',
      avoidTools: ['understand_code'],
      recommendedStrategy: (itemCount ?? 0) > 0 ? 'observe-first' : undefined,
      recommendedParams: {action: (itemCount ?? 0) > 0 ? 'get' : 'list'},
      confidence: (itemCount ?? 0) > 0 ? 0.87 : 0.72,
      resumeHint:
        '后续可把命中的 taskId 接到 summarize / orchestrate_reverse_task。',
    };
  }

  if (action === 'compare') {
    return {
      status: 'ok',
      summary: `已比较 ${taskId} 与 ${otherTaskId}，可继续回到单任务摘要或健康检查。`,
      recommendedNextAction:
        '对差异更大的任务执行 summarize 或 get_rebuild_health_report。',
      recommendedTool: 'manage_reverse_task',
      toolClass: 'task',
      routeHint: 'stay_on_task_flow',
      avoidTools: ['collect_code'],
      recommendedStrategy: 'evidence-only',
      recommendedParams: {action: 'summarize', taskId},
      confidence: 0.83,
      resumeHint: `如需继续自动推进，可对 ${taskId} 执行 --orchestrateReverseTask ${taskId}。`,
    };
  }

  if (action === 'progress') {
    return {
      status: 'ok',
      summary: `任务已推进到 ${currentStage ?? '未知阶段'}，当前状态 ${status ?? 'unknown'}。`,
      recommendedNextAction: `按 nextStepHint=${nextStepHint ?? 'recommend_next_step'} 继续执行。`,
      recommendedTool: nextStepHint,
      toolClass:
        nextStepHint === 'export_rebuild_bundle' ||
        nextStepHint === 'diff_env_requirements'
          ? 'rebuild'
          : nextStepHint?.startsWith('manage_reverse_task:')
            ? 'task'
            : 'analysis',
      routeHint:
        nextStepHint === 'export_rebuild_bundle' ||
        nextStepHint === 'diff_env_requirements'
          ? 'switch_to_rebuild'
          : nextStepHint?.startsWith('manage_reverse_task:')
            ? 'stay_on_task_flow'
            : 'switch_to_analysis',
      avoidTools: nextStepHint ? ['list_pages', 'navigate_page'] : undefined,
      recommendedStrategy: inferStrategyFromStep(nextStepHint),
      recommendedParams: taskId ? {taskId} : undefined,
      confidence: 0.91,
      resumeHint: taskId
        ? `可直接执行 --orchestrateReverseTask ${taskId}`
        : undefined,
    };
  }

  if (action === 'get' || action === 'summarize') {
    return {
      status: 'ok',
      summary: `已返回任务 ${taskId ?? ''} 的上下文快照。`,
      recommendedNextAction: nextStepHint
        ? `优先按 nextStepHint=${nextStepHint} 执行。`
        : '可先执行 progress，获取系统推断的下一步。',
      recommendedTool: nextStepHint ?? 'manage_reverse_task',
      toolClass:
        nextStepHint === 'export_rebuild_bundle' ||
        nextStepHint === 'diff_env_requirements'
          ? 'rebuild'
          : nextStepHint && !nextStepHint.startsWith('manage_reverse_task:')
            ? 'analysis'
            : 'task',
      routeHint:
        nextStepHint === 'export_rebuild_bundle' ||
        nextStepHint === 'diff_env_requirements'
          ? 'switch_to_rebuild'
          : nextStepHint && !nextStepHint.startsWith('manage_reverse_task:')
            ? 'switch_to_analysis'
            : 'stay_on_task_flow',
      avoidTools: nextStepHint ? ['list_pages'] : ['understand_code'],
      recommendedStrategy: nextStepHint
        ? inferStrategyFromStep(nextStepHint)
        : 'observe-first',
      recommendedParams: nextStepHint ? {taskId} : {action: 'progress', taskId},
      confidence: nextStepHint ? 0.88 : 0.8,
      resumeHint: taskId
        ? `如需自动续跑，可执行 --orchestrateReverseTask ${taskId}`
        : undefined,
    };
  }

  return {
    status: 'ok',
    summary: `动作 ${action} 已执行。`,
    recommendedNextAction: taskId
      ? '如需继续判断下一步，可执行 summarize / progress / orchestrate_reverse_task。'
      : '如需继续，可回到 list / search 选择任务。',
    recommendedTool: taskId ? 'manage_reverse_task' : 'manage_reverse_task',
    toolClass: 'task',
    routeHint: 'stay_on_task_flow',
    avoidTools: taskId ? ['understand_code'] : ['export_rebuild_bundle'],
    recommendedStrategy: taskId ? 'evidence-only' : 'observe-first',
    recommendedParams: taskId
      ? {action: 'summarize', taskId}
      : {action: 'list'},
    confidence: 0.78,
    resumeHint: taskId
      ? `可执行 --manageReverseTask summarize --taskId ${taskId}`
      : undefined,
  };
}

export function buildOrchestrationAgentHints(args: {
  taskId: string;
  primaryStep: ReverseTaskExecutableStep;
  execution?: ReverseTaskExecutionResult;
  confidence: number;
}): ReverseTaskAgentHints {
  const {taskId, primaryStep, execution, confidence} = args;
  return {
    status: 'ok',
    summary: execution?.failedStep
      ? `编排在 ${execution.failedStep.tool} 处失败，已返回 recovery 信息。`
      : `已生成 ${taskId} 的下一步编排建议。`,
    recommendedNextAction:
      execution?.recovery?.recommendedNextAction ??
      `优先执行 ${primaryStep.tool}。`,
    recommendedTool: execution?.failedStep
      ? 'manage_reverse_task'
      : primaryStep.tool,
    toolClass: execution?.failedStep
      ? 'task'
      : primaryStep.tool === 'export_rebuild_bundle' ||
          primaryStep.tool === 'diff_env_requirements'
        ? 'rebuild'
        : primaryStep.tool === 'manage_reverse_task'
          ? 'task'
          : 'analysis',
    routeHint: execution?.failedStep
      ? 'stay_on_task_flow'
      : primaryStep.tool === 'export_rebuild_bundle' ||
          primaryStep.tool === 'diff_env_requirements'
        ? 'switch_to_rebuild'
        : primaryStep.tool === 'manage_reverse_task'
          ? 'stay_on_task_flow'
          : 'switch_to_analysis',
    avoidTools: execution?.failedStep
      ? ['list_pages', 'navigate_page']
      : ['search_websocket_messages'],
    recommendedStrategy:
      execution?.failedStep?.failureType === 'env_error'
        ? 'env-fix'
        : execution?.failedStep?.failureType === 'tool_error'
          ? 'evidence-only'
          : inferStrategyFromStep(primaryStep.key),
    recommendedParams: execution?.failedStep
      ? {action: 'summarize', taskId}
      : primaryStep.params,
    confidence,
    resumeHint:
      execution?.recovery?.recommendedCommand ??
      buildLocalCliCommand(import.meta.url, [
        '--orchestrateReverseTask',
        taskId,
        '--execute',
        '--resume',
      ]),
  };
}

export function buildRebuildHealthAgentHints(args: {
  taskId: string;
  runtimeError: string;
  observedCapabilities: string[];
  hasPatchSuggestions: boolean;
}): ReverseTaskAgentHints {
  const {taskId, runtimeError, observedCapabilities, hasPatchSuggestions} =
    args;
  return {
    status: 'ok',
    summary: hasPatchSuggestions
      ? `已识别 ${taskId} 的补环境缺口，可直接转到 diff_env_requirements。`
      : `当前未识别到明确 env gap，建议继续补充证据。`,
    recommendedNextAction: hasPatchSuggestions
      ? '先套用最小补环境片段，再重试 rebuild / orchestration。'
      : '继续补充 runtime evidence，或重新执行 summarize / compare 对齐上下文。',
    recommendedTool: hasPatchSuggestions
      ? 'diff_env_requirements'
      : 'manage_reverse_task',
    toolClass: hasPatchSuggestions ? 'rebuild' : 'task',
    routeHint: hasPatchSuggestions ? 'switch_to_rebuild' : 'stay_on_task_flow',
    avoidTools: hasPatchSuggestions
      ? ['understand_code']
      : ['export_rebuild_bundle'],
    recommendedStrategy: hasPatchSuggestions ? 'env-fix' : 'observe-first',
    recommendedParams: hasPatchSuggestions
      ? {runtimeError, observedCapabilities}
      : {action: 'summarize', taskId},
    confidence: hasPatchSuggestions ? 0.89 : 0.7,
    resumeHint: hasPatchSuggestions
      ? `可先复查 get_rebuild_health_report，然后执行 --orchestrateReverseTask ${taskId} --strategy env-fix`
      : `可执行 --manageReverseTask summarize --taskId ${taskId}`,
  };
}

export function buildRunReverseAgentHints(args: {
  taskId: string;
  goalMode?: 'signature-only' | 'pure-draft' | 'port-ready';
  stopReason:
    | 'analysis_completed'
    | 'pure_extraction_ready'
    | 'task_passed'
    | 'blocked'
    | 'checkpoint_required'
    | 'stalled'
    | 'max_rounds';
  finalState: {
    state?: {status?: string; nextStepHint?: string; currentStage?: string};
  };
  lastPrimaryStep: ReverseTaskExecutableStep;
  roundsExecuted: number;
  maxRounds: number;
}): ReverseTaskAgentHints {
  const {
    taskId,
    goalMode,
    stopReason,
    finalState,
    lastPrimaryStep,
    roundsExecuted,
    maxRounds,
  } = args;
  if (stopReason === 'analysis_completed') {
    return {
      status: 'ok',
      summary: `已跑到函数切片结构理解阶段，当前建议先看 summarize，再决定是否进入 deobfuscate / pure extraction。`,
      recommendedNextAction:
        '先读取任务摘要和 understand-code 产物，再决定是否继续深挖。',
      recommendedTool: 'manage_reverse_task',
      toolClass: 'task',
      routeHint: 'stay_on_task_flow',
      avoidTools: ['list_pages', 'navigate_page'],
      recommendedStrategy: 'evidence-only',
      recommendedParams: {action: 'summarize', taskId},
      confidence: 0.92,
      resumeHint: `可执行 --manageReverseTask summarize --taskId ${taskId}`,
    };
  }

  if (stopReason === 'pure_extraction_ready') {
    if (goalMode === 'port-ready') {
      return {
        status: 'ok',
        summary:
          '已自动完成 port-ready 草稿，建议直接导出 pure portable 单文件。',
        recommendedNextAction:
          '直接导出 run/portable.js，作为便携 pure 交付物，再决定是否保留分析态 artifacts。',
        recommendedTool: 'export_portable_bundle',
        toolClass: 'analysis',
        routeHint: 'switch_to_analysis',
        avoidTools: ['run_reverse_agent'],
        recommendedStrategy: 'evidence-only',
        recommendedParams: {taskId, artifactMode: 'pure'},
        confidence: 0.96,
        resumeHint: `可执行 --exportPortableBundle ${taskId} --artifactMode pure`,
      };
    }
    return {
      status: 'ok',
      summary:
        '已自动完成切片理解与去混淆预处理，当前任务已推进到 PureExtraction 准备态。',
      recommendedNextAction:
        '先查看 summarize 与 pure-extraction 产物，接着固化 fixture / Node pure implementation。',
      recommendedTool: 'manage_reverse_task',
      toolClass: 'task',
      routeHint: 'stay_on_task_flow',
      avoidTools: ['run_reverse_agent'],
      recommendedStrategy: 'evidence-only',
      recommendedParams: {action: 'summarize', taskId},
      confidence: 0.94,
      resumeHint: `可执行 --manageReverseTask summarize --taskId ${taskId}`,
    };
  }

  if (stopReason === 'task_passed') {
    return {
      status: 'ok',
      summary: '任务已经达到 pass，可直接导出摘要或报告。',
      recommendedNextAction:
        '优先 summarize / export report，不要再重复自动续跑。',
      recommendedTool: 'manage_reverse_task',
      toolClass: 'task',
      routeHint: 'stay_on_task_flow',
      avoidTools: ['run_reverse_agent'],
      recommendedStrategy: 'evidence-only',
      recommendedParams: {action: 'summarize', taskId},
      confidence: 0.94,
      resumeHint: `可执行 --manageReverseTask summarize --taskId ${taskId}`,
    };
  }

  if (stopReason === 'checkpoint_required' || stopReason === 'blocked') {
    return {
      status: 'needs_input',
      summary: '自动续跑已停下，当前更适合先看任务摘要和失败上下文。',
      recommendedNextAction:
        '先检查失败步骤与任务摘要，确认是否是 env gap / 外部依赖 / 上下文缺失。',
      recommendedTool: 'manage_reverse_task',
      toolClass: 'task',
      routeHint: 'stay_on_task_flow',
      avoidTools: ['run_reverse_agent'],
      recommendedStrategy:
        stopReason === 'checkpoint_required' ? 'env-fix' : 'evidence-only',
      recommendedParams: {action: 'summarize', taskId},
      confidence: 0.84,
      resumeHint: `可执行 --manageReverseTask summarize --taskId ${taskId}`,
    };
  }

  return {
    status: 'ok',
    summary: `自动续跑共执行 ${roundsExecuted}/${maxRounds} 轮，当前停在 ${lastPrimaryStep.tool}。`,
    recommendedNextAction:
      '如仍要继续自动推进，可再次执行 run_reverse_agent；若想先看上下文，先 summarize。',
    recommendedTool: 'run_reverse_agent',
    toolClass: 'orchestration',
    routeHint: 'switch_to_orchestration',
    avoidTools: ['list_pages'],
    recommendedStrategy:
      finalState.state?.nextStepHint === 'diff_env_requirements'
        ? 'env-fix'
        : undefined,
    recommendedParams: {taskId, maxRounds},
    confidence: stopReason === 'stalled' ? 0.63 : 0.75,
    resumeHint: `可执行 --runReverseAgent ${taskId} --maxRounds ${maxRounds}`,
  };
}
