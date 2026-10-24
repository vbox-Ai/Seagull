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

async function readJson<T>(relativePath: string): Promise<T> {
  const content = await readFile(path.join(repoRoot, relativePath), 'utf8');
  return JSON.parse(content) as T;
}

describe('parameter blueprint knowledge base docs', () => {
  it('defines the workflow library index and starter workflows', async () => {
    const index = await readJson<{
      schemaVersion: string;
      libraryVersion: string;
      workflows: Array<{id: string; path: string}>;
    }>('docs/knowledge/parameter-blueprints/index.json');

    assert.strictEqual(index.schemaVersion, '1.0');
    assert.ok(index.libraryVersion);

    const workflowIds = index.workflows.map(item => item.id).sort();
    assert.deepStrictEqual(workflowIds, [
      'douyin-a-bogus',
      'generic-header-sign',
      'generic-query-token',
      'jd-h5st',
      'ks-hxfalcon',
    ]);

    for (const item of index.workflows) {
      const metadata = await readJson<{
        id: string;
        title: string;
        aliases: string[];
        category: string;
        status: string;
        version: string;
        lastUpdated: string;
        summary: string;
      }>(`docs/knowledge/parameter-blueprints/${item.path}/metadata.json`);
      const workflow = await readFile(
        path.join(
          repoRoot,
          `docs/knowledge/parameter-blueprints/${item.path}/workflow.md`,
        ),
        'utf8',
      );

      assert.strictEqual(metadata.id, item.id);
      assert.ok(metadata.title);
      assert.ok(Array.isArray(metadata.aliases));
      assert.ok(metadata.category);
      assert.ok(metadata.status);
      assert.ok(metadata.version);
      assert.ok(metadata.lastUpdated);
      assert.ok(metadata.summary);
      assert.ok(workflow.includes('## 适用范围'));
      assert.ok(workflow.includes('## 目标契约'));
      assert.ok(workflow.includes('## 推荐工具顺序'));
      assert.ok(workflow.includes('## 步骤清单'));
      assert.ok(workflow.includes('## 失败分支与转向'));
      assert.ok(workflow.includes('## 验收标准'));
      assert.ok(workflow.includes('## 成功判定'));
      assert.ok(workflow.includes('## 禁止事项'));
    }

    const h5stParts = await readJson<{
      parameter: string;
      parts: Array<{index: number; name: string}>;
    }>('docs/knowledge/parameter-blueprints/jd-h5st/parts.json');
    const h5stMutations = await readJson<{
      parameter: string;
      mutations: Array<{id: string; applies_to_part: number}>;
    }>('docs/knowledge/parameter-blueprints/jd-h5st/mutations.json');
    const douyinParts = await readJson<{
      parameter: string;
      parts: Array<{index: number; name: string}>;
    }>('docs/knowledge/parameter-blueprints/douyin-a-bogus/parts.json');
    const douyinMutations = await readJson<{
      parameter: string;
      mutations: Array<{id: string; applies_to_part: number}>;
    }>('docs/knowledge/parameter-blueprints/douyin-a-bogus/mutations.json');
    const falconParts = await readJson<{
      parameter: string;
      parts: Array<{index: number; name: string}>;
    }>('docs/knowledge/parameter-blueprints/ks-hxfalcon/parts.json');
    const falconMutations = await readJson<{
      parameter: string;
      mutations: Array<{id: string; applies_to_part: number}>;
    }>('docs/knowledge/parameter-blueprints/ks-hxfalcon/mutations.json');

    assert.strictEqual(h5stParts.parameter, 'h5st');
    assert.strictEqual(h5stParts.parts.length, 10);
    assert.ok(h5stParts.parts.some(item => item.name === 'body_digest'));
    assert.strictEqual(h5stMutations.parameter, 'h5st');
    assert.ok(
      h5stMutations.mutations.some(
        item => item.id === 'field-ordering-normalization',
      ),
    );

    assert.strictEqual(douyinParts.parameter, 'a_bogus');
    assert.ok(douyinParts.parts.length >= 6);
    assert.ok(
      douyinParts.parts.some(item => item.name === 'send_time_patch_segment'),
    );
    assert.strictEqual(douyinMutations.parameter, 'a_bogus');
    assert.ok(
      douyinMutations.mutations.some(
        item => item.id === 'send-time-patch-variant',
      ),
    );

    assert.strictEqual(falconParts.parameter, '__NS_hxfalcon');
    assert.ok(falconParts.parts.length >= 6);
    assert.ok(
      falconParts.parts.some(item => item.name === 'vm_bridge_segment'),
    );
    assert.strictEqual(falconMutations.parameter, '__NS_hxfalcon');
    assert.ok(
      falconMutations.mutations.some(
        item => item.id === 'vm-bridge-callback-variant',
      ),
    );
  });
});
