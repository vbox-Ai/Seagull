/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {autoProgressReverseTask} from '../../../src/reverse/ReverseTaskAutoProgress.js';
import {startReverseTask} from '../../../src/reverse/ReverseTaskBootstrap.js';
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';

describe('ReverseTaskAutoProgress', () => {
  it('moves a task with hook evidence toward Rebuild and stores nextStepHint', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-task-auto-progress-'),
    );
    try {
      const store = new ReverseTaskStore({rootDir});
      const task = await startReverseTask(store, {
        taskId: 'task-auto-001',
        taskSlug: 'auto-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'auto progress',
      });
      const opened = await store.openTask({
        taskId: 'task-auto-001',
        slug: 'auto-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'auto progress',
        targetContext: {
          targetRequest: {method: 'POST', url: 'https://example.com/api/sign'},
        },
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        note: 'captured sign sample',
      });

      const result = await autoProgressReverseTask(store, 'task-auto-001');
      assert.strictEqual(result.currentStage, 'Rebuild');
      assert.strictEqual(result.nextStepHint, 'export_rebuild_bundle');
      assert.ok(Array.isArray(result.reasoning));
      assert.strictEqual(result.signals.hasHookEvidence, true);
      assert.ok(result.signals.stageConfidence >= 0.7);
      void task;
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('moves a task with passing rebuild and acceptance toward Port', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-task-auto-progress-port-'),
    );
    try {
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-auto-002',
        taskSlug: 'auto-port',
        targetUrl: 'https://example.com/api/sign',
        goal: 'port progress',
        successCriteria: {
          localRebuild: 'pass',
          browserAlignment: 'pass',
          serverAcceptance: 'pass',
        },
      });

      const result = await autoProgressReverseTask(store, 'task-auto-002');
      assert.strictEqual(result.currentStage, 'Port');
      assert.strictEqual(result.status, 'pass');
      assert.strictEqual(result.nextStepHint, 'manage_reverse_task:summarize');
      assert.strictEqual(result.signals.stageConfidence, 1);
      assert.ok(result.reasoning.some(item => item.includes('Port')));
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
