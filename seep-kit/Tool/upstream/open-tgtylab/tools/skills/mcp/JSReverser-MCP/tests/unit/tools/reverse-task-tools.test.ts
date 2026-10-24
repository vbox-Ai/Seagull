/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {runReverseAgentTool} from '../../../src/tools/agent-runner.js';
import {
  analyzeTarget,
  locateSignatureFunction,
  recordReverseEvidence,
} from '../../../src/tools/analyzer.js';
import {getHookData} from '../../../src/tools/hook.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';
import {startReverseTaskTool} from '../../../src/tools/task.js';
import type {
  CollectCodeResult,
  DeobfuscateResult,
  DetectCryptoResult,
  UnderstandCodeResult,
} from '../../../src/types/index.js';

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

function makeAgentContext() {
  const page = {evaluate: async () => ({})};
  return {
    getSelectedPage: () => page,
    getPageByOptionalIdx: () => page,
    selectPage: () => undefined,
    reinitDebugger: async () => undefined,
    debuggerContext: {
      isEnabled: () => true,
      getScripts: () => [{scriptId: '77', url: 'https://example.com/app.js'}],
      getScriptsByUrlPattern: () => [
        {scriptId: '77', url: 'https://example.com/app.js'},
      ],
      getScriptSource: async () => 'function genH5st(){return hash(body)}',
      getScriptById: () => ({
        scriptId: '77',
        url: 'https://example.com/app.js',
      }),
      searchInScripts: async () => ({
        matches: [
          {
            scriptId: '77',
            url: 'https://example.com/app.js',
            lineNumber: 12,
            lineContent: 'function genH5st(){return hash(body)}',
          },
        ],
      }),
      extractFunctionTree: async () => ({
        mainFunction: 'genH5st',
        code: 'function genH5st(){return hash(body)}\nfunction hash(v){return v}',
        functions: [
          {
            name: 'genH5st',
            code: 'function genH5st(){return hash(body)}',
            dependencies: ['hash'],
            startLine: 1,
            endLine: 1,
            size: 40,
          },
          {
            name: 'hash',
            code: 'function hash(v){return v}',
            dependencies: [],
            startLine: 2,
            endLine: 2,
            size: 24,
          },
        ],
        callGraph: {genH5st: ['hash'], hash: []},
        totalSize: 64,
        extractedCount: 2,
      }),
    },
  };
}

