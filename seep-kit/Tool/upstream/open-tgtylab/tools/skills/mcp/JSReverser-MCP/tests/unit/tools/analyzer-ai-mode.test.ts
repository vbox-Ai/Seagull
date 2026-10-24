/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, beforeEach, describe, it} from 'node:test';

import {
  deobfuscateCode,
  detectCrypto,
  riskPanel,
  understandCode,
} from '../../../src/tools/analyzer.js';
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

describe('analyzer ai runtime metadata', () => {
  const originalEnv = {...process.env};

  beforeEach(() => {
    delete process.env.DEFAULT_LLM_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_CLI_PATH;
  });

  afterEach(() => {
    process.env = {...originalEnv};
  });

  it('adds local-fallback aiRuntime metadata to analyzer-style tools', async () => {
    const runtime = getJSHookRuntime() as unknown as {
      deobfuscator: {deobfuscate(input: unknown): Promise<unknown>};
      analyzer: {understand(input: unknown): Promise<unknown>};
      cryptoDetector: {detect(input: unknown): Promise<unknown>};
      collector: {
        getTopPriorityFiles(limit: number): {
          files: Array<{url: string; content: string}>;
        };
      };
      hookManager: {
        getRecords(id: string): unknown[];
        getAllKnownHookIds(): string[];
      };
    };
    const originals = {
      deobfuscate: runtime.deobfuscator.deobfuscate,
      understand: runtime.analyzer.understand,
      detect: runtime.cryptoDetector.detect,
      getTopPriorityFiles: runtime.collector.getTopPriorityFiles,
      getRecords: runtime.hookManager.getRecords,
      getAllKnownHookIds: runtime.hookManager.getAllKnownHookIds,
    };

    runtime.deobfuscator.deobfuscate = async () => ({
      cleanedCode: 'const a = 1;',
    });
    runtime.analyzer.understand = async () => ({
      securityRisks: [],
      summary: 'ok',
    });
    runtime.cryptoDetector.detect = async () => ({
      algorithms: [],
      securityIssues: [],
    });
    runtime.collector.getTopPriorityFiles = () => ({
      files: [{url: 'a.js', content: 'const a=1;'}],
    });
    runtime.hookManager.getRecords = () => [];
    runtime.hookManager.getAllKnownHookIds = () => [];

    try {
      for (const [tool, params] of [
        [deobfuscateCode, {code: 'x'}],
        [understandCode, {code: 'x'}],
        [detectCrypto, {code: 'x', useAI: true}],
        [riskPanel, {code: 'x'}],
      ] as const) {
        const response = makeResponse();
        await tool.handler(
          {params},
          response as unknown as Parameters<typeof tool.handler>[1],
          {} as Parameters<typeof tool.handler>[2],
        );
        const parsed = JSON.parse(response.lines[1] ?? '{}') as {
          aiRuntime?: {mode?: string};
        };
        assert.strictEqual(parsed.aiRuntime?.mode, 'local-fallback');
      }
    } finally {
      runtime.deobfuscator.deobfuscate = originals.deobfuscate;
      runtime.analyzer.understand = originals.understand;
      runtime.cryptoDetector.detect = originals.detect;
      runtime.collector.getTopPriorityFiles = originals.getTopPriorityFiles;
      runtime.hookManager.getRecords = originals.getRecords;
      runtime.hookManager.getAllKnownHookIds = originals.getAllKnownHookIds;
    }
  });

  it('passes aiMode through understand_code and rejects required mode when unavailable', async () => {
    const runtime = getJSHookRuntime() as unknown as {
      analyzer: {understand(input: unknown): Promise<unknown>};
    };
    const original = runtime.analyzer.understand;
    const calls: unknown[] = [];
    runtime.analyzer.understand = async input => {
      calls.push(input);
      return {
        securityRisks: [],
        qualityScore: 90,
      };
    };

    try {
      const response = makeResponse();
      await understandCode.handler(
        {params: {code: 'function a(){}', aiMode: 'off'}},
        response as unknown as Parameters<typeof understandCode.handler>[1],
        {} as Parameters<typeof understandCode.handler>[2],
      );
      assert.deepStrictEqual(calls[0], {
        code: 'function a(){}',
        aiMode: 'off',
      });

      await assert.rejects(
        () =>
          understandCode.handler(
            {params: {code: 'function a(){}', aiMode: 'required'}},
            makeResponse() as unknown as Parameters<
              typeof understandCode.handler
            >[1],
            {} as Parameters<typeof understandCode.handler>[2],
          ),
        /AI mode required/,
      );
    } finally {
      runtime.analyzer.understand = original;
    }
  });
});
