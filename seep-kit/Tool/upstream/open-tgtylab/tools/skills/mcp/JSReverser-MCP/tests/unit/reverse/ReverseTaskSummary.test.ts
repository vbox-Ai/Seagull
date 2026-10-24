/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {startReverseTask} from '../../../src/reverse/ReverseTaskBootstrap.js';
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {summarizeReverseTask} from '../../../src/reverse/ReverseTaskSummary.js';

describe('ReverseTaskSummary', () => {
  it('returns a compact summary for one task', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-task-summary-'),
    );
    try {
      const store = new ReverseTaskStore({rootDir});
      const task = await startReverseTask(store, {
        taskId: 'task-summary-001',
        taskSlug: 'summary-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'summarize task',
        currentSummary: '已确认目标请求',
      });
      const opened = await store.openTask({
        taskId: 'task-summary-001',
        slug: 'summary-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'summarize task',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        note: 'captured sign path',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        functionName: 'signPayload',
        requestUrl: 'https://example.com/api/sign',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'network',
        kind: 'env-gap',
        note: 'localStorage is not defined',
      });
      await mkdir(path.join(rootDir, 'task-summary-001', 'run'), {
        recursive: true,
      });
      await mkdir(path.join(rootDir, 'task-summary-001', 'env'), {
        recursive: true,
      });
      await writeFile(
        path.join(rootDir, 'task-summary-001', 'run', 'portable.js'),
        '// portable',
      );
      await writeFile(
        path.join(rootDir, 'task-summary-001', 'env', 'replay.js'),
        '// replay',
      );

      const result = await summarizeReverseTask(store, 'task-summary-001');
      assert.strictEqual(result.taskId, 'task-summary-001');
      assert.strictEqual(result.currentSummary, '已确认目标请求');
      assert.ok(result.headline.includes('Observe'));
      assert.ok(result.recentEvidence[0]?.includes('captured sign path'));
      assert.strictEqual(result.evidenceAggregates.bySource.hook, 2);
      assert.ok(
        result.evidenceAggregates.topFunctions.some(
          entry => entry.value === 'signPayload',
        ),
      );
      assert.ok(
        result.evidenceAggregates.blockers.includes(
          'localStorage is not defined',
        ),
      );
      assert.ok(
        result.evidenceAggregates.links.requestToFunctions.some(entry =>
          entry.functions.includes('signPayload'),
        ),
      );
      assert.strictEqual(result.compactDelivery.portablePureReady, true);
      assert.strictEqual(result.compactDelivery.portableReplayReady, true);
      assert.deepStrictEqual(result.compactDelivery.files, [
        'run/portable.js',
        'env/replay.js',
      ]);
      void task;
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
