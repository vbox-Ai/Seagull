/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {setIssuesEnabled} from '../../../src/features.js';
import {zod} from '../../../src/third_party/index.js';
import {consoleMessage} from '../../../src/tools/console.js';

interface ConsoleIncludeOptions {
  pageSize?: number;
  pageIdx?: number;
  types?: Array<
    | 'log'
    | 'debug'
    | 'info'
    | 'error'
    | 'warn'
    | 'dir'
    | 'dirxml'
    | 'table'
    | 'trace'
    | 'clear'
    | 'startGroup'
    | 'startGroupCollapsed'
    | 'endGroup'
    | 'assert'
    | 'profile'
    | 'profileEnd'
    | 'count'
    | 'timeEnd'
    | 'verbose'
    | 'issue'
  >;
  includePreservedMessages?: boolean;
}

interface ConsoleResponseHarness {
  setIncludeConsoleData(value: boolean, options?: ConsoleIncludeOptions): void;
  appendResponseLine(value: string): void;
  setIncludePages(value: boolean): void;
  setIncludeNetworkRequests(value: boolean): void;
  attachImage(value: unknown): void;
  attachNetworkRequest(reqid: number): void;
  attachConsoleMessage(msgid: number): void;
  setIncludeWebSocketConnections(value: boolean): void;
  attachWebSocket(wsid: number): void;
}

interface ListConsoleRequestHarness {
  params: {
    action: 'list';
    pageSize?: number;
    pageIdx?: number;
    types?: ConsoleIncludeOptions['types'];
    includePreservedMessages?: boolean;
  };
}

interface GetConsoleRequestHarness {
  params: {
    action: 'get';
    msgid: number;
  };
}

describe('console tools', () => {
  it('lists console messages with filters and defaults', async () => {
    const schema = zod.object(consoleMessage.schema);
    const parsed = schema.parse({
      action: 'list',
      pageSize: 20,
      pageIdx: 1,
      types: ['error'],
    });

    let include = false;
    let options: ConsoleIncludeOptions | undefined;
    const response: ConsoleResponseHarness = {
      setIncludeConsoleData: (value: boolean, opts?: ConsoleIncludeOptions) => {
        include = value;
        options = opts;
      },
      appendResponseLine: () => undefined,
      setIncludePages: () => undefined,
      setIncludeNetworkRequests: () => undefined,
      attachImage: () => undefined,
      attachNetworkRequest: () => undefined,
      attachConsoleMessage: () => undefined,
      setIncludeWebSocketConnections: () => undefined,
      attachWebSocket: () => undefined,
    };

    await consoleMessage.handler(
      {params: parsed} as unknown as ListConsoleRequestHarness,
      response as unknown as Parameters<typeof consoleMessage.handler>[1],
      {} as Parameters<typeof consoleMessage.handler>[2],
    );

    assert.strictEqual(include, true);
    assert.ok(options);
    assert.strictEqual(options.pageSize, 20);
    assert.strictEqual(options.pageIdx, 1);
    assert.deepStrictEqual(options.types, ['error']);
    assert.strictEqual(options.includePreservedMessages, undefined);
  });

  it('attaches single console message by msgid', async () => {
    let attached: number | undefined;
    const response: ConsoleResponseHarness = {
      attachConsoleMessage: (id: number) => {
        attached = id;
      },
      appendResponseLine: () => undefined,
      setIncludeConsoleData: () => undefined,
      setIncludePages: () => undefined,
      setIncludeNetworkRequests: () => undefined,
      attachImage: () => undefined,
      attachNetworkRequest: () => undefined,
      setIncludeWebSocketConnections: () => undefined,
      attachWebSocket: () => undefined,
    };

    await consoleMessage.handler(
      {
        params: {action: 'get', msgid: 42},
      } as unknown as GetConsoleRequestHarness,
      response as unknown as Parameters<typeof consoleMessage.handler>[1],
      {} as Parameters<typeof consoleMessage.handler>[2],
    );
    assert.strictEqual(attached, 42);
  });

  it('covers issues feature branch in console message types', async () => {
    setIssuesEnabled(true);
    try {
      const url = new URL('../../../src/tools/console.js', import.meta.url);
      const mod = await import(`${url.href}?issues=on`);
      const schema = zod.object(mod.consoleMessage.schema);
      const parsed = schema.parse({action: 'list', types: ['issue']});
      assert.deepStrictEqual(parsed.types, ['issue']);
    } finally {
      setIssuesEnabled(false);
    }
  });
});
