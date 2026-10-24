/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {WaitForHelper} from '../../src/WaitForHelper.js';

describe('WaitForHelper', () => {
  it('rethrows action errors from waitForEventsAfterAction', async () => {
    const page = {
      _client() {
        return {
          on: () => undefined,
          off: () => undefined,
        };
      },
      evaluateHandle: async () => ({
        evaluate: async () => undefined,
        dispose: async () => undefined,
      }),
      waitForNavigation: async () => undefined,
    };

    const helper = new WaitForHelper(page as never, 1, 1);

    await assert.rejects(
      () =>
        helper.waitForEventsAfterAction(async () => {
          throw new Error('boom');
        }),
      /boom/,
    );
  });
});
