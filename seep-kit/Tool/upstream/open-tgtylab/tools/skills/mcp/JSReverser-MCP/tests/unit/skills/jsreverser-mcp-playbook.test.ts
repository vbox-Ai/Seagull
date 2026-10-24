/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

const repoRoot = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('jsreverser-mcp-playbook docs contract', () => {
  it('defines the staged workflow, principles, task artifacts, local rebuild references, and task-driven routing', async () => {
    const skill = await readRepoFile('skills/jsreverser-mcp-playbook/SKILL.md');
    const automationEntry = await readRepoFile(
      'skills/jsreverser-mcp-playbook/references/automation-entry.md',
    );
    const taskTemplate = await readRepoFile(
      'skills/jsreverser-mcp-playbook/references/mcp-task-template.md',
    );
    const outputContract = await readRepoFile(
      'skills/jsreverser-mcp-playbook/references/output-contract.md',
    );
    const fallbacks = await readRepoFile(
      'skills/jsreverser-mcp-playbook/references/fallbacks.md',
    );
    const taskArtifacts = await readRepoFile(
      'skills/jsreverser-mcp-playbook/references/task-artifacts.md',
    );
    const localRebuild = await readRepoFile(
      'skills/jsreverser-mcp-playbook/references/local-rebuild.md',
    );
    const openaiAgent = await readRepoFile(
      'skills/jsreverser-mcp-playbook/agents/openai.yaml',
    );

    for (const phrase of [
      'Observe',
      'Capture',
      'Rebuild',
      'Patch',
      'DeepDive',
      'Observe-first',
      'Hook-preferred',
      'Breakpoint-last',
      'Rebuild-oriented',
      'Evidence-first',
      'Task-driven',
    ]) {
      assert.ok(skill.includes(phrase), `missing phrase in skill: ${phrase}`);
    }

    assert.ok(automationEntry.includes('页面观察'));
    assert.ok(taskTemplate.includes('本地补环境'));
    assert.ok(outputContract.includes('task artifact'));
    assert.ok(fallbacks.includes('local rebuild'));
    assert.ok(taskArtifacts.includes('timeline.jsonl'));
    assert.ok(localRebuild.includes('env/entry.js'));
    assert.ok(skill.includes('inject_preload_script'));
    assert.ok(automationEntry.includes('inject_preload_script'));
    assert.ok(automationEntry.includes('首屏初始化'));
    assert.ok(skill.includes('AI 快速执行版'));
    assert.ok(skill.includes('正式权威版'));
    assert.ok(skill.includes('以 `docs/reference/*` 为准'));
    assert.ok(skill.includes('docs/reference/reverse-bootstrap.md'));
    assert.ok(skill.includes('docs/reference/env-patching.md'));
    assert.ok(skill.includes('docs/reference/pure-extraction.md'));
    assert.ok(skill.includes('manage_reverse_task'));
    assert.ok(skill.includes('orchestrate_reverse_task'));
    assert.ok(skill.includes('run_reverse_agent'));
    assert.ok(skill.includes('export_portable_bundle'));
    assert.ok(skill.includes('get_parameter_workflow'));
    assert.ok(skill.includes('continuation.invoke'));
    assert.ok(skill.includes('compactDelivery'));
    assert.ok(openaiAgent.includes('task-driven'));
    assert.ok(openaiAgent.includes('manage_reverse_task'));
    assert.ok(openaiAgent.includes('orchestrate_reverse_task'));
    assert.ok(openaiAgent.includes('run_reverse_agent'));
    assert.ok(openaiAgent.includes('export_portable_bundle'));
    assert.ok(openaiAgent.includes('get_parameter_workflow'));
  });
});
