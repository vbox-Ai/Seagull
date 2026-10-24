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

async function readJson<T>(relativePath: string): Promise<T> {
  const content = await readFile(path.join(repoRoot, relativePath), 'utf8');
  return JSON.parse(content) as T;
}

describe('parameter workflow packaging', () => {
  it('copies knowledge base docs into build/docs output', async () => {
    const index = await readJson<{
      workflows: Array<{id: string; path: string}>;
    }>('build/docs/knowledge/parameter-blueprints/index.json');

    assert.ok(index.workflows.length >= 3);
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/generic-header-sign/metadata.json',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/generic-header-sign/workflow.md',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/jd-h5st/metadata.json',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/jd-h5st/workflow.md',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/jd-h5st/parts.json',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/jd-h5st/mutations.json',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/douyin-a-bogus/parts.json',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/douyin-a-bogus/mutations.json',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/ks-hxfalcon/parts.json',
      ),
    );
    await access(
      path.join(
        repoRoot,
        'build/docs/knowledge/parameter-blueprints/ks-hxfalcon/mutations.json',
      ),
    );
  });
});
