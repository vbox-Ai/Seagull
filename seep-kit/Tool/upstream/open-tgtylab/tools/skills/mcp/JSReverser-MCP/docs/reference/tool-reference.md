<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

> 快速按逆向目标查工具，请先看：[`docs/reference/reverse-task-index.md`](./reverse-task-index.md)

## Agent Response Contracts

Reverse-task tools return agent-oriented response fields for low-token continuation and recovery.

Common fields include `schemaVersion`, `responseSummary`, `diagnostics`, `outcome`, `agentGuidance`, `recommendedStrategy`, `artifacts`, `generatedArtifacts`, `outputMode`, `fallbackPlan`, `continuation`, `targetActionDescription`, `otherTaskId`, `pruneOlderThanDays`, and `strategy`.

### Compact response example (`manage_reverse_task:get`)

```json
{
  "schemaVersion": "1.0",
  "responseSummary": "Task loaded.",
  "continuation": {
    "invoke": "manage_reverse_task",
    "invokeHint": {
      "requiredParams": ["taskId"],
      "optionalParams": ["outputMode"]
    }
  },
  "agentGuidance": {
    "recommendedStrategy": "observe-first"
  },
  "artifacts": ["task.json"]
}
```

### Failure response example (`env_error`, resumable)

```json
{
  "schemaVersion": "1.0",
  "outcome": "blocked",
  "errorType": "env_error",
  "fallbackPlan": {
    "recommendedStrategy": "env-fix"
  },
  "continuation": {
    "invoke": "orchestrate_reverse_task",
    "invokeHint": {
      "requiredParams": ["runtimeError", "observedCapabilities"]
    }
  }
}
```

### Blocked response example

```json
{
  "schemaVersion": "1.0",
  "outcome": "blocked",
  "blockedBy": ["missing runtime evidence"],
  "agentGuidance": {
    "recommendedStrategy": "evidence-only"
  }
}
```

