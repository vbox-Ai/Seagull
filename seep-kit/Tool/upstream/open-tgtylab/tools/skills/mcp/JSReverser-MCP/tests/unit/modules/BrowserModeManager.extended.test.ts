/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import fs from 'node:fs';
import {afterEach, beforeEach, describe, it} from 'node:test';

import puppeteer from 'puppeteer-core';

import {BrowserModeManager} from '../../../src/modules/browser/BrowserModeManager.js';
import {StealthScripts2025} from '../../../src/modules/stealth/StealthScripts2025.js';
import {logger} from '../../../src/utils/logger.js';

interface BrowserLaunchHarness {
  isConnected(): boolean;
  disconnect?(): Promise<void>;
  newPage?(): Promise<PageHarness>;
}

interface PageHarness {
  evaluateOnNewDocument(): Promise<void>;
  on(event: string, handler: () => void): void;
  setCacheEnabled(value: boolean): Promise<void>;
  setBypassCSP(value: boolean): Promise<void>;
  setJavaScriptEnabled(value: boolean): Promise<void>;
  setCookie(...cookies: Array<{name: string; value: string}>): Promise<void>;
  goto?(url: string): Promise<void>;
}

interface BrowserManagerHarness {
  detectAllBrowsers(): Array<{name: string; path: string}>;
  waitForBrowser(timeout: number): Promise<void>;
  launchBrowserProcess(): Promise<void>;
  injectAntiDetectionScripts(page: PageHarness): Promise<void>;
  launch(): Promise<BrowserLaunchHarness>;
  newPage(): Promise<PageHarness>;
  getCurrentPage(): PageHarness | null;
  browser: BrowserLaunchHarness | null;
  currentPage: PageHarness | null;
  sessionData: {cookies?: Array<{name: string; value: string}>};
  browserProcess?: {killed: boolean; kill(signal: string): void} | null;
  autoLaunched?: boolean;
}

interface BrowserModeManagerStaticHarness {
  detectedBrowsersCache: Array<{name: string; path: string}> | null;
}

