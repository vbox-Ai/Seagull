/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ToolExecutionScheduler} from '../../../src/utils/ToolExecutionScheduler.js';

describe('ToolExecutionScheduler', () => {
  it('serializes write operations', async () => {
    const scheduler = new ToolExecutionScheduler();
    const order: string[] = [];

    await Promise.all([
      scheduler.execute(false, async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        order.push('a');
        return 1;
      }),
      scheduler.execute(false, async () => {
        order.push('b');
        return 2;
      }),
    ]);

    assert.deepStrictEqual(order, ['a', 'b']);
  });

  it('allows read-only operations to run concurrently', async () => {
    const scheduler = new ToolExecutionScheduler();
    const start = Date.now();
    await Promise.all([
      scheduler.execute(
        true,
        async () => new Promise(resolve => setTimeout(resolve, 40)),
      ),
      scheduler.execute(
        true,
        async () => new Promise(resolve => setTimeout(resolve, 40)),
      ),
    ]);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 75);
  });

  it('runs higher-priority queued writes first', async () => {
    const scheduler = new ToolExecutionScheduler();
    const order: string[] = [];

    await Promise.all([
      scheduler.execute(false, async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push('first');
      }),
      scheduler.execute(
        false,
        async () => {
          order.push('low');
        },
        {priority: 1},
      ),
      scheduler.execute(
        false,
        async () => {
          order.push('high');
        },
        {priority: 10},
      ),
    ]);

    assert.deepStrictEqual(order, ['first', 'high', 'low']);
  });

  it('times out slow operations', async () => {
    const scheduler = new ToolExecutionScheduler();

    await assert.rejects(
      () =>
        scheduler.execute(
          true,
          async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
          },
          {timeoutMs: 5},
        ),
      /timed out after 5ms/,
    );
  });
});
