/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {McpResponse} from '../../src/McpResponse.js';

describe('McpResponse network detail formatting', () => {
  it('renders richer request metadata for attached network requests', async () => {
    const response = new McpResponse();
    response.attachNetworkRequest(7);

    const context = {
      getNetworkRequestById() {
        return {
          url: () => 'https://api.example.com/orders',
          method: () => 'POST',
          resourceType: () => 'fetch',
          headers: () => ({'content-type': 'application/json', accept: '*/*'}),
          hasPostData: () => true,
          postData: () => '{"a":1}',
          fetchPostData: async () => '{"a":1}',
          response: () => ({
            status: () => 200,
            headers: () => ({'content-type': 'application/json'}),
            buffer: async () => Buffer.from('{"ok":true}', 'utf8'),
          }),
          failure: () => null,
          redirectChain: () => [],
        };
      },
      getNetworkRequestStableId: () => 7,
      getNetworkConditions: () => undefined,
      getCpuThrottlingRate: () => 1,
      getPages: () => [],
      isPageSelected: () => false,
      getConsoleData: () => [],
      getWebSocketConnections: () => [],
      getWebSocketById: () => {
        throw new Error('not used');
      },
      getConsoleMessageById: () => {
        throw new Error('not used');
      },
      getConsoleMessageStableId: () => 0,
      createPagesSnapshot: async () => undefined,
      getNavigationTimeout: () => 30_000,
    };

    const [text] = await response.handle(
      'get_network_request',
      context as never,
    );

    assert.strictEqual(text.type, 'text');
    assert.ok(text.text.includes('Method: POST'));
    assert.ok(text.text.includes('Resource Type: fetch'));
    assert.ok(text.text.includes('### Request Headers (2)'));
    assert.ok(text.text.includes('### Response Headers (1)'));
    assert.ok(text.text.includes('### Response Body'));
  });

  it('renders request failure details with the new failure heading', async () => {
    const response = new McpResponse();
    response.attachNetworkRequest(9);

    const context = {
      getNetworkRequestById() {
        return {
          url: () => 'https://api.example.com/fail',
          method: () => 'GET',
          resourceType: () => 'xhr',
          headers: () => ({}),
          hasPostData: () => false,
          postData: () => undefined,
          fetchPostData: async () => undefined,
          response: () => null,
          failure: () => ({errorText: 'net::ERR_ABORTED'}),
          redirectChain: () => [],
        };
      },
      getNetworkRequestStableId: () => 9,
      getNetworkConditions: () => undefined,
      getCpuThrottlingRate: () => 1,
      getPages: () => [],
      isPageSelected: () => false,
      getConsoleData: () => [],
      getWebSocketConnections: () => [],
      getWebSocketById: () => {
        throw new Error('not used');
      },
      getConsoleMessageById: () => {
        throw new Error('not used');
      },
      getConsoleMessageStableId: () => 0,
      createPagesSnapshot: async () => undefined,
      getNavigationTimeout: () => 30_000,
    };

    const [text] = await response.handle(
      'get_network_request',
      context as never,
    );

    assert.strictEqual(text.type, 'text');
    assert.ok(text.text.includes('Method: GET'));
    assert.ok(text.text.includes('Resource Type: xhr'));
    assert.ok(text.text.includes('### Request Failure'));
    assert.ok(text.text.includes('net::ERR_ABORTED'));
  });

  it('uses targetPageIdx when formatting network and websocket data', async () => {
    const response = new McpResponse();
    response.setIncludeNetworkRequests(true, {targetPageIdx: 3});
    response.attachNetworkRequest(11, 3);
    response.setIncludeWebSocketConnections(true, {targetPageIdx: 3});
    response.attachWebSocket(15, 3);

    const calls: string[] = [];
    const context = {
      getNetworkRequests(_includePreserved?: boolean, targetPageIdx?: number) {
        calls.push(`list-network:${targetPageIdx}`);
        return [];
      },
      getNetworkRequestById(_id: number, targetPageIdx?: number) {
        calls.push(`get-network:${targetPageIdx}`);
        return {
          url: () => 'https://api.example.com/item',
          method: () => 'GET',
          resourceType: () => 'xhr',
          headers: () => ({}),
          hasPostData: () => false,
          postData: () => undefined,
          fetchPostData: async () => undefined,
          response: () => null,
          failure: () => null,
          redirectChain: () => [],
        };
      },
      getWebSocketConnections(
        _includePreserved?: boolean,
        targetPageIdx?: number,
      ) {
        calls.push(`list-ws:${targetPageIdx}`);
        return [];
      },
      getWebSocketById(_id: number, targetPageIdx?: number) {
        calls.push(`get-ws:${targetPageIdx}`);
        return {
          connection: {
            url: 'wss://socket.example',
            status: 'open',
            createdAt: Date.now(),
            requestHeaders: {},
            responseHeaders: {},
          },
          frames: [],
        };
      },
      getNetworkRequestStableId: () => 11,
      getWebSocketStableId: () => 15,
      getNetworkConditions: () => undefined,
      getCpuThrottlingRate: () => 1,
      getPages: () => [],
      isPageSelected: () => false,
      getConsoleData: () => [],
      getConsoleMessageById: () => {
        throw new Error('not used');
      },
      getConsoleMessageStableId: () => 0,
      createPagesSnapshot: async () => undefined,
      getNavigationTimeout: () => 30_000,
    };

    await response.handle('mixed_response', context as never);

    assert.deepStrictEqual(calls, [
      'get-network:3',
      'get-network:3',
      'list-network:3',
      'list-ws:3',
      'get-ws:3',
    ]);
  });
});