- **[Navigation automation](#navigation-automation)** (27 tools)
  - [`check_browser_health`](#check_browser_health)
  - [`click_element`](#click_element)
  - [`diagnose_environment`](#diagnose_environment)
  - [`emulate_device`](#emulate_device)
  - [`export_diagnostic_bundle`](#export_diagnostic_bundle)
  - [`find_clickable_elements`](#find_clickable_elements)
  - [`get_all_links`](#get_all_links)
  - [`get_dom_structure`](#get_dom_structure)
  - [`get_performance_metrics`](#get_performance_metrics)
  - [`hover_element`](#hover_element)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`new_page`](#new_page)
  - [`press_key`](#press_key)
  - [`query_dom`](#query_dom)
  - [`record_page_flow`](#record_page_flow)
  - [`repair_browser_connection`](#repair_browser_connection)
  - [`replay_page_flow`](#replay_page_flow)
  - [`scroll_page`](#scroll_page)
  - [`select_option`](#select_option)
  - [`select_page`](#select_page)
  - [`session_state`](#session_state)
  - [`set_viewport`](#set_viewport)
  - [`type_text`](#type_text)
  - [`upload_file`](#upload_file)
  - [`wait_for_element`](#wait_for_element)
  - [`wait_for_network_idle`](#wait_for_network_idle)
- **[Network](#network)** (8 tools)
  - [`analyze_websocket_messages`](#analyze_websocket_messages)
  - [`export_har_snapshot`](#export_har_snapshot)
  - [`get_websocket_message`](#get_websocket_message)
  - [`get_websocket_messages`](#get_websocket_messages)
  - [`infer_websocket_schema`](#infer_websocket_schema)
  - [`list_websocket_connections`](#list_websocket_connections)
  - [`network_request`](#network_request)
  - [`trace_request_to_code`](#trace_request_to_code)
- **[Debugging](#debugging)** (6 tools)
  - [`console_message`](#console_message)
  - [`evaluate_script`](#evaluate_script)
  - [`inject_preload_script`](#inject_preload_script)
  - [`list_frames`](#list_frames)
  - [`select_frame`](#select_frame)
  - [`take_screenshot`](#take_screenshot)
- **[JS Reverse Engineering](#js-reverse-engineering)** (69 tools)
  - [`analyze_source_maps`](#analyze_source_maps)
  - [`analyze_target`](#analyze_target)
  - [`auto_rebuild_fix_loop`](#auto_rebuild_fix_loop)
  - [`breakpoint`](#breakpoint)
  - [`collect_code`](#collect_code)
  - [`collection_diff`](#collection_diff)
  - [`create_hook`](#create_hook)
  - [`create_reverse_task_from_request`](#create_reverse_task_from_request)
  - [`deobfuscate_code`](#deobfuscate_code)
  - [`detect_crypto`](#detect_crypto)
  - [`diff_env_requirements`](#diff_env_requirements)
  - [`diff_session_state`](#diff_session_state)
  - [`evaluate_on_callframe`](#evaluate_on_callframe)
  - [`explain_reverse_stage`](#explain_reverse_stage)
  - [`export_function_slice`](#export_function_slice)
  - [`export_portable_bundle`](#export_portable_bundle)
  - [`export_rebuild_bundle`](#export_rebuild_bundle)
  - [`export_session_report`](#export_session_report)
  - [`extract_function_tree`](#extract_function_tree)
  - [`find_in_script`](#find_in_script)
  - [`generate_parameter_report`](#generate_parameter_report)
  - [`get_hook_data`](#get_hook_data)
  - [`get_parameter_workflow`](#get_parameter_workflow)
  - [`get_paused_info`](#get_paused_info)
  - [`get_rebuild_health_report`](#get_rebuild_health_report)
  - [`get_reference`](#get_reference)
  - [`get_reference_route`](#get_reference_route)
  - [`get_request_initiator`](#get_request_initiator)
  - [`get_script_source`](#get_script_source)
  - [`get_storage`](#get_storage)
  - [`hook_function`](#hook_function)
  - [`inject_hook`](#inject_hook)
  - [`inject_stealth`](#inject_stealth)
  - [`inspect_object`](#inspect_object)
  - [`list_hooks`](#list_hooks)
  - [`list_parameter_workflows`](#list_parameter_workflows)
  - [`list_scripts`](#list_scripts)
  - [`list_stealth_features`](#list_stealth_features)
  - [`list_stealth_presets`](#list_stealth_presets)
  - [`list_task_artifacts`](#list_task_artifacts)
  - [`locate_candidate_functions`](#locate_candidate_functions)
  - [`locate_signature_function`](#locate_signature_function)
  - [`manage_reverse_task`](#manage_reverse_task)
  - [`monitor_events`](#monitor_events)
  - [`orchestrate_reverse_task`](#orchestrate_reverse_task)
  - [`pause`](#pause)
  - [`probe_runtime_capabilities`](#probe_runtime_capabilities)
  - [`prune_task_artifacts`](#prune_task_artifacts)
  - [`recommend_next_step`](#recommend_next_step)
  - [`recommend_parameter_workflow`](#recommend_parameter_workflow)
  - [`record_reverse_evidence`](#record_reverse_evidence)
  - [`remove_hook`](#remove_hook)
  - [`resume`](#resume)
  - [`risk_panel`](#risk_panel)
  - [`run_reverse_agent`](#run_reverse_agent)
  - [`search_in_scripts`](#search_in_scripts)
  - [`search_in_sources`](#search_in_sources)
  - [`set_breakpoint_on_text`](#set_breakpoint_on_text)
  - [`set_user_agent`](#set_user_agent)
  - [`start_reverse_task`](#start_reverse_task)
  - [`step_into`](#step_into)
  - [`step_out`](#step_out)
  - [`step_over`](#step_over)
  - [`stop_monitor`](#stop_monitor)
  - [`summarize_code`](#summarize_code)
  - [`trace_function`](#trace_function)
  - [`understand_code`](#understand_code)
  - [`unhook_function`](#unhook_function)
  - [`xhr_breakpoint`](#xhr_breakpoint)

## Navigation automation

### `check_browser_health`

**Description:** Check browser connectivity and active page readiness before running reverse workflows.

**Parameters:**

- `pageIdx`

### `click_element`

**Description:** Click an element by selector.

**Parameters:**

- `pageIdx`
- `selector`

### `diagnose_environment`

**Description:** Run static environment diagnostics for startup, AI provider setup, and artifact output paths.

### `emulate_device`

**Description:** Emulate a common mobile device profile.

**Parameters:**

- `pageIdx`
- `deviceName`

### `export_diagnostic_bundle`

**Description:** Export a compact support bundle with environment, AI runtime, browser, and setup diagnostics.

**Parameters:**

- `remoteDebuggingUrl`

### `find_clickable_elements`

**Description:** Find clickable buttons/links, optionally filtered by text.

**Parameters:**

- `pageIdx`
- `filterText`

### `get_all_links`

**Description:** List links on the active page.

**Parameters:**

- `pageIdx`

### `get_dom_structure`

**Description:** Get DOM tree structure for current page.

**Parameters:**

- `pageIdx`
- `maxDepth`
- `includeText`

### `get_performance_metrics`

**Description:** Get page performance metrics from Performance API.

**Parameters:**

- `pageIdx`

### `hover_element`

**Description:** Hover over an element by selector.

**Parameters:**

- `pageIdx`
- `selector`

### `list_pages`

**Description:** Get a list of pages open in the browser.

### `navigate_page`

**Description:** Navigates the currently selected page to a URL, or performs back/forward/reload navigation. Waits for DOMContentLoaded event (not full page load). Default timeout is 10 seconds.

**Parameters:**

- `pageIdx`
- `type`
- `url`
- `ignoreCache`
- `timeout`

### `new_page`

**Description:** Creates a new page and navigates to the specified URL. Waits for DOMContentLoaded event (not full page load). Default timeout is 10 seconds.

**Parameters:**

- `url`
- `timeout`

### `press_key`

**Description:** Press a keyboard key on the active page.

**Parameters:**

- `pageIdx`
- `key`

### `query_dom`

**Description:** Query one or multiple elements by CSS selector.

**Parameters:**

- `pageIdx`
- `selector`
- `all`
- `limit`

### `record_page_flow`

**Description:** Persist a page interaction flow draft for later replay and evidence reuse.

**Parameters:**

- `taskId`
- `name`
- `actions`

### `repair_browser_connection`

**Description:** Diagnose Chrome remote-debugging connectivity and return concrete repair commands.

**Parameters:**

- `browserUrl`
- `wsEndpoint`
- `remoteDebuggingUrl`
- `checkReachability`

### `replay_page_flow`

**Description:** Replay recorded page flow actions through PageController.

**Parameters:**

- `actions`

### `scroll_page`

**Description:** Scroll the page to absolute x/y coordinates.

**Parameters:**

- `pageIdx`
- `x`
- `y`

### `select_option`

**Description:** Select one or more values in a native select element.

**Parameters:**

- `pageIdx`
- `selector`
- `values`

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- `pageIdx`

### `session_state`

**Description:** Manage in-memory session snapshots: save, restore, list, delete, dump, or load.

**Parameters:**

- `action`
- `pageIdx`
- `sessionId`
- `includeCookies`
- `includeLocalStorage`
- `includeSessionStorage`
- `navigateToSavedUrl`
- `clearStorageBeforeRestore`
- `path`
- `pretty`
- `encrypt`
- `snapshotJson`
- `overwrite`

### `set_viewport`

**Description:** Set the active page viewport size.

**Parameters:**

- `pageIdx`
- `width`
- `height`

### `type_text`

**Description:** Type text into an input element.

**Parameters:**

- `pageIdx`
- `selector`
- `text`
- `delay`

### `upload_file`

**Description:** Upload a local file through a file input selector.

**Parameters:**

- `pageIdx`
- `selector`
- `filePath`

### `wait_for_element`

**Description:** Wait for selector to appear.

**Parameters:**

- `pageIdx`
- `selector`
- `timeout`

### `wait_for_network_idle`

**Description:** Wait until the page network becomes idle.

**Parameters:**

- `pageIdx`
- `timeout`

## Network

### `analyze_websocket_messages`

**Description:** Group WebSocket messages by pattern/fingerprint and return stats plus sample indices for each type.

**Parameters:**

- `wsid`
- `direction`
- `targetPageIdx`

### `export_har_snapshot`

**Description:** Export selected page network requests into a compact HAR-like snapshot for offline analysis.

**Parameters:**

- `targetPageIdx`
- `includePreservedRequests`
- `urlFilter`

### `get_websocket_message`

**Description:** Gets a single WebSocket message by its frame index. Use get_websocket_messages or analyze_websocket_messages first to find the frame index.

**Parameters:**

- `wsid`
- `frameIndex`
- `targetPageIdx`

### `get_websocket_messages`

**Description:** Gets messages for a WebSocket connection. IMPORTANT: For binary/protobuf messages (like live streaming), use analyze_websocket_messages FIRST to understand message types, then use groupId parameter to filter specific types. Default mode shows summary only.

**Parameters:**

- `wsid`
- `direction`
- `groupId`
- `pageSize`
- `pageIdx`
- `targetPageIdx`
- `show_content`

### `infer_websocket_schema`

**Description:** Infer JSON field types, message type distribution, and non-JSON counts from WebSocket messages.

**Parameters:**

- `messages`

### `list_websocket_connections`

**Description:** List all WebSocket connections. After getting wsid, use analyze_websocket_messages(wsid) FIRST to understand message patterns before viewing individual messages.

**Parameters:**

- `pageSize`
- `pageIdx`
- `targetPageIdx`
- `urlFilter`
- `includePreservedConnections`

### `network_request`

**Description:** List network requests, or get one request by reqid.

**Parameters:**

- `action`
- `reqid`
- `pageSize`
- `pageIdx`
- `targetPageIdx`
- `resourceTypes`
- `includePreservedRequests`

### `trace_request_to_code`

**Description:** Trace a captured network request to initiator stack frames and optional static code candidates.

**Parameters:**

- `reqid`
- `targetPageIdx`
- `parameterNames`
- `files`

## Debugging

### `console_message`

**Description:** List console messages, or get one message by msgid.

**Parameters:**

- `action`
- `msgid`
- `targetPageIdx`
- `pageSize`
- `pageIdx`
- `types`
- `includePreservedMessages`

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON
so returned values have to JSON-serializable.

**Parameters:**

- `pageIdx`
- `function`

### `inject_preload_script`

**Description:** Register a JavaScript snippet that will run on future document loads before page scripts execute. Use this for preload hooks, environment patches, and early instrumentation.

**Parameters:**

- `script`

### `list_frames`

**Description:** Lists all frames (including iframes) in the current page as a tree. Shows frame index, name, and URL. Use select_frame to switch execution context to a specific frame.

### `select_frame`

**Description:** Selects a frame (by index from list_frames) as the execution context for evaluate_script, hook_function, inspect_object, and other tools that run JavaScript in the page.

**Parameters:**

- `frameIdx`

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- `pageIdx`
- `format`
- `quality`
- `fullPage`
- `filePath`

## JS Reverse Engineering

### `analyze_source_maps`

**Description:** Parse a source map and summarize original sources, embedded content coverage, and likely reverse targets.

**Parameters:**

- `sourceMapContent`
- `sourceMapUrl`

### `analyze_target`

**Description:** One-shot reverse workflow: collect code, run security/crypto analysis, optional deobfuscation, and hook timeline correlation.

**Parameters:**

- `url`
- `topN`
- `useAI`
- `aiMode`
- `runDeobfuscation`
- `hookPreset`
- `autoInjectHooks`
- `waitAfterHookMs`
- `correlationWindowMs`
- `maxCorrelatedFlows`
- `maxFingerprints`
- `autoReplayActions`
- `collect`

### `auto_rebuild_fix_loop`

**Description:** Create a resumable env-fix loop plan from runtime errors and observed capabilities.

**Parameters:**

- `taskId`
- `runtimeError`
- `observedCapabilities`
- `maxIterations`

### `breakpoint`

**Description:** Manage JavaScript breakpoints: set, remove, or list active breakpoints.

**Parameters:**

- `action`
- `pageIdx`
- `url`
- `lineNumber`
- `columnNumber`
- `condition`
- `isRegex`
- `breakpointId`

### `collect_code`

**Description:** Collect JavaScript code from a page with smart modes (summary/priority/incremental/full).

**Parameters:**

- `url`
- `smartMode`
- `returnMode`
- `includeInline`
- `includeExternal`
- `includeDynamic`
- `maxTotalSize`
- `maxFileSize`
- `pattern`
- `limit`
- `topN`

### `collection_diff`

**Description:** Compare previous and current collected file summaries.

**Parameters:**

- `previous`
- `current`
- `includeUnchanged`

### `create_hook`

**Description:** RECOMMENDED: Create hook script for function/fetch/xhr/property/cookie/websocket/eval/timer. Hooks run without pausing page execution and are the preferred approach over breakpoints for monitoring and interception.

**Parameters:**

- `type`
- `params`
- `description`
- `action`

### `create_reverse_task_from_request`

**Description:** Create a reverse task directly from one captured network request.

**Parameters:**

- `requestId`
- `targetPageIdx`
- `taskId`
- `taskSlug`
- `goal`

### `deobfuscate_code`

**Description:** AI-assisted JavaScript deobfuscation.

**Parameters:**

- `code`
- `aggressive`
- `renameVariables`

### `detect_crypto`

**Description:** Detect cryptographic algorithms/libraries from JavaScript source.

**Parameters:**

- `code`
- `useAI`

### `diff_env_requirements`

**Description:** Compare local runtime failures with observed browser capabilities and suggest the next environment patches.

**Parameters:**

- `runtimeError`
- `observedCapabilities`

### `diff_session_state`

**Description:** Compare cookies, localStorage, and sessionStorage snapshots before and after a page action.

**Parameters:**

- `before`
- `after`

### `evaluate_on_callframe`

**Description:** Evaluates a JavaScript expression in the context of a specific call frame while paused. This allows you to inspect variables and execute code in the paused scope.

**Parameters:**

- `expression`
- `frameIndex`

### `explain_reverse_stage`

**Description:** Explain a reverse-engineering stage with goals, entry criteria, avoid list, and recommended tools.

**Parameters:**

- `stage`
- `includeDocs`

### `export_function_slice`

**Description:** Build a minimal function slice draft with direct helper dependencies and a Node env shim.

**Parameters:**

- `code`
- `functionName`
- `dependencyNames`

### `export_portable_bundle`

**Description:** Collapse existing analysis artifacts into portable single-file outputs for pure extraction and local rebuild.

**Parameters:**

- `taskId`
- `artifactMode`
- `includePurePortable`
- `includeRebuildPortable`

### `export_rebuild_bundle`

**Description:** Export a local Node rebuild bundle from observed reverse-engineering evidence.

**Parameters:**

- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`
- `autoGenerate`
- `autoExportPortable`
- `targetKeywords`
- `targetUrlPatterns`
- `targetFunctionNames`
- `targetActionDescription`
- `maxEvidenceItems`
- `entryCode`
- `envCode`
- `polyfillsCode`
- `capture`
- `notes`

### `export_session_report`

**Description:** Export current reverse-engineering session as JSON or Markdown.

**Parameters:**

- `format`
- `includeHookData`

### `extract_function_tree`

**Description:** Extracts a target function and its local dependency tree from a script, returning a compact code slice for follow-up reverse analysis.

**Parameters:**

- `pageIdx`
- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`
- `persistResult`
- `scriptId`
- `functionName`
- `maxDepth`
- `maxSize`
- `includeComments`

### `find_in_script`

**Description:** Finds a string in a specific script and returns its exact line/column position with surrounding context. Ideal for setting breakpoints in minified files where the entire code is on one line.

**Parameters:**

- `pageIdx`
- `scriptId`
- `query`
- `contextChars`
- `occurrence`
- `caseSensitive`

### `generate_parameter_report`

**Description:** Generate a concise parameter-chain report from target, candidates, evidence, and next steps.

**Parameters:**

- `targetUrl`
- `parameterNames`
- `candidateFunctions`
- `evidence`
- `nextSteps`

### `get_hook_data`

**Description:** Get captured data for one hook or all hooks. Supports raw view and summary view for noise reduction.

**Parameters:**

- `hookId`
- `view`
- `maxRecords`

### `get_parameter_workflow`

**Description:** Get one packaged parameter workflow by id or alias.

**Parameters:**

- `id`

### `get_paused_info`

**Description:** Gets information about the current paused state including call stack, current location, and scope variables. Use this after a breakpoint is hit to understand the execution context.

**Parameters:**

- `pageIdx`
- `includeScopes`
- `maxScopeDepth`

### `get_rebuild_health_report`

**Description:** Produce a compact rebuild health report for one reverse task, including env blockers, evidence aggregates, and next fixes.

**Parameters:**

- `taskId`
- `outputMode`
- `observedCapabilities`

### `get_reference`

**Description:** Read one packaged reference doc, or return its compact summary.

**Parameters:**

- `mode`
- `docId`
- `maxSections`

### `get_reference_route`

**Description:** Route by stage, topic, or natural-language query to the most relevant reference docs.

**Parameters:**

- `mode`
- `stage`
- `topic`
- `query`

### `get_request_initiator`

**Description:** Gets the JavaScript call stack that initiated a network request. This helps trace which code triggered an API call.

**Parameters:**

- `requestId`
- `pageIdx`
- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`

### `get_script_source`

**Description:** Gets the source code of a JavaScript script by its script ID. Supports line range (for normal files) or character offset (for minified single-line files). Use list_scripts first to find the script ID.

**Parameters:**

- `pageIdx`
- `scriptId`
- `startLine`
- `endLine`
- `offset`
- `length`

### `get_storage`

**Description:** Gets browser storage data including cookies, localStorage, and sessionStorage.

**Parameters:**

- `pageIdx`
- `type`
- `filter`

### `hook_function`

**Description:** Recommended default for reverse engineering: hook a function and log calls/args/results without pausing execution.

**Parameters:**

- `pageIdx`
- `target`
- `logArgs`
- `logResult`
- `logStack`
- `hookId`

### `inject_hook`

**Description:** Inject an existing hook into the current page.

**Parameters:**

- `hookId`

### `inject_stealth`

**Description:** Inject anti-detection stealth scripts to current page.

**Parameters:**

- `preset`

### `inspect_object`

**Description:** Deeply inspects a JavaScript object, showing its properties, prototype chain, and methods. Useful for understanding object structure.

**Parameters:**

- `expression`
- `depth`
- `showMethods`
- `showPrototype`

### `list_hooks`

**Description:** Lists all active function hooks.

### `list_parameter_workflows`

**Description:** List packaged parameter workflows that can guide reverse-engineering and rebuild steps.

### `list_scripts`

**Description:** Lists all JavaScript scripts loaded in the current page. Returns script ID, URL, and source map information. Use this to find scripts before setting breakpoints or searching.

**Parameters:**

- `pageIdx`
- `filter`

### `list_stealth_features`

**Description:** List available stealth feature toggles.

### `list_stealth_presets`

**Description:** List available stealth presets.

### `list_task_artifacts`

**Description:** List files, sizes, and update times for a reverse task artifact directory.

**Parameters:**

- `taskId`

### `locate_candidate_functions`

**Description:** Score likely signature/token/request functions from code files, params, headers, and target URL hints.

**Parameters:**

- `targetUrl`
- `parameterNames`
- `headerNames`
- `keywords`
- `files`
- `maxCandidates`

### `locate_signature_function`

**Description:** Collect candidate scripts and rank likely signature-generation functions for a target parameter.

**Parameters:**

- `url`
- `taskId`
- `taskSlug`
- `goal`
- `persistResult`
- `targetParam`
- `relatedParams`
- `candidateScripts`
- `observedFunctions`
- `preferredUrlPatterns`
- `topN`
- `maxCandidates`
- `collect`

### `manage_reverse_task`

**Description:** Unified reverse task entry for list/get/summarize/progress/update/timeline/archive/restore/search/tag/prune/compare actions. Preferred task-management entry to reduce tool-selection overhead.

**Parameters:**

- `action`
- `taskId`
- `otherTaskId`
- `outputMode`
- `limit`
- `timelineLimit`
- `evidenceLimit`
- `includeArchived`
- `query`
- `tag`
- `tags`
- `replaceTags`
- `pruneOlderThanDays`
- `taskSlug`
- `targetUrl`
- `goal`
- `currentStage`
- `status`
- `currentSummary`
- `nextStepHint`
- `successCriteria`
- `stage`
- `timelineAction`
- `timelineStatus`
- `result`
- `next`
- `detail`

### `monitor_events`

**Description:** Monitors DOM events on a specified element or window. Events will be logged to console.

**Parameters:**

- `selector`
- `events`
- `monitorId`
- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`

### `orchestrate_reverse_task`

**Description:** High-level reverse-task orchestrator that syncs task state, picks the primary next step, and returns a compact execution plan.

**Parameters:**

- `taskId`
- `persistState`
- `includeSummary`
- `execute`
- `resume`
- `stopOnError`
- `strategy`
- `outputMode`
- `skipSteps`
- `fromStep`
- `onlySteps`
- `executionOverrides`

### `pause`

**Description:** Pauses JavaScript execution at the current point. Use this to interrupt running code.

**Parameters:**

- `pageIdx`

### `probe_runtime_capabilities`

**Description:** Probe browser runtime capabilities and compare them with Node rebuild assumptions.

**Parameters:**

- `targetPageIdx`

### `prune_task_artifacts`

**Description:** Remove old task artifact directories by age, with dry-run support by default.

**Parameters:**

- `olderThanDays`
- `dryRun`

### `recommend_next_step`

**Description:** Recommend the next reverse-engineering action from lightweight workflow signals.

**Parameters:**

- `taskId`
- `browserHealthy`
- `pageReady`
- `taskGoal`
- `currentStage`
- `taskStatus`
- `hasTargetRequest`
- `hookRecordCount`
- `hasRebuildBundle`
- `hasPassingRebuild`
- `firstDivergenceKnown`

### `recommend_parameter_workflow`

**Description:** Recommend the closest packaged parameter workflow from a keyword, alias, or short natural-language query.

**Parameters:**

- `query`

### `record_reverse_evidence`

**Description:** Append structured reverse-engineering evidence to a task artifact log.

**Parameters:**

- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`
- `channel`
- `targetKeywords`
- `targetUrlPatterns`
- `targetFunctionNames`
- `targetActionDescription`
- `entry`

### `remove_hook`

**Description:** Remove a hook by id.

**Parameters:**

- `hookId`

### `resume`

**Description:** Resumes JavaScript execution after being paused at a breakpoint. Execution continues until the next breakpoint or completion.

**Parameters:**

- `pageIdx`

### `risk_panel`

**Description:** Build a combined risk score from analyzer, crypto detector and hook signals.

**Parameters:**

- `code`
- `useAI`
- `includeHookSignals`
- `hookId`
- `topN`

### `run_reverse_agent`

**Description:** One-shot reverse agent entry: repeatedly plans and executes the main reverse chain until blocked, stalled, or reaching the analysis checkpoint.

**Parameters:**

- `taskId`
- `maxRounds`
- `strategy`
- `goalMode`
- `autoExportPortable`
- `outputMode`
- `includeSummary`

### `search_in_scripts`

**Description:** Search in collected script cache with regex pattern.

**Parameters:**

- `pattern`
- `limit`
- `maxTotalSize`

### `search_in_sources`

**Description:** Searches for a string or regex pattern in all loaded JavaScript sources. Returns matching lines with script ID, URL, and line number. Use get_script_source with startLine/endLine to view full context around matches.

**Parameters:**

- `pageIdx`
- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`
- `persistResult`
- `query`
- `caseSensitive`
- `isRegex`
- `maxResults`
- `maxLineLength`
- `excludeMinified`
- `urlFilter`

### `set_breakpoint_on_text`

**Description:** Sets a breakpoint on specific code (function name, statement, etc.) by searching for it and automatically determining the exact position. Works with both normal and minified files. NOTE: Prefer hook_function for monitoring function calls — it captures args/results without pausing execution. Use this only when you need to inspect local variables at a specific code location.

**Parameters:**

- `pageIdx`
- `text`
- `urlFilter`
- `occurrence`
- `condition`

### `set_user_agent`

**Description:** Set custom user-agent for active page.

**Parameters:**

- `userAgent`

### `start_reverse_task`

**Description:** Initialize a task artifact directory with task.json, state.json, report.md, and first timeline entry.

**Parameters:**

- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`
- `currentStage`
- `currentSummary`
- `successCriteria`
- `targetContext`

### `step_into`

**Description:** Steps into the next function call. Use this to enter and debug function bodies.

**Parameters:**

- `pageIdx`

### `step_out`

**Description:** Steps out of the current function, continuing until the function returns. Use this to quickly exit a function.

**Parameters:**

- `pageIdx`

### `step_over`

**Description:** Steps over to the next statement, treating function calls as a single step. Use this to move through code without entering function bodies.

**Parameters:**

- `pageIdx`

### `stop_monitor`

**Description:** Stops an event monitor.

**Parameters:**

- `monitorId`

### `summarize_code`

**Description:** Summarize one code file, multiple files, or project-level context.

**Parameters:**

- `mode`
- `code`
- `url`
- `files`

### `trace_function`

**Description:** Traces calls to a function by its name in the source code. Works for ANY function including module-internal functions (webpack/rollup bundled). Uses "logpoints" (conditional breakpoints) to log arguments without pausing execution.

**Parameters:**

- `pageIdx`
- `functionName`
- `urlFilter`
- `logArgs`
- `logThis`
- `pause`
- `traceId`
- `taskId`
- `taskSlug`
- `targetUrl`
- `goal`

### `understand_code`

**Description:** Analyze code structure/business/security with AI + static analysis.

**Parameters:**

- `code`
- `focus`
- `aiMode`

### `unhook_function`

**Description:** Removes a previously installed function hook.

**Parameters:**

- `hookId`

### `xhr_breakpoint`

**Description:** Set or remove an XHR/Fetch breakpoint by URL substring match.

**Parameters:**

- `action`
- `pageIdx`
- `url`
