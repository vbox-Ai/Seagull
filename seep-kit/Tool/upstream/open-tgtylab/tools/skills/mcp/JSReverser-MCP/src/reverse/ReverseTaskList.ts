/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getReverseTaskState} from './ReverseTaskQuery.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

export async function listReverseTasks(
  store: ReverseTaskStore,
  options: {limit?: number; includeArchived?: boolean} = {},
): Promise<
  Array<{
    taskId: string;
    slug: string;
    currentStage: string;
    status: string;
    nextStepHint: string;
    updatedAt: number;
    goal: string;
    tags: string[];
    archivedAt?: number;
  }>
> {
  const taskIds = await store.listTaskIds();
  const rows = await Promise.all(
    taskIds.map(async taskId => {
      const state = await getReverseTaskState(store, taskId, {
        timelineLimit: 1,
        evidenceLimit: 1,
      });
      return {
        taskId,
        slug: String(state.task?.slug ?? ''),
        currentStage: String(
          state.state?.currentStage ?? state.task?.currentStage ?? 'Observe',
        ),
        status: String(state.state?.status ?? 'active'),
        nextStepHint: String(
          state.state?.nextStepHint ?? 'recommend_next_step',
        ),
        updatedAt: Number(state.state?.updatedAt ?? state.task?.updatedAt ?? 0),
        goal: String(state.task?.goal ?? ''),
        tags: Array.isArray(state.task?.tags)
          ? state.task!.tags.map(item => String(item))
          : [],
        archivedAt:
          typeof state.task?.archivedAt === 'number'
            ? Number(state.task.archivedAt)
            : undefined,
      };
    }),
  );

  return rows
    .filter(row => options.includeArchived || row.archivedAt === undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, options.limit ?? rows.length);
}
