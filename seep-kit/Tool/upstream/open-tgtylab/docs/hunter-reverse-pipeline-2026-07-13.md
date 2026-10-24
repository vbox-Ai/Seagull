# Hunter Binary and Android Reverse Pipeline

Hunter now provides a persistent orchestration layer for authorized binary and
Android security analysis. The pipeline coordinates existing Ghidra,
ReverseLabTools, Frida, apktool, and jadx capabilities without claiming that an
external analysis ran when the backend is unavailable.

## Architecture

The native binary pipeline persists six ordered stages:

1. `triage` — hashes, type, entropy, packer/protector, compiler/language, and
   `triage_pe`/`die_scan` handoffs.
2. `static` — local string/import candidates plus normalized
   `ghidra_headless_analyze` summaries, functions, exports, entry point, xrefs,
   call graph, and API annotations.
3. `identify` — evidence-ranked crypto, network, anti-debug, C2, and persistence
   candidates.
4. `plan` — x64dbg, Frida, Procmon, and decrypt/unpack plans.
5. `capture` — external dynamic execution with explicit
   `awaiting-external` state when no backend runner is connected.
6. `produce` — Markdown/JSON reports, IOC inventory, YARA, Sigma, and
   evidence-derived decrypt scripts.

Each run is stored under:

```text
exports/reverse/<pipeline_id>/
├── state.json
├── captures/
├── external/
├── plans/
├── reports/
└── scripts/
```

State writes are atomic. Reopening a pipeline validates the sample path, size,
and SHA-256 so completed results cannot be silently reused after the sample
changes.

## Android Extension

The Android pipeline adds dedicated stages for:

- decoded `AndroidManifest.xml`, permissions, components, exported attack
  surface, and intent filters;
- jadx Java/DEX discovery for crypto, OkHttp/Retrofit,
  `HttpURLConnection`, WebView bridges, and dynamic loading;
- safe SO extraction by ABI, JNI/native signal discovery, and Ghidra handoffs;
- Frida Server preparation plus HTTP, crypto/unpack, WebView, Base64, and
  custom hook collection;
- post-processing of key/IV, dynamic DEX, native buffers, and carved payloads.

If apktool or jadx is absent, the state records an explicit capability gap and
keeps the external action pending.

## MCP Tools

The complete `hunter_tools` server exposes:

- `hunter_reverse_binary(sample_path, type="auto")`
- `hunter_reverse_step(pipeline_id, step_name)`
- `hunter_reverse_extract_iocs(pipeline_id)`
- `hunter_reverse_generate_rules(pipeline_id)`
- `hunter_reverse_decrypt_plan(pipeline_id)`

All tools return the standard Hunter envelope:

```json
{
  "tool": "hunter_reverse_binary",
  "status": "ok",
  "data": {},
  "evidence": {},
  "next_actions": []
}
```

The MCP server persists orchestration and artifacts. It does not directly
dispatch another MCP server from inside Hunter; external calls remain auditable
handoff descriptors unless an authorized backend runner is injected.

## Safety and Evidence

- Original samples are read-only.
- Dynamic capture is never reported as complete without a successful backend
  result.
- Backend `error` or `failed` results fail the active pipeline step.
- User-controlled pipeline IDs cannot escape the configured output root.
- Heuristic API/string indicators are labeled separately from xref-confirmed
  functions.
- YARA/Sigma output combines exact hashes with evidence-derived strings and
  behavior indicators.

## Verification

The reverse-specific suite covers binary type detection, packer detection,
function correlation, six-step persistence, Ghidra result normalization,
backend error handling, sample mutation protection, output-path safety, final
report consistency, crypto-script generation, Android analysis, MCP
registration, and integration-contract membership.
