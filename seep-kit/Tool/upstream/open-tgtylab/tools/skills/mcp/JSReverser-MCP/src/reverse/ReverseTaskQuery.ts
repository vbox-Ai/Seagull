/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {access} from 'node:fs/promises';
import path from 'node:path';

import type {ReverseTaskState} from '../types/index.js';

import {
  buildReverseTaskEvidenceIndex,
  type ReverseTaskEvidenceAggregates,
} from './ReverseTaskEvidenceIndex.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

function isNonEmptyRecord(
  value: Record<string, unknown> | undefined,
): value is Record<string, unknown> {
  return value !== undefined && Object.keys(value).length > 0;
}

export interface ReverseTaskCompactDelivery {
  portablePureReady: boolean;
  portableReplayReady: boolean;
  files: string[];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readCompactDelivery(
  store: ReverseTaskStore,
  taskId: string,
): Promise<ReverseTaskCompactDelivery> {
  const taskDir = store.getTaskDir(taskId);
  const candidates = [
    {file: 'run/portable.js', key: 'portablePureReady'},
    {file: 'env/replay.js', key: 'portableReplayReady'},
  ] as const;

  const checks = await Promise.all(
    candidates.map(async candidate => ({
      ...candidate,
      exists: await pathExists(path.join(taskDir, candidate.file)),
    })),
  );

  return {
    portablePureReady: checks.some(
      entry => entry.key === 'portablePureReady' && entry.exists,
    ),
    portableReplayReady: checks.some(
      entry => entry.key === 'portableReplayReady' && entry.exists,
    ),
    files: checks.filter(entry => entry.exists).map(entry => entry.file),
  };
}

export async function getReverseTaskState(
  store: ReverseTaskStore,
  taskId: string,
  options: {timelineLimit?: number; evidenceLimit?: number} = {},
): Promise<{
  taskId: string;
  task: Record<string, unknown> | undefined;
  state: ReverseTaskState | undefined;
  targetContext: Record<string, unknown> | undefined;
  recentTimeline: Array<Record<string, unknown>>;
  recentEvidence: Array<Record<string, unknown>>;
  evidenceAggregates: ReverseTaskEvidenceAggregates;
  compactDelivery: ReverseTaskCompactDelivery;
}> {
  const [task, state, targetContext, timeline, evidence, compactDelivery] =
    await Promise.all([
      store.readSnapshot<Record<string, unknown>>(taskId, 'task.json'),
      store.readSnapshot<ReverseTaskState>(taskId, 'state.json'),
      store.readSnapshot<Record<string, unknown>>(
        taskId,
        'target-context.json',
      ),
      store.readLog('timeline', taskId),
      store.readLog('runtime-evidence', taskId),
      readCompactDelivery(store, taskId),
    ]);

  const timelineLimit = options.timelineLimit ?? 10;
  const evidenceLimit = options.evidenceLimit ?? 10;
  const effectiveTargetContext = isNonEmptyRecord(targetContext)
    ? targetContext
    : (task?.targetContext as Record<string, unknown> | undefined);
  const evidenceIndex = buildReverseTaskEvidenceIndex(evidence, {
    targetContext: effectiveTargetContext,
  });

  return {
    taskId,
    task,
    state,
    targetContext: effectiveTargetContext,
    recentTimeline: timeline.slice(-timelineLimit),
    recentEvidence: evidenceIndex.dedupedEntries.slice(-evidenceLimit),
    evidenceAggregates: evidenceIndex.aggregates,
    compactDelivery,
  };
}
