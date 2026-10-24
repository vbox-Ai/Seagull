/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ToolCategory} from '../../../src/tools/categories.js';
import {
  COMPACT_TOOL_NAMES,
  KERNEL_TOOL_NAMES,
  describeToolProfileSelection,
  selectToolsForProfile,
} from '../../../src/tools/profile.js';
import type {ToolDefinition} from '../../../src/tools/ToolDefinition.js';

function tool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    annotations: {
      category: ToolCategory.REVERSE_ENGINEERING,
      readOnlyHint: true,
    },
    schema: {},
    handler: async () => undefined,
  };
}

describe('tool profile selection', () => {
  it('keeps full profile unchanged', () => {
    const tools = [tool('evaluate_script'), tool('step_over')];
    assert.deepStrictEqual(selectToolsForProfile(tools, 'full'), tools);
  });

  it('exposes only kernel automation tools by default', () => {
    const tools = [
      tool('run_reverse_agent'),
      tool('orchestrate_reverse_task'),
      tool('network_request'),
      tool('repair_browser_connection'),
      tool('step_over'),
      tool('pause'),
    ];

    assert.deepStrictEqual(
      selectToolsForProfile(tools).map(selected => selected.name),
      [
        'run_reverse_agent',
        'orchestrate_reverse_task',
        'network_request',
        'repair_browser_connection',
      ],
    );
  });

  it('kernel profile keeps automated reverse workflow entry points', () => {
    for (const name of [
      'diagnose_environment',
      'repair_browser_connection',
      'export_diagnostic_bundle',
      'start_reverse_task',
      'create_reverse_task_from_request',
      'manage_reverse_task',
      'orchestrate_reverse_task',
      'run_reverse_agent',
      'trace_request_to_code',
      'locate_candidate_functions',
      'auto_rebuild_fix_loop',
      'record_page_flow',
      'replay_page_flow',
    ]) {
      assert.ok(KERNEL_TOOL_NAMES.has(name), `${name} should be kernel`);
    }
  });

  it('kernel profile omits manual controls that remain available in compact', () => {
    for (const name of [
      'create_hook',
      'inject_hook',
      'hover_element',
      'select_option',
      'upload_file',
    ]) {
      assert.strictEqual(KERNEL_TOOL_NAMES.has(name), false);
      assert.strictEqual(COMPACT_TOOL_NAMES.has(name), true);
    }
  });

  it('compact profile includes the high-level reverse workflow entry points', () => {
    for (const name of [
      'diagnose_environment',
      'start_reverse_task',
      'manage_reverse_task',
      'orchestrate_reverse_task',
      'run_reverse_agent',
      'get_reference_route',
      'export_portable_bundle',
      'repair_browser_connection',
      'trace_request_to_code',
      'export_diagnostic_bundle',
    ]) {
      assert.ok(COMPACT_TOOL_NAMES.has(name), `${name} should be compact`);
    }
  });

  it('compact profile intentionally omits token-heavy step debugging controls', () => {
    for (const name of ['pause', 'step_over', 'step_into', 'step_out']) {
      assert.strictEqual(COMPACT_TOOL_NAMES.has(name), false);
    }
  });

  it('describes hidden tools for compact profile discoverability', () => {
    const summary = describeToolProfileSelection(
      [
        tool('run_reverse_agent'),
        tool('pause'),
        tool('step_over'),
        tool('network_request'),
      ],
      'compact',
    );

    assert.deepStrictEqual(summary.selectedToolNames, [
      'run_reverse_agent',
      'network_request',
    ]);
    assert.deepStrictEqual(summary.hiddenToolNames, ['pause', 'step_over']);
    assert.match(summary.hint, /toolProfile=full/);
  });

  it('describes hidden tools for default kernel profile discoverability', () => {
    const summary = describeToolProfileSelection([
      tool('run_reverse_agent'),
      tool('pause'),
      tool('step_over'),
      tool('network_request'),
      tool('create_hook'),
    ]);

    assert.strictEqual(summary.profile, 'kernel');
    assert.deepStrictEqual(summary.selectedToolNames, [
      'run_reverse_agent',
      'network_request',
    ]);
    assert.deepStrictEqual(summary.hiddenToolNames, [
      'create_hook',
      'pause',
      'step_over',
    ]);
    assert.match(summary.hint, /Kernel profile hid 3 tools/);
    assert.match(summary.hint, /toolProfile compact/);
  });
});
