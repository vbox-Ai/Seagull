/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {updateReverseTaskState} from '../../../src/reverse/ReverseTaskState.js';
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {orchestrateReverseTaskTool} from '../../../src/tools/orchestrator.js';
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

describe('orchestrate_reverse_task tool', () => {
  it('returns a compact orchestration plan for one reverse task', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-tool-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-001',
            taskSlug: 'orchestrate-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'orchestrate task tool',
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
        taskId: 'task-orchestrate-001',
        slug: 'orchestrate-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'orchestrate task tool',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        note: 'captured orchestrator sample',
      });

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-001',
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        ok: boolean;
        currentStage: string;
        schemaVersion?: string;
        responseSummary?: string;
        diagnostics?: Record<string, unknown>;
        outcome?: string;
        shouldResume?: boolean;
        shouldSwitchStrategy?: boolean;
        nextBestTool?: string;
        detailLevel?: string;
        routeGuard?: {
          preferredToolClass?: string;
          routeHint?: string;
          avoidTools?: string[];
        };
        continuation?: {
          ready?: boolean;
          tool?: string;
          strategy?: string;
          toolClass?: string;
          routeHint?: string;
          invoke?: {tool?: string; params?: Record<string, unknown>};
          invokeHint?: {
            requiredParams?: string[];
            optionalParams?: string[];
            example?: Record<string, unknown>;
          };
        };
        orchestration: {
          primaryStep: {tool: string};
          suggestedSteps: Array<{tool: string}>;
        };
        agentGuidance?: {
          recommendedTool?: string;
          recommendedParams?: Record<string, unknown>;
          recommendedStrategy?: string;
          resumeHint?: string;
          confidence?: number;
          toolClass?: string;
          routeHint?: string;
        };
      };
      assert.strictEqual(payload.ok, true);
      assert.strictEqual(payload.schemaVersion, '1.0');
      assert.strictEqual(payload.currentStage, 'Rebuild');
      assert.strictEqual(
        payload.orchestration.primaryStep.tool,
        'export_rebuild_bundle',
      );
      assert.strictEqual(
        payload.orchestration.suggestedSteps[0]?.tool,
        'manage_reverse_task',
      );
      assert.ok(payload.responseSummary);
      assert.ok(payload.diagnostics);
      assert.strictEqual(payload.outcome, 'success');
      assert.strictEqual(payload.shouldResume, false);
      assert.strictEqual(payload.shouldSwitchStrategy, false);
      assert.strictEqual(payload.nextBestTool, 'export_rebuild_bundle');
      assert.strictEqual(payload.detailLevel, 'standard');
      assert.strictEqual(payload.routeGuard?.preferredToolClass, 'rebuild');
      assert.strictEqual(payload.routeGuard?.routeHint, 'switch_to_rebuild');
      assert.strictEqual(payload.continuation?.ready, true);
      assert.strictEqual(payload.continuation?.tool, 'export_rebuild_bundle');
      assert.strictEqual(payload.continuation?.strategy, 'rebuild-first');
      assert.strictEqual(
        payload.continuation?.invoke?.tool,
        'export_rebuild_bundle',
      );
      assert.deepStrictEqual(payload.continuation?.invoke?.params, {
        taskId: 'task-orchestrate-001',
      });
      assert.deepStrictEqual(payload.continuation?.invokeHint?.requiredParams, [
        'taskId',
      ]);
      assert.deepStrictEqual(payload.continuation?.invokeHint?.example, {
        taskId: 'task-orchestrate-001',
      });
      assert.strictEqual(payload.continuation?.toolClass, 'rebuild');
      assert.strictEqual(payload.continuation?.routeHint, 'switch_to_rebuild');
      assert.strictEqual(
        payload.agentGuidance?.recommendedTool,
        'export_rebuild_bundle',
      );
      assert.strictEqual(
        payload.agentGuidance?.recommendedStrategy,
        'rebuild-first',
      );
      assert.strictEqual(payload.agentGuidance?.toolClass, 'rebuild');
      assert.strictEqual(payload.agentGuidance?.routeHint, 'switch_to_rebuild');
      assert.deepStrictEqual(payload.agentGuidance?.recommendedParams, {
        taskId: 'task-orchestrate-001',
      });
      assert.ok(
        String(payload.agentGuidance?.resumeHint).includes(
          '--orchestrateReverseTask task-orchestrate-001',
        ),
      );
      assert.ok((payload.agentGuidance?.confidence ?? 0) > 0.8);
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('prefers locate_signature_function before capture when target request is known but hook evidence is absent', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-locate-signature-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-locate-001',
            taskSlug: 'orchestrate-locate-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'locate h5st signature function',
            targetContext: {
              targetRequest: {
                method: 'POST',
                url: 'https://example.com/api/h5st',
              },
            },
          },
        },
        makeResponse() as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-locate-001',
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        currentStage: string;
        nextBestTool?: string;
        orchestration: {
          primaryStep: {tool: string; params?: Record<string, unknown>};
        };
        continuation?: {
          invoke?: {tool?: string; params?: Record<string, unknown>};
        };
        agentGuidance?: {
          recommendedTool?: string;
          recommendedParams?: Record<string, unknown>;
        };
      };
      assert.strictEqual(payload.nextBestTool, 'locate_signature_function');
      assert.strictEqual(
        payload.orchestration.primaryStep.tool,
        'locate_signature_function',
      );
      assert.strictEqual(
        payload.orchestration.primaryStep.params?.url,
        'https://example.com/api/h5st',
      );
      assert.strictEqual(
        payload.orchestration.primaryStep.params?.targetParam,
        'h5st',
      );
      assert.ok(
        !(
          'preferredUrlPatterns' in
          (payload.orchestration.primaryStep.params ?? {})
        ),
      );
      assert.ok(
        !(
          'observedFunctions' in
          (payload.orchestration.primaryStep.params ?? {})
        ),
      );
      assert.ok(
        !('relatedParams' in (payload.orchestration.primaryStep.params ?? {})),
      );
      assert.strictEqual(
        payload.continuation?.invoke?.tool,
        'locate_signature_function',
      );
      assert.strictEqual(
        payload.agentGuidance?.recommendedParams?.url,
        'https://example.com/api/h5st',
      );
      assert.strictEqual(
        payload.agentGuidance?.recommendedParams?.targetParam,
        'h5st',
      );
      assert.ok(
        !(
          'preferredUrlPatterns' in
          (payload.agentGuidance?.recommendedParams ?? {})
        ),
      );
      assert.ok(
        !(
          'observedFunctions' in
          (payload.agentGuidance?.recommendedParams ?? {})
        ),
      );
      assert.ok(
        !('relatedParams' in (payload.agentGuidance?.recommendedParams ?? {})),
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('passes inferred relatedParams into locate_signature_function when the goal exposes known signing fields', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-locate-related-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-locate-params-001',
            taskSlug: 'orchestrate-locate-params-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'locate h5st builder for appid body functionId',
            targetContext: {
              targetRequest: {
                method: 'POST',
                url: 'https://example.com/api/h5st',
              },
            },
          },
        },
        makeResponse() as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-locate-params-001',
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        orchestration: {
          primaryStep: {tool: string; params?: Record<string, unknown>};
        };
      };
      assert.strictEqual(
        payload.orchestration.primaryStep.tool,
        'locate_signature_function',
      );
      assert.deepStrictEqual(payload.orchestration.primaryStep.params, {
        url: 'https://example.com/api/h5st',
        targetParam: 'h5st',
        relatedParams: ['appid', 'body', 'functionid'],
      });
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('reuses persisted locatedSignature and jumps to search_in_sources instead of locating again', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-reuse-located-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-reuse-001',
            taskSlug: 'orchestrate-reuse-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'reuse located h5st builder',
            targetContext: {
              targetRequest: {
                method: 'POST',
                url: 'https://example.com/api/h5st',
              },
            },
          },
        },
        makeResponse() as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-orchestrate-reuse-001',
        slug: 'orchestrate-reuse-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'reuse located h5st builder',
      });
      await task.writeSnapshot('target-context.json', {
        targetRequest: {
          method: 'POST',
          url: 'https://example.com/api/h5st',
        },
        locatedSignature: {
          functionName: 'genH5st',
          scriptUrl: 'https://example.com/app.js',
        },
      });

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-reuse-001',
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        nextBestTool?: string;
        orchestration: {
          primaryStep: {tool: string; params?: Record<string, unknown>};
        };
        continuation?: {
          invoke?: {tool?: string; params?: Record<string, unknown>};
        };
      };
      assert.strictEqual(payload.nextBestTool, 'search_in_sources');
      assert.strictEqual(
        payload.orchestration.primaryStep.tool,
        'search_in_sources',
      );
      assert.deepStrictEqual(payload.orchestration.primaryStep.params, {
        query: 'genH5st',
        isRegex: false,
        caseSensitive: true,
        maxResults: 10,
        urlFilter: 'https://example.com/app.js',
      });
      assert.strictEqual(
        payload.continuation?.invoke?.tool,
        'search_in_sources',
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('jumps to extract_function_tree when both locatedSignature and locatedSource are already persisted', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-reuse-slice-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-slice-001',
            taskSlug: 'orchestrate-slice-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'reuse located slice',
            targetContext: {
              targetRequest: {
                method: 'POST',
                url: 'https://example.com/api/h5st',
              },
            },
          },
        },
        makeResponse() as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-orchestrate-slice-001',
        slug: 'orchestrate-slice-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'reuse located slice',
      });
      await task.writeSnapshot('target-context.json', {
        targetRequest: {
          method: 'POST',
          url: 'https://example.com/api/h5st',
        },
        locatedSignature: {
          functionName: 'genH5st',
          scriptUrl: 'https://example.com/app.js',
        },
        locatedSource: {
          query: 'genH5st',
          scriptId: '77',
          url: 'https://example.com/app.js',
          lineNumber: 13,
        },
      });

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-slice-001',
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        nextBestTool?: string;
        orchestration: {
          primaryStep: {tool: string; params?: Record<string, unknown>};
        };
        continuation?: {
          invoke?: {tool?: string; params?: Record<string, unknown>};
        };
      };
      assert.strictEqual(payload.nextBestTool, 'extract_function_tree');
      assert.strictEqual(
        payload.orchestration.primaryStep.tool,
        'extract_function_tree',
      );
      assert.deepStrictEqual(payload.orchestration.primaryStep.params, {
        scriptId: '77',
        functionName: 'genH5st',
        maxDepth: 2,
      });
      assert.strictEqual(
        payload.continuation?.invoke?.tool,
        'extract_function_tree',
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('reuses persisted function-slice and jumps straight to understand_code', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-reuse-understand-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-understand-001',
            taskSlug: 'orchestrate-understand-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'reuse persisted function slice',
            targetContext: {
              targetRequest: {
                method: 'POST',
                url: 'https://example.com/api/h5st',
              },
            },
          },
        },
        makeResponse() as unknown as Parameters<
          typeof startReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof startReverseTaskTool.handler>[2],
      );

      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-orchestrate-understand-001',
        slug: 'orchestrate-understand-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'reuse persisted function slice',
      });
      await task.writeSnapshot('target-context.json', {
        targetRequest: {
          method: 'POST',
          url: 'https://example.com/api/h5st',
        },
        locatedSignature: {
          functionName: 'genH5st',
          scriptUrl: 'https://example.com/app.js',
        },
      });
      await task.writeSnapshot('function-slice.json', {
        mainFunction: 'genH5st',
        scriptId: '77',
        scriptUrl: 'https://example.com/app.js',
        code: 'function genH5st(){return hash(body)}\nfunction hash(v){return v}',
        extractedCount: 2,
        totalSize: 68,
      });

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-understand-001',
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        nextBestTool?: string;
        orchestration: {
          primaryStep: {tool: string; params?: Record<string, unknown>};
        };
        continuation?: {
          invoke?: {tool?: string; params?: Record<string, unknown>};
        };
      };
      assert.strictEqual(payload.nextBestTool, 'understand_code');
      assert.strictEqual(
        payload.orchestration.primaryStep.tool,
        'understand_code',
      );
      assert.strictEqual(
        payload.orchestration.primaryStep.params?.focus,
        'structure',
      );
      assert.ok(
        String(payload.orchestration.primaryStep.params?.code ?? '').includes(
          'function genH5st(){return hash(body)}',
        ),
      );
      assert.strictEqual(payload.continuation?.invoke?.tool, 'understand_code');
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('executes orchestration steps, writes checkpoint, and resumes from failure', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-exec-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-exec-001',
            taskSlug: 'orchestrate-exec-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'orchestrate execution tool',
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

      await updateReverseTaskState(runtime.reverseTaskStore, {
        taskId: 'task-orchestrate-exec-001',
        currentStage: 'PureExtraction',
        status: 'partial',
        currentSummary: 'ready to extract pure algorithm',
        nextStepHint: 'understand_code',
        successCriteria: {localRebuild: 'pass', browserAlignment: 'pass'},
      });

      const firstResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-exec-001',
            execute: true,
            stopOnError: true,
          },
        },
        firstResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const firstPayload = JSON.parse(firstResponse.lines[1] ?? '{}') as {
        errorCode?: string;
        errorType?: string;
        retryable?: boolean;
        blockedBy?: string;
        ok: boolean;
        execution?: {
          executed: boolean;
          completedStepCount: number;
          failedStep?: {
            tool: string;
            status: string;
            failureType?: string;
            retryable?: boolean;
          };
          checkpoint?: {
            status: string;
            completedSteps: string[];
            pendingSteps: string[];
            failureType?: string;
            retryable?: boolean;
          };
        };
      };
      assert.strictEqual(firstPayload.ok, true);
      assert.strictEqual(firstPayload.execution?.executed, true);
      assert.strictEqual(
        firstPayload.execution?.failedStep?.tool,
        'understand_code',
      );
      assert.strictEqual(
        firstPayload.execution?.failedStep?.failureType,
        'tool_error',
      );
      assert.strictEqual(firstPayload.execution?.failedStep?.retryable, true);
      assert.strictEqual(firstPayload.errorCode, 'tool_error');
      assert.strictEqual(firstPayload.errorType, 'tool_error');
      assert.strictEqual(firstPayload.retryable, true);
      assert.strictEqual(firstPayload.blockedBy, 'tooling');
      assert.ok(
        (
          firstPayload.execution as
            | {recovery?: {recommendedCommand?: string}}
            | undefined
        )?.recovery?.recommendedCommand?.includes('--execute --resume'),
      );
      assert.ok(
        (
          firstPayload.execution as
            | {recovery?: {recommendedCommand?: string}}
            | undefined
        )?.recovery?.recommendedCommand?.startsWith('node '),
      );
      assert.ok(
        !(
          firstPayload.execution as
            | {recovery?: {recommendedCommand?: string}}
            | undefined
        )?.recovery?.recommendedCommand?.startsWith('jsreverser-mcp '),
      );
      assert.strictEqual(firstPayload.execution?.checkpoint?.status, 'failed');
      assert.strictEqual(
        firstPayload.execution?.checkpoint?.failureType,
        'tool_error',
      );
      assert.strictEqual(firstPayload.execution?.checkpoint?.retryable, true);
      assert.deepStrictEqual(
        firstPayload.execution?.checkpoint?.completedSteps,
        ['manage_reverse_task:progress'],
      );

      const resumedResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-exec-001',
            execute: true,
            resume: true,
            stopOnError: false,
            executionOverrides: {
              understand_code: {
                status: 'ok',
                result: 'synthetic pure extraction analysis completed',
              },
            },
          },
        },
        resumedResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const resumedPayload = JSON.parse(resumedResponse.lines[1] ?? '{}') as {
        ok: boolean;
        execution?: {
          executed: boolean;
          resumed: boolean;
          completedStepCount: number;
          skippedStepCount: number;
          checkpoint?: {status: string; completedSteps: string[]};
          stepResults?: Array<{
            tool: string;
            status: string;
            retryCount?: number;
          }>;
        };
        summary?: {recentTimeline: Array<{action: string; status: string}>};
      };
      assert.strictEqual(resumedPayload.ok, true);
      assert.strictEqual(resumedPayload.execution?.executed, true);
      assert.strictEqual(resumedPayload.execution?.resumed, true);
      assert.ok((resumedPayload.execution?.completedStepCount ?? 0) >= 2);
      assert.ok((resumedPayload.execution?.skippedStepCount ?? 0) >= 1);
      assert.strictEqual(
        resumedPayload.execution?.checkpoint?.status,
        'passed',
      );
      assert.ok(
        resumedPayload.execution?.stepResults?.some(
          entry => entry.tool === 'understand_code' && entry.retryCount === 1,
        ),
      );
      assert.ok(
        resumedPayload.summary?.recentTimeline.some(
          entry => entry.action === 'understand_code' && entry.status === 'ok',
        ),
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports onlySteps and fromStep filtering in orchestration plans', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-filter-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-filter-001',
            taskSlug: 'orchestrate-filter-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'orchestrate filter tool',
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

      await updateReverseTaskState(runtime.reverseTaskStore, {
        taskId: 'task-orchestrate-filter-001',
        currentStage: 'PureExtraction',
        status: 'partial',
        currentSummary: 'ready to extract pure algorithm',
        nextStepHint: 'understand_code',
        successCriteria: {localRebuild: 'pass'},
      });

      const onlyResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-filter-001',
            onlySteps: ['understand_code'],
          },
        },
        onlyResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );
      const onlyPayload = JSON.parse(onlyResponse.lines[1] ?? '{}') as {
        orchestration: {
          primaryStep: {tool: string};
          suggestedSteps: Array<{tool: string}>;
        };
      };
      assert.strictEqual(
        onlyPayload.orchestration.primaryStep.tool,
        'understand_code',
      );
      assert.deepStrictEqual(
        onlyPayload.orchestration.suggestedSteps.map(entry => entry.tool),
        ['understand_code'],
      );

      const fromResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-filter-001',
            fromStep: 'understand_code',
          },
        },
        fromResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );
      const fromPayload = JSON.parse(fromResponse.lines[1] ?? '{}') as {
        orchestration: {suggestedSteps: Array<{tool: string}>};
      };
      assert.deepStrictEqual(
        fromPayload.orchestration.suggestedSteps.map(entry => entry.tool),
        ['understand_code', 'manage_reverse_task'],
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports skipSteps and returns env-error recovery guidance', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-skip-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-skip-001',
            taskSlug: 'orchestrate-skip-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'orchestrate skip tool',
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
        taskId: 'task-orchestrate-skip-001',
        slug: 'orchestrate-skip-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'orchestrate skip tool',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        note: 'captured orchestrator sample',
      });

      const skipResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-skip-001',
            skipSteps: ['export_rebuild_bundle'],
          },
        },
        skipResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );
      const skipPayload = JSON.parse(skipResponse.lines[1] ?? '{}') as {
        orchestration: {suggestedSteps: Array<{tool: string}>};
      };
      assert.deepStrictEqual(
        skipPayload.orchestration.suggestedSteps.map(entry => entry.tool),
        ['manage_reverse_task', 'manage_reverse_task'],
      );

      await updateReverseTaskState(runtime.reverseTaskStore, {
        taskId: 'task-orchestrate-skip-001',
        currentStage: 'PureExtraction',
        status: 'partial',
        currentSummary: 'ready to extract pure algorithm',
        nextStepHint: 'understand_code',
        successCriteria: {localRebuild: 'pass'},
      });

      const errorResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-skip-001',
            execute: true,
            onlySteps: ['understand_code'],
            executionOverrides: {
              understand_code: {
                status: 'error',
                error: 'window is not defined',
              },
            },
          },
        },
        errorResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const errorPayload = JSON.parse(errorResponse.lines[1] ?? '{}') as {
        execution?: {
          failedStep?: {failureType?: string};
          recovery?: {
            recommendedCommand?: string;
            shouldInspectSummary?: boolean;
            shouldResume?: boolean;
          };
        };
      };
      assert.strictEqual(
        errorPayload.execution?.failedStep?.failureType,
        'env_error',
      );
      assert.ok(
        errorPayload.execution?.recovery?.recommendedCommand?.includes(
          '--manageReverseTask summarize',
        ),
      );
      assert.ok(
        errorPayload.execution?.recovery?.recommendedCommand?.startsWith(
          'node ',
        ),
      );
      assert.strictEqual(
        errorPayload.execution?.recovery?.shouldInspectSummary,
        true,
      );
      assert.strictEqual(errorPayload.execution?.recovery?.shouldResume, true);
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports named orchestration strategy templates', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-strategy-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-strategy-001',
            taskSlug: 'orchestrate-strategy-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'orchestrate strategy tool',
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

      const cases = [
        {
          strategy: 'observe-first',
          tool: 'manage_reverse_task',
          key: 'manage_reverse_task:get',
        },
        {
          strategy: 'rebuild-first',
          tool: 'export_rebuild_bundle',
          key: 'export_rebuild_bundle',
        },
        {
          strategy: 'env-fix',
          tool: 'diff_env_requirements',
          key: 'diff_env_requirements',
        },
        {
          strategy: 'artifact-sync',
          tool: 'manage_reverse_task',
          key: 'manage_reverse_task:timeline',
        },
        {
          strategy: 'evidence-only',
          tool: 'manage_reverse_task',
          key: 'manage_reverse_task:summarize',
        },
      ] as const;

      for (const testCase of cases) {
        const response = makeResponse();
        await orchestrateReverseTaskTool.handler(
          {
            params: {
              taskId: 'task-orchestrate-strategy-001',
              strategy: testCase.strategy,
            },
          },
          response as unknown as Parameters<
            typeof orchestrateReverseTaskTool.handler
          >[1],
          {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
        );

        const payload = JSON.parse(response.lines[1] ?? '{}') as {
          orchestration: {primaryStep: {tool: string; key: string}};
        };
        assert.strictEqual(
          payload.orchestration.primaryStep.tool,
          testCase.tool,
        );
        assert.strictEqual(payload.orchestration.primaryStep.key, testCase.key);
      }
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports compact orchestration output and exposes fallback steps for env errors', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-compact-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-compact-001',
            taskSlug: 'orchestrate-compact-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'compact output',
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

      await updateReverseTaskState(runtime.reverseTaskStore, {
        taskId: 'task-orchestrate-compact-001',
        currentStage: 'Patch',
        status: 'partial',
        currentSummary: 'ReferenceError: window is not defined',
        nextStepHint: 'understand_code',
      });

      const compactResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-compact-001',
            outputMode: 'compact',
          },
        },
        compactResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const compactPayload = JSON.parse(compactResponse.lines[1] ?? '{}') as {
        schemaVersion?: string;
        responseSummary?: unknown;
        detailLevel?: string;
        diagnostics?: Record<string, unknown>;
        nextBestTool?: string;
        fallbackPlan?: unknown;
        agentGuidance?: unknown;
        orchestration: {suggestedSteps: Array<{tool: string; reason?: string}>};
      };
      assert.ok(typeof compactPayload.responseSummary === 'string');
      assert.strictEqual(compactPayload.schemaVersion, '1.0');
      assert.strictEqual(compactPayload.detailLevel, 'minimal');
      assert.ok(compactPayload.diagnostics);
      assert.strictEqual(compactPayload.nextBestTool, undefined);
      assert.strictEqual(compactPayload.fallbackPlan, undefined);
      assert.strictEqual(compactPayload.agentGuidance, undefined);
      assert.ok(
        compactPayload.orchestration.suggestedSteps.every(
          step => step.reason === undefined,
        ),
      );

      const fallbackResponse = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-compact-001',
            execute: true,
            onlySteps: ['diff_env_requirements'],
            executionOverrides: {
              diff_env_requirements: {
                status: 'error',
                error: 'window is not defined',
              },
            },
          },
        },
        fallbackResponse as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const fallbackPayload = JSON.parse(fallbackResponse.lines[1] ?? '{}') as {
        schemaVersion?: string;
        outcome?: string;
        shouldResume?: boolean;
        shouldSwitchStrategy?: boolean;
        nextBestTool?: string;
        detailLevel?: string;
        routeGuard?: {preferredToolClass?: string; routeHint?: string};
        continuation?: {
          ready?: boolean;
          tool?: string;
          strategy?: string;
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
        agentGuidance?: {
          recommendedStrategy?: string;
          toolClass?: string;
          routeHint?: string;
        };
        fallbackPlan?: {
          reason: string;
          recommendedStrategy?: string;
          steps: Array<{tool: string}>;
        };
      };
      assert.strictEqual(fallbackPayload.outcome, 'partial');
      assert.strictEqual(fallbackPayload.schemaVersion, '1.0');
      assert.strictEqual(fallbackPayload.shouldResume, true);
      assert.strictEqual(fallbackPayload.shouldSwitchStrategy, true);
      assert.strictEqual(fallbackPayload.nextBestTool, 'diff_env_requirements');
      assert.strictEqual(fallbackPayload.detailLevel, 'standard');
      assert.strictEqual(
        fallbackPayload.routeGuard?.preferredToolClass,
        'task',
      );
      assert.strictEqual(
        fallbackPayload.routeGuard?.routeHint,
        'stay_on_task_flow',
      );
      assert.strictEqual(fallbackPayload.continuation?.ready, true);
      assert.strictEqual(
        fallbackPayload.continuation?.tool,
        'diff_env_requirements',
      );
      assert.strictEqual(fallbackPayload.continuation?.strategy, 'env-fix');
      assert.strictEqual(
        fallbackPayload.continuation?.actionKey,
        'diff_env_requirements',
      );
      assert.strictEqual(
        fallbackPayload.continuation?.invoke?.tool,
        'diff_env_requirements',
      );
      assert.deepStrictEqual(
        fallbackPayload.continuation?.invokeHint?.requiredParams,
        ['runtimeError', 'observedCapabilities'],
      );
      assert.strictEqual(fallbackPayload.continuation?.toolClass, 'task');
      assert.strictEqual(
        fallbackPayload.continuation?.routeHint,
        'stay_on_task_flow',
      );
      assert.strictEqual(
        fallbackPayload.agentGuidance?.recommendedStrategy,
        'env-fix',
      );
      assert.ok(fallbackPayload.fallbackPlan);
      assert.strictEqual(
        fallbackPayload.fallbackPlan?.recommendedStrategy,
        'env-fix',
      );
      assert.ok(
        fallbackPayload.fallbackPlan?.steps.some(
          step => step.tool === 'diff_env_requirements',
        ),
      );
      assert.ok(
        fallbackPayload.fallbackPlan?.steps.some(
          step => step.tool === 'manage_reverse_task',
        ),
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('executes export_rebuild_bundle through the real rebuild tool path', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-export-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    const originals = {
      getTopPriorityFiles: runtime.collector.getTopPriorityFiles,
      getCookies: runtime.pageController.getCookies,
      getLocalStorage: runtime.pageController.getLocalStorage,
      getSessionStorage: runtime.pageController.getSessionStorage,
      getPage: runtime.pageController.getPage,
    };
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-export-001',
            taskSlug: 'orchestrate-export-demo',
            targetUrl: 'https://example.com/product',
            goal: 'export rebuild bundle',
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
        taskId: 'task-orchestrate-export-001',
        slug: 'orchestrate-export-demo',
        targetUrl: 'https://example.com/product',
        goal: 'export rebuild bundle',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        functionName: 'signPayload',
        requestUrl: 'https://example.com/api/sign',
      });

      runtime.collector.getTopPriorityFiles = () => ({
        files: [
          {
            url: 'https://example.com/static/sign.js',
            content:
              'function signPayload(token, nonce) { return token + nonce; }',
            size: 58,
            type: 'external',
          },
        ],
        totalSize: 58,
        totalFiles: 1,
      });
      runtime.pageController.getCookies = async () => [
        {name: 'sid', value: 'cookie-1'},
      ];
      runtime.pageController.getLocalStorage = async () => ({token: 'abc'});
      runtime.pageController.getSessionStorage = async () => ({nonce: 'n-1'});
      runtime.pageController.getPage = async () =>
        ({
          url: () => 'https://example.com/product',
          title: async () => 'Product',
        }) as Awaited<ReturnType<typeof runtime.pageController.getPage>>;

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-export-001',
            execute: true,
            stopOnError: true,
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        execution?: {checkpoint?: {status: string}};
        summary?: {recentTimeline: Array<{action: string; status: string}>};
      };
      assert.strictEqual(payload.execution?.checkpoint?.status, 'passed');
      assert.ok(
        payload.summary?.recentTimeline.some(
          entry =>
            entry.action === 'export_rebuild_bundle' && entry.status === 'ok',
        ),
      );
      await stat(
        path.join(rootDir, 'task-orchestrate-export-001', 'env', 'entry.js'),
      );
      const capture = JSON.parse(
        await readFile(
          path.join(
            rootDir,
            'task-orchestrate-export-001',
            'env',
            'capture.json',
          ),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(
        (capture.page as Record<string, unknown>).url,
        'https://example.com/product',
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      runtime.collector.getTopPriorityFiles = originals.getTopPriorityFiles;
      runtime.pageController.getCookies = originals.getCookies;
      runtime.pageController.getLocalStorage = originals.getLocalStorage;
      runtime.pageController.getSessionStorage = originals.getSessionStorage;
      runtime.pageController.getPage = originals.getPage;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('executes diff_env_requirements through the real rebuild analyzer path', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-orchestrate-task-diff-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-diff-001',
            taskSlug: 'orchestrate-diff-demo',
            targetUrl: 'https://example.com/product',
            goal: 'diff env requirements',
            currentStage: 'Patch',
            currentSummary: 'ReferenceError: window is not defined',
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

      await updateReverseTaskState(runtime.reverseTaskStore, {
        taskId: 'task-orchestrate-diff-001',
        currentStage: 'Patch',
        status: 'partial',
        currentSummary: 'ReferenceError: window is not defined',
        nextStepHint: 'diff_env_requirements',
      });

      const response = makeResponse();
      await orchestrateReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-orchestrate-diff-001',
            execute: true,
            stopOnError: true,
          },
        },
        response as unknown as Parameters<
          typeof orchestrateReverseTaskTool.handler
        >[1],
        {} as Parameters<typeof orchestrateReverseTaskTool.handler>[2],
      );

      const payload = JSON.parse(response.lines[1] ?? '{}') as {
        execution?: {checkpoint?: {status: string}};
        summary?: {
          recentTimeline: Array<{
            action: string;
            status: string;
            result?: string;
          }>;
        };
      };
      assert.strictEqual(payload.execution?.checkpoint?.status, 'passed');
      const diffEntry = payload.summary?.recentTimeline.find(
        entry =>
          entry.action === 'diff_env_requirements' && entry.status === 'ok',
      );
      assert.ok(diffEntry);
      assert.ok(String(diffEntry?.result ?? '').includes('window'));
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
