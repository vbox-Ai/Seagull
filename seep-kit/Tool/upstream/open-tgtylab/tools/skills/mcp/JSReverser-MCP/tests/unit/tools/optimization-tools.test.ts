/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  analyzeSourceMapSummary,
  buildBrowserConnectionRepairPlan,
  buildFunctionSliceDraft,
  buildParameterReportDraft,
  diffSessionStateSnapshots,
  inferWebSocketSchemaFromMessages,
  locateCandidateFunctionsFromFiles,
  optimizationTools,
} from '../../../src/tools/optimizations.js';

describe('optimization tools', () => {
  it('exports all functional optimization tools', () => {
    const names = optimizationTools.map(tool => tool.name).sort();

    assert.deepStrictEqual(names, [
      'analyze_source_maps',
      'auto_rebuild_fix_loop',
      'diff_session_state',
      'export_diagnostic_bundle',
      'export_function_slice',
      'export_har_snapshot',
      'generate_parameter_report',
      'infer_websocket_schema',
      'list_task_artifacts',
      'locate_candidate_functions',
      'probe_runtime_capabilities',
      'prune_task_artifacts',
      'record_page_flow',
      'repair_browser_connection',
      'replay_page_flow',
      'trace_request_to_code',
    ]);
  });

  it('builds browser repair plans without treating MCP as an HTTP app', () => {
    const plan = buildBrowserConnectionRepairPlan({
      browserUrl: 'https://target.example/app',
      wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
      remoteDebuggingUrl: 'http://127.0.0.1:9222',
      devtoolsReachable: false,
    });

    assert.strictEqual(plan.ok, false);
    assert.ok(plan.problems.some(item => item.includes('二选一')));
    assert.ok(plan.problems.some(item => item.includes('业务网站地址')));
    assert.ok(plan.repairCommands.some(item => item.includes('json/version')));
  });

  it('scores candidate functions from target params and request sinks', () => {
    const candidates = locateCandidateFunctionsFromFiles({
      targetUrl: 'https://example.com/api/order',
      parameterNames: ['sign', 'nonce'],
      headerNames: ['x-sign'],
      files: [
        {
          url: 'https://example.com/app.js',
          content:
            'function buildSign(nonce){ return fetch("/api/order?sign="+nonce); }',
        },
        {
          url: 'https://example.com/other.js',
          content: 'function render(){ return 1; }',
        },
      ],
      maxCandidates: 3,
    });

    assert.strictEqual(candidates[0].name, 'buildSign');
    assert.ok(candidates[0].score > candidates[1].score);
    assert.ok(candidates[0].reasons.includes('param:sign'));
  });

  it('summarizes source maps and source coverage', () => {
    const summary = analyzeSourceMapSummary({
      sourceMapContent: JSON.stringify({
        version: 3,
        file: 'app.js',
        sources: ['src/sign.ts', 'src/api.ts'],
        sourcesContent: ['export const sign = 1;', 'fetch("/api")'],
        mappings: 'AAAA',
      }),
    });

    assert.strictEqual(summary.valid, true);
    assert.strictEqual(summary.sourceCount, 2);
    assert.strictEqual(summary.sourcesWithContent, 2);
    assert.ok(summary.recommendedNextSteps[0].includes('src/sign.ts'));
  });

  it('exports a function slice draft with direct helper dependencies', () => {
    const draft = buildFunctionSliceDraft({
      functionName: 'sign',
      code: 'function helper(v){return v+"x"}\nfunction sign(value){return helper(value)}',
    });

    assert.strictEqual(draft.found, true);
    assert.ok(draft.slice.includes('function sign'));
    assert.ok(draft.slice.includes('function helper'));
    assert.ok(draft.envShim.includes('globalThis.window'));
  });

  it('diffs cookie and storage snapshots', () => {
    const diff = diffSessionStateSnapshots({
      before: {
        cookies: [{name: 'sid', value: 'a'}],
        localStorage: {token: 'old'},
      },
      after: {
        cookies: [
          {name: 'sid', value: 'b'},
          {name: 'ab', value: '1'},
        ],
        localStorage: {token: 'new'},
        sessionStorage: {nonce: 'n1'},
      },
    });

    assert.deepStrictEqual(diff.cookies.changed, ['sid']);
    assert.deepStrictEqual(diff.cookies.added, ['ab']);
    assert.deepStrictEqual(diff.localStorage.changed, ['token']);
    assert.deepStrictEqual(diff.sessionStorage.added, ['nonce']);
  });

  it('infers websocket message schemas', () => {
    const schema = inferWebSocketSchemaFromMessages({
      messages: [
        '{"type":"ping","ts":1}',
        '{"type":"pong","ok":true}',
        'raw-binary-like',
      ],
    });

    assert.strictEqual(schema.totalMessages, 3);
    assert.deepStrictEqual(schema.json.fields.type.types, ['string']);
    assert.strictEqual(schema.nonJsonCount, 1);
  });

  it('builds parameter report drafts from evidence', () => {
    const report = buildParameterReportDraft({
      targetUrl: 'https://example.com/api/order',
      parameterNames: ['sign'],
      candidateFunctions: [{name: 'buildSign', score: 12, file: 'app.js'}],
      evidence: ['fetch request contains sign'],
      nextSteps: ['export function slice'],
    });

    assert.ok(report.markdown.includes('https://example.com/api/order'));
    assert.ok(report.markdown.includes('buildSign'));
    assert.ok(report.summary.includes('sign'));
  });
});
