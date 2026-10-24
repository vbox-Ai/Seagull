/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ToolDefinition} from './ToolDefinition.js';

export type ToolProfile = 'kernel' | 'compact' | 'full';

export const KERNEL_TOOL_NAMES = new Set([
  'analyze_source_maps',
  'auto_rebuild_fix_loop',
  'collect_code',
  'create_reverse_task_from_request',
  'diagnose_environment',
  'diff_session_state',
  'explain_reverse_stage',
  'export_diagnostic_bundle',
  'export_har_snapshot',
  'export_rebuild_bundle',
  'generate_parameter_report',
  'get_rebuild_health_report',
  'get_reference',
  'get_reference_route',
  'infer_websocket_schema',
  'list_pages',
  'list_task_artifacts',
  'locate_candidate_functions',
  'manage_reverse_task',
  'navigate_page',
  'network_request',
  'orchestrate_reverse_task',
  'probe_runtime_capabilities',
  'recommend_next_step',
  'record_page_flow',
  'record_reverse_evidence',
  'repair_browser_connection',
  'replay_page_flow',
  'run_reverse_agent',
  'search_in_scripts',
  'search_in_sources',
  'select_page',
  'start_reverse_task',
  'trace_request_to_code',
  'understand_code',
]);

export const COMPACT_TOOL_NAMES = new Set([
  'check_browser_health',
  'collect_code',
  'console_message',
  'create_hook',
  'create_reverse_task_from_request',
  'diagnose_environment',
  'diff_env_requirements',
  'diff_session_state',
  'emulate_device',
  'analyze_source_maps',
  'auto_rebuild_fix_loop',
  'evaluate_script',
  'explain_reverse_stage',
  'export_diagnostic_bundle',
  'export_function_slice',
  'export_har_snapshot',
  'export_portable_bundle',
  'export_rebuild_bundle',
  'extract_function_tree',
  'generate_parameter_report',
  'get_all_links',
  'get_hook_data',
  'get_parameter_workflow',
  'get_rebuild_health_report',
  'get_reference',
  'get_reference_route',
  'hover_element',
  'infer_websocket_schema',
  'inject_hook',
  'list_task_artifacts',
  'list_pages',
  'list_parameter_workflows',
  'locate_candidate_functions',
  'locate_signature_function',
  'manage_reverse_task',
  'navigate_page',
  'network_request',
  'new_page',
  'orchestrate_reverse_task',
  'probe_runtime_capabilities',
  'prune_task_artifacts',
  'record_page_flow',
  'recommend_next_step',
  'recommend_parameter_workflow',
  'record_reverse_evidence',
  'remove_hook',
  'press_key',
  'repair_browser_connection',
  'replay_page_flow',
  'run_reverse_agent',
  'search_in_scripts',
  'search_in_sources',
  'select_page',
  'select_option',
  'session_state',
  'set_viewport',
  'scroll_page',
  'start_reverse_task',
  'take_screenshot',
  'trace_request_to_code',
  'understand_code',
  'upload_file',
  'wait_for_network_idle',
]);

export function selectToolsForProfile(
  tools: ToolDefinition[],
  profile: ToolProfile = 'kernel',
): ToolDefinition[] {
  if (profile === 'full') {
    return tools;
  }

  const selectedNames =
    profile === 'compact' ? COMPACT_TOOL_NAMES : KERNEL_TOOL_NAMES;
  return tools.filter(tool => selectedNames.has(tool.name));
}

export function describeToolProfileSelection(
  tools: ToolDefinition[],
  profile: ToolProfile = 'kernel',
): {
  profile: ToolProfile;
  selectedToolNames: string[];
  hiddenToolNames: string[];
  hint: string;
} {
  const selected = selectToolsForProfile(tools, profile).map(tool => tool.name);
  const selectedSet = new Set(selected);
  const hidden =
    profile === 'full'
      ? []
      : tools
          .map(tool => tool.name)
          .filter(name => !selectedSet.has(name))
          .sort();

  return {
    profile,
    selectedToolNames: selected,
    hiddenToolNames: hidden,
    hint:
      hidden.length > 0
        ? profile === 'kernel'
          ? `Kernel profile hid ${hidden.length} tools. Restart with --toolProfile compact for broader workflow controls, or --toolProfile full when you need low-level debugging controls.`
          : `Compact profile hid ${hidden.length} tools. Restart with --toolProfile full or set toolProfile=full when you need low-level debugging controls.`
        : 'All registered tools are available in this profile.',
  };
}
