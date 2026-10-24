/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

const repoRoot = process.cwd();

async function readJson(relativePath: string): Promise<unknown> {
  const content = await readFile(path.join(repoRoot, relativePath), 'utf8');
  return JSON.parse(content);
}

async function assertExists(relativePath: string): Promise<void> {
  await access(path.join(repoRoot, relativePath));
}

describe('reference docs packaging', () => {
  it('publishes core and extra reference docs into build output with a manifest', async () => {
    const manifest = (await readJson('build/docs-manifest.json')) as {
      core: Record<string, string>;
      extra: Record<string, string>;
    };

    assert.deepStrictEqual(Object.keys(manifest.core).sort(), [
      'case-safety-policy',
      'env-patching',
      'pure-extraction',
      'reverse-bootstrap',
      'reverse-task-index',
      'reverse-workflow',
      'tool-io-contract',
    ]);

    assert.deepStrictEqual(Object.keys(manifest.extra).sort(), [
      'algorithm-upgrade-template',
      'reverse-artifacts',
      'reverse-report-template',
      'reverse-update-prompt-template',
      'tool-reference',
    ]);

    for (const relativePath of [
      ...Object.values(manifest.core),
      ...Object.values(manifest.extra),
    ]) {
      assert.ok(relativePath.startsWith('build/docs/'));
      await assertExists(relativePath);
    }

    await assertExists('build/docs/reference-core/reverse-workflow.md');
    await assertExists('build/docs/reference-extra/tool-reference.md');
  });

  it('declares packaged build docs in package.json publish files', async () => {
    const packageJson = (await readJson('package.json')) as {files?: string[]};
    assert.ok(packageJson.files?.includes('build/docs'));
    assert.ok(packageJson.files?.includes('build/docs-manifest.json'));
  });
});
