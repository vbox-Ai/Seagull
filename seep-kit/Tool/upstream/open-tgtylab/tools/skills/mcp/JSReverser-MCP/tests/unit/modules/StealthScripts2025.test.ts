/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {afterEach, beforeEach, describe, it} from 'node:test';

import {StealthScripts2025} from '../../../src/modules/stealth/StealthScripts2025.js';

interface StealthPageHarness {
  setUserAgent(userAgent: string): Promise<void>;
  evaluateOnNewDocument<T extends unknown[]>(
    fn: (...args: T) => unknown,
    ...args: T
  ): Promise<void>;
}

interface StealthStaticHarness {
  hideWebDriver(page: StealthPageHarness): Promise<void>;
  mockChrome(page: StealthPageHarness): Promise<void>;
  setUserAgentConsistent(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
  fixPermissions(page: StealthPageHarness): Promise<void>;
  mockPlugins(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
  mockCanvas(page: StealthPageHarness): Promise<void>;
  mockWebGL(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
  mockAudioContext(page: StealthPageHarness): Promise<void>;
  fixLanguages(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
  mockBattery(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
  fixMediaDevices(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
  mockNotifications(page: StealthPageHarness): Promise<void>;
  mockConnection(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
  mockFocus(page: StealthPageHarness): Promise<void>;
  mockPerformanceNow(page: StealthPageHarness): Promise<void>;
  mockScreen(
    page: StealthPageHarness,
    options: Record<string, unknown>,
  ): Promise<void>;
}

type StealthGlobalHarness = typeof globalThis & {
  navigator?: StealthNavigatorHarness;
  window?: StealthWindowHarness;
  document?: StealthDocumentHarness;
  Document?: new () => object;
  Notification?: StealthNotificationHarness;
  screen?: StealthScreenHarness;
  performance?: StealthPerformanceHarness;
  HTMLCanvasElement?: new () => StealthCanvasHarness;
  CanvasRenderingContext2D?: new () => StealthCanvasContextHarness;
  WebGLRenderingContext?: new () => StealthWebGLHarness;
  WebGL2RenderingContext?: new () => StealthWebGLHarness;
  AudioBuffer?: new () => StealthAudioBufferHarness;
  OfflineAudioContext?: new () => object;
};

interface StealthPermissionResult {
  state: string;
}

interface StealthNavigatorHarness {
  permissions: {
    query(descriptor: PermissionDescriptor): Promise<StealthPermissionResult>;
  };
  mediaDevices: {
    enumerateDevices(): Promise<Array<{kind: string}>>;
  };
  userAgent?: string;
  languages?: string[];
  connection?: object;
  plugins?: {
    length: number;
    item(index: number): unknown;
    namedItem(name: string): unknown;
  };
  getBattery?(): Promise<{charging: boolean; level: number}>;
}

interface StealthWindowHarness {
  navigator: StealthNavigatorHarness;
  chrome?: {
    runtime: {
      onMessage: {
        hasListeners(): boolean;
      };
    };
    loadTimes(): object;
    csi(): object;
  };
}

interface StealthDocumentHarness {
  hidden?: boolean;
  hasFocus?(): boolean;
}

interface StealthNotificationHarness {
  permission: string;
  requestPermission(): Promise<string>;
}

interface StealthScreenHarness {
  width?: number;
  height?: number;
}

interface StealthPerformanceHarness {
  now?(): number;
  timing?: {
    responseStart: number;
    domContentLoadedEventEnd: number;
    loadEventEnd: number;
    navigationStart: number;
  };
}

interface StealthCanvasContextHarness {
  getImageData(): {data: Uint8ClampedArray};
  putImageData(): void;
}

interface StealthCanvasHarness {
  width: number;
  height: number;
  getContext(): StealthCanvasContextHarness;
  toDataURL(): string;
  toBlob(callback?: (blob: null) => void): void;
}

interface StealthWebGLHarness {
  getParameter(param: number): string;
}

interface StealthAudioBufferHarness {
  copyFromChannel(
    dest: Float32Array,
    channelNumber?: number,
    startInChannel?: number,
  ): void;
  getChannelData(channelNumber?: number): Float32Array;
}

const globals = globalThis as StealthGlobalHarness;

const createStealthPage = (): StealthPageHarness => ({
  setUserAgent: async () => undefined,
  evaluateOnNewDocument: async <T extends unknown[]>(
    fn: (...args: T) => unknown,
    ...args: T
  ) => {
    fn(...args);
  },
});

describe('StealthScripts2025', () => {
  let originals: Record<string, unknown>;
  const stealth = StealthScripts2025 as unknown as StealthStaticHarness;

  beforeEach(() => {
    originals = {
      hideWebDriver: stealth.hideWebDriver,
      mockChrome: stealth.mockChrome,
      setUserAgentConsistent: stealth.setUserAgentConsistent,
      fixPermissions: stealth.fixPermissions,
      mockPlugins: stealth.mockPlugins,
      mockCanvas: stealth.mockCanvas,
      mockWebGL: stealth.mockWebGL,
      mockAudioContext: stealth.mockAudioContext,
      fixLanguages: stealth.fixLanguages,
      mockBattery: stealth.mockBattery,
      fixMediaDevices: stealth.fixMediaDevices,
      mockNotifications: stealth.mockNotifications,
      mockConnection: stealth.mockConnection,
      mockFocus: stealth.mockFocus,
      mockPerformanceNow: stealth.mockPerformanceNow,
      mockScreen: stealth.mockScreen,
    };
  });

  afterEach(() => {
    Object.assign(stealth, originals);
  });

  it('returns presets, resolves options and tracks current options', async () => {
    const presets = StealthScripts2025.getPresets();
    assert.ok(presets.length > 0);
    assert.ok(presets.some(p => p.name === 'windows-chrome'));

    const resolved = StealthScripts2025.resolveOptions({
      preset: 'linux-chrome',
      languages: ['en-US'],
    });
    assert.strictEqual(resolved.navigatorPlatform, 'Linux x86_64');
    assert.deepStrictEqual(resolved.languages, ['en-US']);

    const page: StealthPageHarness = {
      setUserAgent: async () => undefined,
      evaluateOnNewDocument: async () => undefined,
    };
    await StealthScripts2025.injectAll(
      page as unknown as Parameters<typeof StealthScripts2025.injectAll>[0],
      {
        preset: 'mac-chrome',
        mockConnection: false,
        performanceNoise: false,
        overrideScreen: false,
      },
    );
    const current = StealthScripts2025.getCurrentOptions();
    assert.strictEqual(current?.preset, 'mac-chrome');
  });

  it('injectAll honors enabled/skipped/error feature paths', async () => {
    const called: string[] = [];
    stealth.hideWebDriver = async () => {
      called.push('hideWebDriver');
    };
    stealth.mockChrome = async () => {
      called.push('mockChrome');
    };
    stealth.setUserAgentConsistent = async () => {
      called.push('setUserAgent');
    };
    stealth.fixPermissions = async () => {
      throw new Error('perm fail');
    };
    stealth.mockPlugins = async () => {
      called.push('mockPlugins');
    };
    stealth.mockCanvas = async () => {
      called.push('mockCanvas');
    };
    stealth.mockWebGL = async () => {
      called.push('mockWebGL');
    };
    stealth.mockAudioContext = async () => {
      called.push('mockAudioContext');
    };
    stealth.fixLanguages = async () => {
      called.push('fixLanguages');
    };
    stealth.mockBattery = async () => {
      called.push('mockBattery');
    };
    stealth.fixMediaDevices = async () => {
      called.push('mockMediaDevices');
    };
    stealth.mockNotifications = async () => {
      called.push('mockNotifications');
    };
    stealth.mockConnection = async () => {
      called.push('mockConnection');
    };
    stealth.mockFocus = async () => {
      called.push('focusOverride');
    };
    stealth.mockPerformanceNow = async () => {
      called.push('performanceNoise');
    };
    stealth.mockScreen = async () => {
      called.push('overrideScreen');
    };

    const page: StealthPageHarness = {
      setUserAgent: async () => undefined,
      evaluateOnNewDocument: async () => undefined,
    };

    const report = await StealthScripts2025.injectAll(
      page as unknown as Parameters<typeof StealthScripts2025.injectAll>[0],
      {
        preset: 'windows-chrome',
        mockConnection: false,
        performanceNoise: false,
        overrideScreen: false,
      },
    );

    assert.ok(called.includes('setUserAgent'));
    assert.ok(report.injectedFeatures.includes('hideWebDriver'));
    assert.ok(report.skippedFeatures.includes('mockConnection'));
    assert.ok(report.skippedFeatures.includes('performanceNoise'));
    assert.ok(report.skippedFeatures.includes('overrideScreen'));
    assert.ok(report.skippedFeatures.some(s => s.includes('fixPermissions')));
  });

  it('covers direct helper invocations and compatibility helper', async () => {
    const page: StealthPageHarness = {
      setUserAgent: async () => undefined,
      evaluateOnNewDocument: async () => undefined,
    };

    await StealthScripts2025.hideWebDriver(
      page as unknown as Parameters<typeof StealthScripts2025.hideWebDriver>[0],
    );
    await StealthScripts2025.mockChrome(
      page as unknown as Parameters<typeof StealthScripts2025.mockChrome>[0],
    );
    await StealthScripts2025.setUserAgentConsistent(
      page as unknown as Parameters<
        typeof StealthScripts2025.setUserAgentConsistent
      >[0],
      {
        userAgent: 'UA',
        navigatorPlatform: 'Win32',
        vendor: 'Google Inc.',
      },
    );
    await StealthScripts2025.fixPermissions(
      page as unknown as Parameters<
        typeof StealthScripts2025.fixPermissions
      >[0],
    );
    await StealthScripts2025.mockPlugins(
      page as unknown as Parameters<typeof StealthScripts2025.mockPlugins>[0],
      {},
    );
    await StealthScripts2025.mockCanvas(
      page as unknown as Parameters<typeof StealthScripts2025.mockCanvas>[0],
    );
    await StealthScripts2025.mockWebGL(
      page as unknown as Parameters<typeof StealthScripts2025.mockWebGL>[0],
      {},
    );
    await StealthScripts2025.mockAudioContext(
      page as unknown as Parameters<
        typeof StealthScripts2025.mockAudioContext
      >[0],
    );
    await StealthScripts2025.fixLanguages(
      page as unknown as Parameters<typeof StealthScripts2025.fixLanguages>[0],
      {},
    );
    await StealthScripts2025.mockBattery(
      page as unknown as Parameters<typeof StealthScripts2025.mockBattery>[0],
      {},
    );
    await StealthScripts2025.fixMediaDevices(
      page as unknown as Parameters<
        typeof StealthScripts2025.fixMediaDevices
      >[0],
      {},
    );
    await StealthScripts2025.mockNotifications(
      page as unknown as Parameters<
        typeof StealthScripts2025.mockNotifications
      >[0],
    );
    await StealthScripts2025.mockConnection(
      page as unknown as Parameters<
        typeof StealthScripts2025.mockConnection
      >[0],
      {},
    );
    await StealthScripts2025.mockFocus(
      page as unknown as Parameters<typeof StealthScripts2025.mockFocus>[0],
    );
    await StealthScripts2025.mockPerformanceNow(
      page as unknown as Parameters<
        typeof StealthScripts2025.mockPerformanceNow
      >[0],
    );
    await StealthScripts2025.mockScreen(
      page as unknown as Parameters<typeof StealthScripts2025.mockScreen>[0],
      {
        screen: {width: 1280, height: 720},
      },
    );

    await StealthScripts2025.setRealisticUserAgent(
      page as unknown as Parameters<
        typeof StealthScripts2025.setRealisticUserAgent
      >[0],
      'linux',
    );
  });

  it('executes injected callbacks against mocked browser globals', async () => {
    const backup = {
      navigator: globals.navigator,
      window: globals.window,
      document: globals.document,
      Document: globals.Document,
      Notification: globals.Notification,
      screen: globals.screen,
      performance: globals.performance,
    };

    class DocMock {}
    const nav: StealthNavigatorHarness = {
      permissions: {
        query: async (_p: PermissionDescriptor) => ({state: 'granted'}),
      },
      mediaDevices: {enumerateDevices: async () => []},
    };
    const doc: StealthDocumentHarness = new DocMock() as StealthDocumentHarness;
    doc.hasFocus = () => false;

    const setGlobal = (key: string, value: unknown) => {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    };

    setGlobal('navigator', nav);
    setGlobal('window', {navigator: nav});
    setGlobal('document', doc);
    setGlobal('Document', DocMock);
    setGlobal('Notification', {
      permission: 'denied',
      requestPermission: async () => 'denied',
    });
    setGlobal('screen', {});
    setGlobal('performance', {now: () => 1});

    try {
      const page = createStealthPage();

      await StealthScripts2025.setUserAgentConsistent(
        page as unknown as Parameters<
          typeof StealthScripts2025.setUserAgentConsistent
        >[0],
        {
          userAgent: 'UA-1',
          navigatorPlatform: 'Win32',
          vendor: 'Google Inc.',
          hardwareConcurrency: 16,
        },
      );
      await StealthScripts2025.fixLanguages(
        page as unknown as Parameters<
          typeof StealthScripts2025.fixLanguages
        >[0],
        {languages: ['zh-CN', 'en']},
      );
      await StealthScripts2025.mockNotifications(
        page as unknown as Parameters<
          typeof StealthScripts2025.mockNotifications
        >[0],
      );
      await StealthScripts2025.mockConnection(
        page as unknown as Parameters<
          typeof StealthScripts2025.mockConnection
        >[0],
        {
          connection: {
            effectiveType: '4g',
            downlink: 10,
            rtt: 50,
            saveData: false,
          },
        },
      );
      await StealthScripts2025.mockFocus(
        page as unknown as Parameters<typeof StealthScripts2025.mockFocus>[0],
      );
      await StealthScripts2025.mockPerformanceNow(
        page as unknown as Parameters<
          typeof StealthScripts2025.mockPerformanceNow
        >[0],
      );
      await StealthScripts2025.mockScreen(
        page as unknown as Parameters<typeof StealthScripts2025.mockScreen>[0],
        {
          screen: {width: 1200, height: 800},
        },
      );

      assert.strictEqual(globals.navigator?.userAgent, 'UA-1');
      assert.deepStrictEqual(globals.navigator?.languages, ['zh-CN', 'en']);
      assert.strictEqual(globals.Notification?.permission, 'default');
      assert.strictEqual(typeof globals.navigator?.connection, 'object');
      assert.strictEqual(globals.document?.hidden, false);
      assert.ok((globals.performance?.now?.() ?? 0) >= 1);
      assert.strictEqual(globals.screen?.width, 1200);
    } finally {
      setGlobal('navigator', backup.navigator);
      setGlobal('window', backup.window);
      setGlobal('document', backup.document);
      setGlobal('Document', backup.Document);
      setGlobal('Notification', backup.Notification);
      setGlobal('screen', backup.screen);
      setGlobal('performance', backup.performance);
    }
  });

  it('executes canvas/webgl/audio callback patches on mocked constructors', async () => {
    const backup = {
      HTMLCanvasElement: globals.HTMLCanvasElement,
      CanvasRenderingContext2D: globals.CanvasRenderingContext2D,
      WebGLRenderingContext: globals.WebGLRenderingContext,
      WebGL2RenderingContext: globals.WebGL2RenderingContext,
      AudioBuffer: globals.AudioBuffer,
      OfflineAudioContext: globals.OfflineAudioContext,
      navigator: globals.navigator,
      window: globals.window,
      document: globals.document,
      Document: globals.Document,
      Notification: globals.Notification,
      screen: globals.screen,
      performance: globals.performance,
    };
    const setGlobal = (key: string, value: unknown) => {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    };

    class CanvasCtxMock {
      getImageData() {
        return {data: new Uint8ClampedArray([10, 10, 10, 255])};
      }
      putImageData() {
        return undefined;
      }
    }
    class CanvasMock {
      width = 1;
      height = 1;
      getContext() {
        return new CanvasCtxMock();
      }
      toDataURL() {
        return 'data:orig';
      }
      toBlob(cb?: (blob: null) => void) {
        cb?.(null);
      }
    }
    class WebGL1Mock {
      getParameter(param: number) {
        return `orig-${param}`;
      }
    }
    class WebGL2Mock {
      getParameter(param: number) {
        return `orig2-${param}`;
      }
    }
    class AudioBufferMock {
      private arr = new Float32Array([0.1, 0.2]);
      copyFromChannel(dest: Float32Array) {
        dest[0] = this.arr[0]!;
      }
      getChannelData() {
        return this.arr;
      }
    }
    class DocMock {}
    const nav: StealthNavigatorHarness = {
      permissions: {
        query: async (_p: PermissionDescriptor) => ({state: 'granted'}),
      },
      mediaDevices: {enumerateDevices: async () => []},
    };

    setGlobal('HTMLCanvasElement', CanvasMock);
    setGlobal('CanvasRenderingContext2D', CanvasCtxMock);
    setGlobal('WebGLRenderingContext', WebGL1Mock);
    setGlobal('WebGL2RenderingContext', WebGL2Mock);
    setGlobal('AudioBuffer', AudioBufferMock);
    setGlobal('OfflineAudioContext', class OfflineAudioContextMock {});
    setGlobal('navigator', nav);
    setGlobal('window', {navigator: nav});
    setGlobal('document', new DocMock());
    setGlobal('Document', DocMock);
    setGlobal('Notification', {
      permission: 'default',
      requestPermission: async () => 'default',
    });
    setGlobal('screen', {});
    setGlobal('performance', {
      now: () => 1,
      timing: {
        responseStart: 1,
        domContentLoadedEventEnd: 2,
        loadEventEnd: 3,
        navigationStart: 0,
      },
    });

    try {
      const page = createStealthPage();

      await StealthScripts2025.mockCanvas(
        page as unknown as Parameters<typeof StealthScripts2025.mockCanvas>[0],
      );
      await StealthScripts2025.mockWebGL(
        page as unknown as Parameters<typeof StealthScripts2025.mockWebGL>[0],
        {
          webglVendor: 'VENDOR-X',
          webglRenderer: 'RENDERER-Y',
        },
      );
      await StealthScripts2025.mockAudioContext(
        page as unknown as Parameters<
          typeof StealthScripts2025.mockAudioContext
        >[0],
      );

      const canvas = new (globals.HTMLCanvasElement as NonNullable<
        StealthGlobalHarness['HTMLCanvasElement']
      >)();
      assert.strictEqual(canvas.toDataURL().startsWith('data:'), true);

      const gl1 = new (globals.WebGLRenderingContext as NonNullable<
        StealthGlobalHarness['WebGLRenderingContext']
      >)();
      const gl2 = new (globals.WebGL2RenderingContext as NonNullable<
        StealthGlobalHarness['WebGL2RenderingContext']
      >)();
      assert.strictEqual(gl1.getParameter(0x9245), 'VENDOR-X');
      assert.strictEqual(gl1.getParameter(0x9246), 'RENDERER-Y');
      assert.strictEqual(gl2.getParameter(0x9245), 'VENDOR-X');
      assert.strictEqual(gl2.getParameter(0x9246), 'RENDERER-Y');

      const audio = new (globals.AudioBuffer as NonNullable<
        StealthGlobalHarness['AudioBuffer']
      >)();
      const dest = new Float32Array(1);
      audio.copyFromChannel(dest, 0, 0);
      assert.notStrictEqual(dest[0], 0);
      const channel = audio.getChannelData(0);
      assert.ok(channel[0] !== undefined);
    } finally {
      setGlobal('HTMLCanvasElement', backup.HTMLCanvasElement);
      setGlobal('CanvasRenderingContext2D', backup.CanvasRenderingContext2D);
      setGlobal('WebGLRenderingContext', backup.WebGLRenderingContext);
      setGlobal('WebGL2RenderingContext', backup.WebGL2RenderingContext);
      setGlobal('AudioBuffer', backup.AudioBuffer);
      setGlobal('OfflineAudioContext', backup.OfflineAudioContext);
      setGlobal('navigator', backup.navigator);
      setGlobal('window', backup.window);
      setGlobal('document', backup.document);
      setGlobal('Document', backup.Document);
      setGlobal('Notification', backup.Notification);
      setGlobal('screen', backup.screen);
      setGlobal('performance', backup.performance);
    }
  });

  it('executes hideWebDriver/mockChrome/permissions/plugins/media/battery branches', async () => {
    const backup = {
      navigator: globals.navigator,
      window: globals.window,
      Notification: globals.Notification,
      performance: globals.performance,
      WebGLRenderingContext: globals.WebGLRenderingContext,
      WebGL2RenderingContext: globals.WebGL2RenderingContext,
    };
    const setGlobal = (key: string, value: unknown) => {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    };

    const nav: StealthNavigatorHarness = {
      permissions: {
        query: async (_p: PermissionDescriptor) => ({state: 'granted'}),
      },
      mediaDevices: {enumerateDevices: async () => []},
    };
    setGlobal('navigator', nav);
    setGlobal('window', {navigator: nav});
    setGlobal('Notification', {
      permission: 'granted',
      requestPermission: async () => 'granted',
    });
    setGlobal('performance', {
      timing: {
        responseStart: 1,
        domContentLoadedEventEnd: 2,
        loadEventEnd: 3,
        navigationStart: 0,
      },
    });
    class WebGL1Mock {
      getParameter(param: number) {
        return `orig-${param}`;
      }
    }
    // 覆盖分支：WebGL2 不存在
    setGlobal('WebGLRenderingContext', WebGL1Mock);
    setGlobal('WebGL2RenderingContext', undefined);

    try {
      const page = createStealthPage();

      await StealthScripts2025.hideWebDriver(
        page as unknown as Parameters<
          typeof StealthScripts2025.hideWebDriver
        >[0],
      );
      await StealthScripts2025.mockChrome(
        page as unknown as Parameters<typeof StealthScripts2025.mockChrome>[0],
      );
      await StealthScripts2025.fixPermissions(
        page as unknown as Parameters<
          typeof StealthScripts2025.fixPermissions
        >[0],
      );
      await StealthScripts2025.mockPlugins(
        page as unknown as Parameters<typeof StealthScripts2025.mockPlugins>[0],
        {
          plugins: [
            {
              name: 'P1',
              filename: 'p1',
              description: 'p1',
              mimeTypes: [
                {type: 'application/p1', description: 'd', suffixes: 'p1'},
              ],
            },
          ],
        },
      );
      await StealthScripts2025.mockBattery(
        page as unknown as Parameters<typeof StealthScripts2025.mockBattery>[0],
        {battery: {charging: false, level: 0.5}},
      );
      await StealthScripts2025.fixMediaDevices(
        page as unknown as Parameters<
          typeof StealthScripts2025.fixMediaDevices
        >[0],
        {
          mediaDevices: {audioInputs: 2, videoInputs: 1, speakers: 1},
        },
      );
      await StealthScripts2025.mockWebGL(
        page as unknown as Parameters<typeof StealthScripts2025.mockWebGL>[0],
        {
          webglVendor: 'Vendor-Only',
          webglRenderer: 'Renderer-Only',
        },
      );

      // hideWebDriver
      assert.strictEqual(globals.navigator?.webdriver, undefined);
      assert.strictEqual(
        Object.getOwnPropertyNames(globals.navigator ?? {}).includes(
          'webdriver',
        ),
        false,
      );
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(
          Object.getOwnPropertyDescriptors(globals.navigator ?? {}),
          'webdriver',
        ),
        false,
      );

      // mockChrome
      const chromeObj = globals.window?.chrome;
      assert.ok(chromeObj.runtime);
      assert.strictEqual(chromeObj.runtime.onMessage.hasListeners(), false);
      assert.ok(chromeObj.loadTimes());
      assert.ok(chromeObj.csi());

      // fixPermissions
      const perm = await globals.navigator!.permissions.query({
        name: 'notifications',
      });
      assert.strictEqual(perm.state, 'granted');

      // mockPlugins
      const plugins = globals.navigator?.plugins;
      assert.strictEqual(plugins.length, 1);
      assert.ok(plugins.item(0));
      assert.ok(plugins.namedItem('P1'));

      // mockBattery
      const battery = await globals.navigator!.getBattery!();
      assert.strictEqual(battery.charging, false);
      assert.strictEqual(typeof battery.level, 'number');

      // fixMediaDevices
      const devices = await globals.navigator!.mediaDevices.enumerateDevices();
      assert.strictEqual(devices.length, 4);
      assert.strictEqual(devices[0]?.kind, 'audioinput');

      // mockWebGL with no WebGL2
      const gl1 = new (globals.WebGLRenderingContext as NonNullable<
        StealthGlobalHarness['WebGLRenderingContext']
      >)();
      assert.strictEqual(gl1.getParameter(0x9245), 'Vendor-Only');
      assert.strictEqual(gl1.getParameter(0x9246), 'Renderer-Only');
    } finally {
      setGlobal('navigator', backup.navigator);
      setGlobal('window', backup.window);
      setGlobal('Notification', backup.Notification);
      setGlobal('performance', backup.performance);
      setGlobal('WebGLRenderingContext', backup.WebGLRenderingContext);
      setGlobal('WebGL2RenderingContext', backup.WebGL2RenderingContext);
    }
  });
});
