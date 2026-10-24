/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  resolveTraceOutputMode,
  withOptionalTraceIdContent,
} from '../../../src/tools/trace-output.js';

describe('trace output formatting', () => {
  it('omits trace metadata from successful compact responses by default', () => {
    const content = [{type: 'text' as const, text: 'ok'}];
    assert.strictEqual(
      withOptionalTraceIdContent(content, 'trace_1', 'errors'),
      content,
    );
  });

  it('prepends trace metadata when full trace output is requested', () => {
    const content = [{type: 'text' as const, text: 'ok'}];
    const wrapped = withOptionalTraceIdContent(content, 'trace_1', 'all');

    assert.strictEqual(wrapped.length, 2);
    assert.strictEqual(wrapped[0]?.type, 'text');
    assert.strictEqual(wrapped[1]?.type, 'text');
    const traceText = wrapped[0]?.type === 'text' ? wrapped[0].text : '{}';
    const responseText = wrapped[1]?.type === 'text' ? wrapped[1].text : '';
    assert.deepStrictEqual(JSON.parse(traceText), {
      traceId: 'trace_1',
    });
    assert.strictEqual(responseText, 'ok');
  });

  it('allows a single tool call to override global trace output mode', () => {
    assert.strictEqual(resolveTraceOutputMode('errors', 'all'), 'all');
    assert.strictEqual(resolveTraceOutputMode('all', 'errors'), 'errors');
    assert.strictEqual(resolveTraceOutputMode('errors', undefined), 'errors');
    assert.strictEqual(resolveTraceOutputMode('errors', 'invalid'), 'errors');
  });
});
