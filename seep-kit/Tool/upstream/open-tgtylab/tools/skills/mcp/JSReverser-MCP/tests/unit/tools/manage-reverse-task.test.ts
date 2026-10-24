/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';
import {manageReverseTaskTool} from '../../../src/tools/task-manager.js';
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

describe('manage_reverse_task tool', () => {
  it('supports list/get/summarize/progress/update/timeline actions', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-manage-task-tool-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-manage-001',
            taskSlug: 'manage-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'manage task tool',
            targetContext: {
              targetRequest: {
                method: 'POST',
                url: 'https://example.com/api/sign',
              },
            },
          },
        },
        makeResponse() as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const opened = await runtime.reverseTaskStore.openTask({
        taskId: 'task-manage-001',
        slug: 'manage-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'manage task tool',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        note: 'aggregate path',
      });
      await mkdir(path.join(rootDir, 'task-manage-001', 'run'), {
        recursive: true,
      });
      await mkdir(path.join(rootDir, 'task-manage-001', 'env'), {
        recursive: true,
      });
      await writeFile(
        path.join(rootDir, 'task-manage-001', 'run', 'portable.js'),
        '// portable',
      );
      await writeFile(
        path.join(rootDir, 'task-manage-001', 'env', 'replay.js'),
        '// replay',
      );

      const listResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {action: 'list'},
        },
        listResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const listPayload = JSON.parse(listResponse.lines[1] ?? '{}') as {
        action: string;
        items: Array<{taskId: string}>;
        schemaVersion?: string;
        responseSummary?: string;
        diagnostics?: Record<string, unknown>;
      };
      assert.strictEqual(listPayload.action, 'list');
      assert.strictEqual(listPayload.schemaVersion, '1.0');
      assert.strictEqual(listPayload.items[0]?.taskId, 'task-manage-001');
      assert.ok(
        Array.isArray((listPayload as {artifacts?: string[]}).artifacts),
      );
      assert.ok(typeof listPayload.responseSummary === 'string');
      assert.ok(listPayload.diagnostics);

      const getResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {action: 'get', taskId: 'task-manage-001'},
        },
        getResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const getPayload = JSON.parse(getResponse.lines[1] ?? '{}') as {
        action: string;
        taskId: string;
        artifacts?: string[];
        schemaVersion?: string;
        responseSummary?: string;
        diagnostics?: Record<string, unknown>;
        compactDelivery?: {
          portablePureReady?: boolean;
          portableReplayReady?: boolean;
          files?: string[];
        };
      };
      assert.strictEqual(getPayload.action, 'get');
      assert.strictEqual(getPayload.schemaVersion, '1.0');
      assert.strictEqual(getPayload.taskId, 'task-manage-001');
      assert.ok(getPayload.artifacts?.includes('task.json'));
      assert.strictEqual(getPayload.compactDelivery?.portablePureReady, true);
      assert.strictEqual(getPayload.compactDelivery?.portableReplayReady, true);
      assert.deepStrictEqual(getPayload.compactDelivery?.files, [
        'run/portable.js',
        'env/replay.js',
      ]);
      assert.ok(typeof getPayload.responseSummary === 'string');
      assert.ok(getPayload.diagnostics);

      const progressResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {action: 'progress', taskId: 'task-manage-001'},
        },
        progressResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const progressPayload = JSON.parse(progressResponse.lines[1] ?? '{}') as {
        action: string;
        currentStage: string;
        schemaVersion?: string;
        responseSummary?: string;
        diagnostics?: Record<string, unknown>;
        outcome?: string;
        shouldResume?: boolean;
        nextBestTool?: string;
        detailLevel?: string;
        routeGuard?: {preferredToolClass?: string; routeHint?: string};
        continuation?: {
          ready?: boolean;
          tool?: string;
          actionKey?: string;
          toolClass?: string;
          routeHint?: string;
          invoke?: {tool?: string; params?: Record<string, unknown>};
          invokeHint?: {
            requiredParams?: string[];
            optionalParams?: string[];
            example?: Record<string, unknown>;
          };
        };
      };
      assert.strictEqual(progressPayload.action, 'progress');
      assert.strictEqual(progressPayload.schemaVersion, '1.0');
      assert.strictEqual(progressPayload.currentStage, 'Rebuild');
      assert.ok(typeof progressPayload.responseSummary === 'string');
      assert.ok(progressPayload.diagnostics);
      assert.strictEqual(progressPayload.outcome, 'success');
      assert.strictEqual(progressPayload.shouldResume, true);
      assert.strictEqual(progressPayload.nextBestTool, 'export_rebuild_bundle');
      assert.strictEqual(progressPayload.detailLevel, 'standard');
      assert.strictEqual(
        progressPayload.routeGuard?.preferredToolClass,
        'rebuild',
      );
      assert.strictEqual(
        progressPayload.routeGuard?.routeHint,
        'switch_to_rebuild',
      );
      assert.strictEqual(progressPayload.continuation?.ready, true);
      assert.strictEqual(
        progressPayload.continuation?.tool,
        'export_rebuild_bundle',
      );
      assert.strictEqual(
        progressPayload.continuation?.actionKey,
        'export_rebuild_bundle',
      );
      assert.strictEqual(
        progressPayload.continuation?.invoke?.tool,
        'export_rebuild_bundle',
      );
      assert.deepStrictEqual(progressPayload.continuation?.invoke?.params, {
        taskId: 'task-manage-001',
      });
      assert.deepStrictEqual(
        progressPayload.continuation?.invokeHint?.requiredParams,
        ['taskId'],
      );
      assert.deepStrictEqual(
        progressPayload.continuation?.invokeHint?.example,
        {taskId: 'task-manage-001'},
      );
      assert.strictEqual(progressPayload.continuation?.toolClass, 'rebuild');
      assert.strictEqual(
        progressPayload.continuation?.routeHint,
        'switch_to_rebuild',
      );

      const updateResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'update',
            taskId: 'task-manage-001',
            currentStage: 'Patch',
            status: 'partial',
            currentSummary: '已开始补环境',
          },
        },
        updateResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const updatePayload = JSON.parse(updateResponse.lines[1] ?? '{}') as {
        ok: boolean;
        action: string;
      };
      assert.strictEqual(updatePayload.ok, true);
      assert.strictEqual(updatePayload.action, 'update');

      const timelineResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'timeline',
            taskId: 'task-manage-001',
            stage: 'patch',
            timelineAction: 'diff env',
            timelineStatus: 'ok',
            result: 'found first divergence',
          },
        },
        timelineResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const timelinePayload = JSON.parse(timelineResponse.lines[1] ?? '{}') as {
        ok: boolean;
        action: string;
      };
      assert.strictEqual(timelinePayload.ok, true);
      assert.strictEqual(timelinePayload.action, 'timeline');

      const summarizeResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {action: 'summarize', taskId: 'task-manage-001'},
        },
        summarizeResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const summarizePayload = JSON.parse(
        summarizeResponse.lines[1] ?? '{}',
      ) as {
        action: string;
        taskId: string;
        reasoning: string[];
        artifacts?: string[];
        schemaVersion?: string;
        responseSummary?: string;
        diagnostics?: Record<string, unknown>;
        compactDelivery?: {
          portablePureReady?: boolean;
          portableReplayReady?: boolean;
          files?: string[];
        };
      };
      assert.strictEqual(summarizePayload.action, 'summarize');
      assert.strictEqual(summarizePayload.taskId, 'task-manage-001');
      assert.ok(summarizePayload.artifacts?.includes('report.md'));
      assert.strictEqual(
        summarizePayload.compactDelivery?.portablePureReady,
        true,
      );
      assert.strictEqual(
        summarizePayload.compactDelivery?.portableReplayReady,
        true,
      );
      assert.deepStrictEqual(summarizePayload.compactDelivery?.files, [
        'run/portable.js',
        'env/replay.js',
      ]);
      assert.ok(typeof summarizePayload.responseSummary === 'string');
      assert.ok(summarizePayload.diagnostics);

      const state = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-manage-001', 'state.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(state.currentStage, 'Patch');
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports archive/search/tag/restore/prune/compare actions', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-manage-task-admin-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      for (const [taskId, goal] of [
        ['task-admin-001', 'compare left'],
        ['task-admin-002', 'compare right'],
      ] as const) {
        await startReverseTaskTool.handler(
          {
            params: {
              taskId,
              taskSlug: taskId,
              targetUrl: `https://example.com/${taskId}`,
              goal,
              targetContext: {
                candidateScripts: ['https://example.com/static/sign.js'],
                targetRequest: {
                  method: 'POST',
                  url: 'https://example.com/api/sign',
                },
              },
            },
          },
          makeResponse() as unknown as Parameters<
            typeof startReverseTaskTool.handler
          >[1],
          {} as Parameters<typeof startReverseTaskTool.handler>[2],
        );
        const opened = await runtime.reverseTaskStore.openTask({
          taskId,
          slug: taskId,
          targetUrl: `https://example.com/${taskId}`,
          goal,
        });
        await opened.appendLog('runtime-evidence', {
          source: 'hook',
          kind: 'hook-hit',
          functionName: 'signPayload',
          requestUrl: 'https://example.com/api/sign',
        });
      }

      const tagResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'tag',
            taskId: 'task-admin-001',
            tags: ['jd', 'blocked'],
          },
        },
        tagResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const tagPayload = JSON.parse(tagResponse.lines[1] ?? '{}') as {
        tags: string[];
      };
      assert.deepStrictEqual(tagPayload.tags, ['blocked', 'jd']);

      const searchResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'search',
            query: 'compare',
            tag: 'jd',
            includeArchived: true,
          },
        },
        searchResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const searchPayload = JSON.parse(searchResponse.lines[1] ?? '{}') as {
        items: Array<{taskId: string}>;
        agentGuidance?: {recommendedTool?: string};
      };
      assert.strictEqual(searchPayload.items.length, 1);
      assert.strictEqual(searchPayload.items[0]?.taskId, 'task-admin-001');
      assert.strictEqual(
        searchPayload.agentGuidance?.recommendedTool,
        'manage_reverse_task',
      );

      const compareResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'compare',
            taskId: 'task-admin-001',
            otherTaskId: 'task-admin-002',
          },
        },
        compareResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const comparePayload = JSON.parse(compareResponse.lines[1] ?? '{}') as {
        summary: {sharedTopFunctions: string[]};
        agentGuidance?: {recommendedTool?: string};
      };
      assert.ok(
        comparePayload.summary.sharedTopFunctions.includes('signPayload'),
      );
      assert.strictEqual(
        comparePayload.agentGuidance?.recommendedTool,
        'manage_reverse_task',
      );

      const archiveResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'archive',
            taskId: 'task-admin-001',
          },
        },
        archiveResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const archivePayload = JSON.parse(archiveResponse.lines[1] ?? '{}') as {
        archivedAt: number;
      };
      assert.ok(archivePayload.archivedAt > 0);

      const listResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {action: 'list'},
        },
        listResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const listPayload = JSON.parse(listResponse.lines[1] ?? '{}') as {
        items: Array<{taskId: string}>;
      };
      assert.ok(
        !listPayload.items.some(item => item.taskId === 'task-admin-001'),
      );

      const restoreResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'restore',
            taskId: 'task-admin-001',
          },
        },
        restoreResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const restorePayload = JSON.parse(restoreResponse.lines[1] ?? '{}') as {
        restored: boolean;
      };
      assert.strictEqual(restorePayload.restored, true);

      const archiveAgainResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'archive',
            taskId: 'task-admin-001',
          },
        },
        archiveAgainResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );

      const pruneResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'prune',
          },
        },
        pruneResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const prunePayload = JSON.parse(pruneResponse.lines[1] ?? '{}') as {
        removedTaskIds: string[];
      };
      assert.ok(prunePayload.removedTaskIds.includes('task-admin-001'));
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('validates action-specific parameters for agent-facing task management', async () => {
    const response = makeResponse();

    await assert.rejects(
      () =>
        manageReverseTaskTool.handler(
          {
            params: {
              action: 'search',
            },
          },
          response as unknown as Parameters<
            typeof manageReverseTaskTool.handler
          >[1],
          {} as Parameters<typeof manageReverseTaskTool.handler>[2],
        ),
      /query or tag is required/,
    );

    await assert.rejects(
      () =>
        manageReverseTaskTool.handler(
          {
            params: {
              action: 'tag',
              taskId: 'task-x',
              tags: [],
            },
          },
          response as unknown as Parameters<
            typeof manageReverseTaskTool.handler
          >[1],
          {} as Parameters<typeof manageReverseTaskTool.handler>[2],
        ),
      /at least one tag is required/,
    );

    await assert.rejects(
      () =>
        manageReverseTaskTool.handler(
          {
            params: {
              action: 'update',
              taskId: 'task-x',
            },
          },
          response as unknown as Parameters<
            typeof manageReverseTaskTool.handler
          >[1],
          {} as Parameters<typeof manageReverseTaskTool.handler>[2],
        ),
      /at least one mutable field is required/,
    );
  });

  it('supports compact output for get and summarize actions', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-manage-task-compact-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-manage-compact-001',
            taskSlug: 'compact-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'compact task tool',
            targetContext: {
              targetRequest: {
                method: 'POST',
                url: 'https://example.com/api/sign',
              },
            },
          },
        },
        makeResponse() as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const getResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'get',
            taskId: 'task-manage-compact-001',
            outputMode: 'compact',
          },
        },
        getResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const getPayload = JSON.parse(getResponse.lines[1] ?? '{}') as {
        outputMode?: string;
        recentTimeline?: unknown[];
        recentEvidence?: unknown[];
        targetContext?: unknown;
      };
      assert.strictEqual(getPayload.outputMode, 'compact');
      assert.strictEqual(getPayload.recentTimeline, undefined);
      assert.strictEqual(getPayload.recentEvidence, undefined);
      assert.strictEqual(getPayload.targetContext, undefined);

      const summarizeResponse = makeResponse();
      await manageReverseTaskTool.handler(
        {
          params: {
            action: 'summarize',
            taskId: 'task-manage-compact-001',
            outputMode: 'compact',
          },
        },
        summarizeResponse as unknown as Parameters<
          typeof manageReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof manageReverseTaskTool.handler>[2],
      );
      const summarizePayload = JSON.parse(
        summarizeResponse.lines[1] ?? '{}',
      ) as {
        outputMode?: string;
        recentTimeline?: unknown[];
        recentEvidence?: unknown[];
        reasoning?: unknown[];
      };
      assert.strictEqual(summarizePayload.outputMode, 'compact');
      assert.strictEqual(summarizePayload.recentTimeline, undefined);
      assert.strictEqual(summarizePayload.recentEvidence, undefined);
      assert.strictEqual(summarizePayload.reasoning, undefined);
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
