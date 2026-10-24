/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {recommendNextStep} from '../../../src/modules/workflows/NextStepAdvisor.js';

describe('NextStepAdvisor', () => {
  it('recommends health check when browser is not ready', () => {
    const advice = recommendNextStep({browserHealthy: false});
    assert.strictEqual(advice.stage, 'Observe');
    assert.strictEqual(advice.nextStep, 'check_browser_health');
  });

  it('recommends runtime capture before breakpoints', () => {
    const advice = recommendNextStep({
      browserHealthy: true,
      pageReady: true,
      hasTargetRequest: true,
      hookRecordCount: 0,
    });
    assert.strictEqual(advice.stage, 'Capture');
    assert.strictEqual(advice.nextStep, 'inject_hook');
    assert.ok(advice.avoid.includes('breakpoint'));
  });

  it('recommends rebuild after hook evidence exists', () => {
    const advice = recommendNextStep({
      browserHealthy: true,
      pageReady: true,
      hasTargetRequest: true,
      hookRecordCount: 2,
      hasRebuildBundle: false,
    });
    assert.strictEqual(advice.stage, 'Rebuild');
    assert.strictEqual(advice.nextStep, 'export_rebuild_bundle');
  });

  it('respects explicit patch stage and keeps patch-oriented guidance', () => {
    const advice = recommendNextStep({
      currentStage: 'Patch',
      hasRebuildBundle: true,
      hasPassingRebuild: false,
      firstDivergenceKnown: false,
    });
    assert.strictEqual(advice.stage, 'Patch');
    assert.strictEqual(advice.nextStep, 'diff_env_requirements');
  });
});
