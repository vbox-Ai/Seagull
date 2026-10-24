/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';

import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';

function findPackageRoot(fromDir: string): string {
  let currentDir = fromDir;

  while (true) {
    if (existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Unable to find package.json from ${fromDir}`);
    }
    currentDir = parentDir;
  }
}

describe('ReverseTaskStore', () => {
  it('resolves the default task root from the package root instead of process cwd', () => {
    const originalCwd = process.cwd;
    const fakeCwd = path.join(
      path.parse(process.cwd()).root,
      'Windows',
      'system32',
    );
    const repoRoot = findPackageRoot(
      path.dirname(fileURLToPath(import.meta.url)),
    );

    process.cwd = () => fakeCwd;

    try {
      const store = new ReverseTaskStore();

      assert.strictEqual(
        store.rootDir,
        path.join(repoRoot, 'artifacts', 'tasks'),
      );
      assert.notStrictEqual(
        store.rootDir,
        path.join(fakeCwd, 'artifacts', 'tasks'),
      );
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('supports explicit rootDir override for arbitrary working directories or custom storage locations', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-custom-artifacts-'),
    );

    try {
      const store = new ReverseTaskStore({rootDir});
      assert.strictEqual(store.rootDir, rootDir);
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('creates and reopens a reverse task with durable JSON and JSONL artifacts', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-mcp-task-store-'),
    );

    try {
      const store = new ReverseTaskStore({rootDir});
      const task = await store.openTask({
        taskId: '20260304-demo-task',
        slug: 'demo-task',
        targetUrl: 'https://example.com/app.js',
        goal: 'rebuild signature flow',
      });

      await task.appendTimeline({
        stage: 'observe',
        action: 'new_page',
        status: 'ok',
      });
      await task.writeSnapshot('cookies.json', {
        cookies: [
          {
            name: 'sessionid',
            value: 'abc123',
          },
        ],
      });

      const reopened = await store.openTask({
        taskId: '20260304-demo-task',
        slug: 'demo-task',
        targetUrl: 'https://example.com/app.js',
        goal: 'rebuild signature flow',
      });
      await reopened.appendTimeline({
        stage: 'capture',
        action: 'create_hook',
        status: 'ok',
      });

      const taskJson = JSON.parse(
        await readFile(
          path.join(rootDir, '20260304-demo-task', 'task.json'),
          'utf8',
        ),
      );
      assert.strictEqual(taskJson.taskId, '20260304-demo-task');
      assert.strictEqual(taskJson.slug, 'demo-task');
      assert.strictEqual(taskJson.targetUrl, 'https://example.com/app.js');
      assert.strictEqual(taskJson.goal, 'rebuild signature flow');

      const cookiesJson = JSON.parse(
        await readFile(
          path.join(rootDir, '20260304-demo-task', 'cookies.json'),
          'utf8',
        ),
      );
      assert.deepStrictEqual(cookiesJson, {
        cookies: [
          {
            name: 'sessionid',
            value: 'abc123',
          },
        ],
      });

      const timelineLines = (
        await readFile(
          path.join(rootDir, '20260304-demo-task', 'timeline.jsonl'),
          'utf8',
        )
      )
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));

      assert.strictEqual(timelineLines.length, 2);
      assert.strictEqual(timelineLines[0].stage, 'observe');
      assert.strictEqual(timelineLines[0].action, 'new_page');
      assert.strictEqual(timelineLines[1].stage, 'capture');
      assert.strictEqual(timelineLines[1].action, 'create_hook');
      assert.ok(typeof timelineLines[0].timestamp === 'number');
      assert.ok(typeof timelineLines[1].timestamp === 'number');
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
