/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import OpenAI from 'openai';

import {OpenAIProvider} from '../../../src/services/OpenAIProvider.js';

interface OpenAICompletionPayloadLike {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  messages: Array<{
    content:
      | Array<{
          image_url: {
            url: string;
          };
        }>
      | string;
  }>;
}

interface OpenAIClientLike {
  chat: {
    completions: {
      create(payload?: unknown): Promise<{
        choices: Array<{message: {content: string | null}}>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      }>;
    };
  };
}

interface OpenAIProviderHarness {
  client: OpenAIClientLike;
  getMimeType(extension: string): string;
  chat(
    messages: Array<{role: string; content: string}>,
    options?: {model?: string; temperature?: number; maxTokens?: number},
  ): Promise<{
    content: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
  analyzeImage(
    imageInput: string,
    prompt: string,
    isFilePath?: boolean,
  ): Promise<string>;
}

describe('OpenAIProvider (mocked)', () => {
  it('throws when api key is missing', () => {
    assert.throws(
      () => new OpenAIProvider({apiKey: ''}),
      /OpenAI API key is required/,
    );
  });

  it('maps chat response into internal response shape', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    provider.client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{message: {content: 'ok'}}],
            usage: {prompt_tokens: 1, completion_tokens: 2, total_tokens: 3},
          }),
        },
      },
    };

    const out = await provider.chat([{role: 'user', content: 'hello'}]);
    assert.strictEqual(out.content, 'ok');
    assert.deepStrictEqual(out.usage, {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
  });

  it('throws when chat has no choice message', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    provider.client = {
      chat: {
        completions: {
          create: async () => ({choices: []}),
        },
      },
    };

    await assert.rejects(
      async () => provider.chat([{role: 'user', content: 'hello'}]),
      /No response from OpenAI/,
    );
  });

  it('passes through generic errors from chat', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    provider.client = {
      chat: {
        completions: {
          create: async () => {
            throw new Error('network down');
          },
        },
      },
    };

    await assert.rejects(
      async () => provider.chat([{role: 'user', content: 'hello'}]),
      /network down/,
    );
  });

  it('handles base64/http/data-url and file-path image inputs', async () => {
    const calls: OpenAICompletionPayloadLike[] = [];
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    provider.client = {
      chat: {
        completions: {
          create: async (payload?: unknown) => {
            calls.push(payload as OpenAICompletionPayloadLike);
            return {choices: [{message: {content: 'vision-ok'}}]};
          },
        },
      },
    };

    const out1 = await provider.analyzeImage('dGVzdA==', 'p1', false);
    const out2 = await provider.analyzeImage(
      'https://example.com/i.png',
      'p2',
      false,
    );
    const out3 = await provider.analyzeImage(
      'data:image/png;base64,abcd',
      'p3',
      false,
    );

    const tempPath = join(tmpdir(), `openai-provider-test-${Date.now()}.png`);
    writeFileSync(tempPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const out4 = await provider.analyzeImage(tempPath, 'p4', true);
    rmSync(tempPath, {force: true});

    assert.strictEqual(out1, 'vision-ok');
    assert.strictEqual(out2, 'vision-ok');
    assert.strictEqual(out3, 'vision-ok');
    assert.strictEqual(out4, 'vision-ok');

    const urls = calls.map(c => {
      const content = c.messages[0]?.content;
      if (!Array.isArray(content)) {
        throw new Error('Expected image content payload');
      }
      const imagePart = content[1];
      if (!imagePart || !('image_url' in imagePart)) {
        throw new Error('Expected image_url part');
      }
      return imagePart.image_url.url;
    });
    assert.ok(urls[0].startsWith('data:image/png;base64,'));
    assert.strictEqual(urls[1], 'https://example.com/i.png');
    assert.strictEqual(urls[2], 'data:image/png;base64,abcd');
    assert.ok(urls[3].startsWith('data:image/png;base64,'));
  });

  it('falls back to png mime type for unknown extensions', () => {
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    assert.strictEqual(provider.getMimeType('jpg'), 'image/jpeg');
    assert.strictEqual(provider.getMimeType('unknown'), 'image/png');
  });

  it('covers OpenAI APIError and unknown error formatting paths', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;

    const apiError = Object.assign(new Error('rate limited'), {
      status: 429,
      code: 'rate_limit',
    });
    Object.setPrototypeOf(apiError, OpenAI.APIError.prototype);

    provider.client = {
      chat: {
        completions: {
          create: async () => {
            throw apiError;
          },
        },
      },
    };
    await assert.rejects(
      async () => provider.chat([{role: 'user', content: 'hello'}]),
      (err: unknown) =>
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        'code' in err &&
        (err as {status?: number; code?: string}).status === 429 &&
        (err as {status?: number; code?: string}).code === 'rate_limit',
    );

    provider.client = {
      chat: {
        completions: {
          create: async () => {
            throw 'non-error';
          },
        },
      },
    };
    await assert.rejects(
      async () => provider.chat([{role: 'user', content: 'hello'}]),
      /Unknown error: non-error/,
    );
  });

  it('throws when analyzeImage receives empty choice payload', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    provider.client = {
      chat: {
        completions: {
          create: async () => ({choices: []}),
        },
      },
    };

    await assert.rejects(
      async () => provider.analyzeImage('dGVzdA==', 'p', false),
      /No response from OpenAI/,
    );
  });

  it('covers empty content and no-usage response branches', async () => {
    const payloads: OpenAICompletionPayloadLike[] = [];
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    provider.client = {
      chat: {
        completions: {
          create: async (input?: unknown) => {
            payloads.push(input as OpenAICompletionPayloadLike);
            return {choices: [{message: {content: null}}]};
          },
        },
      },
    };

    const out = await provider.chat([{role: 'assistant', content: 'x'}], {
      model: 'gpt-test',
      temperature: 0.3,
      maxTokens: 99,
    });
    assert.strictEqual(out.content, '');
    assert.strictEqual(out.usage, undefined);
    const payload = payloads[0];
    assert.ok(payload);
    assert.strictEqual(payload.model, 'gpt-test');
    assert.strictEqual(payload.temperature, 0.3);
    assert.strictEqual(payload.max_tokens, 99);
  });

  it('covers analyzeImage file path without extension branch', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'sk-test-key',
    }) as unknown as OpenAIProviderHarness;
    provider.client = {
      chat: {
        completions: {
          create: async () => ({choices: [{message: {content: null}}]}),
        },
      },
    };

    const tempPath = join(tmpdir(), `openai-provider-test-${Date.now()}`);
    writeFileSync(tempPath, Buffer.from([0x00]));
    const out = await provider.analyzeImage(tempPath, 'p', true);
    rmSync(tempPath, {force: true});
    assert.strictEqual(out, '');
  });
});
