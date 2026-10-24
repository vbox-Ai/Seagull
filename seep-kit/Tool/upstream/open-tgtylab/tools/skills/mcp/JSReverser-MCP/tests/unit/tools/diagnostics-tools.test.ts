/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {diagnoseEnvironment} from '../../../src/tools/diagnostics.js';

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

describe('diagnostics tools', () => {
  it('returns structured diagnostics without needing browser context', async () => {
    const response = makeResponse();

    await diagnoseEnvironment.handler(
      {params: {}},
      response as unknown as Parameters<typeof diagnoseEnvironment.handler>[1],
      {} as Parameters<typeof diagnoseEnvironment.handler>[2],
    );

    assert.strictEqual(diagnoseEnvironment.name, 'diagnose_environment');
    assert.strictEqual(response.lines[0], '```json');
    const parsed = JSON.parse(response.lines[1] ?? '{}') as {
      status: string;
      checks: unknown[];
    };
    assert.ok(['ok', 'warn', 'fail'].includes(parsed.status));
    assert.ok(Array.isArray(parsed.checks));
  });
});
