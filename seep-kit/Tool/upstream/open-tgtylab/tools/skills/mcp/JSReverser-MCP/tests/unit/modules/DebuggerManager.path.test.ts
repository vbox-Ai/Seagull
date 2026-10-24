/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

import {DebuggerManager} from '../../../src/modules/debugger/DebuggerManager.js';
import {resolveDefaultDebuggerSessionsDir} from '../../../src/utils/projectPaths.js';

describe('DebuggerManager default session paths', () => {
  it('saves and lists sessions under the package-root debugger-sessions directory', async () => {
    const originalCwd = process.cwd;
    const fakeCwd = path.join(
      path.parse(process.cwd()).root,
      'Windows',
      'system32',
    );
    const manager = new DebuggerManager({} as never);

    process.cwd = () => fakeCwd;

    let savedPath = '';
    try {
      savedPath = await manager.saveSession(undefined, {source: 'unit-test'});
      const expectedRoot = resolveDefaultDebuggerSessionsDir(import.meta.url);

      assert.ok(savedPath.startsWith(expectedRoot));
      assert.ok(!savedPath.startsWith(fakeCwd));

      const sessions = await manager.listSavedSessions();
      assert.ok(sessions.some(session => session.path === savedPath));
    } finally {
      process.cwd = originalCwd;
      if (savedPath) {
        await rm(savedPath, {force: true});
      }
    }
  });
});