describe('reverse task tools', () => {
  it('mirrors runtime evidence into network and scripts artifacts and removes template placeholders', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-task-mirror-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;

    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      const taskDir = path.join(rootDir, 'task-mirror');
      await mkdir(taskDir, {recursive: true});
      await writeFile(
        path.join(taskDir, 'network.jsonl'),
        '{"ts":"<ISO8601>","request":{"url":"<url>"}}\n',
        'utf8',
      );
      await writeFile(
        path.join(taskDir, 'scripts.jsonl'),
        '{"ts":"<ISO8601>","url":"<script_url>"}\n',
        'utf8',
      );

      const networkResponse = makeResponse();
      await recordReverseEvidence.handler(
        {
          params: {
            taskId: 'task-mirror',
            taskSlug: 'demo',
            targetUrl: 'https://example.com',
            goal: 'mirror capture',
            channel: 'runtime-evidence',
            entry: {
              ts: '2026-03-07T12:00:00Z',
              stage: 'capture',
              source: 'mcp',
              request: {
                method: 'GET',
                url: 'https://example.com/api/sign?token=abc',
                queryKeys: ['token', 'sign'],
              },
              response: {
                status: 200,
                bodyPreview: '{"ok":true}',
              },
              note: 'captured request',
            },
          },
        } as Parameters<typeof recordReverseEvidence.handler>[0],
        networkResponse as unknown as Parameters<
          typeof recordReverseEvidence.handler
        >[1],
        {} as Parameters<typeof recordReverseEvidence.handler>[2],
      );

      const scriptResponse = makeResponse();
      await recordReverseEvidence.handler(
        {
          params: {
            taskId: 'task-mirror',
            taskSlug: 'demo',
            targetUrl: 'https://example.com',
            goal: 'mirror capture',
            channel: 'runtime-evidence',
            entry: {
              ts: '2026-03-07T12:00:01Z',
              source: 'mcp',
              scriptId: '77',
              url: 'https://cdn.example.com/security.js',
              locator: {type: 'find_in_script', query: 'sign', offset: '10'},
              note: 'candidate sign chain',
            },
          },
        } as Parameters<typeof recordReverseEvidence.handler>[0],
        scriptResponse as unknown as Parameters<
          typeof recordReverseEvidence.handler
        >[1],
        {} as Parameters<typeof recordReverseEvidence.handler>[2],
      );

      const network = (
        await readFile(path.join(taskDir, 'network.jsonl'), 'utf8')
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      const scripts = (
        await readFile(path.join(taskDir, 'scripts.jsonl'), 'utf8')
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      assert.strictEqual(network.length, 1);
      assert.strictEqual(
        network[0].request.url,
        'https://example.com/api/sign?token=abc',
      );
      assert.strictEqual(network[0].response.status, 200);
      assert.strictEqual(network[0].note, 'captured request');

      assert.strictEqual(scripts.length, 1);
      assert.strictEqual(scripts[0].scriptId, '77');
      assert.strictEqual(scripts[0].url, 'https://cdn.example.com/security.js');
      assert.strictEqual(scripts[0].note, 'candidate sign chain');
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('records reverse evidence and emits rebuild-oriented guidance', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-task-tools-'),
    );
    const runtime = getJSHookRuntime();
    const originals = {
      reverseTaskStore: runtime.reverseTaskStore,
      collectorCollect: runtime.collector.collect,
      collectorGetActivePage: runtime.collector.getActivePage,
      collectorGetTopPriorityFiles: runtime.collector.getTopPriorityFiles,
      analyzerUnderstand: runtime.analyzer.understand,
      cryptoDetect: runtime.cryptoDetector.detect,
      hookCreate: runtime.hookManager.create,
      hookRecords: runtime.hookManager.getRecords,
      replayActions: runtime.pageController.replayActions,
    };

    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    runtime.collector.collect = async (): Promise<CollectCodeResult> => ({
      files: [
        {
          url: 'app.js',
          content: 'function sign(){return 1}',
          size: 32,
          type: 'external',
        },
      ],
      dependencies: {nodes: [], edges: []},
      totalSize: 32,
      collectTime: 1,
    });
    runtime.collector.getActivePage = async () => {
      throw new Error('unit test should not launch a real browser');
    };
    runtime.collector.getTopPriorityFiles = () => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId) { return hash(body); } fetch("/api/h5st", {method: "POST"})',
          size: 104,
          type: 'external',
        },
      ],
      totalSize: 104,
      totalFiles: 1,
    });
    runtime.analyzer.understand = async (): Promise<UnderstandCodeResult> => ({
      structure: {
        functions: [],
        classes: [],
        modules: [],
        callGraph: {nodes: [], edges: []},
      },
      techStack: {other: []},
      businessLogic: {mainFeatures: [], entities: [], rules: [], dataModel: {}},
      dataFlow: {
        graph: {nodes: [], edges: []},
        sources: [],
        sinks: [],
        taintPaths: [],
      },
      securityRisks: [],
      qualityScore: 88,
    });
    runtime.cryptoDetector.detect = async (): Promise<DetectCryptoResult> => ({
      algorithms: [
        {
          name: 'SHA256',
          type: 'hash',
          confidence: 0.9,
          location: {file: 'top-sign.js', line: 1},
          usage: 'signature',
        },
      ],
      libraries: [],
      confidence: 0.9,
    });
    runtime.hookManager.create = ({type}: {type: string}) => ({
      hookId: `${type}-hook-1`,
      type,
      script: `/* ${type} */`,
    });
    runtime.hookManager.getRecords = () => [
      {
        hookId: 'fetch-hook-1',
        target: 'fetch',
        event: 'request',
        method: 'POST',
        url: 'https://example.com/api/sign?token=abc',
        body: '{"token":"abc","sign":"xyz"}',
        status: 200,
        timestamp: Date.now(),
      },
    ];
    runtime.pageController.replayActions = async () => [];

    try {
      const recordResponse = makeResponse();
      await recordReverseEvidence.handler(
        {
          params: {
            taskId: 'task-001',
            taskSlug: 'demo',
            targetUrl: 'https://example.com',
            goal: 'rebuild signature',
            channel: 'runtime-evidence',
            targetKeywords: ['sign', 'nonce'],
            targetUrlPatterns: ['https://example.com/api/sign'],
            targetFunctionNames: ['signPayload'],
            targetActionDescription: 'click submit order button',
            entry: {
              source: 'hook',
              note: 'captured sign parameters',
            },
          },
        } as Parameters<typeof recordReverseEvidence.handler>[0],
        recordResponse as unknown as Parameters<
          typeof recordReverseEvidence.handler
        >[1],
        {} as Parameters<typeof recordReverseEvidence.handler>[2],
      );

      const recorded = (
        await readFile(
          path.join(rootDir, 'task-001', 'runtime-evidence.jsonl'),
          'utf8',
        )
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.strictEqual(recorded.length, 1);
      assert.strictEqual(recorded[0].source, 'hook');
      assert.strictEqual(recorded[0].note, 'captured sign parameters');
      assert.deepStrictEqual(recorded[0].targetContext, {
        targetKeywords: ['sign', 'nonce'],
        targetUrlPatterns: ['https://example.com/api/sign'],
        targetFunctionNames: ['signPayload'],
        targetActionDescription: 'click submit order button',
      });

      const targetContext = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-001', 'target-context.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.deepStrictEqual(targetContext, {
        targetKeywords: ['sign', 'nonce'],
        targetUrlPatterns: ['https://example.com/api/sign'],
        targetFunctionNames: ['signPayload'],
        targetActionDescription: 'click submit order button',
      });

      const analyzeResponse = makeResponse();
      await analyzeTarget.handler(
        {
          params: {
            url: 'https://example.com',
            hookPreset: 'api-signature',
            autoInjectHooks: false,
          },
        } as Parameters<typeof analyzeTarget.handler>[0],
        analyzeResponse as unknown as Parameters<
          typeof analyzeTarget.handler
        >[1],
        {} as Parameters<typeof analyzeTarget.handler>[2],
      );
      const analyzeJson = extractFirstJsonBlock(analyzeResponse.lines);
      assert.ok(Array.isArray(analyzeJson.recommendedNextSteps));
      assert.ok(Array.isArray(analyzeJson.stopIf));
      assert.ok(Array.isArray(analyzeJson.whyTheseSteps));

      const hookResponse = makeResponse();
      await getHookData.handler(
        {
          params: {
            hookId: 'fetch-hook-1',
            view: 'summary',
            maxRecords: 5,
          },
        } as Parameters<typeof getHookData.handler>[0],
        hookResponse as unknown as Parameters<typeof getHookData.handler>[1],
        {} as Parameters<typeof getHookData.handler>[2],
      );
      const hookJson = extractFirstJsonBlock(hookResponse.lines);
      assert.ok(Array.isArray(hookJson.candidateEnvNeeds));
      assert.ok(Array.isArray(hookJson.requestBindings));
    } finally {
      runtime.reverseTaskStore = originals.reverseTaskStore;
      runtime.collector.collect = originals.collectorCollect;
      runtime.collector.getActivePage = originals.collectorGetActivePage;
      runtime.collector.getTopPriorityFiles =
        originals.collectorGetTopPriorityFiles;
      runtime.analyzer.understand = originals.analyzerUnderstand;
      runtime.cryptoDetector.detect = originals.cryptoDetect;
      runtime.hookManager.create = originals.hookCreate;
      runtime.hookManager.getRecords = originals.hookRecords;
      runtime.pageController.replayActions = originals.replayActions;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('persists locate_signature_function results into task artifacts for later orchestration reuse', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-locate-persist-'),
    );
    const runtime = getJSHookRuntime();
    const originals = {
      reverseTaskStore: runtime.reverseTaskStore,
      collectorCollect: runtime.collector.collect,
      collectorGetTopPriorityFiles: runtime.collector.getTopPriorityFiles,
    };

    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    runtime.collector.collect = async (): Promise<CollectCodeResult> => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId){ return crypto.subtle.digest("SHA-256", body); }',
          size: 96,
          type: 'external',
        },
      ],
      dependencies: {nodes: [], edges: []},
      totalSize: 96,
      collectTime: 1,
    });
    runtime.collector.getTopPriorityFiles = () => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId){ return crypto.subtle.digest("SHA-256", body); }',
          size: 96,
          type: 'external',
        },
      ],
      totalSize: 96,
      totalFiles: 1,
    });

    try {
      const response = makeResponse();
      await locateSignatureFunction.handler(
        {
          params: {
            url: 'https://example.com',
            taskId: 'task-locate-persist-001',
            taskSlug: 'persist-demo',
            goal: 'persist h5st location',
            persistResult: true,
            targetParam: 'h5st',
            relatedParams: ['appid', 'body', 'functionId'],
          },
        } as Parameters<typeof locateSignatureFunction.handler>[0],
        response as unknown as Parameters<
          typeof locateSignatureFunction.handler
        >[1],
        {} as Parameters<typeof locateSignatureFunction.handler>[2],
      );

      const locateJson = extractFirstJsonBlock(response.lines);
      assert.strictEqual(locateJson.persisted, true);

      const targetContext = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-locate-persist-001', 'target-context.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.deepStrictEqual(targetContext.locatedSignature, {
        functionName: 'genH5st',
        scriptUrl: 'https://example.com/app.js',
        score: 23,
        targetParam: 'h5st',
        relatedParams: ['appid', 'body', 'functionid'],
        evidence: [
          'function name matches target param: h5st',
          'function name matches signing keywords',
          'related params matched: appid, body, functionid',
          'api signals: crypto.subtle, digest',
        ],
      });

      const snapshot = JSON.parse(
        await readFile(
          path.join(
            rootDir,
            'task-locate-persist-001',
            'signature-locate.json',
          ),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(snapshot.targetParam, 'h5st');

      const evidence = (
        await readFile(
          path.join(
            rootDir,
            'task-locate-persist-001',
            'runtime-evidence.jsonl',
          ),
          'utf8',
        )
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.strictEqual(evidence[0].kind, 'signature-locate');
      assert.strictEqual(evidence[0].functionName, 'genH5st');
    } finally {
      runtime.reverseTaskStore = originals.reverseTaskStore;
      runtime.collector.collect = originals.collectorCollect;
      runtime.collector.getTopPriorityFiles =
        originals.collectorGetTopPriorityFiles;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('runs the full reverse agent loop through locate/search/slice/understand', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-run-agent-'),
    );
    const runtime = getJSHookRuntime();
    const originals = {
      reverseTaskStore: runtime.reverseTaskStore,
      collectorCollect: runtime.collector.collect,
      collectorGetTopPriorityFiles: runtime.collector.getTopPriorityFiles,
      analyzerUnderstand: runtime.analyzer.understand,
      deobfuscatorDeobfuscate: runtime.deobfuscator.deobfuscate,
    };

    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    runtime.collector.collect = async (): Promise<CollectCodeResult> => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId){ return crypto.subtle.digest("SHA-256", body); }',
          size: 96,
          type: 'external',
        },
      ],
      dependencies: {nodes: [], edges: []},
      totalSize: 96,
      collectTime: 1,
    });
    runtime.collector.getTopPriorityFiles = () => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId){ return crypto.subtle.digest("SHA-256", body); }',
          size: 96,
          type: 'external',
        },
      ],
      totalSize: 96,
      totalFiles: 1,
    });
    runtime.analyzer.understand = async (): Promise<UnderstandCodeResult> => ({
      structure: {
        functions: [],
        classes: [],
        modules: [],
        callGraph: {nodes: [], edges: []},
      },
      techStack: {other: []},
      businessLogic: {
        mainFeatures: ['build h5st'],
        entities: [],
        rules: [],
        dataModel: {},
      },
      dataFlow: {
        graph: {nodes: [], edges: []},
        sources: [],
        sinks: [],
        taintPaths: [],
      },
      securityRisks: [],
      qualityScore: 90,
    });
    runtime.deobfuscator.deobfuscate =
      async (): Promise<DeobfuscateResult> => ({
        code: 'function genH5st(appid, body, functionId) { return hash(body); }',
        readabilityScore: 85,
        confidence: 0.88,
        obfuscationType: ['webpack'],
        transformations: [],
        analysis: 'normalized control flow',
      });

    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-run-agent-001',
            taskSlug: 'run-agent-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'auto run h5st reverse agent',
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
      const opened = await runtime.reverseTaskStore.openTask({
        taskId: 'task-run-agent-001',
        slug: 'run-agent-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'auto run h5st reverse agent',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'capture',
        kind: 'sample',
        requestUrl: 'https://example.com/api/h5st',
        bodyPreview:
          '{"appid":"app-1","body":{"sku":"1001"},"functionId":"sign.test"}',
      });

      const response = makeResponse();
      await runReverseAgentTool.handler(
        {
          params: {
            taskId: 'task-run-agent-001',
            maxRounds: 6,
          },
        } as Parameters<typeof runReverseAgentTool.handler>[0],
        response as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[1],
        makeAgentContext() as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[2],
      );

      const payload = extractFirstJsonBlock(response.lines) as {
        run?: {
          roundsExecuted?: number;
          stopReason?: string;
          goalMode?: string;
          rounds?: Array<{primaryTool: string}>;
        };
        generatedArtifacts?: string[];
        nextBestTool?: string;
        continuation?: {
          invoke?: {tool?: string; params?: Record<string, unknown>};
        };
      };
      assert.strictEqual(payload.run?.stopReason, 'pure_extraction_ready');
      assert.strictEqual(payload.run?.roundsExecuted, 4);
      assert.strictEqual(payload.run?.goalMode, 'pure-draft');
      assert.deepStrictEqual(payload.generatedArtifacts, [
        'understand-code.json',
        'deobfuscate-code.json',
        'pure-extraction.json',
        'run/fixtures.json',
        'run/pure-main.js',
        'run/pure-selftest.test.mjs',
      ]);
      assert.deepStrictEqual(
        payload.run?.rounds?.map(entry => entry.primaryTool),
        [
          'locate_signature_function',
          'search_in_sources',
          'extract_function_tree',
          'understand_code',
        ],
      );
      assert.strictEqual(payload.nextBestTool, 'manage_reverse_task');
      assert.strictEqual(
        payload.continuation?.invoke?.tool,
        'manage_reverse_task',
      );
      assert.deepStrictEqual(payload.continuation?.invoke?.params, {
        action: 'summarize',
        taskId: 'task-run-agent-001',
      });

      const targetContext = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-run-agent-001', 'target-context.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.ok(targetContext.locatedSignature);
      assert.ok(targetContext.locatedSource);
      assert.ok(targetContext.functionSlice);

      const understandSnapshot = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-run-agent-001', 'understand-code.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(
        (understandSnapshot.input as Record<string, unknown>).focus,
        'structure',
      );

      const deobfuscateSnapshot = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-run-agent-001', 'deobfuscate-code.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(
        (deobfuscateSnapshot.input as Record<string, unknown>).aggressive,
        true,
      );

      const pureExtraction = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-run-agent-001', 'pure-extraction.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(pureExtraction.stage, 'PureExtraction');
      assert.strictEqual(pureExtraction.goalMode, 'pure-draft');
      assert.strictEqual(pureExtraction.mainFunction, 'genH5st');

      const fixtures = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-run-agent-001', 'run', 'fixtures.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(fixtures.stage, 'PureExtraction');
      assert.strictEqual(fixtures.goalMode, 'pure-draft');
      assert.strictEqual(fixtures.mainFunction, 'genH5st');
      assert.deepStrictEqual(
        (fixtures.samples as Array<Record<string, unknown>>)[0].input,
        {
          appid: 'app-1',
          body: {sku: '1001'},
          functionId: 'sign.test',
        },
      );
      assert.strictEqual(
        (
          (
            (fixtures.samples as Array<Record<string, unknown>>)[0]
              .runtimeContext as Record<string, unknown>
          ).request as Record<string, unknown>
        ).url,
        'https://example.com/api/h5st',
      );

      const pureMain = await readFile(
        path.join(rootDir, 'task-run-agent-001', 'run', 'pure-main.js'),
        'utf8',
      );
      assert.ok(pureMain.includes('export function genH5st'));
      assert.ok(pureMain.includes('export const GOAL_MODE = "pure-draft"'));
      assert.ok(pureMain.includes('deobfuscatedDraft'));
      assert.ok(pureMain.includes('export function runFixture'));
      assert.ok(pureMain.includes('signature: null'));

      const selftest = await readFile(
        path.join(
          rootDir,
          'task-run-agent-001',
          'run',
          'pure-selftest.test.mjs',
        ),
        'utf8',
      );
      assert.ok(selftest.includes("import {runFixture} from './pure-main.js'"));
      assert.ok(selftest.includes('runs first auto-generated fixture'));
      assert.ok(selftest.includes('result.mainFunction'));

      const evidence = (
        await readFile(
          path.join(rootDir, 'task-run-agent-001', 'runtime-evidence.jsonl'),
          'utf8',
        )
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.ok(evidence.some(entry => entry.kind === 'signature-locate'));
      assert.ok(evidence.some(entry => entry.kind === 'source-locate'));
      assert.ok(evidence.some(entry => entry.kind === 'function-slice'));
      assert.ok(evidence.some(entry => entry.kind === 'understand-code'));
      assert.ok(evidence.some(entry => entry.kind === 'deobfuscate-code'));
      assert.ok(evidence.some(entry => entry.kind === 'pure-draft'));
      assert.ok(evidence.some(entry => entry.kind === 'auto-agent'));
    } finally {
      runtime.reverseTaskStore = originals.reverseTaskStore;
      runtime.collector.collect = originals.collectorCollect;
      runtime.collector.getTopPriorityFiles =
        originals.collectorGetTopPriorityFiles;
      runtime.analyzer.understand = originals.analyzerUnderstand;
      runtime.deobfuscator.deobfuscate = originals.deobfuscatorDeobfuscate;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports signature-only goal mode and stops after function slice', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-task-run-agent-signature-'),
    );
    const runtime = getJSHookRuntime();
    const originals = {
      reverseTaskStore: runtime.reverseTaskStore,
      collectorCollect: runtime.collector.collect,
      collectorGetTopPriorityFiles: runtime.collector.getTopPriorityFiles,
      analyzerUnderstand: runtime.analyzer.understand,
      deobfuscatorDeobfuscate: runtime.deobfuscator.deobfuscate,
    };

    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    runtime.collector.collect = async (): Promise<CollectCodeResult> => ({
      files: [
        {
          url: 'app.js',
          content: 'function sign(){return 1}',
          size: 32,
          type: 'external',
        },
      ],
      dependencies: {nodes: [], edges: []},
      totalSize: 32,
      collectTime: 1,
    });
    runtime.collector.getTopPriorityFiles = () => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId) { return hash(body); } fetch("/api/h5st", {method: "POST"})',
          size: 104,
          type: 'external',
        },
      ],
      totalSize: 104,
      totalFiles: 1,
    });

    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-run-agent-signature-001',
            taskSlug: 'run-agent-signature-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'signature-only flow',
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
      await runReverseAgentTool.handler(
        {
          params: {
            taskId: 'task-run-agent-signature-001',
            maxRounds: 6,
            goalMode: 'signature-only',
          },
        } as Parameters<typeof runReverseAgentTool.handler>[0],
        response as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[1],
        makeAgentContext() as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[2],
      );

      const payload = extractFirstJsonBlock(response.lines) as {
        run?: {
          roundsExecuted?: number;
          stopReason?: string;
          goalMode?: string;
          rounds?: Array<{primaryTool: string}>;
        };
        generatedArtifacts?: string[];
      };
      assert.strictEqual(payload.run?.stopReason, 'analysis_completed');
      assert.strictEqual(payload.run?.roundsExecuted, 3);
      assert.strictEqual(payload.run?.goalMode, 'signature-only');
      assert.deepStrictEqual(payload.generatedArtifacts, [
        'function-slice.json',
      ]);
      assert.deepStrictEqual(
        payload.run?.rounds?.map(entry => entry.primaryTool),
        [
          'locate_signature_function',
          'search_in_sources',
          'extract_function_tree',
        ],
      );

      const functionSlice = JSON.parse(
        await readFile(
          path.join(
            rootDir,
            'task-run-agent-signature-001',
            'function-slice.json',
          ),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(functionSlice.mainFunction, 'genH5st');

      await assert.rejects(
        readFile(
          path.join(
            rootDir,
            'task-run-agent-signature-001',
            'pure-extraction.json',
          ),
          'utf8',
        ),
      );
    } finally {
      runtime.reverseTaskStore = originals.reverseTaskStore;
      runtime.collector.collect = originals.collectorCollect;
      runtime.collector.getTopPriorityFiles =
        originals.collectorGetTopPriorityFiles;
      runtime.analyzer.understand = originals.analyzerUnderstand;
      runtime.deobfuscator.deobfuscate = originals.deobfuscatorDeobfuscate;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('materializes explicit port-ready contract drafts', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-task-run-agent-port-'),
    );
    const runtime = getJSHookRuntime();
    const originals = {
      reverseTaskStore: runtime.reverseTaskStore,
      collectorCollect: runtime.collector.collect,
      collectorGetTopPriorityFiles: runtime.collector.getTopPriorityFiles,
      analyzerUnderstand: runtime.analyzer.understand,
      deobfuscatorDeobfuscate: runtime.deobfuscator.deobfuscate,
    };

    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    runtime.collector.collect = async (): Promise<CollectCodeResult> => ({
      files: [
        {
          url: 'app.js',
          content: 'function sign(){return 1}',
          size: 32,
          type: 'external',
        },
      ],
      dependencies: {nodes: [], edges: []},
      totalSize: 32,
      collectTime: 1,
    });
    runtime.collector.getTopPriorityFiles = () => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId) { return hash(body); } fetch("/api/h5st", {method: "POST"})',
          size: 104,
          type: 'external',
        },
      ],
      totalSize: 104,
      totalFiles: 1,
    });
    runtime.analyzer.understand = async (): Promise<UnderstandCodeResult> => ({
      structure: {
        functions: [],
        classes: [],
        modules: [],
        callGraph: {nodes: [], edges: []},
      },
      techStack: {other: []},
      businessLogic: {
        mainFeatures: ['build h5st'],
        entities: [],
        rules: [],
        dataModel: {},
      },
      dataFlow: {
        graph: {nodes: [], edges: []},
        sources: [],
        sinks: [],
        taintPaths: [],
      },
      securityRisks: [],
      qualityScore: 90,
    });
    runtime.deobfuscator.deobfuscate =
      async (): Promise<DeobfuscateResult> => ({
        code: 'function genH5st(input){return input}',
        readabilityScore: 90,
        confidence: 0.9,
        obfuscationType: ['webpack'],
        transformations: [],
        analysis: 'port ready draft',
      });

    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-run-agent-port-001',
            taskSlug: 'run-agent-port-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'port ready flow',
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

      const opened = await runtime.reverseTaskStore.openTask({
        taskId: 'task-run-agent-port-001',
        slug: 'run-agent-port-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'port ready flow',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'capture',
        kind: 'sample',
        requestUrl: 'https://example.com/api/h5st',
        bodyPreview:
          '{"appid":"app-1","body":{"sku":"1001"},"functionId":"sign.test"}',
      });

      const response = makeResponse();
      await runReverseAgentTool.handler(
        {
          params: {
            taskId: 'task-run-agent-port-001',
            maxRounds: 6,
            goalMode: 'port-ready',
          },
        } as Parameters<typeof runReverseAgentTool.handler>[0],
        response as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[1],
        makeAgentContext() as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[2],
      );

      const payload = extractFirstJsonBlock(response.lines) as {
        run?: {
          stopReason?: string;
          goalMode?: string;
          autoExportPortable?: boolean;
        };
        nextBestTool?: string;
        continuation?: {
          invoke?: {tool?: string; params?: Record<string, unknown>};
        };
      };
      assert.strictEqual(payload.run?.stopReason, 'pure_extraction_ready');
      assert.strictEqual(payload.run?.goalMode, 'port-ready');
      assert.strictEqual(payload.run?.autoExportPortable, false);
      assert.strictEqual(payload.nextBestTool, 'export_portable_bundle');
      assert.strictEqual(
        payload.continuation?.invoke?.tool,
        'export_portable_bundle',
      );
      assert.deepStrictEqual(payload.continuation?.invoke?.params, {
        taskId: 'task-run-agent-port-001',
        artifactMode: 'pure',
      });

      const pureExtraction = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-run-agent-port-001', 'pure-extraction.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(pureExtraction.goalMode, 'port-ready');
      assert.strictEqual(
        (pureExtraction.boundary as Record<string, unknown>).portBoundary,
        'stabilize output contract before cross-runtime port',
      );

      const fixtures = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-run-agent-port-001', 'run', 'fixtures.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(fixtures.goalMode, 'port-ready');
      assert.ok((fixtures.boundary as Record<string, unknown>).adapterBoundary);

      const pureMain = await readFile(
        path.join(rootDir, 'task-run-agent-port-001', 'run', 'pure-main.js'),
        'utf8',
      );
      assert.ok(pureMain.includes('export const PORT_CONTRACT ='));
      assert.ok(
        pureMain.includes("outputShape: 'signature-result-v1'") ||
          pureMain.includes('"outputShape": "signature-result-v1"'),
      );
      assert.ok(pureMain.includes('inputAdapterApplied'));
      assert.ok(pureMain.includes('fixtureId'));
    } finally {
      runtime.reverseTaskStore = originals.reverseTaskStore;
      runtime.collector.collect = originals.collectorCollect;
      runtime.collector.getTopPriorityFiles =
        originals.collectorGetTopPriorityFiles;
      runtime.analyzer.understand = originals.analyzerUnderstand;
      runtime.deobfuscator.deobfuscate = originals.deobfuscatorDeobfuscate;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('auto-exports portable pure bundle after port-ready when enabled', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-task-run-agent-port-auto-'),
    );
    const runtime = getJSHookRuntime();
    const originals = {
      reverseTaskStore: runtime.reverseTaskStore,
      collectorCollect: runtime.collector.collect,
      collectorGetTopPriorityFiles: runtime.collector.getTopPriorityFiles,
      analyzerUnderstand: runtime.analyzer.understand,
      deobfuscatorDeobfuscate: runtime.deobfuscator.deobfuscate,
    };

    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});
    runtime.collector.collect = async (): Promise<CollectCodeResult> => ({
      files: [
        {
          url: 'app.js',
          content: 'function sign(){return 1}',
          size: 32,
          type: 'external',
        },
      ],
      dependencies: {nodes: [], edges: []},
      totalSize: 32,
      collectTime: 1,
    });
    runtime.collector.getTopPriorityFiles = () => ({
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function genH5st(appid, body, functionId) { return hash(body); } fetch("/api/h5st", {method: "POST"})',
          size: 104,
          type: 'external',
        },
      ],
      totalSize: 104,
      totalFiles: 1,
    });
    runtime.analyzer.understand = async (): Promise<UnderstandCodeResult> => ({
      structure: {
        functions: [],
        classes: [],
        modules: [],
        callGraph: {nodes: [], edges: []},
      },
      techStack: {other: []},
      businessLogic: {
        mainFeatures: ['build h5st'],
        entities: [],
        rules: [],
        dataModel: {},
      },
      dataFlow: {
        graph: {nodes: [], edges: []},
        sources: [],
        sinks: [],
        taintPaths: [],
      },
      securityRisks: [],
      qualityScore: 90,
    });
    runtime.deobfuscator.deobfuscate =
      async (): Promise<DeobfuscateResult> => ({
        code: 'function genH5st(input){return input}',
        readabilityScore: 90,
        confidence: 0.9,
        obfuscationType: ['webpack'],
        transformations: [],
        analysis: 'port ready auto export draft',
      });

    try {
      await startReverseTaskTool.handler(
        {
          params: {
            taskId: 'task-run-agent-port-auto-001',
            taskSlug: 'run-agent-port-auto-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'port ready auto export flow',
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

      const opened = await runtime.reverseTaskStore.openTask({
        taskId: 'task-run-agent-port-auto-001',
        slug: 'run-agent-port-auto-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'port ready auto export flow',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'capture',
        kind: 'sample',
        requestUrl: 'https://example.com/api/h5st',
        bodyPreview:
          '{"appid":"app-1","body":{"sku":"1001"},"functionId":"sign.test"}',
      });

      const response = makeResponse();
      await runReverseAgentTool.handler(
        {
          params: {
            taskId: 'task-run-agent-port-auto-001',
            maxRounds: 6,
            goalMode: 'port-ready',
            autoExportPortable: true,
          },
        } as Parameters<typeof runReverseAgentTool.handler>[0],
        response as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[1],
        makeAgentContext() as unknown as Parameters<
          typeof runReverseAgentTool.handler
        >[2],
      );

      const payload = extractFirstJsonBlock(response.lines) as {
        run?: {
          stopReason?: string;
          goalMode?: string;
          autoExportPortable?: boolean;
        };
        generatedArtifacts?: string[];
      };
      assert.strictEqual(payload.run?.stopReason, 'pure_extraction_ready');
      assert.strictEqual(payload.run?.goalMode, 'port-ready');
      assert.strictEqual(payload.run?.autoExportPortable, true);
      assert.ok((payload.generatedArtifacts ?? []).includes('run/portable.js'));

      const portable = await readFile(
        path.join(
          rootDir,
          'task-run-agent-port-auto-001',
          'run',
          'portable.js',
        ),
        'utf8',
      );
      assert.ok(portable.includes('runPortableFixture'));
      assert.ok(portable.includes('PORTABLE_FIXTURES'));
    } finally {
      runtime.reverseTaskStore = originals.reverseTaskStore;
      runtime.collector.collect = originals.collectorCollect;
      runtime.collector.getTopPriorityFiles =
        originals.collectorGetTopPriorityFiles;
      runtime.analyzer.understand = originals.analyzerUnderstand;
      runtime.deobfuscator.deobfuscate = originals.deobfuscatorDeobfuscate;
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
