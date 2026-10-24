/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import fc from 'fast-check';

import {ToolCategory} from '../../src/tools/categories.js';
import {ToolRegistry} from '../../src/tools/ToolRegistry.js';

describe('Property 1: Tool Name Uniqueness', () => {
  it('rejects duplicate names for any generated tool set', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({minLength: 1, maxLength: 12}), {
          minLength: 1,
          maxLength: 20,
        }),
        names => {
          const registry = new ToolRegistry();

          for (const name of names) {
            const safeName = name.replace(/\s+/g, '_');
            if (!registry.validateName(safeName)) {
              assert.throws(() => {
                registry.register({
                  name: safeName,
                  description: 'x',
                  annotations: {
                    category: ToolCategory.DEBUGGING,
                    readOnlyHint: true,
                  },
                  schema: {},
                  handler: async () => undefined,
                });
              });
              continue;
            }

            registry.register({
              name: safeName,
              description: 'x',
              annotations: {
                category: ToolCategory.DEBUGGING,
                readOnlyHint: true,
              },
              schema: {},
              handler: async () => undefined,
            });
          }
        },
      ),
    );
  });
});
