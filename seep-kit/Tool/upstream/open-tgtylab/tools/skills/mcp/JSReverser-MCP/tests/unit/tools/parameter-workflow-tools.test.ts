/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  getParameterWorkflow,
  listParameterWorkflows,
  recommendParameterWorkflow,
} from '../../../src/tools/workflows.js';

interface ResponseShape {
  lines: string[];
  appendResponseLine(value: string): void;
}

function makeResponse(): ResponseShape {
  const lines: string[] = [];
  return {
    lines,
    appendResponseLine(value: string) {
      lines.push(value);
    },
  };
}

function extractJson(lines: string[]): Record<string, unknown> {
  const start = lines.indexOf('```json');
  const end = lines.indexOf('```', start + 1);
  return JSON.parse(lines.slice(start + 1, end).join('\n')) as Record<
    string,
    unknown
  >;
}

describe('parameter workflow tools', () => {
  it('lists workflows', async () => {
    const response = makeResponse();
    await listParameterWorkflows.handler(
      {params: {}} as Parameters<typeof listParameterWorkflows.handler>[0],
      response as unknown as Parameters<
        typeof listParameterWorkflows.handler
      >[1],
      {} as Parameters<typeof listParameterWorkflows.handler>[2],
    );

    const payload = extractJson(response.lines);
    const items = payload.items as Array<Record<string, unknown>>;
    assert.ok(items.some(item => item.id === 'jd-h5st'));
  });

  it('gets a workflow by id', async () => {
    const response = makeResponse();
    await getParameterWorkflow.handler(
      {params: {id: 'jd-h5st'}} as Parameters<
        typeof getParameterWorkflow.handler
      >[0],
      response as unknown as Parameters<typeof getParameterWorkflow.handler>[1],
      {} as Parameters<typeof getParameterWorkflow.handler>[2],
    );

    const payload = extractJson(response.lines);
    assert.strictEqual(payload.id, 'jd-h5st');
    assert.ok(typeof payload.workflow === 'string');
    assert.ok(payload.parts);
    assert.ok(payload.mutations);
  });

  it('recommends a workflow from keyword', async () => {
    const response = makeResponse();
    await recommendParameterWorkflow.handler(
      {params: {query: 'h5st'}} as Parameters<
        typeof recommendParameterWorkflow.handler
      >[0],
      response as unknown as Parameters<
        typeof recommendParameterWorkflow.handler
      >[1],
      {} as Parameters<typeof recommendParameterWorkflow.handler>[2],
    );

    const payload = extractJson(response.lines);
    assert.strictEqual(payload.id, 'jd-h5st');
  });
});
