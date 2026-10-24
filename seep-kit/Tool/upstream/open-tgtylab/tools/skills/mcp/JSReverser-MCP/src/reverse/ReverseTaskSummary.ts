/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ReverseTaskEvidenceAggregates} from './ReverseTaskEvidenceIndex.js';
import {getReverseTaskState} from './ReverseTaskQuery.js';
import type {ReverseTaskCompactDelivery} from './ReverseTaskQuery.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

function stringifyList(items: unknown[], limit: number): string[] {
  return items.slice(-limit).map(item => {
    if (!item || typeof item !== 'object') {
      return String(item);
    }
    const record = item as Record<string, unknown>;
    const stage = typeof record.stage === 'string' ? `[${record.stage}] ` : '';
    const action =
      typeof record.action === 'string'
        ? record.action
        : typeof record.kind === 'string'
          ? record.kind
          : typeof record.source === 'string'
            ? record.source
            : 'event';
    const detail =
      typeof record.result === 'string'
        ? record.result
        : typeof record.note === 'string'
          ? record.note
          : typeof record.status === 'string'
            ? record.status
            : '';
    return `${stage}${action}${detail ? `: ${detail}` : ''}`;
  });
}

export async function summarizeReverseTask(
  store: ReverseTaskStore,
  taskId: string,
  options: {timelineLimit?: number; evidenceLimit?: number} = {},
): Promise<{
  taskId: string;
  headline: string;
  currentStage: string;
  status: string;
  goal: string;
  currentSummary: string;
  nextStepHint: string;
  recentTimeline: string[];
  recentEvidence: string[];
  successCriteria: Record<string, unknown>;
  signals: Record<string, unknown>;
  reasoning: string[];
  evidenceAggregates: ReverseTaskEvidenceAggregates;
  compactDelivery: ReverseTaskCompactDelivery;
}> {
  const state = await getReverseTaskState(store, taskId, options);
  const currentStage = String(
    state.state?.currentStage ?? state.task?.currentStage ?? 'Observe',
  );
  const status = String(state.state?.status ?? 'active');
  const goal = String(state.task?.goal ?? '');
  const currentSummary = String(
    state.state?.currentSummary ??
      state.task?.currentSummary ??
      '任务已初始化，但尚未补充摘要。',
  );
  const nextStepHint = String(
    state.state?.nextStepHint ?? 'recommend_next_step',
  );
  const successCriteria = (state.state?.successCriteria ??
    state.task?.successCriteria ??
    {}) as Record<string, unknown>;
  const signals = (state.state?.signals ?? {}) as Record<string, unknown>;
  const reasoning = Array.isArray(state.state?.reasoning)
    ? state.state.reasoning.map(item => String(item))
    : [];

  return {
    taskId,
    headline: `${taskId} | ${currentStage} | ${status}`,
    currentStage,
    status,
    goal,
    currentSummary,
    nextStepHint,
    recentTimeline: stringifyList(
      state.recentTimeline,
      options.timelineLimit ?? 5,
    ),
    recentEvidence: stringifyList(
      state.recentEvidence,
      options.evidenceLimit ?? 5,
    ),
    successCriteria,
    signals,
    reasoning,
    evidenceAggregates: state.evidenceAggregates,
    compactDelivery: state.compactDelivery,
  };
}
