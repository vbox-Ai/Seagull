/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {getReverseStageGuide} from '../../../src/modules/workflows/ReverseStageGuide.js';

describe('ReverseStageGuide', () => {
  it('returns structured guidance for key stages', () => {
    for (const stage of [
      'Observe',
      'Capture',
      'Rebuild',
      'Patch',
      'DeepDive',
      'PureExtraction',
    ] as const) {
      const guide = getReverseStageGuide(stage);
      assert.strictEqual(guide.stage, stage);
      assert.ok(guide.goal.length > 0);
      assert.ok(guide.entryCriteria.length > 0);
      assert.ok(guide.avoid.length > 0);
      assert.ok(guide.recommendedTools.length > 0);
    }
  });
});
