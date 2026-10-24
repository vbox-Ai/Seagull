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
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';

describe('ReverseTaskBootstrap', () => {
  it('initializes task.json, state.json, report.md and timeline entry', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-task-bootstrap-'),
    );

    try {
      const store = new ReverseTaskStore({rootDir});
      const result = await startReverseTask(store, {
        taskId: 'task-bootstrap-001',
        taskSlug: 'bootstrap-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: '确认目标请求并初始化 task artifact',
        currentStage: 'Observe',
        currentSummary: '已初始化任务',
        targetContext: {
          pageUrl: 'https://example.com/page',
          triggerAction: 'click submit',
          candidateScripts: ['https://cdn.example.com/app.js'],
          targetRequest: {
            method: 'POST',
            url: 'https://example.com/api/sign',
            notes: '候选签名请求',
          },
        },
      });

      const taskJson = JSON.parse(
        await readFile(result.taskFile, 'utf8'),
      ) as Record<string, unknown>;
      const stateJson = JSON.parse(
        await readFile(result.stateFile, 'utf8'),
      ) as Record<string, unknown>;
      const report = await readFile(result.reportFile, 'utf8');
      const timeline = (
        await readFile(path.join(result.taskDir, 'timeline.jsonl'), 'utf8')
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      assert.strictEqual(taskJson.currentStage, 'Observe');
      assert.strictEqual(stateJson.currentStage, 'Observe');
      assert.strictEqual(stateJson.nextStepHint, 'recommend_next_step');
      assert.ok(report.includes('Reverse Task Report'));
      assert.ok(report.includes('recommend_next_step'));
      assert.strictEqual(timeline.length, 1);
      assert.strictEqual(timeline[0].action, 'start_reverse_task');
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
