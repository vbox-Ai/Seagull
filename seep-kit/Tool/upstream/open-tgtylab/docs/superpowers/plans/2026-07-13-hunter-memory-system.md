# Hunter Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement persistent target memory, technique effectiveness, reusable patterns, passive fingerprint matching, and five MCP tools.

**Architecture:** Use one SQLite database with focused repository classes. Keep pattern/fingerprint matching deterministic and side-effect free; MCP wrappers only validate inputs, call local repositories, and return the existing Hunter JSON envelope.

**Tech Stack:** Python standard library `sqlite3`, dataclasses, regex, JSON, existing Hunter `FastMCP`, pytest.

---

### Task 1: RED tests

**Files:**
- Create: `C:\Users\USERNAME\.agents\skills\hunter\tests\test_memory.py`

- [ ] Write tests for schema creation, target query, regression, technique ranking, pattern matching, fingerprint seed counts, and five MCP tools.
- [ ] Run `python -m pytest tests/test_memory.py -q`; confirm collection fails because `core.memory` is missing.

### Task 2: Target and technique persistence

**Files:**
- Create: `C:\Users\USERNAME\.agents\skills\hunter\core\memory\__init__.py`
- Create: `C:\Users\USERNAME\.agents\skills\hunter\core\memory\target_memory.py`
- Create: `C:\Users\USERNAME\.agents\skills\hunter\core\memory\technique_memory.py`

- [ ] Implement idempotent schema initialization at `D:\Open-tgtylab\data\targets.db`.
- [ ] Implement target/fingerprint/endpoint/vulnerability/history CRUD and regression comparison.
- [ ] Implement technique registration, attempt recording, WAF-specific ranking, combinations, retirement, and stats refresh.
- [ ] Run target/technique tests and confirm GREEN.

### Task 3: Pattern engine

**Files:**
- Create: `C:\Users\USERNAME\.agents\skills\hunter\core\memory\pattern_engine.py`

- [ ] Implement parameter-to-vulnerability associations, response indicators, stack-to-strategy recommendations, and history-driven extraction.
- [ ] Return confidence and evidence strings for every recommendation.
- [ ] Run pattern tests.

### Task 4: Fingerprint database

**Files:**
- Create: `C:\Users\USERNAME\.agents\skills\hunter\core\memory\fingerprint_database.py`

- [ ] Seed at least 30 WAF, 50 CMS, 30 framework, and common API signatures.
- [ ] Implement case-insensitive header/body/path/favicon matching with confidence scores.
- [ ] Run fingerprint count and detection tests.

### Task 5: MCP integration and contract

**Files:**
- Modify: `C:\Users\USERNAME\.agents\skills\hunter\mcp_server.py`
- Modify: `C:\Users\USERNAME\.agents\skills\hunter\integration-contract.json`
- Modify: `C:\Users\USERNAME\.agents\skills\hunter\core\hunter_tools_facade.py`
- Modify: `C:\Users\USERNAME\.agents\skills\hunter\README.md`
- Modify: `C:\Users\USERNAME\.agents\skills\hunter\TOOLS.md`
- Modify: `C:\Users\USERNAME\.agents\skills\hunter\SKILL.md`

- [ ] Add memory store lifecycle and five MCP wrappers.
- [ ] Add five required tools to the contract and capabilities.
- [ ] Keep fingerprint detection passive and memory recommendations non-executing.
- [ ] Run MCP smoke and contract checks.

### Task 6: Verification and evidence

**Files:**
- Modify: `D:\Open-tgtylab\cases\hunter-skill\state.json`
- Create: `D:\Open-tgtylab\exports\notes\hunter-memory-system-20260713.md`

- [ ] Run focused memory tests and the full Hunter suite.
- [ ] Run compile, JSON, contract, and diff checks.
- [ ] Record exact counts, residual failures, and next steps.
