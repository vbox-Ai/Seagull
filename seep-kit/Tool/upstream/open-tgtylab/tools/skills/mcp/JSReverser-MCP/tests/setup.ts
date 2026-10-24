/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Test setup file
 * Loaded before running tests
 */

process.env.NODE_ENV = 'test';

if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  };
}