describe('BrowserModeManager extended', () => {
  let originalConnect: typeof puppeteer.connect;
  let originalInfo: typeof logger.info;
  let originalWarn: typeof logger.warn;
  let originalError: typeof logger.error;
  let originalSuccess: typeof logger.success;

  beforeEach(() => {
    originalConnect = puppeteer.connect;
    originalInfo = logger.info.bind(logger);
    originalWarn = logger.warn.bind(logger);
    originalError = logger.error.bind(logger);
    originalSuccess = logger.success.bind(logger);
    logger.info = () => undefined;
    logger.warn = () => undefined;
    logger.error = () => undefined;
    logger.success = () => undefined;
  });

  afterEach(() => {
    puppeteer.connect = originalConnect;
    logger.info = originalInfo;
    logger.warn = originalWarn;
    logger.error = originalError;
    logger.success = originalSuccess;
    (
      BrowserModeManager as unknown as BrowserModeManagerStaticHarness
    ).detectedBrowsersCache = null;
    (
      StealthScripts2025 as unknown as {
        injectAll: typeof StealthScripts2025.injectAll;
      }
    ).injectAll = originalInjectAll;
  });

  let originalInjectAll: typeof StealthScripts2025.injectAll;

  beforeEach(() => {
    originalInjectAll = StealthScripts2025.injectAll;
  });

  it('detects custom browser path when provided', () => {
    const manager = new BrowserModeManager({
      browserPath: process.cwd(),
      autoLaunch: false,
      useStealthScripts: false,
    });
    const list = (
      manager as unknown as BrowserManagerHarness
    ).detectAllBrowsers();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0]?.name, 'Custom Browser');
  });

  it('waitForBrowser succeeds when connect works and fails on timeout', async () => {
    const manager = new BrowserModeManager({
      autoLaunch: false,
      useStealthScripts: false,
    });

    puppeteer.connect = (async () =>
      ({disconnect: () => undefined}) as unknown as Awaited<
        ReturnType<typeof puppeteer.connect>
      >) as typeof puppeteer.connect;
    await (manager as unknown as BrowserManagerHarness).waitForBrowser(20);

    puppeteer.connect = (async () => {
      throw new Error('down');
    }) as typeof puppeteer.connect;
    await assert.rejects(async () => {
      await (manager as unknown as BrowserManagerHarness).waitForBrowser(30);
    }, /Browser failed to start within 30ms at http:\/\/127\.0\.0\.1:9222.*down/);
  });

  it('launch handles direct connect, autoLaunch fallback, and no-autoLaunch failure', async () => {
    const manager = new BrowserModeManager({
      autoLaunch: true,
      useStealthScripts: false,
    });

    // direct connect success
    const browser: BrowserLaunchHarness = {isConnected: () => true};
    puppeteer.connect = (async () =>
      browser as unknown as Awaited<
        ReturnType<typeof puppeteer.connect>
      >) as typeof puppeteer.connect;
    const direct = await manager.launch();
    assert.strictEqual(direct, browser as unknown as typeof direct);

    // force reconnect path
    (manager as unknown as BrowserManagerHarness).browser = null;
    let callCount = 0;
    puppeteer.connect = (async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('first failed');
      }
      return browser as unknown as Awaited<
        ReturnType<typeof puppeteer.connect>
      >;
    }) as typeof puppeteer.connect;
    (manager as unknown as BrowserManagerHarness).launchBrowserProcess =
      async () => undefined;
    const fallback = await manager.launch();
    assert.strictEqual(fallback, browser as unknown as typeof fallback);

    // no autoLaunch -> throw
    const managerNoAuto = new BrowserModeManager({
      autoLaunch: false,
      useStealthScripts: false,
      remoteDebuggingPort: 9333,
    });
    puppeteer.connect = (async () => {
      throw new Error('connect fail');
    }) as typeof puppeteer.connect;
    await assert.rejects(async () => {
      await managerNoAuto.launch();
    }, /Failed to connect to browser/);
  });

  it('injects anti-detection scripts and exposes getters', async () => {
    const manager = new BrowserModeManager({
      autoLaunch: false,
      useStealthScripts: false,
    });

    let injected = 0;
    const browser: BrowserLaunchHarness = {isConnected: () => true};
    const page: PageHarness = {
      evaluateOnNewDocument: async () => {
        injected += 1;
      },
      on: () => undefined,
      setCacheEnabled: async () => undefined,
      setBypassCSP: async () => undefined,
      setJavaScriptEnabled: async () => undefined,
      setCookie: async () => undefined,
    };
    await (
      manager as unknown as BrowserManagerHarness
    ).injectAntiDetectionScripts(page);
    assert.strictEqual(injected, 1);

    (manager as unknown as BrowserManagerHarness).browser = browser;
    (manager as unknown as BrowserManagerHarness).currentPage = page;
    assert.ok(manager.getBrowser());
    assert.ok(manager.getCurrentPage());
  });

  it('returns cached detected browser list when available', () => {
    (
      BrowserModeManager as unknown as BrowserModeManagerStaticHarness
    ).detectedBrowsersCache = [{name: 'Cached', path: '/tmp/browser'}];
    const manager = new BrowserModeManager({
      autoLaunch: false,
      useStealthScripts: false,
    });

    const list = (
      manager as unknown as BrowserManagerHarness
    ).detectAllBrowsers();
    assert.deepStrictEqual(list, [{name: 'Cached', path: '/tmp/browser'}]);
  });

  it('newPage triggers stealth injection when enabled', async () => {
    let injected = 0;
    (
      StealthScripts2025 as unknown as {
        injectAll: typeof StealthScripts2025.injectAll;
      }
    ).injectAll = async () => {
      injected += 1;
      return {
        preset: 'linux-chrome',
        injectedFeatures: ['x'],
        skippedFeatures: [],
        userAgent: 'ua',
        platform: 'linux',
        scriptCount: 1,
        injectedScripts: ['x'],
        errors: [],
      };
    };

    const manager = new BrowserModeManager({
      autoLaunch: false,
      useStealthScripts: true,
      stealthPreset: 'linux-chrome',
    });

    const page: PageHarness = {
      on: () => undefined,
      setCacheEnabled: async () => undefined,
      setBypassCSP: async () => undefined,
      setJavaScriptEnabled: async () => undefined,
      setCookie: async () => undefined,
      evaluateOnNewDocument: async () => undefined,
    };
    (manager as unknown as BrowserManagerHarness).browser = {
      newPage: async () => page,
      isConnected: () => true,
    };

    await manager.newPage();
    assert.strictEqual(injected, 1);
  });

  it('launchBrowserProcess covers empty and success paths', async () => {
    const manager = new BrowserModeManager({
      autoLaunch: true,
      useStealthScripts: false,
      remoteDebuggingPort: 9555,
      waitForBrowserTimeoutMs: 10,
      waitForBrowserPollMs: 1,
    });

    (manager as unknown as BrowserManagerHarness).detectAllBrowsers = () => [];
    await assert.rejects(async () => {
      await (
        manager as unknown as BrowserManagerHarness
      ).launchBrowserProcess();
    }, /Cannot find browser executable/);

    (manager as unknown as BrowserManagerHarness).detectAllBrowsers = () => [
      {name: 'Echo', path: '/bin/echo'},
      {name: 'Echo2', path: '/bin/echo'},
    ];
    (manager as unknown as BrowserManagerHarness).waitForBrowser = async () =>
      undefined;

    await (manager as unknown as BrowserManagerHarness).launchBrowserProcess();
    assert.strictEqual(
      (manager as unknown as {autoLaunched: boolean}).autoLaunched,
      true,
    );
    assert.ok((manager as unknown as {browserProcess: unknown}).browserProcess);
  });

  it('covers detectAllBrowsers default scan path and goto branches', async () => {
    const manager = new BrowserModeManager({
      autoLaunch: false,
      useStealthScripts: false,
    });

    const found = (
      manager as unknown as BrowserManagerHarness
    ).detectAllBrowsers();
    assert.ok(Array.isArray(found));

    await assert.rejects(async () => {
      await manager.goto('https://example.com');
    }, /No page available/);

    let navigated = 0;
    const page = {
      goto: async (url: string) => {
        navigated += Number(url.includes('example.com'));
      },
    };
    (manager as unknown as BrowserManagerHarness).currentPage =
      page as unknown as PageHarness;
    const out = await manager.goto('https://example.com');
    assert.strictEqual(out, page as unknown as typeof out);
    assert.strictEqual(navigated, 1);
  });

  it('covers launch autoLaunch failure branch with actionable message', async () => {
    const manager = new BrowserModeManager({
      autoLaunch: true,
      useStealthScripts: false,
      remoteDebuggingPort: 9444,
    });

    puppeteer.connect = (async () => {
      throw new Error('connect failed');
    }) as typeof puppeteer.connect;
    (manager as unknown as BrowserManagerHarness).launchBrowserProcess =
      async () => {
        throw new Error('spawn failed');
      };

    await assert.rejects(async () => {
      await manager.launch();
    }, /Failed to connect and auto-launch browser/);
  });

  it('covers newPage launch-on-demand and close handler cleanup', async () => {
    const manager = new BrowserModeManager({
      autoLaunch: false,
      useStealthScripts: false,
    }) as unknown as BrowserManagerHarness;

    let closeHandler: (() => void) | undefined;
    const page = {
      on: (event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      },
      setCacheEnabled: async () => undefined,
      setBypassCSP: async () => undefined,
      setJavaScriptEnabled: async () => undefined,
      setCookie: async () => undefined,
      evaluateOnNewDocument: async () => undefined,
    };

    manager.injectAntiDetectionScripts = async () => undefined;
    manager.launch = async () => {
      manager.browser = {newPage: async () => page, isConnected: () => true};
      return manager.browser;
    };
    manager.sessionData = {cookies: [{name: 'k', value: 'v'}]};

    const out = await manager.newPage();
    assert.strictEqual(out, page as unknown as typeof out);
    assert.ok(closeHandler);

    closeHandler!();
    assert.strictEqual(manager.getCurrentPage(), null);
  });

  it('covers windows scanning branch and registerFound dedupe', () => {
    const originalPlatform = process.platform;
    const fakeWinPath = 'C:\\Google\\Chrome\\Application\\chrome.exe';

    // On POSIX, this is treated as a normal relative filename and can be created.
    fs.writeFileSync(fakeWinPath, 'x');
    Object.defineProperty(process, 'platform', {value: 'win32'});

    try {
      const manager = new BrowserModeManager({
        autoLaunch: false,
        useStealthScripts: false,
      });

      const list = (
        manager as unknown as BrowserManagerHarness
      ).detectAllBrowsers();
      assert.ok(
        list.some((b: {path: string}) => String(b.path).includes(fakeWinPath)),
      );

      // cached branch still works after first detection
      const list2 = (
        manager as unknown as BrowserManagerHarness
      ).detectAllBrowsers();
      assert.ok(Array.isArray(list2));
    } finally {
      Object.defineProperty(process, 'platform', {value: originalPlatform});
      if (fs.existsSync(fakeWinPath)) {
        try {
          fs.unlinkSync(fakeWinPath);
        } catch {
          // Ignore cleanup errors on environments where this path is protected.
        }
      }
      (
        BrowserModeManager as unknown as BrowserModeManagerStaticHarness
      ).detectedBrowsersCache = null;
    }
  });

  it('executes anti-detection callback and close cleanup branches', async () => {
    const globals = globalThis as typeof globalThis & {
      navigator?: {
        permissions: {
          query: (permission: {name: string}) => Promise<{state: string}>;
        };
        webdriver?: undefined;
      };
      window?: {
        navigator: {
          permissions: {
            query: (permission: {name: string}) => Promise<{state: string}>;
          };
        };
        chrome?: unknown;
      };
      Notification?: {permission: string};
    };
    const backup = {
      navigator: globals.navigator,
      window: globals.window,
      Notification: globals.Notification,
    };
    const setGlobal = (key: string, value: unknown) => {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    };

    const nav = {
      permissions: {
        query: (_p: {name: string}) => Promise.resolve({state: 'granted'}),
      },
    };
    setGlobal('navigator', nav);
    setGlobal('window', {navigator: nav});
    setGlobal('Notification', {permission: 'default'});

    try {
      const manager = new BrowserModeManager({
        autoLaunch: false,
        useStealthScripts: false,
      });
      const page = {
        evaluateOnNewDocument: async (fn: () => void) => {
          fn();
        },
        on: () => undefined,
        setCacheEnabled: async () => undefined,
        setBypassCSP: async () => undefined,
        setJavaScriptEnabled: async () => undefined,
        setCookie: async () => undefined,
      } as unknown as PageHarness & {
        evaluateOnNewDocument(fn: () => void): Promise<void>;
      };
      await (
        manager as unknown as BrowserManagerHarness
      ).injectAntiDetectionScripts(page);
      const navigatorState = globals.navigator as
        | {webdriver?: undefined}
        | undefined;
      assert.strictEqual(navigatorState?.webdriver, undefined);

      const killer = {
        killed: false,
        kill: () => {
          killer.killed = true;
        },
      };
      (manager as unknown as BrowserManagerHarness).browser = {
        disconnect: async () => {
          throw new Error('disconnect failed');
        },
        isConnected: () => true,
      };
      (manager as unknown as BrowserManagerHarness).browserProcess = killer;
      (manager as unknown as BrowserManagerHarness).autoLaunched = true;

      await manager.close();
      assert.strictEqual(
        (manager as unknown as BrowserManagerHarness).browser,
        null,
      );
      assert.strictEqual(
        (manager as unknown as BrowserManagerHarness).currentPage,
        null,
      );
      assert.strictEqual(
        (manager as unknown as BrowserManagerHarness).autoLaunched,
        false,
      );
      assert.strictEqual(killer.killed, true);
    } finally {
      setGlobal('navigator', backup.navigator);
      setGlobal('window', backup.window);
      setGlobal('Notification', backup.Notification);
    }
  });
});
