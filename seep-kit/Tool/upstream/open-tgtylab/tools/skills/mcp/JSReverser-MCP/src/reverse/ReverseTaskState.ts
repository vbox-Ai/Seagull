/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import type {ReverseTaskState} from '../types/index.js';

import type {ReverseTaskStore} from './ReverseTaskStore.js';

export interface UpdateReverseTaskStateInput {
  taskId: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
  currentStage?: string;
  status?: 'active' | 'blocked' | 'partial' | 'pass';
  currentSummary?: string;
  nextStepHint?: string;
  successCriteria?: {
    localRebuild?: 'pass' | 'partial' | 'unknown';
    serverAcceptance?: 'pass' | 'partial' | 'unknown';
    browserAlignment?: 'pass' | 'partial' | 'unknown';
    notes?: string;
  };
  signals?: Record<string, unknown>;
  reasoning?: string[];
}

function mergeRecord(
  base: Record<string, unknown> | undefined,
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !extra) return undefined;
  return {
    ...(base ?? {}),
    ...(extra ?? {}),
  };
}

export async function updateReverseTaskState(
  store: ReverseTaskStore,
  input: UpdateReverseTaskStateInput,
): Promise<{
  taskId: string;
  state: ReverseTaskState;
  taskFile: string;
  stateFile: string;
}> {
  const existingTask = await store.readSnapshot<Record<string, unknown>>(
    input.taskId,
    'task.json',
  );
  const existingState = await store.readSnapshot<ReverseTaskState>(
    input.taskId,
    'state.json',
  );

  const task = await store.openTask({
    taskId: input.taskId,
    slug: input.taskSlug ?? String(existingTask?.slug ?? input.taskId),
    targetUrl: input.targetUrl ?? String(existingTask?.targetUrl ?? ''),
    goal: input.goal ?? String(existingTask?.goal ?? ''),
    currentStage:
      input.currentStage ??
      String(
        existingTask?.currentStage ?? existingState?.currentStage ?? 'Observe',
      ),
    currentSummary:
      input.currentSummary ??
      String(
        existingTask?.currentSummary ?? existingState?.currentSummary ?? '',
      ),
    successCriteria: mergeRecord(
      existingTask?.successCriteria as Record<string, unknown> | undefined,
      input.successCriteria,
    ),
    targetContext: existingTask?.targetContext as
      | Record<string, unknown>
      | undefined,
  });

  const nextState: ReverseTaskState = {
    taskId: input.taskId,
    currentStage:
      input.currentStage ??
      existingState?.currentStage ??
      String(existingTask?.currentStage ?? 'Observe'),
    status: input.status ?? existingState?.status ?? 'active',
    nextStepHint: input.nextStepHint ?? existingState?.nextStepHint,
    successCriteria: mergeRecord(
      existingState?.successCriteria,
      input.successCriteria,
    ),
    currentSummary: input.currentSummary ?? existingState?.currentSummary,
    signals: input.signals ?? existingState?.signals,
    reasoning: input.reasoning ?? existingState?.reasoning,
    updatedAt: Date.now(),
  };

  await task.writeSnapshot('state.json', nextState);
  await task.appendTimeline({
    stage: String(nextState.currentStage).toLowerCase(),
    action: 'update_reverse_task_state',
    status: 'ok',
    result: nextState.status,
    next: nextState.nextStepHint ?? 'recommend_next_step',
  });

  return {
    taskId: task.taskId,
    state: nextState,
    taskFile: path.join(task.taskDir, 'task.json'),
    stateFile: path.join(task.taskDir, 'state.json'),
  };
}
