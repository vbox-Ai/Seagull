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

import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';
import {startReverseTaskTool} from '../../../src/tools/task.js';

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

describe('start_reverse_task tool', () => {
  it('creates initialized task artifacts through the MCP tool', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-start-task-tool-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      const response = makeResponse();
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-tool-001',
            taskSlug: 'tool-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: '初始化任务',
            currentStage: 'Observe',
          },
        },
        response as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        ok?: boolean;
        taskDir?: string;
      };
      assert.strictEqual(payload.ok, true);
      assert.ok(payload.taskDir);

      const state = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-tool-001', 'state.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(state.currentStage, 'Observe');
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
