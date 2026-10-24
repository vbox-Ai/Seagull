/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {orchestrateReverseTask} from './ReverseTaskOrchestrator.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';
import {appendReverseTimeline} from './ReverseTaskTimeline.js';

export type ReverseAgentStopReason =
  | 'analysis_completed'
  | 'pure_extraction_ready'
  | 'task_passed'
  | 'blocked'
  | 'checkpoint_required'
  | 'stalled'
  | 'max_rounds';

export interface ReverseAgentRoundResult {
  round: number;
  stage: string;
  status: string;
  primaryTool: string;
  nextStepHint: string;
  completedStepCount: number;
  failedStep?: {
    tool: string;
    failureType?: string;
    retryable?: boolean;
  };
}

export interface ReverseAgentRunResult {
  taskId: string;
  roundsExecuted: number;
  stopReason: ReverseAgentStopReason;
  currentStage: string;
  status: string;
  nextStepHint: string;
  currentSummary: string;
  rounds: ReverseAgentRoundResult[];
  lastOrchestration: Awaited<ReturnType<typeof orchestrateReverseTask>>;
}

export async function appendReverseAgentLog(
  store: ReverseTaskStore,
  taskId: string,
  entry: Record<string, unknown>,
): Promise<void> {
  const task = await store.readSnapshot<Record<string, unknown>>(
    taskId,
    'task.json',
  );
  if (!task) {
    return;
  }
  const opened = await store.openTask({
    taskId,
    slug: String(task.slug ?? taskId),
    targetUrl: String(task.targetUrl ?? ''),
    goal: String(task.goal ?? ''),
    currentStage: String(task.currentStage ?? 'Observe'),
    currentSummary: String(task.currentSummary ?? ''),
    successCriteria: task.successCriteria as
      | Record<string, unknown>
      | undefined,
    targetContext: task.targetContext as Record<string, unknown> | undefined,
  });
  await opened.appendLog('runtime-evidence', {
    source: 'run_reverse_agent',
    kind: 'auto-agent',
    ...entry,
  });
}

export async function markReverseAgentStop(
  store: ReverseTaskStore,
  taskId: string,
  stage: string,
  stopReason: ReverseAgentStopReason,
  detail: Record<string, unknown>,
): Promise<void> {
  await appendReverseTimeline(store, {
    taskId,
    stage: stage.toLowerCase(),
    action: 'run_reverse_agent',
    status: stopReason === 'blocked' ? 'error' : 'ok',
    result: stopReason,
    next: String(detail.nextStepHint ?? 'manage_reverse_task:summarize'),
    detail,
  });
  await appendReverseAgentLog(store, taskId, {
    stopReason,
    stage,
    ...detail,
  });
}
