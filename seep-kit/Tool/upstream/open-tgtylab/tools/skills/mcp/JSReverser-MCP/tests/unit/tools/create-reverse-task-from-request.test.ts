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
import {createReverseTaskFromRequestTool} from '../../../src/tools/task.js';

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

describe('create_reverse_task_from_request tool', () => {
  it('creates a reverse task from one captured request', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-task-from-request-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      const response = makeResponse();
      await createReverseTaskFromRequestTool.handler(
        {
          params: {
            requestId: 7,
            goal: '从请求快速建任务',
            taskSlug: 'request-demo',
          },
        },
        response as unknown as Parameters<
          typeof createReverseTaskFromRequestTool.handler
        >[1],
        {
          getNetworkRequestById: (requestId: number) => {
            assert.strictEqual(requestId, 7);
            return {
              url: () => 'https://example.com/api/sign',
              method: () => 'POST',
              headers: () => ({
                'content-type': 'application/json',
                'x-sign': '1',
              }),
              postData: () => '{"token":"abc"}',
              resourceType: () => 'fetch',
              frame: () => ({url: () => 'https://example.com/product'}),
            };
          },
          getRequestInitiator: () => ({
            url: 'https://example.com/static/sign.js',
            stack: {
              callFrames: [
                {url: 'https://example.com/static/sign.js'},
                {url: 'https://example.com/static/runtime.js'},
              ],
            },
          }),
        } as unknown as Parameters<
          typeof createReverseTaskFromRequestTool.handler
        >[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        ok?: boolean;
        taskId?: string;
        candidateScripts?: string[];
      };
      assert.strictEqual(payload.ok, true);
      assert.ok(payload.taskId);
      assert.deepStrictEqual(payload.candidateScripts, [
        'https://example.com/static/sign.js',
        'https://example.com/static/runtime.js',
      ]);

      const targetContext = JSON.parse(
        await readFile(
          path.join(rootDir, payload.taskId!, 'target-context.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(targetContext.pageUrl, 'https://example.com/product');
      assert.strictEqual(targetContext.triggerAction, 'network_request:get:7');
      assert.strictEqual(
        (targetContext.targetRequest as Record<string, unknown>).method,
        'POST',
      );
      assert.strictEqual(
        (targetContext.targetRequest as Record<string, unknown>).url,
        'https://example.com/api/sign',
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
