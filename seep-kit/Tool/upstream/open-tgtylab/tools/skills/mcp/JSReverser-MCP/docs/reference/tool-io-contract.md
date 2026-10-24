# 全工具读写契约表

更新时间：2026-03-05

## 统一数据平面（Single Source of Truth）

1. Hook 采集数据：`window.__hookStore[hookId]`（页面侧唯一键）
2. Hook 安装元信息：`window.__mcp_hooks__`（仅用于 list/unhook，不存采集数据）
3. 事件监控元信息：`window.__mcp_monitors__`（monitor/stop 管理）
4. 服务器侧 Hook 汇总：`runtime.hookManager`（由 `get_hook_data` 从 `__hookStore` 同步）
5. 采集缓存：`runtime.collector` + `UnifiedCacheManager`（代码/摘要/统计缓存）
6. 任务工件：`artifacts/tasks/<taskId>/...`（证据、env、报告、bundle）

## 契约规则

- 同一类数据只能有一个页面侧主键（例如 Hook 数据只能写 `__hookStore`）。
- 工具读取路径必须对齐写入路径，禁止写 A 读 B。
- 汇总工具（`get_hook_data`/`risk_panel`/`export_session_report`）必须使用 `hookManager.getAllKnownHookIds()` 口径。

## 工具读写契约（全量）

