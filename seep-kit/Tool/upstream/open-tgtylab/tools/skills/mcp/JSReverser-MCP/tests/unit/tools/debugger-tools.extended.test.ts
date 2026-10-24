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
import {
  listScripts,
  getScriptSource,
  findInScript,
  extractFunctionTree,
  searchInSources,
  breakpoint,
  getRequestInitiator,
  getPausedInfo,
  resume,
  pause,
  stepOver,
  stepInto,
  stepOut,
  evaluateOnCallframe,
  setBreakpointOnText,
  hookFunction,
  unhookFunction,
  listHooks,
  inspectObject,
  getStorage,
  xhrBreakpoint,
  monitorEvents,
  stopMonitor,
  traceFunction,
} from '../../../src/tools/debugger.js';
import {listFrames, selectFrame} from '../../../src/tools/frames.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';

interface DebuggerResponseHarness {
  lines: string[];
  appendResponseLine(value: string): void;
  setIncludePages(value: boolean): void;
  setIncludeNetworkRequests(value: boolean): void;
  setIncludeConsoleData(value: boolean): void;
  attachImage(value: unknown): void;
  attachNetworkRequest(id: number): void;
  attachConsoleMessage(id: number): void;
  setIncludeWebSocketConnections(value: boolean): void;
  attachWebSocket(id: number): void;
}

interface ScriptHarness {
  scriptId: string;
  url?: string;
  sourceMapURL?: string;
}

interface BreakpointHarness {
  breakpointId: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  condition?: string;
  locations: unknown[];
}

interface DebuggerContextHarness {
  isEnabled(): boolean;
  getScripts(): ScriptHarness[];
  getScriptsByUrlPattern(pattern: string): ScriptHarness[];
  getScriptSource(scriptId: string): Promise<string>;
  extractFunctionTree?(
    scriptId: string,
    functionName: string,
    options?: {maxDepth?: number; maxSize?: number; includeComments?: boolean},
  ): Promise<{
    mainFunction: string;
    code: string;
    functions: Array<{
      name: string;
      code: string;
      dependencies: string[];
      startLine: number;
      endLine: number;
      size: number;
    }>;
    callGraph: Record<string, string[]>;
    totalSize: number;
    extractedCount: number;
  }>;
  getScriptById(scriptId: string): ScriptHarness | undefined;
  searchInScripts(
    query: string,
    options?: unknown,
  ): Promise<{
    matches: Array<{
      scriptId: string;
      url?: string;
      lineNumber: number;
      lineContent: string;
    }>;
  }>;
  setBreakpoint(
    url: string,
    lineNumber: number,
    columnNumber: number,
    condition?: string,
  ): Promise<BreakpointHarness>;
  setBreakpointByUrlRegex(
    url: string,
    lineNumber: number,
    columnNumber: number,
    condition?: string,
  ): Promise<BreakpointHarness>;
  removeBreakpoint(breakpointId: string): Promise<void>;
  getBreakpoints(): Array<{
    breakpointId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    condition?: string;
    locations: unknown[];
  }>;
  getPausedState(): {
    isPaused: boolean;
    reason?: string;
    hitBreakpoints?: string[];
    callFrames: Array<{
      functionName?: string;
      url?: string;
      callFrameId: string;
      location: {scriptId: string; lineNumber: number; columnNumber: number};
      scopeChain?: Array<{
        type: string;
        name?: string;
        object?: {objectId?: string};
      }>;
    }>;
  };
  isPaused(): boolean;
  resume(): Promise<void>;
  pause(): Promise<void>;
  stepOver(): Promise<void>;
  stepInto(): Promise<void>;
  stepOut(): Promise<void>;
  evaluateOnCallFrame(
    callFrameId: string,
    expression: string,
  ): Promise<{result?: {value?: unknown}; exceptionDetails?: unknown}>;
  getScopeVariables(
    objectId: string,
    maxDepth?: number,
  ): Promise<Array<{name: string; value: unknown}>>;
  getClient(): {
    send(method: string, params?: unknown): Promise<unknown>;
  } | null;
  getLastAutoRecoveryEvent?(): {
    breakpointId: string;
    hitCount: number;
    timestamp: number;
  } | null;
}

interface ToolContextHarness {
  getSelectedPage(): {
    evaluate(...args: unknown[]): Promise<unknown>;
    frames?(): unknown[];
    mainFrame?(): unknown;
  };
  getPageByOptionalIdx?(idx?: number): {
    evaluate(...args: unknown[]): Promise<unknown>;
    frames?(): unknown[];
    mainFrame?(): unknown;
  };
  getSelectedFrame?(): {evaluate(...args: unknown[]): Promise<unknown>};
  selectPage?(page: unknown): void;
  reinitDebugger?(): Promise<void>;
  selectFrame?(frame: unknown): void;
  resetSelectedFrame?(): void;
  getNetworkRequestById(): {url(): string};
  getRequestInitiator(): unknown;
  debuggerContext: DebuggerContextHarness;
}

