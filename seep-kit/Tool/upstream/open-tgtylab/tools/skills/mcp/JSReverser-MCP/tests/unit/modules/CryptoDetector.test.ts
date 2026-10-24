/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {CryptoDetector} from '../../../src/modules/crypto/CryptoDetector.js';

interface LLMServiceLike {
  generateCryptoDetectionPrompt(code: string): unknown[];
  chat(messages: unknown[]): Promise<{content: string}>;
}

const llmStub = {
  generateCryptoDetectionPrompt: () => [],
  chat: async () => ({content: '{"algorithms": []}'}),
} satisfies LLMServiceLike;

describe('CryptoDetector', () => {
  it('detects algorithm keywords', async () => {
    const detector = new CryptoDetector(
      llmStub as unknown as ConstructorParameters<typeof CryptoDetector>[0],
    );
    const result = await detector.detect({
      code: 'const hash = md5(input); const x = sha256(y);',
      useAI: false,
    } as Parameters<typeof detector.detect>[0]);

    assert.ok(result.algorithms.length >= 1);
  });
});
