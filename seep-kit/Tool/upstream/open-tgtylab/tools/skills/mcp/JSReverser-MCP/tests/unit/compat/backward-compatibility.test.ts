/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseArguments} from '../../../src/cli.js';
import * as consoleTools from '../../../src/tools/console.js';
import * as debuggerTools from '../../../src/tools/debugger.js';
import * as networkTools from '../../../src/tools/network.js';
import * as pagesTools from '../../../src/tools/pages.js';
import * as screenshotTools from '../../../src/tools/screenshot.js';
import * as scriptTools from '../../../src/tools/script.js';

interface NamedToolExport {
  name?: string;
}

describe('Backward compatibility', () => {
  it('preserves original tool exports', () => {
    const tools = [
      ...Object.values(consoleTools),
      ...Object.values(debuggerTools),
      ...Object.values(networkTools),
      ...Object.values(pagesTools),
      ...Object.values(screenshotTools),
      ...Object.values(scriptTools),
    ] as NamedToolExport[];

    assert.ok(tools.length > 0);
    assert.ok(tools.some(tool => tool.name === 'evaluate_script'));
  });

  it('keeps CLI argument compatibility', () => {
    const args = parseArguments('1.0.0', [
      'node',
      'mcp',
      '--channel',
      'stable',
      '--headless',
    ]);
    assert.strictEqual(args.channel, 'stable');
    assert.strictEqual(args.headless, true);
  });

  it('non-AI modules work without provider keys', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const {HookManager} = await import(
      '../../../src/modules/hook/HookManager.js'
    );
    const manager = new HookManager();
    const hook = manager.create({type: 'fetch'});
    assert.ok(hook.hookId);
  });
});
