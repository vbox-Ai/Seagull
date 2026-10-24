/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

import type {ReverseTaskDescriptor} from '../types/index.js';

import {listReverseTasks} from './ReverseTaskList.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

async function readTaskDescriptor(
  store: ReverseTaskStore,
  taskId: string,
): Promise<ReverseTaskDescriptor> {
  const task = await store.readSnapshot<ReverseTaskDescriptor>(
    taskId,
    'task.json',
  );
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

async function writeTaskDescriptor(
  store: ReverseTaskStore,
  descriptor: ReverseTaskDescriptor,
): Promise<ReverseTaskDescriptor> {
  const nextDescriptor: ReverseTaskDescriptor = {
    ...descriptor,
    updatedAt: Date.now(),
  };
  await writeFile(
    path.join(store.getTaskDir(descriptor.taskId), 'task.json'),
    `${JSON.stringify(nextDescriptor, null, 2)}\n`,
    'utf8',
  );
  return nextDescriptor;
}

export async function archiveReverseTask(
  store: ReverseTaskStore,
  taskId: string,
): Promise<{taskId: string; archivedAt: number}> {
  const descriptor = await readTaskDescriptor(store, taskId);
  const archivedAt = Date.now();
  await writeTaskDescriptor(store, {
    ...descriptor,
    archivedAt,
  });
  return {taskId, archivedAt};
}

export async function restoreReverseTask(
  store: ReverseTaskStore,
  taskId: string,
): Promise<{taskId: string; restored: boolean}> {
  const descriptor = await readTaskDescriptor(store, taskId);
  await writeTaskDescriptor(store, {
    ...descriptor,
    archivedAt: undefined,
  });
  return {taskId, restored: true};
}

export async function tagReverseTask(
  store: ReverseTaskStore,
  taskId: string,
  tags: string[],
  options: {replace?: boolean} = {},
): Promise<{taskId: string; tags: string[]}> {
  const descriptor = await readTaskDescriptor(store, taskId);
  const normalized = tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
  const nextTags = options.replace
    ? normalized
    : [...new Set([...(descriptor.tags ?? []), ...normalized])].sort();
  await writeTaskDescriptor(store, {
    ...descriptor,
    tags: nextTags,
  });
  return {taskId, tags: nextTags};
}

export async function searchReverseTasks(
  store: ReverseTaskStore,
  options: {
    query?: string;
    tag?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {},
) {
  const rows = await listReverseTasks(store, {
    includeArchived: options.includeArchived,
    limit: options.limit,
  });
  const normalizedQuery = options.query?.trim().toLowerCase();
  const normalizedTag = options.tag?.trim().toLowerCase();

  return rows.filter(row => {
    const matchesQuery =
      !normalizedQuery ||
      [
        row.taskId,
        row.slug,
        row.goal,
        row.currentStage,
        row.status,
        row.nextStepHint,
      ].some(value => value.toLowerCase().includes(normalizedQuery));
    const matchesTag =
      !normalizedTag ||
      row.tags.some(tag => tag.toLowerCase() === normalizedTag);
    return matchesQuery && matchesTag;
  });
}

export async function pruneReverseTasks(
  store: ReverseTaskStore,
  options: {olderThanDays?: number} = {},
): Promise<{removedTaskIds: string[]}> {
  const rows = await listReverseTasks(store, {includeArchived: true});
  const cutoff =
    options.olderThanDays && options.olderThanDays > 0
      ? Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000
      : undefined;
  const removable = rows.filter(
    row =>
      typeof row.archivedAt === 'number' &&
      (cutoff === undefined || row.archivedAt <= cutoff),
  );

  for (const row of removable) {
    await rm(store.getTaskDir(row.taskId), {recursive: true, force: true});
  }

  return {
    removedTaskIds: removable.map(row => row.taskId),
  };
}
