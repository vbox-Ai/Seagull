/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {getReference, getReferenceRoute} from '../../../src/tools/analyzer.js';

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

function extractFirstJsonBlock(lines: string[]): Record<string, unknown> {
  const start = lines.indexOf('```json');
  const end = lines.indexOf('```', start + 1);
  return JSON.parse(lines.slice(start + 1, end).join('\n')) as Record<
    string,
    unknown
  >;
}

describe('reference doc tools', () => {
  it('reads packaged reference docs through the build manifest', async () => {
    const response = makeResponse();

    await getReference.handler(
      {
        params: {
          mode: 'doc',
          docId: 'reverse-workflow',
        },
      } as Parameters<typeof getReference.handler>[0],
      response as unknown as Parameters<typeof getReference.handler>[1],
      {} as Parameters<typeof getReference.handler>[2],
    );

    const payload = extractFirstJsonBlock(response.lines);
    assert.strictEqual(payload.docId, 'reverse-workflow');
    assert.strictEqual(payload.group, 'core');
    assert.strictEqual(
      payload.path,
      'build/docs/reference-core/reverse-workflow.md',
    );
    assert.ok(typeof payload.content === 'string');
    assert.ok((payload.content as string).includes('Observe-first'));
  });

  it('returns compact summary for one packaged reference doc', async () => {
    const response = makeResponse();

    await getReference.handler(
      {
        params: {
          mode: 'summary',
          docId: 'reverse-bootstrap',
          maxSections: 3,
        },
      } as Parameters<typeof getReference.handler>[0],
      response as unknown as Parameters<typeof getReference.handler>[1],
      {} as Parameters<typeof getReference.handler>[2],
    );

    const payload = extractFirstJsonBlock(response.lines);
    assert.strictEqual(payload.docId, 'reverse-bootstrap');
    assert.ok(Array.isArray(payload.highlights));
    assert.ok((payload.highlights as unknown[]).length > 0);
    assert.ok((payload.summary as string).includes('逆向'));
  });

  it('maps workflow stages to the right packaged docs', async () => {
    const response = makeResponse();

    await getReferenceRoute.handler(
      {
        params: {
          mode: 'stage',
          stage: 'Patch',
        },
      } as Parameters<typeof getReferenceRoute.handler>[0],
      response as unknown as Parameters<typeof getReferenceRoute.handler>[1],
      {} as Parameters<typeof getReferenceRoute.handler>[2],
    );

    const payload = extractFirstJsonBlock(response.lines);
    assert.strictEqual(payload.stage, 'Patch');
    assert.ok(Array.isArray(payload.recommendedDocs));
    const recommendedDocs = payload.recommendedDocs as Array<
      Record<string, unknown>
    >;
    assert.ok(recommendedDocs.some(item => item.docId === 'env-patching'));
    assert.ok(recommendedDocs.some(item => item.docId === 'reverse-workflow'));
  });

  it('maps concrete reverse topics to the right packaged docs', async () => {
    const response = makeResponse();

    await getReferenceRoute.handler(
      {
        params: {
          mode: 'topic',
          topic: 'algorithm-upgrade',
        },
      } as Parameters<typeof getReferenceRoute.handler>[0],
      response as unknown as Parameters<typeof getReferenceRoute.handler>[1],
      {} as Parameters<typeof getReferenceRoute.handler>[2],
    );

    const payload = extractFirstJsonBlock(response.lines);
    assert.strictEqual(payload.topic, 'algorithm-upgrade');
    assert.ok(Array.isArray(payload.recommendedDocs));
    const recommendedDocs = payload.recommendedDocs as Array<
      Record<string, unknown>
    >;
    assert.ok(
      recommendedDocs.some(item => item.docId === 'algorithm-upgrade-template'),
    );
    assert.ok(recommendedDocs.some(item => item.docId === 'reverse-workflow'));
  });

  it('recommends topic, stage, and docs from natural-language reverse questions', async () => {
    const response = makeResponse();

    await getReferenceRoute.handler(
      {
        params: {
          mode: 'recommend',
          query: '签名升级后不一致，我想先看 first divergence 应该怎么查',
        },
      } as Parameters<typeof getReferenceRoute.handler>[0],
      response as unknown as Parameters<typeof getReferenceRoute.handler>[1],
      {} as Parameters<typeof getReferenceRoute.handler>[2],
    );

    const payload = extractFirstJsonBlock(response.lines);
    assert.strictEqual(payload.topic, 'algorithm-upgrade');
    assert.strictEqual(payload.stage, 'Upgrade');
    assert.ok(Array.isArray(payload.recommendedDocs));
    const recommendedDocs = payload.recommendedDocs as Array<
      Record<string, unknown>
    >;
    assert.ok(
      recommendedDocs.some(item => item.docId === 'algorithm-upgrade-template'),
    );
  });

  it('tool reference includes startup diagnostics and workflow guidance tools', async () => {
    const response = makeResponse();

    await getReference.handler(
      {
        params: {
          mode: 'doc',
          docId: 'tool-reference',
        },
      } as Parameters<typeof getReference.handler>[0],
      response as unknown as Parameters<typeof getReference.handler>[1],
      {} as Parameters<typeof getReference.handler>[2],
    );

    const payload = extractFirstJsonBlock(response.lines);
    assert.ok(typeof payload.content === 'string');
    const content = payload.content as string;
    assert.ok(content.includes('diagnose_environment'));
    assert.ok(content.includes('recommend_next_step'));
    assert.ok(content.includes('explain_reverse_stage'));
  });
});
