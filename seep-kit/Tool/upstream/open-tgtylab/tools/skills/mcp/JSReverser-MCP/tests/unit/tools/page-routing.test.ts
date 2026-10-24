/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {zod} from '../../../src/third_party/index.js';
import {consoleMessage} from '../../../src/tools/console.js';
import {queryDom} from '../../../src/tools/dom.js';
import {networkRequest} from '../../../src/tools/network.js';
import {clickElement, sessionState} from '../../../src/tools/page.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';
import {screenshot} from '../../../src/tools/screenshot.js';
import {
  analyzeWebSocketMessages,
  getWebSocketMessage,
  getWebSocketMessages,
  listWebSocketConnections,
} from '../../../src/tools/websocket.js';

type RuntimeMethod = (...args: any[]) => any;

interface ResponseHarness {
  lines: string[];
  consoleInclude?: {value: boolean; options?: Record<string, unknown>};
  networkInclude?: {value: boolean; options?: Record<string, unknown>};
  webSocketInclude?: {value: boolean; options?: Record<string, unknown>};
  attachedNetworkRequest?: {reqid: number; targetPageIdx?: number};
  attachedWebSocket?: {wsid: number; targetPageIdx?: number};
  images: unknown[];
  appendResponseLine(value: string): void;
  setIncludePages(value: boolean): void;
  setIncludeNetworkRequests(
    value: boolean,
    options?: Record<string, unknown>,
  ): void;
  setIncludeConsoleData(
    value: boolean,
    options?: Record<string, unknown>,
  ): void;
  attachImage(value: unknown): void;
  attachNetworkRequest(reqid: number, targetPageIdx?: number): void;
  attachConsoleMessage(msgid: number, targetPageIdx?: number): void;
  setIncludeWebSocketConnections(
    value: boolean,
    options?: Record<string, unknown>,
  ): void;
  attachWebSocket(wsid: number, targetPageIdx?: number): void;
}

interface ToolContextHarness {
  getSelectedPage(): PageHarness;
  getPageByIdx(idx: number): PageHarness;
  getPageByOptionalIdx(idx?: number): PageHarness;
  debuggerContext?: {
    isEnabled(): boolean;
    waitForPause(timeoutMs?: number): Promise<unknown>;
  };
  getWebSocketById?(
    wsid: number,
    targetPageIdx?: number,
  ): {
    frames: Array<{
      direction: 'sent' | 'received';
      opcode: number;
      payloadData: string;
    }>;
    connection: {url: string};
  };
  getCachedTrafficSummary?(wsid: number): unknown;
  cacheTrafficSummary?(wsid: number, summary: unknown): void;
  saveFile(data: Uint8Array, filename: string): Promise<{filename: string}>;
  saveTemporaryFile(
    data: Uint8Array,
    mimeType: string,
  ): Promise<{filename: string}>;
}

interface PageHarness {
  id: string;
  url(): string;
  title(): Promise<string>;
  screenshot(options: unknown): Promise<Uint8Array>;
  click?(selector: string): Promise<void>;
}

interface RuntimeHarness {
  syncPageContext: RuntimeMethod;
  bindPageContext: RuntimeMethod;
  domInspector: {
    querySelector: RuntimeMethod;
  };
  pageController: {
    click: RuntimeMethod;
    getPage: RuntimeMethod;
    getCookies: RuntimeMethod;
    getLocalStorage: RuntimeMethod;
    getSessionStorage: RuntimeMethod;
  };
}

function makeResponse(): ResponseHarness {
  return {
    lines: [],
    images: [],
    appendResponseLine(value: string) {
      this.lines.push(value);
    },
    setIncludePages: () => undefined,
    setIncludeNetworkRequests(
      value: boolean,
      options?: Record<string, unknown>,
    ) {
      this.networkInclude = {value, options};
    },
    setIncludeConsoleData(value: boolean, options?: Record<string, unknown>) {
      this.consoleInclude = {value, options};
    },
    attachImage(value: unknown) {
      this.images.push(value);
    },
    attachNetworkRequest(reqid: number, targetPageIdx?: number) {
      this.attachedNetworkRequest = {reqid, targetPageIdx};
    },
    attachConsoleMessage: () => undefined,
    setIncludeWebSocketConnections(
      value: boolean,
      options?: Record<string, unknown>,
    ) {
      this.webSocketInclude = {value, options};
    },
    attachWebSocket(wsid: number, targetPageIdx?: number) {
      this.attachedWebSocket = {wsid, targetPageIdx};
    },
  };
}

