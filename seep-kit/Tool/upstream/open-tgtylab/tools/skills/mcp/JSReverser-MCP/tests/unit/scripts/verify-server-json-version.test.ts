/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {verifyServerJsonVersion} from '../../../scripts/verify-server-json-version.js';

async function withTempProject(
  files: Record<string, string>,
  fn: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), 'jsreverser-version-check-'),
  );
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      await writeFile(path.join(projectRoot, relativePath), content);
    }
    await fn(projectRoot);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
}

describe('verify-server-json-version script', () => {
  it('skips cleanly when server.json is absent', async () => {
    await withTempProject(
      {'package.json': JSON.stringify({version: '2.0.4'})},
      async projectRoot => {
        const message = await verifyServerJsonVersion(projectRoot);
        assert.match(message, /No server\.json found/);
        assert.match(message, /2\.0\.4/);
      },
    );
  });

  it('passes when server.json and package.json versions match', async () => {
    await withTempProject(
      {
        'package.json': JSON.stringify({version: '2.0.4'}),
        'server.json': JSON.stringify({version: '2.0.4'}),
      },
      async projectRoot => {
        const message = await verifyServerJsonVersion(projectRoot);
        assert.strictEqual(
          message,
          'server.json version matches package.json (2.0.4).',
        );
      },
    );
  });

  it('fails when server.json and package.json versions differ', async () => {
    await withTempProject(
      {
        'package.json': JSON.stringify({version: '2.0.4'}),
        'server.json': JSON.stringify({version: '2.0.3'}),
      },
      async projectRoot => {
        await assert.rejects(
          () => verifyServerJsonVersion(projectRoot),
          /server\.json version 2\.0\.3 does not match package\.json version 2\.0\.4/,
        );
      },
    );
  });
});
