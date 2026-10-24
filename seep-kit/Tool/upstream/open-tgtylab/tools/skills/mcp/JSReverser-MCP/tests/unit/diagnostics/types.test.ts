/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {
  DiagnosticReport,
  DiagnosticStatus,
} from '../../../src/diagnostics/types.js';

describe('diagnostics types', () => {
  it('supports the expected report shape', () => {
    const status: DiagnosticStatus = 'warn';
    const report: DiagnosticReport = {
      status,
      summary: 'example',
      checks: [
        {
          name: 'node_version',
          status: 'ok',
          reason: 'supported',
          fix: 'none',
        },
      ],
    };

    assert.strictEqual(report.status, 'warn');
    assert.strictEqual(report.checks[0]?.name, 'node_version');
  });
});