describe('page scoped tool routing', () => {
  it('routes DOM and page controller tools to explicit pageIdx then restores selected page context', async () => {
    const runtime = getJSHookRuntime() as unknown as RuntimeHarness;
    const selectedPage: PageHarness = {
      id: 'selected',
      url: () => 'https://selected.example',
      title: async () => 'selected',
      screenshot: async () => new Uint8Array([1]),
      click: async () => undefined,
    };
    const targetPage: PageHarness = {
      id: 'target',
      url: () => 'https://target.example',
      title: async () => 'target',
      screenshot: async () => new Uint8Array([2]),
      click: async (selector: string) => {
        assert.strictEqual(selector, '#submit');
      },
    };
    const context: ToolContextHarness = {
      getSelectedPage: () => selectedPage,
      getPageByIdx: (idx: number) => {
        assert.strictEqual(idx, 1);
        return targetPage;
      },
      getPageByOptionalIdx: (idx?: number) =>
        idx === undefined ? selectedPage : targetPage,
      saveFile: async () => ({filename: 'x.png'}),
      saveTemporaryFile: async () => ({filename: 'tmp.png'}),
    };
    const response = makeResponse();

    const originalSync = runtime.syncPageContext;
    const originalBind = runtime.bindPageContext;
    const originalQuery = runtime.domInspector.querySelector;
    const syncedPages: string[] = [];
    runtime.syncPageContext = (page: PageHarness) => {
      syncedPages.push(page.id);
    };
    runtime.bindPageContext = () => undefined;
    runtime.domInspector.querySelector = async (selector: string) => ({
      found: true,
      selector,
    });

    try {
      await queryDom.handler(
        {
          params: zod
            .object(queryDom.schema)
            .parse({selector: '#target', pageIdx: 1}),
        },
        response as unknown as Parameters<typeof queryDom.handler>[1],
        context as unknown as Parameters<typeof queryDom.handler>[2],
      );
      await clickElement.handler(
        {
          params: zod
            .object(clickElement.schema)
            .parse({selector: '#submit', pageIdx: 1}),
        },
        response as unknown as Parameters<typeof clickElement.handler>[1],
        context as unknown as Parameters<typeof clickElement.handler>[2],
      );
    } finally {
      runtime.syncPageContext = originalSync;
      runtime.bindPageContext = originalBind;
      runtime.domInspector.querySelector = originalQuery;
    }

    assert.deepStrictEqual(syncedPages, ['target', 'selected']);
  });

  it('returns promptly when click triggers a paused debugger state', async () => {
    getJSHookRuntime() as unknown as RuntimeHarness;
    const selectedPage: PageHarness = {
      id: 'selected',
      url: () => 'https://selected.example',
      title: async () => 'selected',
      screenshot: async () => new Uint8Array([1]),
      click: async () => {
        await new Promise<void>(() => undefined);
      },
    };
    const context: ToolContextHarness = {
      getSelectedPage: () => selectedPage,
      getPageByIdx: () => selectedPage,
      getPageByOptionalIdx: () => selectedPage,
      debuggerContext: {
        isEnabled: () => true,
        waitForPause: async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
          return {isPaused: true};
        },
      },
      saveFile: async () => ({filename: 'x.png'}),
      saveTemporaryFile: async () => ({filename: 'tmp.png'}),
    };
    const response = makeResponse();

    await clickElement.handler(
      {params: zod.object(clickElement.schema).parse({selector: '#submit'})},
      response as unknown as Parameters<typeof clickElement.handler>[1],
      context as unknown as Parameters<typeof clickElement.handler>[2],
    );

    assert.ok(
      response.lines.some(line =>
        line.includes('Execution paused at breakpoint.'),
      ),
    );
  });

  it('uses explicit pageIdx for screenshot without changing selected page', async () => {
    const selectedPage: PageHarness = {
      id: 'selected',
      url: () => 'https://selected.example',
      title: async () => 'selected',
      screenshot: async () => new Uint8Array([1, 2, 3]),
    };
    const targetPage: PageHarness = {
      id: 'target',
      url: () => 'https://target.example',
      title: async () => 'target',
      screenshot: async () => new Uint8Array([9, 9, 9]),
    };
    const response = makeResponse();
    const context: ToolContextHarness = {
      getSelectedPage: () => selectedPage,
      getPageByIdx: (idx: number) => {
        assert.strictEqual(idx, 1);
        return targetPage;
      },
      getPageByOptionalIdx: (idx?: number) =>
        idx === undefined ? selectedPage : targetPage,
      saveFile: async () => ({filename: 'x.png'}),
      saveTemporaryFile: async () => ({filename: 'tmp.png'}),
    };

    await screenshot.handler(
      {
        params: zod
          .object(screenshot.schema)
          .parse({format: 'png', pageIdx: 1}),
      },
      response as unknown as Parameters<typeof screenshot.handler>[1],
      context as unknown as Parameters<typeof screenshot.handler>[2],
    );

    assert.strictEqual(response.images.length, 1);
  });

  it('passes explicit pageIdx through console list options', async () => {
    const response = makeResponse();

    await consoleMessage.handler(
      {
        params: zod
          .object(consoleMessage.schema)
          .parse({action: 'list', targetPageIdx: 2}),
      },
      response as unknown as Parameters<typeof consoleMessage.handler>[1],
      {} as Parameters<typeof consoleMessage.handler>[2],
    );

    assert.deepStrictEqual(response.consoleInclude, {
      value: true,
      options: {
        targetPageIdx: 2,
        includePreservedMessages: undefined,
        pageIdx: undefined,
        pageSize: undefined,
        types: undefined,
      },
    });
  });

  it('passes explicit targetPageIdx through network and websocket list/get options', async () => {
    const response = makeResponse();

    await networkRequest.handler(
      {
        params: zod.object(networkRequest.schema).parse({
          action: 'list',
          pageIdx: 1,
          targetPageIdx: 2,
        }),
      },
      response as unknown as Parameters<typeof networkRequest.handler>[1],
      {
        getDevToolsData: async () => ({}),
        resolveCdpRequestId: () => undefined,
      } as unknown as Parameters<typeof networkRequest.handler>[2],
    );
    await networkRequest.handler(
      {
        params: zod
          .object(networkRequest.schema)
          .parse({action: 'get', reqid: 9, targetPageIdx: 2}),
      },
      response as unknown as Parameters<typeof networkRequest.handler>[1],
      {} as Parameters<typeof networkRequest.handler>[2],
    );
    await listWebSocketConnections.handler(
      {
        params: zod.object(listWebSocketConnections.schema).parse({
          pageIdx: 3,
          targetPageIdx: 2,
        }),
      },
      response as unknown as Parameters<
        typeof listWebSocketConnections.handler
      >[1],
      {} as Parameters<typeof listWebSocketConnections.handler>[2],
    );

    assert.deepStrictEqual(response.networkInclude, {
      value: true,
      options: {
        includePreservedRequests: undefined,
        networkRequestIdInDevToolsUI: undefined,
        pageIdx: 1,
        pageSize: undefined,
        resourceTypes: undefined,
        targetPageIdx: 2,
      },
    });
    assert.deepStrictEqual(response.attachedNetworkRequest, {
      reqid: 9,
      targetPageIdx: 2,
    });
    assert.deepStrictEqual(response.webSocketInclude, {
      value: true,
      options: {
        includePreservedConnections: undefined,
        pageIdx: 3,
        pageSize: undefined,
        targetPageIdx: 2,
        urlFilter: undefined,
      },
    });
  });

  it('routes websocket detail tools to explicit targetPageIdx', async () => {
    const response = makeResponse();
    const calls: Array<{wsid: number; targetPageIdx?: number}> = [];
    const context: ToolContextHarness = {
      getSelectedPage: () => {
        throw new Error('not used');
      },
      getPageByIdx: () => {
        throw new Error('not used');
      },
      getPageByOptionalIdx: () => {
        throw new Error('not used');
      },
      getWebSocketById: (wsid: number, targetPageIdx?: number) => {
        calls.push({wsid, targetPageIdx});
        return {
          connection: {url: 'wss://socket.example'},
          frames: [
            {
              direction: 'received',
              opcode: 1,
              payloadData: 'hello',
              timestamp: Date.now(),
            },
            {
              direction: 'sent',
              opcode: 1,
              payloadData: 'world',
              timestamp: Date.now(),
            },
          ],
        };
      },
      getCachedTrafficSummary: () => undefined,
      cacheTrafficSummary: () => undefined,
      saveFile: async () => ({filename: 'unused'}),
      saveTemporaryFile: async () => ({filename: 'unused'}),
    };

    await getWebSocketMessages.handler(
      {
        params: zod.object(getWebSocketMessages.schema).parse({
          wsid: 5,
          targetPageIdx: 2,
        }),
      },
      response as unknown as Parameters<typeof getWebSocketMessages.handler>[1],
      context as unknown as Parameters<typeof getWebSocketMessages.handler>[2],
    );
    await getWebSocketMessage.handler(
      {
        params: zod.object(getWebSocketMessage.schema).parse({
          wsid: 5,
          frameIndex: 0,
          targetPageIdx: 2,
        }),
      },
      response as unknown as Parameters<typeof getWebSocketMessage.handler>[1],
      context as unknown as Parameters<typeof getWebSocketMessage.handler>[2],
    );
    await analyzeWebSocketMessages.handler(
      {
        params: zod.object(analyzeWebSocketMessages.schema).parse({
          wsid: 5,
          targetPageIdx: 2,
        }),
      },
      response as unknown as Parameters<
        typeof analyzeWebSocketMessages.handler
      >[1],
      context as unknown as Parameters<
        typeof analyzeWebSocketMessages.handler
      >[2],
    );

    assert.deepStrictEqual(calls, [
      {wsid: 5, targetPageIdx: 2},
      {wsid: 5, targetPageIdx: 2},
      {wsid: 5, targetPageIdx: 2},
    ]);
  });

  it('saves session state from explicit pageIdx page', async () => {
    const runtime = getJSHookRuntime() as unknown as RuntimeHarness;
    const selectedPage: PageHarness = {
      id: 'selected',
      url: () => 'https://selected.example',
      title: async () => 'selected',
      screenshot: async () => new Uint8Array([1]),
    };
    const targetPage: PageHarness = {
      id: 'target',
      url: () => 'https://target.example',
      title: async () => 'target',
      screenshot: async () => new Uint8Array([2]),
    };
    const context: ToolContextHarness = {
      getSelectedPage: () => selectedPage,
      getPageByIdx: () => targetPage,
      getPageByOptionalIdx: (idx?: number) =>
        idx === undefined ? selectedPage : targetPage,
      saveFile: async () => ({filename: 'x.png'}),
      saveTemporaryFile: async () => ({filename: 'tmp.png'}),
    };
    const response = makeResponse();

    const originalSync = runtime.syncPageContext;
    const originalBind = runtime.bindPageContext;
    const originalGetPage = runtime.pageController.getPage;
    const originalGetCookies = runtime.pageController.getCookies;
    const originalGetLocalStorage = runtime.pageController.getLocalStorage;
    const originalGetSessionStorage = runtime.pageController.getSessionStorage;

    runtime.syncPageContext = () => undefined;
    runtime.bindPageContext = () => undefined;
    runtime.pageController.getPage = async () => targetPage;
    runtime.pageController.getCookies = async () => [];
    runtime.pageController.getLocalStorage = async () => ({token: 'abc'});
    runtime.pageController.getSessionStorage = async () => ({sid: '1'});

    try {
      await sessionState.handler(
        {
          params: zod.object(sessionState.schema).parse({
            action: 'save',
            pageIdx: 1,
            sessionId: 'explicit-page',
          }),
        },
        response as unknown as Parameters<typeof sessionState.handler>[1],
        context as unknown as Parameters<typeof sessionState.handler>[2],
      );
    } finally {
      runtime.syncPageContext = originalSync;
      runtime.bindPageContext = originalBind;
      runtime.pageController.getPage = originalGetPage;
      runtime.pageController.getCookies = originalGetCookies;
      runtime.pageController.getLocalStorage = originalGetLocalStorage;
      runtime.pageController.getSessionStorage = originalGetSessionStorage;
    }

    assert.match(response.lines.join('\n'), /https:\/\/target\.example/);
  });
});
