/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

const repoRoot = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('parameter workflow contribution docs', () => {
  it('documents how to export, validate, and contribute workflows', async () => {
    const readme = await readRepoFile('README.md');
    const readmeEn = await readRepoFile('README.en.md');
    const guide = await readRepoFile(
      'docs/guides/parameter-workflow-contribution.md',
    );

    assert.ok(readme.includes('docs/knowledge/parameter-blueprints/'));
    assert.ok(readme.includes('参数蓝图库'));
    assert.ok(readme.includes('--list-parameter-workflows'));
    assert.ok(
      readme.includes('docs/guides/parameter-workflow-contribution.md'),
    );

    assert.ok(readmeEn.includes('parameter blueprint knowledge base'));
    assert.ok(readmeEn.includes('--show-parameter-workflow jd-h5st'));
    assert.ok(
      readmeEn.includes('docs/guides/parameter-workflow-contribution.md'),
    );

    assert.ok(guide.includes('--export-parameter-workflow-template'));
    assert.ok(guide.includes('--validate-parameter-workflow'));
    assert.ok(guide.includes('metadata.json'));
    assert.ok(guide.includes('workflow.md'));
    assert.ok(guide.includes('不要提交完整可运行实现'));
  });
});
