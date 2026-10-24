/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, beforeEach, describe, it} from 'node:test';

import {
  runEnvironmentDiagnostics,
  summarizeDiagnosticReport,
} from '../../../src/diagnostics/environment.js';

describe('environment diagnostics', () => {
  const originalEnv = {...process.env};

  beforeEach(() => {
    delete process.env.DEFAULT_LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_CLI_PATH;
    delete process.env.JSREVERSER_ARTIFACTS_DIR;
  });

  afterEach(() => {
    process.env = {...originalEnv};
  });

  it('returns a structured diagnostic report', () => {
    const report = runEnvironmentDiagnostics();

    assert.ok(['ok', 'warn', 'fail'].includes(report.status));
    assert.ok(report.summary.length > 0);
    assert.ok(report.checks.length >= 5);
    assert.ok(
      report.checks.every(item => item.name && item.reason && item.fix),
    );
  });

  it('warns when selected provider is missing credentials', () => {
    process.env.DEFAULT_LLM_PROVIDER = 'openai';

    const report = runEnvironmentDiagnostics();
    const aiCheck = report.checks.find(
      item => item.name === 'ai_provider_selection',
    );

    assert.ok(aiCheck);
    assert.strictEqual(aiCheck.status, 'warn');
    assert.match(aiCheck.reason, /OPENAI_API_KEY/);
  });

  it('summarizes diagnostic counts', () => {
    const report = runEnvironmentDiagnostics();
    const summary = summarizeDiagnosticReport(report);

    assert.match(summary, /status=/);
    assert.match(summary, /ok=/);
  });
});
