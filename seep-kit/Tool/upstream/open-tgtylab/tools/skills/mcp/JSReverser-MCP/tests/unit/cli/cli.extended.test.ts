/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {cliOptions, parseArguments} from '../../../src/cli.js';

interface CliOptionsLike {
  browserUrl: {coerce(value: string | undefined): string | undefined};
  wsEndpoint: {coerce(value: string | undefined): string | undefined};
  wsHeaders: {
    coerce(value: string | undefined): Record<string, string> | undefined;
  };
  viewport: {
    coerce(
      value: string | undefined,
    ): {width: number; height: number} | undefined;
  };
}

interface ParsedArgsLike {
  doctor?: boolean;
  manageReverseTask?: string;
  orchestrateReverseTask?: string;
  runReverseAgent?: string;
  exportPortableBundle?: string;
  maxRounds?: number;
  goalMode?: string;
  autoExportPortable?: boolean;
  artifactMode?: string;
  execute?: boolean;
  resume?: boolean;
  stopOnError?: boolean;
  skipStep?: string[];
  fromStep?: string;
  onlyStep?: string[];
  strategy?: string;
  outputMode?: string;
  toolProfile?: string;
  traceOutput?: string;
  includeSummary?: boolean;
  persistState?: boolean;
  executionOverrides?: Record<
    string,
    {status: string; result?: string; error?: string}
  >;
  reverseTaskLimit?: number;
  reverseTimelineLimit?: number;
  reverseEvidenceLimit?: number;
  taskId?: string;
  taskStage?: string;
  taskStatus?: string;
  timelineStage?: string;
  timelineAction?: string;
  timelineStatus?: string;
  browserUrl?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  autoConnect?: boolean;
  channel?: string;
  headless?: boolean;
  isolated?: boolean;
  categoryNetwork?: boolean;
  viewport?: {width: number; height: number};
  chromeArg?: string[];
  experimentalDevtools?: boolean;
  experimentalIncludeAllPages?: boolean;
}

