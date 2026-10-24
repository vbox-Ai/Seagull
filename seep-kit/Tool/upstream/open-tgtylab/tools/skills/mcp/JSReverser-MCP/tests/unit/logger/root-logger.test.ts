/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {logger, saveLogsToFile} from '../../../src/logger.js';

interface FakeWriteStream {
  write(chunk: string): boolean;
  on(event: string, cb: (err: Error) => void): FakeWriteStream;
  end(): void;
}

interface MutableFsModule {
  createWriteStream: typeof fs.createWriteStream;
}

interface MutableProcess {
  exit(code: number): never;
}

type ConsoleErrorFn = typeof console.error;

describe('root logger', () => {
  it('saves debug logs to a file', async () => {
    const dir = path.resolve('JSReverser-MCP/tests/.tmp/root-logger');
    fs.mkdirSync(dir, {recursive: true});

    const file = path.join(dir, `log-${Date.now()}.txt`);
    const stream = saveLogsToFile(file);

    logger('hello from logger test');

    await new Promise<void>(resolve => {
      stream.end(() => resolve());
    });

    const content = fs.readFileSync(file, 'utf-8');
    assert.ok(content.includes('hello from logger test'));
  });

  it('handles write stream error callback by ending stream and exiting', () => {
    const originalCreate = fs.createWriteStream;
    const originalExit = process.exit;
    const originalConsoleError = console.error;

    let errorHandler: ((err: Error) => void) | null = null;
    let endCalled = 0;
    const fakeStream: FakeWriteStream = {
      write: () => true,
      on: (event: string, cb: (err: Error) => void) => {
        if (event === 'error') {
          errorHandler = cb;
        }
        return fakeStream;
      },
      end: () => {
        endCalled += 1;
      },
    };

    (fs as unknown as MutableFsModule).createWriteStream = () =>
      fakeStream as unknown as ReturnType<typeof fs.createWriteStream>;
    let exitCode: number | null = null;
    (process as unknown as MutableProcess).exit = (code: number) => {
      exitCode = code;
      throw new Error('__exit_called__');
    };
    let errorLogged = '';
    console.error = ((msg?: unknown) => {
      errorLogged = String(msg ?? '');
    }) as ConsoleErrorFn;

    try {
      saveLogsToFile('/tmp/fake-log.txt');
      assert.ok(errorHandler);
      assert.throws(
        () => errorHandler!(new Error('disk full')),
        /__exit_called__/,
      );
      assert.strictEqual(endCalled, 1);
      assert.strictEqual(exitCode, 1);
      assert.ok(errorLogged.includes('Error when opening/writing to log file'));
    } finally {
      (fs as unknown as MutableFsModule).createWriteStream = originalCreate;
      (process as unknown as MutableProcess).exit =
        originalExit as unknown as MutableProcess['exit'];
      console.error = originalConsoleError;
    }
  });
});
