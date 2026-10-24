/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getReverseTaskState} from './ReverseTaskQuery.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';

export async function compareReverseTasks(
  store: ReverseTaskStore,
  leftTaskId: string,
  rightTaskId: string,
): Promise<{
  leftTaskId: string;
  rightTaskId: string;
  summary: {
    stagesDiffer: boolean;
    statusDiffer: boolean;
    sharedTopUrls: string[];
    sharedTopFunctions: string[];
    blockerOverlap: string[];
  };
  left: Awaited<ReturnType<typeof getReverseTaskState>>;
  right: Awaited<ReturnType<typeof getReverseTaskState>>;
}> {
  const [left, right] = await Promise.all([
    getReverseTaskState(store, leftTaskId, {
      timelineLimit: 5,
      evidenceLimit: 10,
    }),
    getReverseTaskState(store, rightTaskId, {
      timelineLimit: 5,
      evidenceLimit: 10,
    }),
  ]);

  const leftUrls = new Set(
    left.evidenceAggregates.topUrls.map(entry => entry.value),
  );
  const rightUrls = new Set(
    right.evidenceAggregates.topUrls.map(entry => entry.value),
  );
  const leftFunctions = new Set(
    left.evidenceAggregates.topFunctions.map(entry => entry.value),
  );
  const rightFunctions = new Set(
    right.evidenceAggregates.topFunctions.map(entry => entry.value),
  );
  const rightBlockers = new Set(right.evidenceAggregates.blockers);

  return {
    leftTaskId,
    rightTaskId,
    summary: {
      stagesDiffer:
        String(
          left.state?.currentStage ?? left.task?.currentStage ?? 'Observe',
        ) !==
        String(
          right.state?.currentStage ?? right.task?.currentStage ?? 'Observe',
        ),
      statusDiffer:
        String(left.state?.status ?? 'active') !==
        String(right.state?.status ?? 'active'),
      sharedTopUrls: [...leftUrls].filter(url => rightUrls.has(url)).sort(),
      sharedTopFunctions: [...leftFunctions]
        .filter(name => rightFunctions.has(name))
        .sort(),
      blockerOverlap: left.evidenceAggregates.blockers
        .filter(blocker => rightBlockers.has(blocker))
        .sort(),
    },
    left,
    right,
  };
}
