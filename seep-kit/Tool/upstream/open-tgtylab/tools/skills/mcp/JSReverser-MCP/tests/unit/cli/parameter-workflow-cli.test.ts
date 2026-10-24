/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  executeKnowledgeCliCommand,
  type CliArguments,
  parseArguments,
} from '../../../src/cli.js';

describe('parameter workflow cli', () => {
  it('parses workflow utility options', () => {
    const args = parseArguments('0.0.0', [
      'node',
      'cli',
      '--list-parameter-workflows',
    ]);

    assert.strictEqual(args.listParameterWorkflows, true);
  });

  it('shows a workflow without starting MCP server', async () => {
    const lines: string[] = [];
    const handled = await executeKnowledgeCliCommand(
      {
        showParameterWorkflow: 'jd-h5st',
      } as unknown as Partial<CliArguments>,
      (line: string) => lines.push(line),
    );

    assert.strictEqual(handled, true);
    assert.ok(lines.join('\n').includes('jd-h5st'));
  });

  it('exports a workflow template and validates it', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'jsreverser-workflow-'),
    );
    try {
      let handled = await executeKnowledgeCliCommand(
        {
          exportParameterWorkflowTemplate: tempDir,
        } as unknown as Partial<CliArguments>,
        () => undefined,
      );
      assert.strictEqual(handled, true);

      const metadata = await readFile(
        path.join(tempDir, 'metadata.json'),
        'utf8',
      );
      const workflow = await readFile(
        path.join(tempDir, 'workflow.md'),
        'utf8',
      );
      const parts = await readFile(path.join(tempDir, 'parts.json'), 'utf8');
      const mutations = await readFile(
        path.join(tempDir, 'mutations.json'),
        'utf8',
      );
      assert.ok(metadata.includes('"id"'));
      assert.ok(workflow.includes('## 目标契约'));
      assert.ok(parts.includes('"parts"'));
      assert.ok(mutations.includes('"mutations"'));

      handled = await executeKnowledgeCliCommand(
        {
          validateParameterWorkflow: tempDir,
        } as unknown as Partial<CliArguments>,
        () => undefined,
      );
      assert.strictEqual(handled, true);
    } finally {
      await rm(tempDir, {recursive: true, force: true});
    }
  });
});
