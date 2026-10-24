/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ReverseTaskExecutableStep} from './ReverseTaskExecutor.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

export type ReverseTaskFailureType =
  | 'tool_error'
  | 'env_error'
  | 'validation_error'
  | 'external_error'
  | 'unknown';

export interface ReverseTaskExecutionStepResult {
  key: string;
  tool: string;
  status: 'passed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  failureType?: ReverseTaskFailureType;
  retryable?: boolean;
  retryCount?: number;
  lastErrorAt?: number;
  updatedAt: number;
}

export interface ReverseTaskExecutionCheckpoint {
  taskId: string;
  status: 'running' | 'failed' | 'passed';
  failureType?: ReverseTaskFailureType;
  retryable?: boolean;
  currentStepKey?: string;
  completedSteps: string[];
  pendingSteps: string[];
  failedStepKey?: string;
  stepResults: ReverseTaskExecutionStepResult[];
  plannedSteps?: ReverseTaskExecutableStep[];
  updatedAt: number;
}

const CHECKPOINT_FILE = 'orchestration-checkpoint.json';

export async function readReverseTaskCheckpoint(
  store: ReverseTaskStore,
  taskId: string,
): Promise<ReverseTaskExecutionCheckpoint | undefined> {
  return store.readSnapshot<ReverseTaskExecutionCheckpoint>(
    taskId,
    CHECKPOINT_FILE,
  );
}

export async function writeReverseTaskCheckpoint(
  store: ReverseTaskStore,
  taskId: string,
  checkpoint: ReverseTaskExecutionCheckpoint,
): Promise<ReverseTaskExecutionCheckpoint> {
  const existingTask = await store.readSnapshot<Record<string, unknown>>(
    taskId,
    'task.json',
  );
  const task = await store.openTask({
    taskId,
    slug: String(existingTask?.slug ?? taskId),
    targetUrl: String(existingTask?.targetUrl ?? ''),
    goal: String(existingTask?.goal ?? ''),
    currentStage:
      typeof existingTask?.currentStage === 'string'
        ? existingTask.currentStage
        : undefined,
    currentSummary:
      typeof existingTask?.currentSummary === 'string'
        ? existingTask.currentSummary
        : undefined,
    successCriteria: existingTask?.successCriteria as
      | Record<string, unknown>
      | undefined,
    targetContext: existingTask?.targetContext as
      | Record<string, unknown>
      | undefined,
  });
  await task.writeSnapshot(CHECKPOINT_FILE, checkpoint);
  return checkpoint;
}
