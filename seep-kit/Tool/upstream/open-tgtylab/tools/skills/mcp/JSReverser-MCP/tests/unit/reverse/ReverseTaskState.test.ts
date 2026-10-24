/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {startReverseTask} from '../../../src/reverse/ReverseTaskBootstrap.js';
import {updateReverseTaskState} from '../../../src/reverse/ReverseTaskState.js';
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';

describe('ReverseTaskState', () => {
  it('updates state.json and task.json stage/summary fields', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-task-state-'),
    );
    try {
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-state-001',
        taskSlug: 'state-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'init',
      });

      const result = await updateReverseTaskState(store, {
        taskId: 'task-state-001',
        currentStage: 'Patch',
        status: 'partial',
        currentSummary: '已定位 first divergence',
        successCriteria: {localRebuild: 'partial'},
      });

      const taskJson = JSON.parse(
        await readFile(result.taskFile, 'utf8'),
      ) as Record<string, unknown>;
      const stateJson = JSON.parse(
        await readFile(result.stateFile, 'utf8'),
      ) as Record<string, unknown>;
      assert.strictEqual(taskJson.currentStage, 'Patch');
      assert.strictEqual(stateJson.currentStage, 'Patch');
      assert.strictEqual(stateJson.status, 'partial');
      assert.strictEqual(taskJson.currentSummary, '已定位 first divergence');
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