function makeResponse(): DebuggerResponseHarness {
  const lines: string[] = [];
  return {
    lines,
    appendResponseLine: (v: string) => lines.push(v),
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

function makeContext(
  overrides: Partial<ToolContextHarness> = {},
): ToolContextHarness {
  const page = {
    evaluate: async () => ({}),
  };

  const debuggerContext = {
    isEnabled: () => true,
    getScripts: () => [],
    getScriptsByUrlPattern: () => [],
    getScriptSource: async () => '',
    extractFunctionTree: async () => ({
      mainFunction: 'buildSign',
      code: 'function buildSign() { return hash(); }\n\nfunction hash() { return "ok"; }',
      functions: [
        {
          name: 'buildSign',
          code: 'function buildSign() { return hash(); }',
          dependencies: ['hash'],
          startLine: 10,
          endLine: 20,
          size: 40,
        },
        {
          name: 'hash',
          code: 'function hash() { return "ok"; }',
          dependencies: [],
          startLine: 22,
          endLine: 25,
          size: 32,
        },
      ],
      callGraph: {buildSign: ['hash'], hash: []},
      totalSize: 72,
      extractedCount: 2,
    }),
    getScriptById: () => ({
      scriptId: '1',
      url: 'https://a.js',
      sourceMapURL: 'https://a.js.map',
    }),
    searchInScripts: async () => ({matches: []}),
    setBreakpoint: async () => ({
      breakpointId: 'bp1',
      locations: [{lineNumber: 1}],
    }),
    setBreakpointByUrlRegex: async () => ({breakpointId: 'bp2', locations: []}),
    removeBreakpoint: async () => undefined,
    getBreakpoints: () => [],
    getPausedState: () => ({isPaused: false, callFrames: []}),
    isPaused: () => false,
    resume: async () => undefined,
    pause: async () => undefined,
    stepOver: async () => undefined,
    stepInto: async () => undefined,
    stepOut: async () => undefined,
    evaluateOnCallFrame: async () => ({result: {value: 1}}),
    getScopeVariables: async () => [],
    getClient: () => ({send: async () => undefined}),
  };

  return {
    getSelectedPage: () => page,
    getPageByOptionalIdx: (_idx?: number) => page,
    getSelectedFrame: () => page,
    selectPage: () => undefined,
    reinitDebugger: async () => undefined,
    selectFrame: () => undefined,
    resetSelectedFrame: () => undefined,
    getNetworkRequestById: () => ({url: () => 'https://api.example.com'}),
    getRequestInitiator: () => undefined,
    debuggerContext,
    ...overrides,
  };
}

describe('debugger tools extended', () => {
  it('covers script listing and source operations', async () => {
    const response = makeResponse();
    const context = makeContext();
    context.debuggerContext.getScripts = () => [
      {scriptId: '1', url: 'https://a.js'},
    ];
    context.debuggerContext.getScriptsByUrlPattern = () => [
      {scriptId: '2', url: 'https://b.js'},
    ];
    context.debuggerContext.getScriptSource = async () =>
      'line1\nline2\nconst x = 1;';

    await listScripts.handler(
      {params: {}},
      response as unknown as Parameters<typeof listScripts.handler>[1],
      context as unknown as Parameters<typeof listScripts.handler>[2],
    );
    await listScripts.handler(
      {params: {filter: 'b'}},
      response as unknown as Parameters<typeof listScripts.handler>[1],
      context as unknown as Parameters<typeof listScripts.handler>[2],
    );
    await getScriptSource.handler(
      {params: {scriptId: '2', startLine: 1, endLine: 2, length: 1000}},
      response as unknown as Parameters<typeof getScriptSource.handler>[1],
      context as unknown as Parameters<typeof getScriptSource.handler>[2],
    );
    await getScriptSource.handler(
      {params: {scriptId: '2', offset: 1, length: 5}},
      response as unknown as Parameters<typeof getScriptSource.handler>[1],
      context as unknown as Parameters<typeof getScriptSource.handler>[2],
    );

    assert.ok(response.lines.some(x => x.includes('Found')));
    assert.ok(response.lines.some(x => x.includes('Source for script')));
  });

  it('covers find/search/source negative and formatting paths', async () => {
    const response = makeResponse();
    const context = makeContext();
    context.debuggerContext.getScriptSource = async () => 'abc\ndef\nabc';
    context.debuggerContext.searchInScripts = async () => ({
      matches: [
        {
          scriptId: '1',
          url: 'https://a.js',
          lineNumber: 1,
          lineContent: 'const token = "abc";',
        },
        {
          scriptId: '2',
          url: 'https://m.js',
          lineNumber: 10,
          lineContent: 'x'.repeat(12000),
        },
      ],
    });

    await findInScript.handler(
      {
        params: {
          scriptId: '1',
          query: 'abc',
          contextChars: 3,
          occurrence: 2,
          caseSensitive: true,
        },
      },
      response as unknown as Parameters<typeof findInScript.handler>[1],
      context as unknown as Parameters<typeof findInScript.handler>[2],
    );
    await findInScript.handler(
      {
        params: {
          scriptId: '1',
          query: 'zzz',
          contextChars: 3,
          occurrence: 1,
          caseSensitive: true,
        },
      },
      response as unknown as Parameters<typeof findInScript.handler>[1],
      context as unknown as Parameters<typeof findInScript.handler>[2],
    );
    await searchInSources.handler(
      {
        params: {
          query: 'token',
          caseSensitive: false,
          isRegex: false,
          maxResults: 1,
          maxLineLength: 20,
          excludeMinified: true,
          urlFilter: 'a.js',
          persistResult: false,
        },
      },
      response as unknown as Parameters<typeof searchInSources.handler>[1],
      context as unknown as Parameters<typeof searchInSources.handler>[2],
    );

    assert.ok(response.lines.some(x => x.includes('Found "abc"')));
    assert.ok(response.lines.some(x => x.includes('not found')));
    assert.ok(
      response.lines.some(x => x.includes('Tip: Use get_script_source')),
    );
  });

  it('persists a single search_in_sources match into task artifacts when requested', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-debugger-search-persist-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = (
      runtime as unknown as {reverseTaskStore: ReverseTaskStore}
    ).reverseTaskStore;
    (
      runtime as unknown as {reverseTaskStore: ReverseTaskStore}
    ).reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      const response = makeResponse();
      const context = makeContext();
      context.debuggerContext.searchInScripts = async () => ({
        matches: [
          {
            scriptId: '77',
            url: 'https://cdn.example.com/security.js',
            lineNumber: 12,
            lineContent: 'function genH5st(){ return 1; }',
          },
        ],
      });

      await searchInSources.handler(
        {
          params: {
            query: 'genH5st',
            caseSensitive: false,
            isRegex: false,
            maxResults: 30,
            maxLineLength: 150,
            excludeMinified: true,
            taskId: 'task-search-persist-001',
            taskSlug: 'search-persist-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'persist search hit',
            persistResult: true,
          },
        },
        response as unknown as Parameters<typeof searchInSources.handler>[1],
        context as unknown as Parameters<typeof searchInSources.handler>[2],
      );

      const targetContext = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-search-persist-001', 'target-context.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.deepStrictEqual(targetContext.locatedSource, {
        query: 'genH5st',
        scriptId: '77',
        url: 'https://cdn.example.com/security.js',
        lineNumber: 13,
      });
      assert.ok(
        response.lines.some(x =>
          x.includes('Persisted single match into task artifact.'),
        ),
      );
    } finally {
      (
        runtime as unknown as {reverseTaskStore: ReverseTaskStore}
      ).reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('covers extract_function_tree output', async () => {
    const response = makeResponse();
    const context = makeContext();

    await extractFunctionTree.handler(
      {
        params: {
          scriptId: '1',
          functionName: 'buildSign',
          maxDepth: 2,
          maxSize: 128,
          includeComments: false,
          persistResult: false,
        },
      },
      response as unknown as Parameters<typeof extractFunctionTree.handler>[1],
      context as unknown as Parameters<typeof extractFunctionTree.handler>[2],
    );

    assert.ok(
      response.lines.some(x => x.includes('Function tree for "buildSign"')),
    );
    assert.ok(response.lines.some(x => x.includes('Extracted functions: 2')));
    assert.ok(response.lines.some(x => x.includes('buildSign -> hash')));
  });

  it('persists extract_function_tree results into task artifacts when requested', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-debugger-slice-persist-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = (
      runtime as unknown as {reverseTaskStore: ReverseTaskStore}
    ).reverseTaskStore;
    (
      runtime as unknown as {reverseTaskStore: ReverseTaskStore}
    ).reverseTaskStore = new ReverseTaskStore({rootDir});
    try {
      const response = makeResponse();
      const context = makeContext();

      await extractFunctionTree.handler(
        {
          params: {
            scriptId: '1',
            functionName: 'buildSign',
            maxDepth: 2,
            maxSize: 128,
            includeComments: false,
            taskId: 'task-slice-persist-001',
            taskSlug: 'slice-persist-demo',
            targetUrl: 'https://example.com/api/h5st',
            goal: 'persist function slice',
            persistResult: true,
          },
        },
        response as unknown as Parameters<
          typeof extractFunctionTree.handler
        >[1],
        context as unknown as Parameters<typeof extractFunctionTree.handler>[2],
      );

      const targetContext = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-slice-persist-001', 'target-context.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.deepStrictEqual(targetContext.functionSlice, {
        mainFunction: 'buildSign',
        scriptId: '1',
        scriptUrl: 'https://a.js',
        extractedCount: 2,
        totalSize: 72,
      });

      const functionSlice = JSON.parse(
        await readFile(
          path.join(rootDir, 'task-slice-persist-001', 'function-slice.json'),
          'utf8',
        ),
      ) as Record<string, unknown>;
      assert.strictEqual(functionSlice.mainFunction, 'buildSign');
      assert.strictEqual(functionSlice.scriptId, '1');
      assert.strictEqual(functionSlice.scriptUrl, 'https://a.js');
      assert.strictEqual(functionSlice.extractedCount, 2);
      assert.ok(typeof functionSlice.persistedAt === 'number');

      const runtimeEvidence = await readFile(
        path.join(rootDir, 'task-slice-persist-001', 'runtime-evidence.jsonl'),
        'utf8',
      );
      assert.ok(runtimeEvidence.includes('"kind":"function-slice"'));
      assert.ok(runtimeEvidence.includes('"functionName":"buildSign"'));
      assert.ok(
        response.lines.some(x =>
          x.includes('Persisted function slice into task artifact.'),
        ),
      );
    } finally {
      (
        runtime as unknown as {reverseTaskStore: ReverseTaskStore}
      ).reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('covers breakpoint management and initiator rendering', async () => {
    const response = makeResponse();
    const context = makeContext();
    context.debuggerContext.getBreakpoints = () => [
      {
        breakpointId: 'bp-1',
        url: 'https://a.js',
        lineNumber: 2,
        columnNumber: 0,
        condition: 'x>1',
        locations: [{x: 1}],
      },
    ];
    context.getRequestInitiator = () => ({
      type: 'script',
      url: 'https://a.js',
      lineNumber: 4,
      columnNumber: 2,
      stack: {
        callFrames: [
          {
            functionName: 'fn',
            scriptId: '1',
            url: 'https://a.js',
            lineNumber: 1,
            columnNumber: 1,
          },
        ],
        parent: {
          callFrames: [
            {
              functionName: 'parent',
              scriptId: '1',
              url: 'https://p.js',
              lineNumber: 1,
              columnNumber: 1,
            },
          ],
        },
      },
    });

    await breakpoint.handler(
      {
        params: {
          action: 'set',
          url: 'a.js',
          lineNumber: 3,
          columnNumber: 0,
          isRegex: false,
        },
      },
      response as unknown as Parameters<typeof breakpoint.handler>[1],
      context as unknown as Parameters<typeof breakpoint.handler>[2],
    );
    await breakpoint.handler(
      {
        params: {
          action: 'set',
          url: '.*a.js',
          lineNumber: 3,
          columnNumber: 0,
          isRegex: true,
        },
      },
      response as unknown as Parameters<typeof breakpoint.handler>[1],
      context as unknown as Parameters<typeof breakpoint.handler>[2],
    );
    await breakpoint.handler(
      {params: {action: 'list'}},
      response as unknown as Parameters<typeof breakpoint.handler>[1],
      context as unknown as Parameters<typeof breakpoint.handler>[2],
    );
    await breakpoint.handler(
      {params: {action: 'remove', breakpointId: 'bp-1'}},
      response as unknown as Parameters<typeof breakpoint.handler>[1],
      context as unknown as Parameters<typeof breakpoint.handler>[2],
    );
    await getRequestInitiator.handler(
      {params: {requestId: 1}},
      response as unknown as Parameters<typeof getRequestInitiator.handler>[1],
      context as unknown as Parameters<typeof getRequestInitiator.handler>[2],
    );

    assert.ok(
      response.lines.some(x => x.includes('Breakpoint set successfully')),
    );
    assert.ok(
      response.lines.some(x => x.includes('If execution appears stuck')),
    );
    assert.ok(response.lines.some(x => x.includes('Active breakpoints')));
    assert.ok(response.lines.some(x => x.includes('Call Stack')));
    assert.ok(
      response.lines.some(x =>
        x.includes('URL: https://a.js [SourceMap: https://a.js.map]'),
      ),
    );
    assert.ok(response.lines.some(x => x.includes('SourceMap')));
  });

  it('covers paused state commands and evaluation branches', async () => {
    const response = makeResponse();
    const context = makeContext();
    context.debuggerContext.getPausedState = () => ({
      isPaused: true,
      reason: 'breakpoint',
      hitBreakpoints: ['bp1'],
      callFrames: [
        {
          functionName: 'fn',
          url: 'https://a.js',
          callFrameId: 'cf-1',
          location: {scriptId: '1', lineNumber: 1, columnNumber: 1},
          scopeChain: [
            {type: 'local', name: 'local', object: {objectId: 'obj-1'}},
          ],
        },
      ],
    });
    context.debuggerContext.isPaused = () => true;
    context.debuggerContext.getScopeVariables = async () => [
      {name: 'x', value: 1},
    ];
    context.debuggerContext.evaluateOnCallFrame = async () => ({
      result: {value: {ok: true}},
    });
    context.debuggerContext.getLastAutoRecoveryEvent = () => ({
      breakpointId: 'bp1',
      hitCount: 3,
      timestamp: Date.now(),
    });

    await getPausedInfo.handler(
      {params: {includeScopes: true, maxScopeDepth: 2}},
      response as unknown as Parameters<typeof getPausedInfo.handler>[1],
      context as unknown as Parameters<typeof getPausedInfo.handler>[2],
    );
    await evaluateOnCallframe.handler(
      {params: {expression: 'x', frameIndex: 0}},
      response as unknown as Parameters<typeof evaluateOnCallframe.handler>[1],
      context as unknown as Parameters<typeof evaluateOnCallframe.handler>[2],
    );
    await resume.handler(
      {params: {}},
      response as unknown as Parameters<typeof resume.handler>[1],
      context as unknown as Parameters<typeof resume.handler>[2],
    );
    await stepOver.handler(
      {params: {}},
      response as unknown as Parameters<typeof stepOver.handler>[1],
      context as unknown as Parameters<typeof stepOver.handler>[2],
    );
    await stepInto.handler(
      {params: {}},
      response as unknown as Parameters<typeof stepInto.handler>[1],
      context as unknown as Parameters<typeof stepInto.handler>[2],
    );
    await stepOut.handler(
      {params: {}},
      response as unknown as Parameters<typeof stepOut.handler>[1],
      context as unknown as Parameters<typeof stepOut.handler>[2],
    );

    context.debuggerContext.isPaused = () => false;
    await pause.handler(
      {params: {}},
      response as unknown as Parameters<typeof pause.handler>[1],
      context as unknown as Parameters<typeof pause.handler>[2],
    );

    assert.ok(response.lines.some(x => x.includes('Execution Paused')));
    assert.ok(response.lines.some(x => x.includes('Auto-recovery detected')));
    assert.ok(response.lines.some(x => x.includes('SourceMap')));
    assert.ok(response.lines.some(x => x.includes('Result')));
    assert.ok(
      response.lines.some(
        x => x.includes('Execution resumed') || x.includes('Pause requested'),
      ),
    );
  });

  it('covers set breakpoint on text and tracing workflows', async () => {
    const response = makeResponse();
    const context = makeContext();
    context.debuggerContext.searchInScripts = async (q: string) => {
      if (q.includes('function targetFn')) {
        return {
          matches: [
            {
              scriptId: '1',
              url: 'https://a.js',
              lineNumber: 0,
              lineContent: 'function targetFn(a){return a;}',
            },
          ],
        };
      }
      if (q === 'targetFn') {
        return {
          matches: [
            {
              scriptId: '1',
              url: 'https://a.js',
              lineNumber: 0,
              lineContent: 'function targetFn(a){return a;}',
            },
          ],
        };
      }
      return {matches: []};
    };
    context.debuggerContext.getScriptSource = async () =>
      'function targetFn(a){return a;}';
    context.debuggerContext.setBreakpoint = async () => ({
      breakpointId: 'trace-bp',
      locations: [{}],
    });

    await setBreakpointOnText.handler(
      {params: {text: 'targetFn', occurrence: 1, condition: 'a>0'}},
      response as unknown as Parameters<typeof setBreakpointOnText.handler>[1],
      context as unknown as Parameters<typeof setBreakpointOnText.handler>[2],
    );
    await traceFunction.handler(
      {
        params: {
          functionName: 'targetFn',
          logArgs: true,
          logThis: true,
          pause: false,
        },
      },
      response as unknown as Parameters<typeof traceFunction.handler>[1],
      context as unknown as Parameters<typeof traceFunction.handler>[2],
    );

    assert.ok(
      response.lines.some(x => x.includes('Breakpoint set successfully')),
    );
    assert.ok(response.lines.some(x => x.includes('Function trace installed')));
  });

  it('records debugger fallback evidence into reverse task artifacts', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-debugger-evidence-'),
    );
    const runtime = getJSHookRuntime();
    const originalStore = runtime.reverseTaskStore;
    runtime.reverseTaskStore = new ReverseTaskStore({rootDir});

    try {
      const response = makeResponse();
      const context = makeContext({
        getSelectedPage: () => ({
          evaluate: async () => undefined,
          frames: () => [],
          mainFrame: () => undefined,
        }),
        getSelectedFrame: () => ({
          evaluate: async () => ({
            success: true,
            monitorId: 'm-evidence',
            eventCount: 1,
          }),
        }),
        getRequestInitiator: () => ({
          type: 'script',
          url: 'https://a.js',
          lineNumber: 4,
          columnNumber: 2,
          stack: {
            callFrames: [
              {
                functionName: 'fn',
                scriptId: '1',
                url: 'https://a.js',
                lineNumber: 1,
                columnNumber: 1,
              },
            ],
          },
        }),
      });
      context.debuggerContext.searchInScripts = async () => ({
        matches: [
          {
            scriptId: '1',
            url: 'https://a.js',
            lineNumber: 0,
            lineContent: 'function targetFn(a){return a;}',
          },
        ],
      });
      context.debuggerContext.getScriptSource = async () =>
        'function targetFn(a){return a;}';
      context.debuggerContext.setBreakpoint = async () => ({
        breakpointId: 'trace-bp',
        locations: [{}],
      });

      const taskParams = {
        taskId: 'task-debugger-evidence',
        taskSlug: 'debugger-evidence',
        targetUrl: 'https://example.com',
        goal: 'capture fallback evidence',
      };

      await getRequestInitiator.handler(
        {params: {requestId: 1, ...taskParams}} as unknown as Parameters<
          typeof getRequestInitiator.handler
        >[0],
        response as unknown as Parameters<
          typeof getRequestInitiator.handler
        >[1],
        context as unknown as Parameters<typeof getRequestInitiator.handler>[2],
      );
      await monitorEvents.handler(
        {
          params: {
            selector: 'window',
            events: ['click'],
            monitorId: 'm-evidence',
            ...taskParams,
          },
        } as unknown as Parameters<typeof monitorEvents.handler>[0],
        response as unknown as Parameters<typeof monitorEvents.handler>[1],
        context as unknown as Parameters<typeof monitorEvents.handler>[2],
      );
      await traceFunction.handler(
        {
          params: {
            functionName: 'targetFn',
            pause: false,
            logArgs: true,
            logThis: false,
            ...taskParams,
          },
        } as unknown as Parameters<typeof traceFunction.handler>[0],
        response as unknown as Parameters<typeof traceFunction.handler>[1],
        context as unknown as Parameters<typeof traceFunction.handler>[2],
      );

      const evidenceLog = (
        await readFile(
          path.join(
            rootDir,
            'task-debugger-evidence',
            'runtime-evidence.jsonl',
          ),
          'utf8',
        )
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>);

      assert.ok(
        evidenceLog.some(entry => entry.tool === 'get_request_initiator'),
      );
      assert.ok(evidenceLog.some(entry => entry.tool === 'monitor_events'));
      assert.ok(evidenceLog.some(entry => entry.tool === 'trace_function'));
    } finally {
      runtime.reverseTaskStore = originalStore;
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('covers page-eval tools: hook/list/unhook/inspect/storage/monitor', async () => {
    const response = makeResponse();
    let evalCount = 0;
    let pageEvalCount = 0;
    let frameEvalCount = 0;
    const frame = {
      evaluate: async () => {
        frameEvalCount += 1;
        switch (frameEvalCount) {
          case 1:
            return {success: true, hookId: 'h1'};
          case 2:
            return [{id: 'h1', target: 'Window.fetch'}];
          case 3:
            return {success: true};
          case 4:
            return {type: 'object', constructor: 'Object', value: {a: 1}};
          case 5:
            return {localStorage: {token: 'x'}};
          case 6:
            return {success: true, monitorId: 'm1', eventCount: 2};
          default:
            return {success: true};
        }
      },
    };
    const context = makeContext({
      getSelectedPage: () => ({
        frames: () => [frame],
        mainFrame: () => frame,
        evaluate: async () => {
          pageEvalCount += 1;
          evalCount += 1;
          switch (evalCount) {
            case 1:
              return {success: true, hookId: 'h1'};
            case 2:
              return [{id: 'h1', target: 'Window.fetch'}];
            case 3:
              return {success: true};
            case 4:
              return {type: 'object', constructor: 'Object', value: {a: 1}};
            case 5:
              return {localStorage: {token: 'x'}};
            case 6:
              return {success: true, monitorId: 'm1', eventCount: 2};
            default:
              return {success: true};
          }
        },
      }),
      getSelectedFrame: () => frame,
    });

    await hookFunction.handler(
      {
        params: {
          target: 'window.fetch',
          logArgs: true,
          logResult: true,
          logStack: false,
        },
      },
      response as unknown as Parameters<typeof hookFunction.handler>[1],
      context as unknown as Parameters<typeof hookFunction.handler>[2],
    );
    await listHooks.handler(
      {params: {}},
      response as unknown as Parameters<typeof listHooks.handler>[1],
      context as unknown as Parameters<typeof listHooks.handler>[2],
    );
    await unhookFunction.handler(
      {params: {hookId: 'h1'}},
      response as unknown as Parameters<typeof unhookFunction.handler>[1],
      context as unknown as Parameters<typeof unhookFunction.handler>[2],
    );
    await inspectObject.handler(
      {
        params: {
          expression: 'window',
          depth: 1,
          showMethods: true,
          showPrototype: true,
        },
      },
      response as unknown as Parameters<typeof inspectObject.handler>[1],
      context as unknown as Parameters<typeof inspectObject.handler>[2],
    );
    await getStorage.handler(
      {params: {type: 'all', filter: 'tok'}},
      response as unknown as Parameters<typeof getStorage.handler>[1],
      context as unknown as Parameters<typeof getStorage.handler>[2],
    );
    await monitorEvents.handler(
      {
        params: {
          selector: 'window',
          events: ['click', 'keydown'],
          monitorId: 'm1',
        },
      },
      response as unknown as Parameters<typeof monitorEvents.handler>[1],
      context as unknown as Parameters<typeof monitorEvents.handler>[2],
    );
    await stopMonitor.handler(
      {params: {monitorId: 'm1'}},
      response as unknown as Parameters<typeof stopMonitor.handler>[1],
      context as unknown as Parameters<typeof stopMonitor.handler>[2],
    );

    assert.ok(
      response.lines.some(x => x.includes('Hook installed successfully')),
    );
    assert.ok(response.lines.some(x => x.includes('Active hooks')));
    assert.ok(response.lines.some(x => x.includes('Storage data')));
    assert.ok(response.lines.some(x => x.includes('Event monitor started')));
    assert.ok(response.lines.some(x => x.includes('Monitor "m1" stopped')));
    assert.strictEqual(pageEvalCount, 0);
    assert.strictEqual(frameEvalCount, 7);
  });

  it('lists frames and switches execution context', async () => {
    const response = makeResponse();
    const selectedCalls: unknown[] = [];
    let resetCount = 0;
    const mainFrame = {
      url: () => 'https://root.example.com',
      name: () => '',
      parentFrame: () => null,
      evaluate: async () => undefined,
    };
    const childFrame = {
      url: () => 'https://child.example.com',
      name: () => 'auth-frame',
      parentFrame: () => mainFrame,
      evaluate: async () => undefined,
    };
    const page = {
      evaluate: async () => undefined,
      frames: () => [mainFrame, childFrame],
      mainFrame: () => mainFrame,
    };
    const context = makeContext({
      getSelectedPage: () => page,
      getSelectedFrame: () => childFrame,
      selectFrame: frame => {
        selectedCalls.push(frame);
      },
      resetSelectedFrame: () => {
        resetCount += 1;
      },
    });

    await listFrames.handler(
      {params: {}},
      response as unknown as Parameters<typeof listFrames.handler>[1],
      context as unknown as Parameters<typeof listFrames.handler>[2],
    );
    await selectFrame.handler(
      {params: {frameIdx: 1}},
      response as unknown as Parameters<typeof selectFrame.handler>[1],
      context as unknown as Parameters<typeof selectFrame.handler>[2],
    );
    await selectFrame.handler(
      {params: {frameIdx: 0}},
      response as unknown as Parameters<typeof selectFrame.handler>[1],
      context as unknown as Parameters<typeof selectFrame.handler>[2],
    );

    assert.ok(response.lines.some(line => line.includes('Frames (2 total)')));
    assert.ok(
      response.lines.some(line => line.includes('0: https://root.example.com')),
    );
    assert.ok(
      response.lines.some(line =>
        line.includes(
          '1: https://child.example.com name="auth-frame" [selected]',
        ),
      ),
    );
    assert.ok(
      response.lines.some(line =>
        line.includes(
          'Switched to frame 1: https://child.example.com (name: "auth-frame")',
        ),
      ),
    );
    assert.ok(
      response.lines.some(line => line.includes('Switched to main frame.')),
    );
    assert.deepStrictEqual(selectedCalls, [childFrame]);
    assert.strictEqual(resetCount, 1);
  });

  it('covers XHR breakpoint helpers', async () => {
    const response = makeResponse();
    const context = makeContext();
    await xhrBreakpoint.handler(
      {params: {action: 'set', url: '/api'}},
      response as unknown as Parameters<typeof xhrBreakpoint.handler>[1],
      context as unknown as Parameters<typeof xhrBreakpoint.handler>[2],
    );
    await xhrBreakpoint.handler(
      {params: {action: 'remove', url: '/api'}},
      response as unknown as Parameters<typeof xhrBreakpoint.handler>[1],
      context as unknown as Parameters<typeof xhrBreakpoint.handler>[2],
    );
    assert.ok(response.lines.some(x => x.includes('XHR breakpoint set')));
    assert.ok(response.lines.some(x => x.includes('XHR breakpoint removed')));
  });

  it('routes low-risk debugger readers to explicit pageIdx and restores selection', async () => {
    const response = makeResponse();
    const selectedPage = {
      evaluate: async () => ({localStorage: {from: 'selected'}}),
      frames: () => [],
      mainFrame: () => selectedFrame,
    };
    const targetFrame = {
      evaluate: async () => ({localStorage: {token: 'target'}}),
    };
    const selectedFrame = {
      evaluate: async () => ({localStorage: {token: 'selected'}}),
    };
    const targetPage = {
      evaluate: async () => ({localStorage: {from: 'target'}}),
      frames: () => [],
      mainFrame: () => targetFrame,
    };
    const selectedPages: unknown[] = [];
    let reinitCount = 0;
    const context = makeContext({
      getSelectedPage: () => selectedPage,
      getPageByOptionalIdx: (idx?: number) => {
        assert.strictEqual(idx, 1);
        return targetPage;
      },
      getSelectedFrame: () => selectedFrame,
      selectPage: page => {
        selectedPages.push(page);
      },
      reinitDebugger: async () => {
        reinitCount += 1;
      },
      getNetworkRequestById: () => ({
        url: () => 'https://api.target.example.com',
      }),
      getRequestInitiator: () => ({
        type: 'script',
        url: 'https://target.js',
        stack: {callFrames: []},
      }),
    });
    context.debuggerContext.getScripts = () => [
      {scriptId: '1', url: 'https://target.js'},
    ];
    context.debuggerContext.getScriptsByUrlPattern = () => [
      {scriptId: '1', url: 'https://target.js'},
    ];
    context.debuggerContext.getScriptSource = async () =>
      'function sign(){return 1;}';
    context.debuggerContext.searchInScripts = async () => ({
      matches: [
        {
          scriptId: '1',
          url: 'https://target.js',
          lineNumber: 0,
          lineContent: 'function sign(){return 1;}',
        },
      ],
    });

    await listScripts.handler(
      {params: {pageIdx: 1}},
      response as unknown as Parameters<typeof listScripts.handler>[1],
      context as unknown as Parameters<typeof listScripts.handler>[2],
    );
    await getScriptSource.handler(
      {params: {scriptId: '1', pageIdx: 1, length: 1000}},
      response as unknown as Parameters<typeof getScriptSource.handler>[1],
      context as unknown as Parameters<typeof getScriptSource.handler>[2],
    );
    await findInScript.handler(
      {
        params: {
          scriptId: '1',
          query: 'sign',
          pageIdx: 1,
          contextChars: 10,
          occurrence: 1,
          caseSensitive: true,
        },
      },
      response as unknown as Parameters<typeof findInScript.handler>[1],
      context as unknown as Parameters<typeof findInScript.handler>[2],
    );
    await searchInSources.handler(
      {
        params: {
          query: 'sign',
          pageIdx: 1,
          caseSensitive: false,
          isRegex: false,
          maxResults: 30,
          maxLineLength: 150,
          excludeMinified: true,
          persistResult: false,
        },
      },
      response as unknown as Parameters<typeof searchInSources.handler>[1],
      context as unknown as Parameters<typeof searchInSources.handler>[2],
    );
    await getStorage.handler(
      {params: {type: 'all', pageIdx: 1}},
      response as unknown as Parameters<typeof getStorage.handler>[1],
      context as unknown as Parameters<typeof getStorage.handler>[2],
    );
    await getRequestInitiator.handler(
      {params: {requestId: 7, pageIdx: 1}},
      response as unknown as Parameters<typeof getRequestInitiator.handler>[1],
      context as unknown as Parameters<typeof getRequestInitiator.handler>[2],
    );
    await getPausedInfo.handler(
      {params: {pageIdx: 1, includeScopes: false, maxScopeDepth: 1}},
      response as unknown as Parameters<typeof getPausedInfo.handler>[1],
      context as unknown as Parameters<typeof getPausedInfo.handler>[2],
    );

    assert.deepStrictEqual(selectedPages, [
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
    ]);
    assert.strictEqual(reinitCount, 12);
    assert.ok(response.lines.some(line => line.includes('Storage data')));
    assert.ok(
      response.lines.some(line =>
        line.includes('Request initiator for https://api.target.example.com'),
      ),
    );
    assert.ok(
      response.lines.some(line => line.includes('Execution is not paused.')),
    );
  });

  it('routes high-risk debugger controls to explicit pageIdx and restores selection', async () => {
    const response = makeResponse();
    let paused = false;
    let selectedFrameEvalCount = 0;
    let targetFrameEvalCount = 0;
    const selectedFrame = {
      evaluate: async () => {
        selectedFrameEvalCount += 1;
        return {success: true, hookId: 'selected-should-not-run'};
      },
    };
    const targetFrame = {
      evaluate: async () => {
        targetFrameEvalCount += 1;
        return {success: true, hookId: 'target-hook'};
      },
    };
    const selectedPage = {
      evaluate: async () => undefined,
      frames: () => [],
      mainFrame: () => selectedFrame,
    };
    const targetPage = {
      evaluate: async () => undefined,
      frames: () => [],
      mainFrame: () => targetFrame,
    };
    const selectedPages: unknown[] = [];
    let reinitCount = 0;
    const sentCommands: Array<{method: string; params?: unknown}> = [];
    const context = makeContext({
      getSelectedPage: () => selectedPage,
      getPageByOptionalIdx: (idx?: number) => {
        assert.strictEqual(idx, 1);
        return targetPage;
      },
      getSelectedFrame: () => selectedFrame,
      selectPage: page => {
        selectedPages.push(page);
      },
      reinitDebugger: async () => {
        reinitCount += 1;
      },
    });
    context.debuggerContext.isPaused = () => paused;
    context.debuggerContext.resume = async () => {
      paused = false;
    };
    context.debuggerContext.pause = async () => {
      paused = true;
    };
    context.debuggerContext.stepOver = async () => undefined;
    context.debuggerContext.stepInto = async () => undefined;
    context.debuggerContext.stepOut = async () => undefined;
    context.debuggerContext.setBreakpoint = async () => ({
      breakpointId: 'bp-target',
      locations: [{}],
    });
    context.debuggerContext.searchInScripts = async () => ({
      matches: [
        {
          scriptId: '1',
          url: 'https://target.js',
          lineNumber: 0,
          lineContent: 'function targetFn(a){return a;}',
        },
      ],
    });
    context.debuggerContext.getScriptSource = async () =>
      'function targetFn(a){return a;}';
    context.debuggerContext.getClient = () => ({
      send: async (method: string, params?: unknown) => {
        sentCommands.push({method, params});
        return undefined;
      },
    });

    await breakpoint.handler(
      {
        params: {
          action: 'set',
          url: 'target.js',
          lineNumber: 2,
          columnNumber: 0,
          isRegex: false,
          pageIdx: 1,
        },
      },
      response as unknown as Parameters<typeof breakpoint.handler>[1],
      context as unknown as Parameters<typeof breakpoint.handler>[2],
    );

    paused = true;
    await resume.handler(
      {params: {pageIdx: 1}},
      response as unknown as Parameters<typeof resume.handler>[1],
      context as unknown as Parameters<typeof resume.handler>[2],
    );

    paused = false;
    await pause.handler(
      {params: {pageIdx: 1}},
      response as unknown as Parameters<typeof pause.handler>[1],
      context as unknown as Parameters<typeof pause.handler>[2],
    );

    paused = true;
    await stepOver.handler(
      {params: {pageIdx: 1}},
      response as unknown as Parameters<typeof stepOver.handler>[1],
      context as unknown as Parameters<typeof stepOver.handler>[2],
    );
    await stepInto.handler(
      {params: {pageIdx: 1}},
      response as unknown as Parameters<typeof stepInto.handler>[1],
      context as unknown as Parameters<typeof stepInto.handler>[2],
    );
    await stepOut.handler(
      {params: {pageIdx: 1}},
      response as unknown as Parameters<typeof stepOut.handler>[1],
      context as unknown as Parameters<typeof stepOut.handler>[2],
    );
    await setBreakpointOnText.handler(
      {params: {text: 'targetFn', occurrence: 1, pageIdx: 1}},
      response as unknown as Parameters<typeof setBreakpointOnText.handler>[1],
      context as unknown as Parameters<typeof setBreakpointOnText.handler>[2],
    );
    await xhrBreakpoint.handler(
      {params: {action: 'set', url: '/api/target', pageIdx: 1}},
      response as unknown as Parameters<typeof xhrBreakpoint.handler>[1],
      context as unknown as Parameters<typeof xhrBreakpoint.handler>[2],
    );
    await xhrBreakpoint.handler(
      {params: {action: 'remove', url: '/api/target', pageIdx: 1}},
      response as unknown as Parameters<typeof xhrBreakpoint.handler>[1],
      context as unknown as Parameters<typeof xhrBreakpoint.handler>[2],
    );
    await traceFunction.handler(
      {
        params: {
          functionName: 'targetFn',
          pause: false,
          logArgs: true,
          logThis: false,
          pageIdx: 1,
        },
      },
      response as unknown as Parameters<typeof traceFunction.handler>[1],
      context as unknown as Parameters<typeof traceFunction.handler>[2],
    );
    await hookFunction.handler(
      {
        params: {
          target: 'window.fetch',
          logArgs: true,
          logResult: true,
          logStack: false,
          pageIdx: 1,
        },
      },
      response as unknown as Parameters<typeof hookFunction.handler>[1],
      context as unknown as Parameters<typeof hookFunction.handler>[2],
    );

    assert.deepStrictEqual(selectedPages, [
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
      targetPage,
      selectedPage,
    ]);
    assert.strictEqual(reinitCount, 20);
    assert.deepStrictEqual(sentCommands, [
      {method: 'DOMDebugger.setXHRBreakpoint', params: {url: '/api/target'}},
      {method: 'DOMDebugger.removeXHRBreakpoint', params: {url: '/api/target'}},
    ]);
    assert.strictEqual(selectedFrameEvalCount, 0);
    assert.strictEqual(targetFrameEvalCount, 1);
    assert.ok(
      response.lines.some(line => line.includes('Breakpoint set successfully')),
    );
    assert.ok(response.lines.some(line => line.includes('Execution resumed')));
    assert.ok(response.lines.some(line => line.includes('Pause requested')));
    assert.ok(response.lines.some(line => line.includes('XHR breakpoint set')));
    assert.ok(
      response.lines.some(line => line.includes('Function trace installed')),
    );
    assert.ok(
      response.lines.some(line => line.includes('Hook installed successfully')),
    );
  });

  it('routes paused-state inspection to explicit pageIdx and restores selection', async () => {
    const response = makeResponse();
    const selectedPage = {
      evaluate: async () => undefined,
      frames: () => [],
      mainFrame: () => undefined,
    };
    const targetPage = {
      evaluate: async () => undefined,
      frames: () => [],
      mainFrame: () => undefined,
    };
    let currentPage: unknown = selectedPage;
    const selectedPages: unknown[] = [];
    let reinitCount = 0;
    const context = makeContext({
      getSelectedPage: () =>
        currentPage as ToolContextHarness['getSelectedPage'] extends () => infer T
          ? T
          : never,
      getPageByOptionalIdx: (idx?: number) => {
        assert.strictEqual(idx, 1);
        return targetPage as ToolContextHarness['getSelectedPage'] extends () => infer T
          ? T
          : never;
      },
      selectPage: page => {
        currentPage = page;
        selectedPages.push(page);
      },
      reinitDebugger: async () => {
        reinitCount += 1;
      },
    });

    context.debuggerContext.getPausedState = () =>
      currentPage === targetPage
        ? {
            isPaused: true,
            reason: 'breakpoint',
            hitBreakpoints: ['bp-target'],
            callFrames: [
              {
                functionName: 'targetFn',
                url: 'https://target.js',
                callFrameId: 'cf-target',
                location: {scriptId: '1', lineNumber: 2, columnNumber: 3},
                scopeChain: [],
              },
            ],
          }
        : {isPaused: false, callFrames: []};

    await getPausedInfo.handler(
      {params: {pageIdx: 1, includeScopes: false, maxScopeDepth: 1}},
      response as unknown as Parameters<typeof getPausedInfo.handler>[1],
      context as unknown as Parameters<typeof getPausedInfo.handler>[2],
    );

    assert.deepStrictEqual(selectedPages, [targetPage, selectedPage]);
    assert.strictEqual(reinitCount, 2);
    assert.ok(response.lines.some(line => line.includes('Execution Paused')));
    assert.ok(response.lines.some(line => line.includes('bp-target')));
  });
});
