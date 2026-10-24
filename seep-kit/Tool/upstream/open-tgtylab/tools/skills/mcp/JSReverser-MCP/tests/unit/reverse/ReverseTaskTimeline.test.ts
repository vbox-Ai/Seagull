/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {startReverseTask} from '../../../src/reverse/ReverseTaskBootstrap.js';
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {appendReverseTimeline} from '../../../src/reverse/ReverseTaskTimeline.js';

describe('ReverseTaskTimeline', () => {
  it('appends explicit timeline entries to an existing task', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-task-timeline-'),
    );
    try {
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-timeline-001',
        taskSlug: 'timeline-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'append timeline',
      });

      const result = await appendReverseTimeline(store, {
        taskId: 'task-timeline-001',
        stage: 'observe',
        action: 'inspect network',
        status: 'ok',
        result: 'target request confirmed',
        next: 'inject hook',
      });

      const timeline = (await readFile(result.timelineFile, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.ok(timeline.length >= 2);
      const last = timeline.at(-1) as Record<string, unknown>;
      assert.strictEqual(last.action, 'inspect network');
      assert.strictEqual(last.next, 'inject hook');
    } finally {
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
