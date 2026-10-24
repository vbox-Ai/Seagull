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

import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {
  explainReverseStage,
  recommendNextStepTool,
} from '../../../src/tools/advisor.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';

function makeResponse() {
  return {
    lines: [] as string[],
    appendResponseLine(value: string) {
      this.lines.push(value);
    },
    setIncludePages: () => undefined,
    setIncludeNetworkRequests: () => undefined,
    setIncludeConsoleData: () => undefined,
    attachImage: () => undefined,
    attachNetworkRequest: () => undefined,
    attachConsoleMessage: () => undefined,
    setIncludeWebSocketConnections: () => undefined,
    attachWebSocket: () => undefined,
  };
}

describe('advisor tools', () => {
  it('returns next step advice as json', async () => {
    const response = makeResponse();
    await recommendNextStepTool.handler(
      {
        params: {
          browserHealthy: true,
          pageReady: true,
          hasTargetRequest: true,
          hookRecordCount: 0,
        },
      },
      response as unknown as Parameters<
        typeof recommendNextStepTool.handler
      >[1],
      {} as Parameters<typeof recommendNextStepTool.handler>[2],
    );
    const parsed = JSON.parse(response.lines[1] ?? '{}') as {nextStep?: string};
    assert.strictEqual(parsed.nextStep, 'inject_hook');
  });

  it('returns stage explanation as json', async () => {
    const response = makeResponse();
    await explainReverseStage.handler(
      {params: {stage: 'Observe', includeDocs: true}},
      response as unknown as Parameters<typeof explainReverseStage.handler>[1],
      {} as Parameters<typeof explainReverseStage.handler>[2],
    );
    const parsed = JSON.parse(response.lines[1] ?? '{}') as {
      stage?: string;
      recommendedTools?: string[];
    };
    assert.strictEqual(parsed.stage, 'Observe');
    assert.ok(Array.isArray(parsed.recommendedTools));
  });

  it('can infer advice from taskId context', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-advisor-task-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'advisor-task-001',
        slug: 'advisor-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: '采样签名',
        currentStage: 'Capture',
      });
      await task.writeSnapshot('state.json', {
        taskId: 'advisor-task-001',
        currentStage: 'Capture',
        status: 'active',
        updatedAt: Date.now(),
      });
      await task.appendLog('runtime-evidence', {
        kind: 'hook-hit',
        source: 'hook',
      });

      const response = makeResponse();
      await recommendNextStepTool.handler(
        {params: {taskId: 'advisor-task-001', hasRebuildBundle: false}},
        response as unknown as Parameters<
          typeof recommendNextStepTool.handler
        >[1],
        {} as Parameters<typeof recommendNextStepTool.handler>[2],
      );
      const parsed = JSON.parse(response.lines[1] ?? '{}') as {
        taskContext?: {taskId?: string};
        nextStep?: string;
      };
      assert.strictEqual(parsed.taskContext?.taskId, 'advisor-task-001');
      assert.strictEqual(parsed.nextStep, 'export_rebuild_bundle');
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
