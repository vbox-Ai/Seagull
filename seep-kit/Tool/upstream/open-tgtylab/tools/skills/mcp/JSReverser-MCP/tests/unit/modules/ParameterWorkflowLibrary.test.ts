/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  getParameterWorkflowLibrary,
  resetParameterWorkflowLibraryForTest,
} from '../../../src/modules/workflows/ParameterWorkflowLibrary.js';

describe('ParameterWorkflowLibrary', () => {
  it('lists, resolves, and recommends workflows from packaged docs', async () => {
    resetParameterWorkflowLibraryForTest();
    const library = await getParameterWorkflowLibrary();

    const workflows = await library.listWorkflows();
    assert.ok(workflows.length >= 3);
    assert.ok(workflows.some((item: {id: string}) => item.id === 'jd-h5st'));

    const workflow = await library.getWorkflow('jd-h5st');
    assert.strictEqual(workflow.metadata.id, 'jd-h5st');
    assert.ok(workflow.workflow.includes('## 适用范围'));
    assert.ok(workflow.parts);
    assert.ok(workflow.mutations);

    const exact = await library.recommendWorkflow('h5st');
    assert.strictEqual(exact.metadata.id, 'jd-h5st');

    const fallback = await library.recommendWorkflow('x-sign');
    assert.strictEqual(fallback.metadata.id, 'generic-header-sign');
  });
});
