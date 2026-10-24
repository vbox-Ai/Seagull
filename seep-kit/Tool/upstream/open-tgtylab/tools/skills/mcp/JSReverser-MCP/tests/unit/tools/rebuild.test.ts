/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {startReverseTask} from '../../../src/reverse/ReverseTaskBootstrap.js';
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {
  diffEnvRequirements,
  exportPortableBundle,
  exportRebuildBundle,
  getRebuildHealthReport,
} from '../../../src/tools/rebuild.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';

interface ResponseShape {
  lines: string[];
  appendResponseLine(value: string): void;
}

function makeResponse(): ResponseShape {
  const lines: string[] = [];
  return {
    lines,
    appendResponseLine: (value: string) => {
      lines.push(value);
    },
  };
}

function extractFirstJsonBlock(lines: string[]): Record<string, unknown> {
  const start = lines.indexOf('```json');
  const end = lines.indexOf('```', start + 1);
  return JSON.parse(lines.slice(start + 1, end).join('\n')) as Record<
    string,
    unknown
  >;
}

describe('rebuild bridge tools', () => {
  it('exports a local rebuild bundle and prioritizes env patches from runtime errors', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-rebuild-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      const exportResponse = makeResponse();
      await exportRebuildBundle.handler(
        {
          params: {
            taskId: 'task-001',
            taskSlug: 'demo',
            targetUrl: 'https://example.com',
            goal: 'rebuild signature',
            entryCode: 'import "./env.js";\nconsole.log(signToken("a", "b"));',
            envCode: 'globalThis.window = globalThis;',
            polyfillsCode: 'globalThis.atob = (v) => v;',
            capture: {
              cookies: [{name: 'sid', value: '1'}],
              requests: [{url: 'https://example.com/api/sign', method: 'POST'}],
            },
            notes: [
              'target request is /api/sign',
              'cookie sid participates in request chain',
            ],
          },
        } as Parameters<typeof exportRebuildBundle.handler>[0],
        exportResponse as unknown as Parameters<
          typeof exportRebuildBundle.handler
        >[1],
        {} as Parameters<typeof exportRebuildBundle.handler>[2],
      );

      await stat(path.join(rootDir, 'task-001', 'env', 'entry.js'));
      await stat(path.join(rootDir, 'task-001', 'env', 'env.js'));
      await stat(path.join(rootDir, 'task-001', 'env', 'polyfills.js'));
      await stat(path.join(rootDir, 'task-001', 'env', 'capture.json'));
      await stat(path.join(rootDir, 'task-001', 'report.md'));

      const report = await readFile(
        path.join(rootDir, 'task-001', 'report.md'),
        'utf8',
      );
      assert.ok(report.includes('/api/sign'));
      assert.ok(report.includes('cookie sid'));

      const diffResponse = makeResponse();
      await diffEnvRequirements.handler(
        {
          params: {
            runtimeError:
              "ReferenceError: window is not defined\nReferenceError: localStorage is not defined\nTypeError: Cannot read properties of undefined (reading 'subtle')",
            observedCapabilities: [
              'window',
              'document',
              'navigator',
              'localStorage',
              'crypto',
            ],
          },
        } as Parameters<typeof diffEnvRequirements.handler>[0],
        diffResponse as unknown as Parameters<
          typeof diffEnvRequirements.handler
        >[1],
        {} as Parameters<typeof diffEnvRequirements.handler>[2],
      );

      const diffJson = extractFirstJsonBlock(diffResponse.lines);
      assert.ok(Array.isArray(diffJson.missingCapabilities));
      assert.ok(Array.isArray(diffJson.nextPatches));
      assert.ok(Array.isArray(diffJson.patchSuggestions));
      assert.strictEqual(
        (diffJson.nextPatches as Array<Record<string, unknown>>)[0].capability,
        'window',
      );
      assert.strictEqual(
        (diffJson.patchSuggestions as Array<Record<string, unknown>>)[0]
          .capability,
        'window',
      );
      assert.ok(
        String(
          (diffJson.patchSuggestions as Array<Record<string, unknown>>)[0]
            .snippet,
        ).includes('globalThis.window = globalThis'),
      );
      assert.ok(
        (diffJson.patchSuggestions as Array<Record<string, unknown>>).some(
          item =>
            item.capability === 'localStorage' &&
            String(item.snippet).includes('globalThis.localStorage'),
        ),
      );
      assert.ok(
        (diffJson.patchSuggestions as Array<Record<string, unknown>>).some(
          item =>
            item.capability === 'crypto' &&
            String(item.snippet).includes('globalThis.crypto'),
        ),
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('returns minimal patch suggestions for session and document style gaps', async () => {
    const diffResponse = makeResponse();
    await diffEnvRequirements.handler(
      {
        params: {
          runtimeError:
            'ReferenceError: document is not defined\nReferenceError: sessionStorage is not defined',
          observedCapabilities: ['document', 'sessionStorage'],
        },
      } as Parameters<typeof diffEnvRequirements.handler>[0],
      diffResponse as unknown as Parameters<
        typeof diffEnvRequirements.handler
      >[1],
      {} as Parameters<typeof diffEnvRequirements.handler>[2],
    );

    const diffJson = extractFirstJsonBlock(diffResponse.lines);
    const patchSuggestions = diffJson.patchSuggestions as Array<
      Record<string, unknown>
    >;
    assert.ok(
      patchSuggestions.some(
        item =>
          item.capability === 'document' &&
          String(item.snippet).includes('globalThis.document'),
      ),
    );
    assert.ok(
      patchSuggestions.some(
        item =>
          item.capability === 'sessionStorage' &&
          String(item.snippet).includes('globalThis.sessionStorage'),
      ),
    );
  });

  it('builds rebuild health report from task summary, timeline, and evidence aggregates', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-rebuild-health-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      await startReverseTask(runtime.reverseTaskStore, {
        taskId: 'task-health-001',
        taskSlug: 'health-demo',
        targetUrl: 'https://example.com/product',
        goal: 'health report',
        currentStage: 'Patch',
        currentSummary: 'ReferenceError: window is not defined',
        targetContext: {
          targetRequest: {
            method: 'POST',
            url: 'https://example.com/api/sign',
          },
          candidateScripts: ['https://example.com/static/sign.js'],
        },
      });

      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-health-001',
        slug: 'health-demo',
        targetUrl: 'https://example.com/product',
        goal: 'health report',
      });
      await task.appendTimeline({
        stage: 'patch',
        action: 'rebuild_local',
        status: 'error',
        result: 'ReferenceError: window is not defined',
      });
      await task.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        functionName: 'signPayload',
        requestUrl: 'https://example.com/api/sign',
        scriptUrl: 'https://example.com/static/sign.js',
      });

      const response = makeResponse();
      await getRebuildHealthReport.handler(
        {
          params: {
            taskId: 'task-health-001',
            observedCapabilities: ['window', 'document', 'crypto'],
          },
        } as Parameters<typeof getRebuildHealthReport.handler>[0],
        response as unknown as Parameters<
          typeof getRebuildHealthReport.handler
        >[1],
        {} as Parameters<typeof getRebuildHealthReport.handler>[2],
      );

      const payload = extractFirstJsonBlock(response.lines);
      assert.strictEqual(payload.currentStage, 'Patch');
      assert.strictEqual(payload.schemaVersion, '1.0');
      assert.strictEqual(payload.status, 'active');
      assert.strictEqual(
        payload.currentSummary,
        'ReferenceError: window is not defined',
      );
      assert.ok((payload.artifacts as string[]).includes('report.md'));
      assert.ok(typeof payload.responseSummary === 'string');
      assert.ok(payload.diagnostics);
      assert.strictEqual(payload.outcome, 'partial');
      assert.strictEqual(payload.shouldResume, false);
      assert.strictEqual(payload.shouldSwitchStrategy, true);
      assert.strictEqual(payload.nextBestTool, 'diff_env_requirements');
      assert.strictEqual(payload.detailLevel, 'standard');
      const routeGuard = payload.routeGuard as
        | {preferredToolClass?: string; routeHint?: string}
        | undefined;
      assert.strictEqual(routeGuard?.preferredToolClass, 'rebuild');
      assert.strictEqual(routeGuard?.routeHint, 'switch_to_rebuild');
      const continuation = payload.continuation as
        | {
            ready?: boolean;
            tool?: string;
            toolClass?: string;
            routeHint?: string;
            invoke?: {tool?: string; params?: Record<string, unknown>};
          }
        | undefined;
      assert.strictEqual(continuation?.ready, true);
      assert.strictEqual(continuation?.tool, 'diff_env_requirements');
      assert.strictEqual(continuation?.invoke?.tool, 'diff_env_requirements');
      assert.deepStrictEqual(continuation?.invoke?.params, {
        runtimeError: 'ReferenceError: window is not defined',
        observedCapabilities: ['window', 'document', 'crypto'],
      });
      assert.strictEqual(continuation?.toolClass, 'rebuild');
      assert.strictEqual(continuation?.routeHint, 'switch_to_rebuild');
      assert.deepStrictEqual(payload.missingCapabilities, ['window']);
      assert.ok(Array.isArray(payload.patchSuggestions));
      assert.ok(
        (payload.patchSuggestions as Array<Record<string, unknown>>).some(
          item => item.capability === 'window',
        ),
      );
      assert.strictEqual(
        (payload.firstDivergence as Record<string, unknown>).action,
        'rebuild_local',
      );
      assert.ok(String(payload.recommendedNextAction).includes('最小补环境'));
      const guidance = payload.agentGuidance as Record<string, unknown>;
      assert.strictEqual(guidance.recommendedTool, 'diff_env_requirements');
      assert.strictEqual(guidance.recommendedStrategy, 'env-fix');
      assert.deepStrictEqual(guidance.recommendedParams, {
        runtimeError: 'ReferenceError: window is not defined',
        observedCapabilities: ['window', 'document', 'crypto'],
      });
      assert.ok(
        String(guidance.resumeHint).includes('get_rebuild_health_report'),
      );
      const evidenceAggregates = payload.evidenceAggregates as Record<
        string,
        unknown
      >;
      const topFunctions = evidenceAggregates.topFunctions as Array<
        Record<string, unknown>
      >;
      const links = evidenceAggregates.links as Record<string, unknown>;
      assert.strictEqual(topFunctions[0]?.value, 'signPayload');
      assert.ok(Array.isArray(links.requestToFunctions));
      assert.ok(
        (links.requestToFunctions as Array<Record<string, unknown>>).some(
          item => item.url === 'https://example.com/api/sign',
        ),
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports compact rebuild health output for agent callers', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-rebuild-health-compact-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      await startReverseTask(runtime.reverseTaskStore, {
        taskId: 'task-health-compact-001',
        taskSlug: 'health-compact-demo',
        targetUrl: 'https://example.com/product',
        goal: 'health compact report',
        currentStage: 'Patch',
        currentSummary: 'ReferenceError: window is not defined',
      });

      const response = makeResponse();
      await getRebuildHealthReport.handler(
        {
          params: {
            taskId: 'task-health-compact-001',
            outputMode: 'compact',
            observedCapabilities: ['window', 'document'],
          },
        } as Parameters<typeof getRebuildHealthReport.handler>[0],
        response as unknown as Parameters<
          typeof getRebuildHealthReport.handler
        >[1],
        {} as Parameters<typeof getRebuildHealthReport.handler>[2],
      );

      const payload = extractFirstJsonBlock(response.lines);
      assert.strictEqual(payload.outputMode, 'compact');
      assert.strictEqual(payload.schemaVersion, '1.0');
      assert.strictEqual(payload.evidenceAggregates, undefined);
      assert.strictEqual(payload.firstDivergence, undefined);
      assert.ok(typeof payload.responseSummary === 'string');
      assert.ok(payload.diagnostics);
      assert.strictEqual(payload.outcome, 'partial');
      assert.strictEqual(payload.shouldResume, false);
      assert.strictEqual(payload.detailLevel, 'minimal');
      assert.strictEqual(payload.nextBestTool, undefined);
      const compactContinuation = payload.continuation as
        | {
            tool?: string;
            invoke?: {tool?: string};
            invokeHint?: {
              requiredParams?: string[];
              optionalParams?: string[];
              example?: Record<string, unknown>;
            };
          }
        | undefined;
      assert.strictEqual(compactContinuation?.tool, 'diff_env_requirements');
      assert.strictEqual(
        compactContinuation?.invoke?.tool,
        'diff_env_requirements',
      );
      assert.deepStrictEqual(compactContinuation?.invokeHint?.requiredParams, [
        'runtimeError',
        'observedCapabilities',
      ]);
      assert.deepStrictEqual(payload.missingCapabilities, ['window']);
      assert.strictEqual(payload.agentGuidance, undefined);
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('auto-generates a rebuild bundle from observed page evidence and task logs', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-rebuild-auto-'),
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
      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-002',
        slug: 'auto-demo',
        targetUrl: 'https://example.com/product',
        goal: 'rebuild signature',
      });
      await task.appendLog('runtime-evidence', {
        source: 'hook',
        requestUrl: 'https://example.com/api/sign',
        functionName: 'signPayload',
        bodyPreview: '{"token":"abc","sign":"xyz"}',
      });
      await task.writeSnapshot('cookies.json', {
        cookies: [{name: 'sid', value: 'cookie-1'}],
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
      await exportRebuildBundle.handler(
        {
          params: {
            taskId: 'task-002',
            taskSlug: 'auto-demo',
            targetUrl: 'https://example.com/product',
            goal: 'rebuild signature',
            autoGenerate: true,
          },
        } as Parameters<typeof exportRebuildBundle.handler>[0],
        response as unknown as Parameters<
          typeof exportRebuildBundle.handler
        >[1],
        {} as Parameters<typeof exportRebuildBundle.handler>[2],
      );

      const entryCode = await readFile(
        path.join(rootDir, 'task-002', 'env', 'entry.js'),
        'utf8',
      );
      const envCode = await readFile(
        path.join(rootDir, 'task-002', 'env', 'env.js'),
        'utf8',
      );
      const capture = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-002', 'env', 'capture.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;

      assert.ok(entryCode.includes('signPayload'));
      assert.ok(entryCode.includes('capture.targetScript'));
      assert.ok(envCode.includes('globalThis.window = globalThis'));
      assert.ok(envCode.includes('globalThis.localStorage'));
      assert.strictEqual(
        (capture.page as Record<string, unknown>).url,
        'https://example.com/product',
      );
      assert.strictEqual(
        (capture.cookies as Array<Record<string, unknown>>)[0].name,
        'sid',
      );
      assert.strictEqual(
        (capture.runtimeEvidence as Array<Record<string, unknown>>)[0]
          .functionName,
        'signPayload',
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

  it('auto-generates replay.js when rebuild bundle export enables portable replay', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-rebuild-auto-portable-'),
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
      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-002-portable',
        slug: 'auto-demo-portable',
        targetUrl: 'https://example.com/product',
        goal: 'rebuild signature portable',
      });
      await task.appendLog('runtime-evidence', {
        source: 'hook',
        requestUrl: 'https://example.com/api/sign',
        functionName: 'signPayload',
        bodyPreview: '{"token":"abc","sign":"xyz"}',
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
      await exportRebuildBundle.handler(
        {
          params: {
            taskId: 'task-002-portable',
            taskSlug: 'auto-demo-portable',
            targetUrl: 'https://example.com/product',
            goal: 'rebuild signature portable',
            autoGenerate: true,
            autoExportPortable: true,
          },
        } as Parameters<typeof exportRebuildBundle.handler>[0],
        response as unknown as Parameters<
          typeof exportRebuildBundle.handler
        >[1],
        {} as Parameters<typeof exportRebuildBundle.handler>[2],
      );

      const payload = extractFirstJsonBlock(response.lines);
      assert.strictEqual(payload.autoExportPortable, true);
      assert.ok((payload.files as string[]).includes('env/replay.js'));

      const replay = await readFile(
        path.join(rootDir, 'task-002-portable', 'env', 'replay.js'),
        'utf8',
      );
      const state = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-002-portable', 'state.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.ok(
        replay.includes(
          'Portable rebuild replay generated by export_portable_bundle',
        ),
      );
      assert.ok(replay.includes('export const CAPTURE ='));
      assert.ok(String(state.currentSummary).includes('env/replay.js'));
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

  it('filters auto-generated evidence by target keywords instead of logging unrelated page noise', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-rebuild-filtered-'),
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
      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-003',
        slug: 'jd-h5st',
        targetUrl: 'https://item.jd.com/1001.html',
        goal: 'find h5st',
      });
      await task.appendLog('runtime-evidence', {
        source: 'hook',
        requestUrl:
          'https://api.m.jd.com/client.action?functionId=pc_search&h5st=abc123',
        functionName: 'genH5st',
        bodyPreview: '{"h5st":"abc123"}',
      });
      await task.appendLog('runtime-evidence', {
        source: 'hook',
        requestUrl: 'https://example.com/analytics',
        functionName: 'trackAd',
        bodyPreview: '{"event":"ad"}',
      });

      runtime.collector.getTopPriorityFiles = () => ({
        files: [
          {
            url: 'https://storage.360buyimg.com/js/h5st.js',
            content: 'function genH5st() { return "abc123"; }',
            size: 40,
            type: 'external',
          },
          {
            url: 'https://storage.360buyimg.com/js/analytics.js',
            content: 'function trackAd() { return "ad"; }',
            size: 34,
            type: 'external',
          },
        ],
        totalSize: 74,
        totalFiles: 2,
      });
      runtime.pageController.getCookies = async () => [
        {name: 'pin', value: 'jd-user'},
      ];
      runtime.pageController.getLocalStorage = async () => ({
        h5st_seed: 'seed-1',
        ad_cache: 'skip',
      });
      runtime.pageController.getSessionStorage = async () => ({
        h5st_nonce: 'n-1',
      });
      runtime.pageController.getPage = async () =>
        ({
          url: () => 'https://item.jd.com/1001.html',
          title: async () => 'JD Product',
        }) as Awaited<ReturnType<typeof runtime.pageController.getPage>>;

      const response = makeResponse();
      await exportRebuildBundle.handler(
        {
          params: {
            taskId: 'task-003',
            taskSlug: 'jd-h5st',
            targetUrl: 'https://item.jd.com/1001.html',
            goal: 'find h5st',
            autoGenerate: true,
            targetKeywords: ['h5st'],
            targetUrlPatterns: ['api.m.jd.com'],
            maxEvidenceItems: 2,
          },
        } as unknown as Parameters<typeof exportRebuildBundle.handler>[0],
        response as unknown as Parameters<
          typeof exportRebuildBundle.handler
        >[1],
        {} as Parameters<typeof exportRebuildBundle.handler>[2],
      );

      const capture = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-003', 'env', 'capture.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      const runtimeEvidence = capture.runtimeEvidence as Array<
        Record<string, unknown>
      >;
      const filteredScript = capture.targetScript as Record<string, unknown>;
      const report = await readFile(
        path.join(rootDir, 'task-003', 'report.md'),
        'utf8',
      );

      assert.strictEqual(runtimeEvidence.length, 1);
      assert.strictEqual(runtimeEvidence[0].functionName, 'genH5st');
      assert.strictEqual(
        filteredScript.url,
        'https://storage.360buyimg.com/js/h5st.js',
      );
      assert.ok(!JSON.stringify(capture).includes('trackAd'));
      assert.ok(!JSON.stringify(capture).includes('analytics'));
      assert.ok(report.includes('targetKeywords'));
      assert.ok(report.includes('targetActionDescription'));
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

  it('matches weird targets through function names and action descriptions without relying on obvious parameter names', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-rebuild-function-target-'),
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
      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-004',
        slug: 'weird-param',
        targetUrl: 'https://example.com/order',
        goal: 'find weird param',
      });
      await task.appendLog('runtime-evidence', {
        source: 'hook',
        actionDescription: 'click submit order button',
        functionName: 'computeQtk9',
        requestUrl: 'https://example.com/api/checkout',
        bodyPreview: '{"qtk9":"abc"}',
      });
      await task.appendLog('runtime-evidence', {
        source: 'hook',
        actionDescription: 'page idle telemetry',
        functionName: 'trackHeartbeat',
        requestUrl: 'https://example.com/api/metrics',
        bodyPreview: '{"ping":1}',
      });

      runtime.collector.getTopPriorityFiles = () => ({
        files: [
          {
            url: 'https://example.com/static/checkout.js',
            content: 'function computeQtk9() { return "abc"; }',
            size: 42,
            type: 'external',
          },
          {
            url: 'https://example.com/static/telemetry.js',
            content: 'function trackHeartbeat() { return 1; }',
            size: 38,
            type: 'external',
          },
        ],
        totalSize: 80,
        totalFiles: 2,
      });
      runtime.pageController.getCookies = async () => [
        {name: 'sid', value: 'checkout-user'},
      ];
      runtime.pageController.getLocalStorage = async () => ({
        order_seed: 'seed-2',
      });
      runtime.pageController.getSessionStorage = async () => ({
        order_nonce: 'nonce-2',
      });
      runtime.pageController.getPage = async () =>
        ({
          url: () => 'https://example.com/order',
          title: async () => 'Checkout',
        }) as Awaited<ReturnType<typeof runtime.pageController.getPage>>;

      const response = makeResponse();
      await exportRebuildBundle.handler(
        {
          params: {
            taskId: 'task-004',
            taskSlug: 'weird-param',
            targetUrl: 'https://example.com/order',
            goal: 'find weird param',
            autoGenerate: true,
            targetFunctionNames: ['computeQtk9'],
            targetActionDescription: 'submit order button',
          },
        } as unknown as Parameters<typeof exportRebuildBundle.handler>[0],
        response as unknown as Parameters<
          typeof exportRebuildBundle.handler
        >[1],
        {} as Parameters<typeof exportRebuildBundle.handler>[2],
      );

      const capture = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-004', 'env', 'capture.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      const runtimeEvidence = capture.runtimeEvidence as Array<
        Record<string, unknown>
      >;
      const filteredScript = capture.targetScript as Record<string, unknown>;
      const report = await readFile(
        path.join(rootDir, 'task-004', 'report.md'),
        'utf8',
      );

      assert.strictEqual(runtimeEvidence.length, 1);
      assert.strictEqual(runtimeEvidence[0].functionName, 'computeQtk9');
      assert.strictEqual(
        filteredScript.url,
        'https://example.com/static/checkout.js',
      );
      assert.ok(!JSON.stringify(capture).includes('trackHeartbeat'));
      assert.ok(!JSON.stringify(capture).includes('telemetry'));
      assert.ok(report.includes('computeQtk9'));
      assert.ok(report.includes('submit order button'));
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

  it('collapses rebuild and pure artifacts into portable single-file outputs', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-portable-export-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      const task = await runtime.reverseTaskStore.openTask({
        taskId: 'task-portable-001',
        slug: 'portable-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'portable export',
      });
      await task.writeSnapshot('task.json', {
        taskId: 'task-portable-001',
        slug: 'portable-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'portable export',
      });

      await exportRebuildBundle.handler(
        {
          params: {
            taskId: 'task-portable-001',
            taskSlug: 'portable-demo',
            targetUrl: 'https://example.com/api/sign',
            goal: 'portable export',
            entryCode:
              'import "./env.js";\nimport "./polyfills.js";\nconsole.log("replay");',
            envCode: 'globalThis.window = globalThis;',
            polyfillsCode: 'globalThis.atob = (v) => v;',
            capture: {
              runtimeEvidence: [{functionName: 'signPayload'}],
            },
            notes: ['portable rebuild bundle'],
          },
        } as Parameters<typeof exportRebuildBundle.handler>[0],
        makeResponse() as unknown as Parameters<
          typeof exportRebuildBundle.handler
        >[1],
        {} as Parameters<typeof exportRebuildBundle.handler>[2],
      );

      await mkdir(path.join(rootDir, 'task-portable-001', 'run'), {
        recursive: true,
      });
      await writeFile(
        path.join(rootDir, 'task-portable-001', 'run', 'pure-main.js'),
        [
          'export function signPayload(input, runtimeContext = {}) {',
          '  return {ok: false, input, runtimeContext, signature: null};',
          '}',
          'export function runFixture(fixture) {',
          '  return signPayload(fixture.input ?? {}, fixture.runtimeContext ?? {});',
          '}',
        ].join('\n'),
      );
      await writeFile(
        path.join(rootDir, 'task-portable-001', 'run', 'fixtures.json'),
        `${JSON.stringify(
          {
            goalMode: 'pure-draft',
            mainFunction: 'signPayload',
            samples: [
              {caseId: 'fixture-001', input: {token: 'a'}, runtimeContext: {}},
            ],
          },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        path.join(rootDir, 'task-portable-001', 'pure-extraction.json'),
        `${JSON.stringify(
          {
            stage: 'PureExtraction',
            goalMode: 'pure-draft',
            mainFunction: 'signPayload',
          },
          null,
          2,
        )}\n`,
      );

      const response = makeResponse();
      await exportPortableBundle.handler(
        {
          params: {
            taskId: 'task-portable-001',
          },
        } as Parameters<typeof exportPortableBundle.handler>[0],
        response as unknown as Parameters<
          typeof exportPortableBundle.handler
        >[1],
        {} as Parameters<typeof exportPortableBundle.handler>[2],
      );

      const payload = extractFirstJsonBlock(response.lines);
      assert.strictEqual(payload.ok, true);
      assert.ok(
        (payload.generatedFiles as string[]).includes('run/portable.js'),
      );
      assert.ok((payload.generatedFiles as string[]).includes('env/replay.js'));
      assert.deepStrictEqual(payload.verification, {
        checked: true,
        ok: true,
        verifiedFiles: ['run/portable.js', 'env/replay.js'],
        errors: [],
      });

      const portable = await readFile(
        path.join(rootDir, 'task-portable-001', 'run', 'portable.js'),
        'utf8',
      );
      const replay = await readFile(
        path.join(rootDir, 'task-portable-001', 'env', 'replay.js'),
        'utf8',
      );
      const state = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-portable-001', 'state.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      const timeline = (
        await readFile(
          path.join(rootDir, 'task-portable-001', 'timeline.jsonl'),
          'utf8',
        )
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      assert.ok(portable.includes('PORTABLE_FIXTURES'));
      assert.ok(portable.includes('runPortableFixture'));
      assert.ok(
        replay.includes(
          'Portable rebuild replay generated by export_portable_bundle',
        ),
      );
      assert.ok(replay.includes('export const CAPTURE ='));
      assert.ok(!replay.includes('import "./env.js";'));
      assert.ok(!replay.includes('import "./polyfills.js";'));
      assert.ok(String(state.currentSummary).includes('run/portable.js'));
      assert.ok(String(state.currentSummary).includes('env/replay.js'));
      assert.ok(
        timeline.some(entry => entry.action === 'compact_delivery_ready'),
      );
      assert.ok(
        timeline.some(entry => entry.action === 'compact_delivery_verified'),
      );
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
