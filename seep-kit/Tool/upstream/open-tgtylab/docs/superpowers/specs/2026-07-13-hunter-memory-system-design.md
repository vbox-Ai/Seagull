# Hunter Memory System Design

**Goal:** Add a local, explainable learning system that stores target observations and attack outcomes, aggregates technique effectiveness, extracts reusable patterns, and exposes safe MCP queries/recommendations.

## Architecture

The memory system is split into four focused Python modules under
`C:\Users\USERNAME\.agents\skills\hunter\core\memory\`:

- `target_memory.py` owns the SQLite schema and target-scoped CRUD/regression
  operations.
- `technique_memory.py` owns attempts, aggregate success rates, WAF-specific
  ranking, low-success retirement, and new-technique registration.
- `pattern_engine.py` is a deterministic rule engine for parameter names,
  response indicators, and technology-stack strategy recommendations.
- `fingerprint_database.py` owns seeded WAF/CMS/framework/API signatures and
  confidence-scored matching against caller-provided observations.

All SQL is parameterized. Writes use transactions and normalized identifiers.
Sensitive values such as credentials, authorization headers, cookies, and full
payloads are not copied into aggregate recommendation output; attack history
stores bounded payload metadata and an explicit success flag.

## Data Flow

`hunter_memory_record` validates and writes target/technique/pattern records.
`hunter_memory_query` reads historical records or ranked technique results.
`hunter_memory_recommend` combines target history, technique statistics, and
pattern rules into explainable, non-executing recommendations.
`hunter_fingerprint_detect` matches caller-supplied passive observations against
the local fingerprint database and stores no target request side effects.

## Safety and Compatibility

The fingerprint tool does not make network requests. It accepts optional
observations and returns a deferred observation request description when no
observations are supplied. The implementation uses the existing Hunter JSON
envelope and adds exactly five tools to the current contract. Existing browser,
session, reverse, and workflow code remains outside the memory module boundary.

## Verification

`tests/test_memory.py` covers database creation, target recording/querying,
regression status, technique ranking, pattern recommendations, seeded
fingerprint counts/detection, and MCP smoke calls. Full Hunter tests are run
after focused tests, with unrelated pre-existing reverse-worktree failures
reported separately.
