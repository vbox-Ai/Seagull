/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {recommendNextStep} from '../modules/workflows/NextStepAdvisor.js';
import type {ReverseStage} from '../modules/workflows/types.js';

import {getReverseTaskState} from './ReverseTaskQuery.js';
import {updateReverseTaskState} from './ReverseTaskState.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

type TaskStatus = 'active' | 'blocked' | 'partial' | 'pass';

interface AutoProgressSignals {
  hasTargetRequest: boolean;
  hookRecordCount: number;
  evidenceCount: number;
  hasHookEvidence: boolean;
  hasEnvGap: boolean;
  hasTimelineBlocker: boolean;
  hasRebuildBundle: boolean;
  hasPassingRebuild: boolean;
  browserAlignment: string;
  serverAcceptance: string;
  localRebuild: string;
  firstDivergenceKnown: boolean;
  stageConfidence: number;
  explicitStage?: string;
}

function normalizeReverseStage(value: string): ReverseStage | undefined {
  if (
    [
      'Observe',
      'Capture',
      'Rebuild',
      'Patch',
      'DeepDive',
      'PureExtraction',
      'Port',
    ].includes(value)
  ) {
    return value as ReverseStage;
  }
  return undefined;
}

function collectSignals(
  state: Awaited<ReturnType<typeof getReverseTaskState>>,
): AutoProgressSignals {
  const successCriteria = (state.state?.successCriteria ??
    state.task?.successCriteria ??
    {}) as Record<string, unknown>;
  const explicitStage = String(
    state.state?.currentStage ?? state.task?.currentStage ?? '',
  );
  const hasTargetRequest = Boolean(
    (state.targetContext as Record<string, unknown> | undefined)
      ?.targetRequest ||
      state.recentEvidence.some(entry => Boolean(entry.request)),
  );
  const hookRecordCount = state.recentEvidence.filter(
    entry => entry.kind === 'hook-hit' || entry.source === 'hook',
  ).length;
  const evidenceCount = state.recentEvidence.length;
  const hasEnvGap =
    state.recentEvidence.some(entry => entry.kind === 'env-gap') ||
    state.recentTimeline.some(entry =>
      String(entry.action ?? '').includes('diff_env_requirements'),
    );
  const hasTimelineBlocker = state.recentTimeline.some(
    entry => String(entry.status ?? '') === 'blocked',
  );
  const localRebuild = String(successCriteria.localRebuild ?? '');
  const browserAlignment = String(successCriteria.browserAlignment ?? '');
  const serverAcceptance = String(successCriteria.serverAcceptance ?? '');
  const hasPassingRebuild = localRebuild === 'pass';
  const hasRebuildBundle =
    ['Rebuild', 'Patch', 'PureExtraction', 'Port'].includes(explicitStage) ||
    ['partial', 'pass'].includes(localRebuild) ||
    state.recentTimeline.some(
      entry => String(entry.action ?? '') === 'export_rebuild_bundle',
    );
  const firstDivergenceKnown =
    hasEnvGap ||
    state.recentTimeline.some(
      entry =>
        typeof entry.result === 'string' &&
        String(entry.result).toLowerCase().includes('divergence'),
    );
  const stageConfidence = calculateStageConfidence({
    hasTargetRequest,
    hasHookEvidence: hookRecordCount > 0,
    hasRebuildBundle,
    hasPassingRebuild,
    browserAlignment,
    serverAcceptance,
    firstDivergenceKnown,
  });

  return {
    hasTargetRequest,
    hookRecordCount,
    evidenceCount,
    hasHookEvidence: hookRecordCount > 0,
    hasEnvGap,
    hasTimelineBlocker,
    hasRebuildBundle,
    hasPassingRebuild,
    browserAlignment,
    serverAcceptance,
    localRebuild,
    firstDivergenceKnown,
    stageConfidence,
    ...(explicitStage ? {explicitStage} : {}),
  };
}