| Tool                         | Read Sources                                                       | Write Sources                            | Canonical Store                                      |
| ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| `analyze_target`             | `runtime.collector` + `runtime.hookManager` + 代码文本             | 分析结果；部分工具写 task artifact       | HookManager / Artifacts                              |
| `deobfuscate_code`           | `runtime.collector` + `runtime.hookManager` + 代码文本             | 分析结果；部分工具写 task artifact       | HookManager / Artifacts                              |
| `detect_crypto`              | `runtime.collector` + `runtime.hookManager` + 代码文本             | 分析结果；部分工具写 task artifact       | HookManager / Artifacts                              |
| `export_session_report`      | `hookManager.getAllKnownHookIds()` + `getRecords()`                | Response report                          | HookManager                                          |
| `record_reverse_evidence`    | 请求参数 + 当前上下文                                              | task artifact 文件                       | `artifacts/tasks/*`                                  |
| `risk_panel`                 | `hookManager.getAllKnownHookIds()` + `getRecords()`                | Response report                          | HookManager                                          |
| `summarize_code`             | `runtime.collector` + `runtime.hookManager` + 代码文本             | 分析结果；部分工具写 task artifact       | HookManager / Artifacts                              |
| `understand_code`            | `runtime.collector` + `runtime.hookManager` + 代码文本             | 分析结果；部分工具写 task artifact       | HookManager / Artifacts                              |
| `collect_code`               | `runtime.collector` + 页面脚本/网络                                | `runtime.collector` 缓存                 | Collector Cache / UnifiedCache                       |
| `collection_diff`            | `runtime.collector` + 页面脚本/网络                                | `runtime.collector` 缓存                 | Collector Cache / UnifiedCache                       |
| `search_in_scripts`          | `runtime.collector` + 页面脚本/网络                                | `runtime.collector` 缓存                 | Collector Cache / UnifiedCache                       |
| `console_message`            | Console 缓存                                                       | Response attach only                     | CDP Console                                          |
| `xhr_breakpoint`             | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `evaluate_on_callframe`      | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `find_in_script`             | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `get_paused_info`            | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `get_request_initiator`      | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `get_script_source`          | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `get_storage`                | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `hook_function`              | 目标函数调用上下文                                                 | `__mcp_hooks__` + `__hookStore[hookId]`  | `__hookStore`（唯一数据面）                          |
| `inspect_object`             | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `breakpoint`                 | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `list_hooks`                 | `__mcp_hooks__`                                                    | -                                        | `__mcp_hooks__`                                      |
| `list_scripts`               | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `monitor_events`             | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `pause`                      | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `resume`                     | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `search_in_sources`          | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `set_breakpoint_on_text`     | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `step_into`                  | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `step_out`                   | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `step_over`                  | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `stop_monitor`               | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `trace_function`             | DebuggerContext + Page Runtime                                     | 断点/XHR 规则/页面注入状态               | `__hookStore` / `__mcp_hooks__` / `__mcp_monitors__` |
| `unhook_function`            | `__mcp_hooks__`                                                    | 恢复原函数并删除 `__mcp_hooks__[hookId]` | `__mcp_hooks__`                                      |
| `find_clickable_elements`    | DOM Runtime                                                        | Response only                            | -                                                    |
| `get_dom_structure`          | DOM Runtime                                                        | Response only                            | -                                                    |
| `query_dom`                  | DOM Runtime                                                        | Response only                            | -                                                    |
| `list_frames`                | Frame 列表                                                         | selected frame                           | Runtime selectedFrame                                |
| `select_frame`               | Frame 列表                                                         | selected frame                           | Runtime selectedFrame                                |
| `create_hook`                | `window.__hookStore` + `runtime.hookManager`                       | `runtime.hookManager`（同步后）          | `__hookStore` / HookManager                          |
| `get_hook_data`              | `__hookStore` -> `hookManager`                                     | `hookManager` 同步数据                   | `__hookStore` / HookManager                          |
| `inject_hook`                | `window.__hookStore` + `runtime.hookManager`                       | `runtime.hookManager`（同步后）          | `__hookStore` / HookManager                          |
| `remove_hook`                | `window.__hookStore` + `runtime.hookManager`                       | `runtime.hookManager`（同步后）          | `__hookStore` / HookManager                          |
| `network_request`            | Network 面板缓存                                                   | Response attach only                     | CDP Network                                          |
| `check_browser_health`       | PageController + 浏览器会话状态                                    | SessionState 快照/恢复                   | In-memory SessionState                               |
| `click_element`              | PageController + 浏览器会话状态                                    | SessionState 快照/恢复                   | In-memory SessionState                               |
| `session_state`              | SessionState 管理器                                                | SessionState 管理器                      | In-memory SessionState                               |
| `get_performance_metrics`    | PageController + 浏览器会话状态                                    | SessionState 快照/恢复                   | In-memory SessionState                               |
| `type_text`                  | PageController + 浏览器会话状态                                    | SessionState 快照/恢复                   | In-memory SessionState                               |
| `wait_for_element`           | PageController + 浏览器会话状态                                    | SessionState 快照/恢复                   | In-memory SessionState                               |
| `list_pages`                 | BrowserManager pages                                               | 当前页选择/导航                          | BrowserManager currentPage                           |
| `navigate_page`              | BrowserManager pages                                               | 当前页选择/导航                          | BrowserManager currentPage                           |
| `new_page`                   | BrowserManager pages                                               | 当前页选择/导航                          | BrowserManager currentPage                           |
| `select_page`                | BrowserManager pages                                               | 当前页选择/导航                          | BrowserManager currentPage                           |
| `diff_env_requirements`      | 运行时失败信息 + 页面能力 + 证据输入（辅助补环境，不替代代理日志） | rebuild bundle/task artifacts            | Artifacts                                            |
| `export_rebuild_bundle`      | 请求参数 + 当前上下文                                              | task artifact 文件                       | `artifacts/tasks/*`                                  |
| `take_screenshot`            | 页面/元素渲染                                                      | 截图文件或响应附件                       | filesystem(optional)                                 |
| `evaluate_script`            | 当前 frame runtime                                                 | 页面注入脚本                             | PreloadScript Registry                               |
| `inject_preload_script`      | 当前 frame runtime                                                 | 页面注入脚本                             | PreloadScript Registry                               |
| `inject_stealth`             | Stealth 配置                                                       | 页面 stealth 注入 / UA                   | Stealth Runtime                                      |
| `list_stealth_features`      | Stealth 配置                                                       | 页面 stealth 注入 / UA                   | Stealth Runtime                                      |
| `list_stealth_presets`       | Stealth 配置                                                       | 页面 stealth 注入 / UA                   | Stealth Runtime                                      |
| `set_user_agent`             | Stealth 配置                                                       | 页面 stealth 注入 / UA                   | Stealth Runtime                                      |
| `analyze_websocket_messages` | WebSocket 帧缓存                                                   | Response attach only                     | CDP WebSocket                                        |
| `get_websocket_message`      | WebSocket 帧缓存                                                   | Response attach only                     | CDP WebSocket                                        |
| `get_websocket_messages`     | WebSocket 帧缓存                                                   | Response attach only                     | CDP WebSocket                                        |
| `list_websocket_connections` | WebSocket 帧缓存                                                   | Response attach only                     | CDP WebSocket                                        |
