/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import type {ReverseTaskStore} from './ReverseTaskStore.js';

export interface AppendReverseTimelineInput {
  taskId: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
  stage: string;
  action: string;
  status: string;
  result?: string;
  next?: string;
  detail?: Record<string, unknown>;
}

export async function appendReverseTimeline(
  store: ReverseTaskStore,
  input: AppendReverseTimelineInput,
): Promise<{
  taskId: string;
  taskFile: string;
  timelineFile: string;
}> {
  const existingTask = await store.readSnapshot<Record<string, unknown>>(
    input.taskId,
    'task.json',
  );
  const task = await store.openTask({
    taskId: input.taskId,
    slug: input.taskSlug ?? String(existingTask?.slug ?? input.taskId),
    targetUrl: input.targetUrl ?? String(existingTask?.targetUrl ?? ''),
    goal: input.goal ?? String(existingTask?.goal ?? ''),
    currentStage: String(existingTask?.currentStage ?? input.stage),
    currentSummary: String(existingTask?.currentSummary ?? ''),
    successCriteria: existingTask?.successCriteria as
      | Record<string, unknown>
      | undefined,
    targetContext: existingTask?.targetContext as
      | Record<string, unknown>
      | undefined,
  });

  await task.appendTimeline({
    stage: input.stage,
    action: input.action,
    status: input.status,
    ...(input.result ? {result: input.result} : {}),
    ...(input.next ? {next: input.next} : {}),
    ...(input.detail ? input.detail : {}),
  });

  return {
    taskId: input.taskId,
    taskFile: path.join(task.taskDir, 'task.json'),
    timelineFile: path.join(task.taskDir, 'timeline.jsonl'),
  };
}