function calculateStageConfidence(signals: {
  hasTargetRequest: boolean;
  hasHookEvidence: boolean;
  hasRebuildBundle: boolean;
  hasPassingRebuild: boolean;
  browserAlignment: string;
  serverAcceptance: string;
  firstDivergenceKnown: boolean;
}): number {
  if (
    signals.hasPassingRebuild &&
    signals.browserAlignment === 'pass' &&
    signals.serverAcceptance === 'pass'
  ) {
    return 1;
  }
  let score = 0.35;
  if (signals.hasTargetRequest) score += 0.15;
  if (signals.hasHookEvidence) score += 0.2;
  if (signals.hasRebuildBundle) score += 0.15;
  if (signals.firstDivergenceKnown) score += 0.05;
  if (signals.hasPassingRebuild) score += 0.1;
  if (signals.browserAlignment === 'pass') score += 0.1;
  if (signals.serverAcceptance === 'pass') score += 0.1;
  return Math.min(1, Number(score.toFixed(2)));
}

function inferCurrentStage(
  state: Awaited<ReturnType<typeof getReverseTaskState>>,
  signals: AutoProgressSignals,
): ReverseStage {
  const explicit = normalizeReverseStage(String(signals.explicitStage ?? ''));
  if (
    explicit === 'Port' ||
    explicit === 'PureExtraction' ||
    explicit === 'Patch'
  ) {
    return explicit;
  }

  if (
    signals.hasPassingRebuild &&
    signals.browserAlignment === 'pass' &&
    signals.serverAcceptance === 'pass'
  ) {
    return 'Port';
  }
  if (signals.hasPassingRebuild && signals.browserAlignment === 'pass') {
    return 'PureExtraction';
  }
  if (
    signals.hasRebuildBundle &&
    (signals.hasEnvGap ||
      signals.firstDivergenceKnown ||
      signals.localRebuild === 'partial')
  ) {
    return 'Patch';
  }
  if (signals.hasRebuildBundle || signals.hasHookEvidence) {
    return 'Rebuild';
  }
  if (signals.hasTargetRequest) {
    return 'Capture';
  }
  return explicit ?? 'Observe';
}

function inferTaskStatus(
  state: Awaited<ReturnType<typeof getReverseTaskState>>,
  stage: ReverseStage,
  signals: AutoProgressSignals,
): TaskStatus {
  const existing = String(state.state?.status ?? '');
  if (existing === 'blocked' || existing === 'pass') {
    return existing as TaskStatus;
  }

  if (
    signals.localRebuild === 'pass' &&
    (signals.browserAlignment === 'pass' ||
      signals.serverAcceptance === 'pass' ||
      stage === 'PureExtraction' ||
      stage === 'Port')
  ) {
    return 'pass';
  }
  if (signals.hasTimelineBlocker) {
    return 'blocked';
  }
  if (signals.localRebuild === 'partial' || stage === 'Patch') {
    return 'partial';
  }
  return 'active';
}

function inferCurrentSummary(
  state: Awaited<ReturnType<typeof getReverseTaskState>>,
  nextStepHint: string,
): string {
  const existing = String(
    state.state?.currentSummary ?? state.task?.currentSummary ?? '',
  );
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const lastEvidence = state.recentEvidence.at(-1) as
    | Record<string, unknown>
    | undefined;
  const evidenceNote =
    typeof lastEvidence?.note === 'string'
      ? lastEvidence.note
      : typeof lastEvidence?.source === 'string'
        ? `最近证据来自 ${lastEvidence.source}`
        : '';

  if (evidenceNote) {
    return `${evidenceNote}；建议下一步执行 ${nextStepHint}。`;
  }

  return `任务已初始化，建议下一步执行 ${nextStepHint}。`;
}

function stageRank(stage: ReverseStage): number {
  return [
    'Observe',
    'Capture',
    'Rebuild',
    'Patch',
    'DeepDive',
    'PureExtraction',
    'Port',
  ].indexOf(stage);
}

function inferAdviceStage(
  inferredStage: ReverseStage,
  adviceStage: ReverseStage,
  signals: AutoProgressSignals,
): ReverseStage {
  if (
    adviceStage === 'PureExtraction' &&
    signals.browserAlignment === 'pass' &&
    signals.serverAcceptance === 'pass'
  ) {
    return 'Port';
  }
  if (stageRank(inferredStage) > stageRank(adviceStage)) {
    return inferredStage;
  }
  return adviceStage;
}