describe('cli extended coverage', () => {
  it('validates browserUrl/wsEndpoint/wsHeaders coercion', () => {
    const options = cliOptions as unknown as CliOptionsLike;
    const browserUrl = options.browserUrl.coerce;
    assert.strictEqual(browserUrl(undefined), undefined);
    assert.strictEqual(
      browserUrl('http://127.0.0.1:9222'),
      'http://127.0.0.1:9222',
    );
    assert.throws(() => browserUrl('not-a-url'), /not valid URL/);

    const wsEndpoint = options.wsEndpoint.coerce;
    assert.strictEqual(wsEndpoint(undefined), undefined);
    assert.strictEqual(
      wsEndpoint('ws://127.0.0.1:9222/devtools/browser/abc'),
      'ws://127.0.0.1:9222/devtools/browser/abc',
    );
    assert.throws(
      () => wsEndpoint('http://127.0.0.1:9222/devtools/browser/abc'),
      /must use ws:\/\/ or wss:\/\//,
    );
    assert.throws(() => wsEndpoint('::bad::'), /not valid URL/);

    const wsHeaders = options.wsHeaders.coerce;
    assert.strictEqual(wsHeaders(undefined), undefined);
    assert.deepStrictEqual(wsHeaders('{"Authorization":"Bearer x"}'), {
      Authorization: 'Bearer x',
    });
    assert.throws(() => wsHeaders('[1,2]'), /Invalid JSON for wsHeaders/);
    assert.throws(() => wsHeaders('{bad json}'), /Invalid JSON for wsHeaders/);
  });

  it('validates viewport coercion', () => {
    const options = cliOptions as unknown as CliOptionsLike;
    const viewport = options.viewport.coerce;
    assert.strictEqual(viewport(undefined), undefined);
    assert.deepStrictEqual(viewport('1280x720'), {width: 1280, height: 720});
    assert.throws(() => viewport('bad-size'), /Invalid viewport/);
    assert.throws(() => viewport('0x720'), /Invalid viewport/);
  });

  it('parseArguments applies stable channel default when launch target is absent', () => {
    const args = parseArguments('1.2.3', ['node', 'cli.js']) as ParsedArgsLike;
    assert.strictEqual(
      (args as ParsedArgsLike & {$0?: string}).$0,
      'node build/src/index.js',
    );
    assert.strictEqual(args.doctor, false);
    assert.strictEqual(args.channel, 'stable');
    assert.strictEqual(args.headless, false);
    assert.strictEqual(args.isolated, false);
    assert.strictEqual(args.categoryNetwork, true);
  });

  it('parseArguments supports reverse task CLI switches', () => {
    const parsed = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--manageReverseTask',
      'list',
      '--reverseTaskLimit',
      '5',
      '--reverseTimelineLimit',
      '7',
      '--reverseEvidenceLimit',
      '9',
    ]) as ParsedArgsLike;

    assert.strictEqual(parsed.manageReverseTask, 'list');
    assert.strictEqual(parsed.reverseTaskLimit, 5);
    assert.strictEqual(parsed.reverseTimelineLimit, 7);
    assert.strictEqual(parsed.reverseEvidenceLimit, 9);
  });

  it('parseArguments supports manageReverseTask mutation flags', () => {
    const parsed = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--manageReverseTask',
      'timeline',
      '--taskId',
      'task-1',
      '--timelineStage',
      'patch',
      '--timelineAction',
      'diff env',
      '--timelineStatus',
      'ok',
    ]) as ParsedArgsLike;

    assert.strictEqual(parsed.manageReverseTask, 'timeline');
    assert.strictEqual(parsed.taskId, 'task-1');
    assert.strictEqual(parsed.timelineStage, 'patch');
    assert.strictEqual(parsed.timelineAction, 'diff env');
    assert.strictEqual(parsed.timelineStatus, 'ok');
  });

  it('parseArguments supports orchestrateReverseTask execution flags', () => {
    const parsed = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--orchestrateReverseTask',
      'task-42',
      '--execute',
      '--resume',
      '--stopOnError=false',
      '--skipStep',
      'manage_reverse_task:progress',
      '--skipStep',
      'understand_code',
      '--fromStep',
      'understand_code',
      '--onlyStep',
      'understand_code',
      '--strategy',
      'env-fix',
      '--outputMode',
      'compact',
      '--includeSummary=false',
      '--persistState=false',
      '--executionOverrides',
      '{"inject_hook":{"status":"ok","result":"done"}}',
    ]) as ParsedArgsLike;

    assert.strictEqual(parsed.orchestrateReverseTask, 'task-42');
    assert.strictEqual(parsed.execute, true);
    assert.strictEqual(parsed.resume, true);
    assert.strictEqual(parsed.stopOnError, false);
    assert.deepStrictEqual(parsed.skipStep, [
      'manage_reverse_task:progress',
      'understand_code',
    ]);
    assert.strictEqual(parsed.fromStep, 'understand_code');
    assert.deepStrictEqual(parsed.onlyStep, ['understand_code']);
    assert.strictEqual(parsed.strategy, 'env-fix');
    assert.strictEqual(parsed.outputMode, 'compact');
    assert.strictEqual(parsed.includeSummary, false);
    assert.strictEqual(parsed.persistState, false);
    assert.deepStrictEqual(parsed.executionOverrides, {
      inject_hook: {
        status: 'ok',
        result: 'done',
      },
    });
  });

  it('parseArguments supports runReverseAgent flags', () => {
    const parsed = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--runReverseAgent',
      'task-77',
      '--maxRounds',
      '4',
      '--goalMode',
      'port-ready',
      '--autoExportPortable',
      '--strategy',
      'evidence-only',
      '--outputMode',
      'compact',
      '--includeSummary=false',
    ]) as ParsedArgsLike;

    assert.strictEqual(parsed.runReverseAgent, 'task-77');
    assert.strictEqual(parsed.maxRounds, 4);
    assert.strictEqual(parsed.goalMode, 'port-ready');
    assert.strictEqual(parsed.autoExportPortable, true);
    assert.strictEqual(parsed.strategy, 'evidence-only');
    assert.strictEqual(parsed.outputMode, 'compact');
    assert.strictEqual(parsed.includeSummary, false);
  });

  it('parseArguments defaults to kernel tool profile and supports compact/full profiles', () => {
    const defaultArgs = parseArguments('1.0.0', ['node', 'mcp']);
    assert.strictEqual(defaultArgs.toolProfile, 'kernel');

    const compactArgs = parseArguments('1.0.0', [
      'node',
      'mcp',
      '--toolProfile',
      'compact',
    ]);
    assert.strictEqual(compactArgs.toolProfile, 'compact');

    const fullArgs = parseArguments('1.0.0', [
      'node',
      'mcp',
      '--toolProfile',
      'full',
    ]);
    assert.strictEqual(fullArgs.toolProfile, 'full');
  });

  it('parseArguments defaults to error-only trace output and supports all traces', () => {
    const defaultArgs = parseArguments('1.0.0', ['node', 'mcp']);
    assert.strictEqual(defaultArgs.traceOutput, 'errors');

    const allTraceArgs = parseArguments('1.0.0', [
      'node',
      'mcp',
      '--traceOutput',
      'all',
    ]);
    assert.strictEqual(allTraceArgs.traceOutput, 'all');
  });

  it('parseArguments supports exportPortableBundle flags', () => {
    const parsed = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--exportPortableBundle',
      'task-88',
      '--artifactMode',
      'pure',
    ]) as ParsedArgsLike;

    assert.strictEqual(parsed.exportPortableBundle, 'task-88');
    assert.strictEqual(parsed.artifactMode, 'pure');
  });

  it('parseArguments keeps explicit launch target without forcing channel', () => {
    const byUrl = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--browserUrl',
      'http://127.0.0.1:9222',
    ]) as ParsedArgsLike;
    assert.strictEqual(byUrl.browserUrl, 'http://127.0.0.1:9222');
    assert.strictEqual(byUrl.channel, undefined);

    const byWs = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--wsEndpoint',
      'ws://127.0.0.1:9222/devtools/browser/abc',
      '--wsHeaders',
      '{"Authorization":"Bearer token"}',
    ]) as ParsedArgsLike;
    assert.strictEqual(
      byWs.wsEndpoint,
      'ws://127.0.0.1:9222/devtools/browser/abc',
    );
    assert.deepStrictEqual(byWs.wsHeaders, {Authorization: 'Bearer token'});
    assert.strictEqual(byWs.channel, undefined);
  });

  it('parseArguments supports autoConnect without forcing local launch defaults', () => {
    const parsed = parseArguments('1.2.3', [
      'node',
      'cli.js',
      '--autoConnect',
    ]) as ParsedArgsLike;

    assert.strictEqual(parsed.autoConnect, true);
    assert.strictEqual(parsed.channel, undefined);
  });

  it('parseArguments supports chrome args, viewport and hidden toggles', () => {
    const parsed = parseArguments('9.9.9', [
      'node',
      'cli.js',
      '--channel',
      'beta',
      '--headless',
      '--isolated',
      '--viewport',
      '1440x900',
      '--chrome-arg=--no-sandbox',
      '--chrome-arg=--disable-gpu',
      '--no-category-network',
      '--experimentalDevtools',
      '--experimentalIncludeAllPages',
    ]) as ParsedArgsLike;

    assert.strictEqual(parsed.channel, 'beta');
    assert.strictEqual(parsed.headless, true);
    assert.strictEqual(parsed.isolated, true);
    assert.deepStrictEqual(parsed.viewport, {width: 1440, height: 900});
    assert.deepStrictEqual(parsed.chromeArg, ['--no-sandbox', '--disable-gpu']);
    assert.strictEqual(parsed.categoryNetwork, false);
    assert.strictEqual(parsed.experimentalDevtools, true);
    assert.strictEqual(parsed.experimentalIncludeAllPages, true);
  });
});
