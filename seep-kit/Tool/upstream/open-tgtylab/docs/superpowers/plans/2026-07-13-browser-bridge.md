# Browser Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a safe browser bridge for Hunter that emits Playwright MCP call plans, captures browser observations, injects auditable hooks, and exposes six MCP tools without directly controlling a browser.

**Architecture:** The bridge is split into a pure descriptor/controller layer, a WebSocket normalization and approval layer, a JavaScript hook/template layer, and an encrypted browser-session store. `mcp_server.py` only wraps these components and returns deferred external-MCP handoffs.

**Tech Stack:** Python standard library, existing Hunter `FastMCP`, JSON state files, `SecretStore`, JavaScript templates validated by Node, pytest.

---

## Work Items

- [x] Add `BrowserController` and `ElementLocator` with ordered locator fallbacks, waits, interaction sequences, snapshots, and deferred Hunter routing.
- [x] Add `WebSocketCapture` with JSON/text/binary normalization, binary format inference, structural diffs, sequence storage, and independent approval-token replay gating.
- [x] Add six idempotent hook templates and `DynamicHookInjector` preload/postload/refresh plans.
- [x] Add `BrowserSessionStore` with path-safe persistence, encrypted hook records, redaction, bounded records, and console-prefix ingestion.
- [x] Register `hunter_browser_navigate`, `hunter_browser_interact`, `hunter_browser_capture_network`, `hunter_browser_inject_hooks`, `hunter_browser_get_hook_results`, and `hunter_browser_snapshot`.
- [x] Raise the integration contract from 94 to 100 tools and document the external Playwright MCP boundary.
- [x] Add browser bridge tests and run focused verification.

## Safety Invariants

Every browser action remains `execution: "deferred"` and `mode: "external-mcp-handoff"`. Hunter observations route only to confirmation-gated descriptors. The bridge never launches a browser, evaluates page JavaScript, sends requests, or replays WebSocket data inside the Hunter process.