function inferNextStepHint(
  stage: ReverseStage,
  adviceNextStep: string,
  signals: AutoProgressSignals,
): string {
  if (stage === 'Port') {
    return 'manage_reverse_task:summarize';
  }
  if (stage === 'Patch' && signals.hasEnvGap) {
    return 'diff_env_requirements';
  }
  if (stage === 'Rebuild' && !signals.hasRebuildBundle) {
    return 'export_rebuild_bundle';
  }
  if (
    stage === 'Capture' &&
    signals.hasTargetRequest &&
    !signals.hasHookEvidence &&
    adviceNextStep === 'inject_hook'
  ) {
    return 'locate_signature_function';
  }
  return adviceNextStep;
}

function buildReasoning(
  stage: ReverseStage,
  status: TaskStatus,
  nextStepHint: string,
  signals: AutoProgressSignals,
): string[] {
  const reasoning: string[] = [];

  if (!signals.hasTargetRequest) {
    reasoning.push('尚未确认目标请求，任务停留在 Observe / Capture 前置阶段。');
  } else {
    reasoning.push('已识别目标请求，可以围绕该请求继续推进。');
  }

  if (signals.hasHookEvidence) {
    reasoning.push(
      `已存在 ${signals.hookRecordCount} 条 hook 证据，可进入本地固化或复现。`,
    );
  }

  if (signals.hasRebuildBundle) {
    reasoning.push('任务已具备本地复现迹象，优先根据 env rebuild 结果推进。');
  }

  if (signals.hasEnvGap || signals.firstDivergenceKnown) {
    reasoning.push(
      '已观察到 env gap / first divergence，当前应按最小因果单元修补。',
    );
  }

  if (stage === 'PureExtraction') {
    reasoning.push('本地链路已通过且浏览器对齐，适合进入纯算法提取阶段。');
  }

  if (stage === 'Port') {
    reasoning.push(
      '本地链路、浏览器对齐、服务端验收均已通过，可视为进入 Port 收口阶段。',
    );
  }

  if (status === 'blocked') {
    reasoning.push('最近时间线存在 blocked 信号，需先解除阻塞再继续推进。');
  }

  reasoning.push(`系统推荐下一步：${nextStepHint}。`);
  return reasoning;
}

export async function autoProgressReverseTask(
  store: ReverseTaskStore,
  taskId: string,
): Promise<{
  taskId: string;
  currentStage: ReverseStage;
  status: TaskStatus;
  nextStepHint: string;
  currentSummary: string;
  signals: AutoProgressSignals;
  reasoning: string[];
}> {
  const state = await getReverseTaskState(store, taskId, {
    timelineLimit: 20,
    evidenceLimit: 20,
  });
  const signals = collectSignals(state);
  const currentStage = inferCurrentStage(state, signals);

  const advice = recommendNextStep({
    currentStage,
    taskGoal: String(state.task?.goal ?? ''),
    hasTargetRequest: signals.hasTargetRequest,
    hookRecordCount: signals.hookRecordCount,
    hasRebuildBundle: signals.hasRebuildBundle,
    hasPassingRebuild: signals.hasPassingRebuild,
    firstDivergenceKnown: signals.firstDivergenceKnown,
  });

  const resolvedStage = inferAdviceStage(currentStage, advice.stage, signals);
  const nextStepHint = inferNextStepHint(
    resolvedStage,
    advice.nextStep,
    signals,
  );
  const status = inferTaskStatus(state, resolvedStage, signals);
  const currentSummary = inferCurrentSummary(state, nextStepHint);
  const reasoning = buildReasoning(
    resolvedStage,
    status,
    nextStepHint,
    signals,
  );

  await updateReverseTaskState(store, {
    taskId,
    currentStage: resolvedStage,
    status,
    nextStepHint,
    currentSummary,
    signals: {...signals},
    reasoning,
  });

  return {
    taskId,
    currentStage: resolvedStage,
    status,
    nextStepHint,
    currentSummary,
    signals,
    reasoning,
  };
}
