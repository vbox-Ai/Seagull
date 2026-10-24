/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {buildRebuildHealthAgentHints} from '../reverse/ReverseTaskAgentProtocol.js';
import {updateReverseTaskState} from '../reverse/ReverseTaskState.js';
import {zod} from '../third_party/index.js';
import type {CodeFile} from '../types/index.js';

import {ToolCategory} from './categories.js';
import {
  buildRebuildContinuation,
  compactAgentPayload,
  withSchemaVersion,
} from './response-builder.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool} from './ToolDefinition.js';

async function writeArtifactFile(
  taskDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = path.join(taskDir, relativePath);
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(filePath, content, 'utf8');
}

function makePortableResponse() {
  return {
    lines: [] as string[],
    appendResponseLine(value: string) {
      this.lines.push(value);
    },
    setIncludePages: () => undefined,
    setIncludeNetworkRequests: () => undefined,
    setIncludeConsoleData: () => undefined,
    attachImage: () => undefined,
    attachNetworkRequest: () => undefined,
    attachConsoleMessage: () => undefined,
    setIncludeWebSocketConnections: () => undefined,
    attachWebSocket: () => undefined,
  };
}

async function persistCompactDeliveryStatus(args: {
  taskId: string;
  taskDir: string;
  generatedFiles: string[];
  verification?: PortableBundleVerification;
}): Promise<void> {
  if (args.generatedFiles.length === 0) {
    return;
  }
  const runtime = getJSHookRuntime();
  const existingState = await runtime.reverseTaskStore.readSnapshot<
    Record<string, unknown>
  >(args.taskId, 'state.json');
  const taskSnapshot = await runtime.reverseTaskStore.readSnapshot<
    Record<string, unknown>
  >(args.taskId, 'task.json');
  const currentStage = String(
    existingState?.currentStage ?? taskSnapshot?.currentStage ?? 'Observe',
  );
  const status = String(existingState?.status ?? 'active') as
    | 'active'
    | 'blocked'
    | 'partial'
    | 'pass';
  const summary = `已生成便携交付文件：${args.generatedFiles.join(', ')}`;

  await updateReverseTaskState(runtime.reverseTaskStore, {
    taskId: args.taskId,
    currentStage,
    status,
    currentSummary: summary,
    nextStepHint: String(
      existingState?.nextStepHint ?? 'manage_reverse_task:summarize',
    ),
  });

  const task = await runtime.reverseTaskStore.openTask({
    taskId: args.taskId,
    slug: String(taskSnapshot?.slug ?? args.taskId),
    targetUrl: String(taskSnapshot?.targetUrl ?? ''),
    goal: String(taskSnapshot?.goal ?? ''),
    currentStage,
    currentSummary: summary,
  });
  await task.appendTimeline({
    stage: currentStage.toLowerCase(),
    action: 'compact_delivery_ready',
    status: 'ok',
    result: args.generatedFiles.join(', '),
    next: 'manage_reverse_task:summarize',
  });
  await task.appendLog('runtime-evidence', {
    source: 'export_portable_bundle',
    kind: 'compact-delivery',
    files: args.generatedFiles,
    verification: args.verification,
    note: summary,
  });
  if (args.verification?.ok) {
    await task.appendTimeline({
      stage: currentStage.toLowerCase(),
      action: 'compact_delivery_verified',
      status: 'ok',
      result: args.verification.verifiedFiles.join(', '),
      next: 'manage_reverse_task:summarize',
    });
  }
}

interface PortableBundleVerification {
  checked: boolean;
  ok: boolean;
  verifiedFiles: string[];
  errors: string[];
}

async function verifyPortableBundleFiles(
  taskDir: string,
  generatedFiles: string[],
): Promise<PortableBundleVerification> {
  const verifiedFiles: string[] = [];
  const errors: string[] = [];
  for (const file of generatedFiles) {
    try {
      const content = await readFile(path.join(taskDir, file), 'utf8');
      if (!content.trim()) {
        errors.push(`${file}: empty file`);
        continue;
      }
      if (!content.includes('export ')) {
        errors.push(`${file}: missing export`);
        continue;
      }
      verifiedFiles.push(file);
    } catch (error) {
      errors.push(
        `${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    checked: true,
    ok: errors.length === 0,
    verifiedFiles,
    errors,
  };
}

async function artifactExists(
  taskDir: string,
  relativePath: string,
): Promise<boolean> {
  try {
    await access(path.join(taskDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJsonArtifact(
  taskDir: string,
  relativePath: string,
): Promise<Record<string, unknown> | undefined> {
  if (!(await artifactExists(taskDir, relativePath))) {
    return undefined;
  }
  return JSON.parse(
    await readFile(path.join(taskDir, relativePath), 'utf8'),
  ) as Record<string, unknown>;
}

async function readTextArtifact(
  taskDir: string,
  relativePath: string,
): Promise<string | undefined> {
  if (!(await artifactExists(taskDir, relativePath))) {
    return undefined;
  }
  return readFile(path.join(taskDir, relativePath), 'utf8');
}

function buildDefaultEnvCode(): string {
  return [
    'globalThis.window = globalThis;',
    'globalThis.self = globalThis;',
    'globalThis.global = globalThis;',
    'globalThis.document ??= {cookie: "", location: {href: ""}};',
    'globalThis.navigator ??= {userAgent: "JSReverser-MCP"};',
    'globalThis.location ??= {href: ""};',
    'globalThis.atob ??= (value) => Buffer.from(value, "base64").toString("utf8");',
    'globalThis.btoa ??= (value) => Buffer.from(value, "utf8").toString("base64");',
    'globalThis.crypto ??= {subtle: {}};',
  ].join('\n');
}

function toStorageShimCode(
  name: 'localStorage' | 'sessionStorage',
  values: Record<string, unknown>,
): string {
  const entries = Object.entries(values);
  return [
    `const ${name}Seed = new Map(${JSON.stringify(entries)});`,
    `globalThis.${name} = {`,
    '  getItem(key) { return this._store.has(key) ? this._store.get(key) : null; },',
    '  setItem(key, value) { this._store.set(String(key), String(value)); },',
    '  removeItem(key) { this._store.delete(String(key)); },',
    '  clear() { this._store.clear(); },',
    '  key(index) { return Array.from(this._store.keys())[index] ?? null; },',
    '  get length() { return this._store.size; },',
    `  _store: ${name}Seed,`,
    '};',
  ].join('\n');
}

function buildAutoEnvCode(capture: Record<string, unknown>): string {
  const cookies = Array.isArray(capture.cookies) ? capture.cookies : [];
  const localStorageValues =
    capture.localStorage && typeof capture.localStorage === 'object'
      ? (capture.localStorage as Record<string, unknown>)
      : {};
  const sessionStorageValues =
    capture.sessionStorage && typeof capture.sessionStorage === 'object'
      ? (capture.sessionStorage as Record<string, unknown>)
      : {};
  const page =
    capture.page && typeof capture.page === 'object'
      ? (capture.page as Record<string, unknown>)
      : {};

  return [
    buildDefaultEnvCode(),
    `globalThis.location = {href: ${JSON.stringify(page.url ?? '')}};`,
    `globalThis.document = {cookie: ${JSON.stringify(cookies.map(cookie => `${String((cookie as Record<string, unknown>).name ?? '')}=${String((cookie as Record<string, unknown>).value ?? '')}`).join('; '))}, location: globalThis.location};`,
    toStorageShimCode('localStorage', localStorageValues),
    toStorageShimCode('sessionStorage', sessionStorageValues),
  ].join('\n\n');
}

function buildAutoEntryCode(
  targetScript: CodeFile | undefined,
  capture: Record<string, unknown>,
): string {
  return [
    'import "./env.js";',
    'import "./polyfills.js";',
    '',
    `const capture = ${JSON.stringify(capture, null, 2)};`,
    `capture.targetScript = ${JSON.stringify(targetScript ?? null, null, 2)};`,
    '',
    'if (capture.targetScript?.content) {',
    '  eval(capture.targetScript.content);',
    '}',
    '',
    'const targetFunction = capture.runtimeEvidence?.find((item) => typeof item.functionName === "string")?.functionName;',
    'if (targetFunction && typeof globalThis[targetFunction] === "function") {',
    '  console.log({targetFunction, result: globalThis[targetFunction]("token", "nonce")});',
    '} else {',
    '  console.log({message: "target function not callable yet", targetFunction});',
    '}',
  ].join('\n');
}

function appendTargetContextNotes(
  notes: string[],
  options: {
    targetKeywords: string[];
    targetUrlPatterns: string[];
    targetFunctionNames: string[];
    targetActionDescription: string;
  },
): string[] {
  return [
    ...notes,
    `targetKeywords: ${options.targetKeywords.length > 0 ? options.targetKeywords.join(', ') : '(none)'}`,
    `targetUrlPatterns: ${options.targetUrlPatterns.length > 0 ? options.targetUrlPatterns.join(', ') : '(none)'}`,
    `targetFunctionNames: ${options.targetFunctionNames.length > 0 ? options.targetFunctionNames.join(', ') : '(none)'}`,
    `targetActionDescription: ${options.targetActionDescription.length > 0 ? options.targetActionDescription : '(none)'}`,
  ];
}

function matchesTargetText(
  value: unknown,
  targetKeywords: string[],
  targetUrlPatterns: string[],
  targetFunctionNames: string[],
  targetActionDescription: string,
): boolean {
  const text =
    typeof value === 'string'
      ? value.toLowerCase()
      : JSON.stringify(value ?? '').toLowerCase();
  return (
    targetKeywords.some(keyword => text.includes(keyword.toLowerCase())) ||
    targetUrlPatterns.some(pattern => text.includes(pattern.toLowerCase())) ||
    targetFunctionNames.some(functionName =>
      text.includes(functionName.toLowerCase()),
    ) ||
    (targetActionDescription.length > 0 &&
      text.includes(targetActionDescription.toLowerCase()))
  );
}

function filterRuntimeEvidence(
  records: Array<Record<string, unknown>>,
  targetKeywords: string[],
  targetUrlPatterns: string[],
  targetFunctionNames: string[],
  targetActionDescription: string,
  maxEvidenceItems: number,
): Array<Record<string, unknown>> {
  const filtered =
    targetKeywords.length === 0 &&
    targetUrlPatterns.length === 0 &&
    targetFunctionNames.length === 0 &&
    targetActionDescription.length === 0
      ? records
      : records.filter(record =>
          matchesTargetText(
            record,
            targetKeywords,
            targetUrlPatterns,
            targetFunctionNames,
            targetActionDescription,
          ),
        );
  return filtered.slice(0, maxEvidenceItems);
}

function pickTargetScript(
  files: CodeFile[],
  targetKeywords: string[],
  targetUrlPatterns: string[],
  targetFunctionNames: string[],
  targetActionDescription: string,
): CodeFile | undefined {
  if (
    targetKeywords.length === 0 &&
    targetUrlPatterns.length === 0 &&
    targetFunctionNames.length === 0 &&
    targetActionDescription.length === 0
  ) {
    return files[0];
  }
  return (
    files.find(file =>
      matchesTargetText(
        file,
        targetKeywords,
        targetUrlPatterns,
        targetFunctionNames,
        targetActionDescription,
      ),
    ) ?? files[0]
  );
}

async function buildAutoBundle(
  taskId: string,
  runtime: ReturnType<typeof getJSHookRuntime>,
  options: {
    targetKeywords: string[];
    targetUrlPatterns: string[];
    targetFunctionNames: string[];
    targetActionDescription: string;
    maxEvidenceItems: number;
  },
): Promise<{
  entryCode: string;
  envCode: string;
  polyfillsCode: string;
  capture: Record<string, unknown>;
  notes: string[];
}> {
  const topPriority = runtime.collector.getTopPriorityFiles(1);
  const targetScript = pickTargetScript(
    topPriority.files,
    options.targetKeywords,
    options.targetUrlPatterns,
    options.targetFunctionNames,
    options.targetActionDescription,
  );
  const page = await runtime.pageController.getPage();
  const [cookies, localStorage, sessionStorage, runtimeEvidence] =
    await Promise.all([
      runtime.pageController.getCookies(),
      runtime.pageController.getLocalStorage(),
      runtime.pageController.getSessionStorage(),
      runtime.reverseTaskStore.readLog('runtime-evidence', taskId),
    ]);
  const filteredRuntimeEvidence = filterRuntimeEvidence(
    runtimeEvidence,
    options.targetKeywords,
    options.targetUrlPatterns,
    options.targetFunctionNames,
    options.targetActionDescription,
    options.maxEvidenceItems,
  );

  const capture = {
    page: {
      url: page.url(),
      title: await page.title(),
    },
    cookies,
    localStorage,
    sessionStorage,
    runtimeEvidence: filteredRuntimeEvidence,
    targetScript: targetScript ?? null,
  };

  return {
    entryCode: buildAutoEntryCode(targetScript, capture),
    envCode: buildAutoEnvCode(capture),
    polyfillsCode: '',
    capture,
    notes: appendTargetContextNotes(
      [
        targetScript
          ? `auto-selected target script: ${targetScript.url}`
          : 'no target script selected from collector',
        filteredRuntimeEvidence.length > 0
          ? `filtered runtime evidence records: ${filteredRuntimeEvidence.length}`
          : 'no runtime evidence records found after target filtering',
      ],
      options,
    ),
  };
}

function inferMissingCapabilities(
  runtimeError: string,
  observedCapabilities: string[],
): Array<{
  capability: string;
  reason: string;
  priority: number;
}> {
  const available = new Set(
    observedCapabilities.map(item => item.toLowerCase()),
  );
  const normalizedError = runtimeError.toLowerCase();
  const candidates = [
    {
      capability: 'window',
      patterns: ['window is not defined'],
      reason: 'Browser global root is missing in local execution.',
      priority: 100,
    },
    {
      capability: 'document',
      patterns: ['document is not defined'],
      reason: 'DOM access is required by the captured browser path.',
      priority: 90,
    },
    {
      capability: 'localStorage',
      patterns: ['localstorage is not defined'],
      reason: 'Captured path reads browser storage values.',
      priority: 80,
    },
    {
      capability: 'sessionStorage',
      patterns: ['sessionstorage is not defined'],
      reason: 'Captured path reads session-scoped browser storage.',
      priority: 75,
    },
    {
      capability: 'crypto',
      patterns: ["reading 'subtle'", 'crypto is not defined'],
      reason: 'Captured path depends on browser crypto primitives.',
      priority: 85,
    },
  ];

  return candidates
    .filter(
      candidate =>
        available.has(candidate.capability.toLowerCase()) &&
        candidate.patterns.some(pattern => normalizedError.includes(pattern)),
    )
    .sort((a, b) => b.priority - a.priority);
}

function buildPatchSuggestion(capability: string): {
  snippet: string;
  note: string;
} {
  if (capability === 'window') {
    return {
      snippet: 'globalThis.window = globalThis;',
      note: '把浏览器全局根对象映射到 Node 全局，通常是第一步最小补丁。',
    };
  }
  if (capability === 'document') {
    return {
      snippet:
        'globalThis.document ??= { cookie: "", location: { href: "" } };',
      note: '提供最小 DOM 壳，优先满足 cookie/location 读取路径。',
    };
  }
  if (capability === 'navigator') {
    return {
      snippet: 'globalThis.navigator ??= { userAgent: "JSReverser-MCP" };',
      note: '补充常见 UA 读取路径，避免环境探测直接失败。',
    };
  }
  if (capability === 'localStorage') {
    return {
      snippet: [
        'globalThis.localStorage ??= {',
        '  _store: new Map(),',
        '  getItem(key) { return this._store.has(key) ? this._store.get(key) : null; },',
        '  setItem(key, value) { this._store.set(String(key), String(value)); },',
        '  removeItem(key) { this._store.delete(String(key)); },',
        '  clear() { this._store.clear(); },',
        '};',
      ].join('\n'),
      note: '先提供最小内存版 localStorage，后续再按浏览器证据注入真实值。',
    };
  }
  if (capability === 'sessionStorage') {
    return {
      snippet: [
        'globalThis.sessionStorage ??= {',
        '  _store: new Map(),',
        '  getItem(key) { return this._store.has(key) ? this._store.get(key) : null; },',
        '  setItem(key, value) { this._store.set(String(key), String(value)); },',
        '  removeItem(key) { this._store.delete(String(key)); },',
        '  clear() { this._store.clear(); },',
        '};',
      ].join('\n'),
      note: '先补 sessionStorage 壳，适合排查一次性 nonce / session 依赖。',
    };
  }
  if (capability === 'crypto') {
    return {
      snippet: 'globalThis.crypto ??= { subtle: {} };',
      note: '先补最小 crypto.subtle 入口，再根据实际算法继续细化实现。',
    };
  }
  return {
    snippet: `// TODO: add a minimal shim for ${capability}`,
    note: '当前没有内建片段，建议结合浏览器证据补最小实现。',
  };
}

function analyzeEnvRequirements(
  runtimeError: string,
  observedCapabilities: string[],
) {
  const missingCapabilities = inferMissingCapabilities(
    runtimeError,
    observedCapabilities,
  );
  const nextPatches = missingCapabilities.map(item => ({
    capability: item.capability,
    reason: item.reason,
    suggestedPatch: `Add a minimal ${item.capability} shim based on browser evidence before retrying the entry script.`,
  }));
  const patchSuggestions = missingCapabilities.map(item => {
    const suggestion = buildPatchSuggestion(item.capability);
    return {
      capability: item.capability,
      priority: item.priority,
      snippet: suggestion.snippet,
      note: suggestion.note,
    };
  });
  return {
    missingCapabilities,
    nextPatches,
    patchSuggestions,
  };
}

function stripRelativeImports(source: string): string {
  return source
    .split('\n')
    .filter(line => !line.trim().startsWith('import "./'))
    .join('\n')
    .trim();
}

function buildPortablePureSource(args: {
  taskId: string;
  pureMainSource: string;
  fixtures: Record<string, unknown>;
  pureExtraction?: Record<string, unknown>;
}): string {
  return `/**
 * Portable pure bundle generated by export_portable_bundle.
 * Task: ${args.taskId}
 */

${args.pureMainSource.trim()}

export const PORTABLE_FIXTURES = ${JSON.stringify(args.fixtures, null, 2)};
export const PORTABLE_METADATA = ${JSON.stringify(
    {
      taskId: args.taskId,
      stage: args.pureExtraction?.stage ?? 'PureExtraction',
      goalMode:
        args.pureExtraction?.goalMode ?? args.fixtures.goalMode ?? 'pure-draft',
      mainFunction:
        args.pureExtraction?.mainFunction ??
        args.fixtures.mainFunction ??
        'main',
    },
    null,
    2,
  )};

export function runPortableFixture(caseId = PORTABLE_FIXTURES.samples?.[0]?.caseId ?? 'fixture-001') {
  const fixture = PORTABLE_FIXTURES.samples?.find?.((item) => item.caseId === caseId) ?? PORTABLE_FIXTURES.samples?.[0];
  if (!fixture) {
    throw new Error('No fixture sample available in portable bundle');
  }
  return runFixture(fixture);
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const caseId = process.argv[2];
  const result = runPortableFixture(caseId);
  console.log(JSON.stringify({ok: true, portable: true, result}, null, 2));
}
`;
}

function buildPortableReplaySource(args: {
  taskId: string;
  envCode: string;
  polyfillsCode: string;
  entryCode: string;
  capture: Record<string, unknown>;
}): string {
  return `/**
 * Portable rebuild replay generated by export_portable_bundle.
 * Task: ${args.taskId}
 */

export const CAPTURE = ${JSON.stringify(args.capture, null, 2)};

// ===== env.js =====
${args.envCode.trim()}

// ===== polyfills.js =====
${args.polyfillsCode.trim()}

// ===== entry.js =====
${stripRelativeImports(args.entryCode)}
`;
}

export const exportPortableBundle = defineTool({
  name: 'export_portable_bundle',
  description:
    'Collapse existing analysis artifacts into portable single-file outputs for pure extraction and local rebuild.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    taskId: zod.string(),
    artifactMode: zod
      .enum(['portable', 'rebuild', 'pure'])
      .optional()
      .default('portable'),
    includePurePortable: zod.boolean().optional().default(true),
    includeRebuildPortable: zod.boolean().optional().default(true),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const taskSnapshot = await runtime.reverseTaskStore.readSnapshot<
      Record<string, unknown>
    >(request.params.taskId, 'task.json');
    const task = await runtime.reverseTaskStore.openTask({
      taskId: request.params.taskId,
      slug: String(taskSnapshot?.slug ?? request.params.taskId),
      targetUrl: String(taskSnapshot?.targetUrl ?? ''),
      goal: String(taskSnapshot?.goal ?? ''),
    });

    const generatedFiles: string[] = [];

    const includePurePortable =
      request.params.artifactMode === 'rebuild'
        ? false
        : request.params.includePurePortable !== false;
    const includeRebuildPortable =
      request.params.artifactMode === 'pure'
        ? false
        : request.params.includeRebuildPortable !== false;

    if (includePurePortable) {
      const [pureMainSource, fixtures, pureExtraction] = await Promise.all([
        readTextArtifact(task.taskDir, 'run/pure-main.js'),
        readJsonArtifact(task.taskDir, 'run/fixtures.json'),
        readJsonArtifact(task.taskDir, 'pure-extraction.json'),
      ]);
      if (pureMainSource && fixtures) {
        await writeArtifactFile(
          task.taskDir,
          'run/portable.js',
          `${buildPortablePureSource({
            taskId: request.params.taskId,
            pureMainSource,
            fixtures,
            pureExtraction,
          })}\n`,
        );
        generatedFiles.push('run/portable.js');
      }
    }

    if (includeRebuildPortable) {
      const [envCode, polyfillsCode, entryCode, capture] = await Promise.all([
        readTextArtifact(task.taskDir, 'env/env.js'),
        readTextArtifact(task.taskDir, 'env/polyfills.js'),
        readTextArtifact(task.taskDir, 'env/entry.js'),
        readJsonArtifact(task.taskDir, 'env/capture.json'),
      ]);
      if (envCode && entryCode && capture) {
        await writeArtifactFile(
          task.taskDir,
          'env/replay.js',
          `${buildPortableReplaySource({
            taskId: request.params.taskId,
            envCode,
            polyfillsCode: polyfillsCode ?? '',
            entryCode,
            capture,
          })}\n`,
        );
        generatedFiles.push('env/replay.js');
      }
    }

    const verification = await verifyPortableBundleFiles(
      task.taskDir,
      generatedFiles,
    );

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ok: true,
          taskId: task.taskId,
          taskDir: task.taskDir,
          artifactMode: request.params.artifactMode ?? 'portable',
          generatedFiles,
          compactDelivery: generatedFiles.length > 0,
          verification,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');

    await persistCompactDeliveryStatus({
      taskId: task.taskId,
      taskDir: task.taskDir,
      generatedFiles,
      verification,
    });
  },
});

export const exportRebuildBundle = defineTool({
  name: 'export_rebuild_bundle',
  description:
    'Export a local Node rebuild bundle from observed reverse-engineering evidence.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    taskId: zod.string(),
    taskSlug: zod.string(),
    targetUrl: zod.string(),
    goal: zod.string(),
    autoGenerate: zod.boolean().optional(),
    autoExportPortable: zod.boolean().optional(),
    targetKeywords: zod.array(zod.string()).optional(),
    targetUrlPatterns: zod.array(zod.string()).optional(),
    targetFunctionNames: zod.array(zod.string()).optional(),
    targetActionDescription: zod.string().optional(),
    maxEvidenceItems: zod.number().int().positive().optional(),
    entryCode: zod.string().optional(),
    envCode: zod.string().optional(),
    polyfillsCode: zod.string().optional(),
    capture: zod.record(zod.string(), zod.unknown()).optional(),
    notes: zod.array(zod.string()).default([]),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const task = await runtime.reverseTaskStore.openTask({
      taskId: request.params.taskId,
      slug: request.params.taskSlug,
      targetUrl: request.params.targetUrl,
      goal: request.params.goal,
    });

    const bundle = request.params.autoGenerate
      ? await buildAutoBundle(request.params.taskId, runtime, {
          targetKeywords: request.params.targetKeywords ?? [],
          targetUrlPatterns: request.params.targetUrlPatterns ?? [],
          targetFunctionNames: request.params.targetFunctionNames ?? [],
          targetActionDescription: request.params.targetActionDescription ?? '',
          maxEvidenceItems: request.params.maxEvidenceItems ?? 20,
        })
      : {
          entryCode: request.params.entryCode ?? '',
          envCode: request.params.envCode ?? '',
          polyfillsCode: request.params.polyfillsCode ?? '',
          capture: request.params.capture ?? {},
          notes: request.params.notes,
        };

    if (
      !request.params.autoGenerate &&
      (!request.params.entryCode ||
        !request.params.envCode ||
        !request.params.capture)
    ) {
      throw new Error(
        'entryCode, envCode, and capture are required unless autoGenerate=true.',
      );
    }

    await writeArtifactFile(
      task.taskDir,
      'env/entry.js',
      `${bundle.entryCode}\n`,
    );
    await writeArtifactFile(task.taskDir, 'env/env.js', `${bundle.envCode}\n`);
    await writeArtifactFile(
      task.taskDir,
      'env/polyfills.js',
      `${bundle.polyfillsCode}\n`,
    );
    await writeArtifactFile(
      task.taskDir,
      'env/capture.json',
      `${JSON.stringify(bundle.capture, null, 2)}\n`,
    );

    const generatedFiles = [
      'env/entry.js',
      'env/env.js',
      'env/polyfills.js',
      'env/capture.json',
      'report.md',
    ];

    if (request.params.autoExportPortable === true) {
      const portableResponse = makePortableResponse();
      await exportPortableBundle.handler(
        {
          params: {
            taskId: request.params.taskId,
            artifactMode: 'rebuild',
          },
        } as Parameters<typeof exportPortableBundle.handler>[0],
        portableResponse as unknown as Parameters<
          typeof exportPortableBundle.handler
        >[1],
        {} as Parameters<typeof exportPortableBundle.handler>[2],
      );
      if (await artifactExists(task.taskDir, 'env/replay.js')) {
        generatedFiles.push('env/replay.js');
      }
    }

    const report = [
      '# Rebuild Bundle',
      '',
      `- Task: ${request.params.taskId}`,
      `- Target URL: ${request.params.targetUrl}`,
      `- Goal: ${request.params.goal}`,
      '',
      '## Notes',
      ...bundle.notes.map(note => `- ${note}`),
    ].join('\n');
    await writeArtifactFile(task.taskDir, 'report.md', `${report}\n`);

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ok: true,
          taskId: task.taskId,
          taskDir: task.taskDir,
          autoGenerated: Boolean(request.params.autoGenerate),
          autoExportPortable: request.params.autoExportPortable === true,
          files: generatedFiles,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const diffEnvRequirements = defineTool({
  name: 'diff_env_requirements',
  description:
    'Compare local runtime failures with observed browser capabilities and suggest the next environment patches.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    runtimeError: zod.string(),
    observedCapabilities: zod.array(zod.string()).default([]),
  },
  handler: async (request, response) => {
    const analyzed = analyzeEnvRequirements(
      request.params.runtimeError,
      request.params.observedCapabilities,
    );

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          missingCapabilities: analyzed.missingCapabilities.map(
            item => item.capability,
          ),
          nextPatches: analyzed.nextPatches,
          patchSuggestions: analyzed.patchSuggestions,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const getRebuildHealthReport = defineTool({
  name: 'get_rebuild_health_report',
  description:
    'Produce a compact rebuild health report for one reverse task, including env blockers, evidence aggregates, and next fixes.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    taskId: zod.string(),
    outputMode: zod.enum(['compact', 'verbose']).optional(),
    observedCapabilities: zod
      .array(zod.string())
      .default([
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'crypto',
      ]),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const {getReverseTaskState} = await import(
      '../reverse/ReverseTaskQuery.js'
    );
    const state = await getReverseTaskState(
      runtime.reverseTaskStore,
      request.params.taskId,
      {
        timelineLimit: 10,
        evidenceLimit: 10,
      },
    );
    const currentStage = String(
      state.state?.currentStage ?? state.task?.currentStage ?? 'Observe',
    );
    const status = String(state.state?.status ?? 'active');
    const currentSummary = String(
      state.state?.currentSummary ?? state.task?.currentSummary ?? '',
    );
    const analyzed = analyzeEnvRequirements(
      currentSummary,
      request.params.observedCapabilities,
    );
    const firstDivergence =
      state.recentTimeline.find(
        entry => String(entry.status ?? '') === 'error',
      ) ??
      state.recentEvidence.find(
        entry => String(entry.kind ?? '') === 'env-gap',
      );
    const agentHints = buildRebuildHealthAgentHints({
      taskId: request.params.taskId,
      runtimeError: currentSummary,
      observedCapabilities: request.params.observedCapabilities,
      hasPatchSuggestions: analyzed.patchSuggestions.length > 0,
    });
    const outputMode = request.params.outputMode ?? 'verbose';

    response.appendResponseLine('```json');
    const continuation = buildRebuildContinuation({
      status,
      missingCapabilitiesCount: analyzed.missingCapabilities.length,
      patchSuggestionCount: analyzed.patchSuggestions.length,
      agentGuidance: agentHints,
    });
    response.appendResponseLine(
      JSON.stringify(
        withSchemaVersion(
          compactAgentPayload(
            {
              taskId: request.params.taskId,
              outputMode,
              responseSummary: `已生成任务 ${request.params.taskId} 的 rebuild health report。`,
              diagnostics: {
                responseStatus: 'ok',
                outputMode,
                taskId: request.params.taskId,
                hasPatchSuggestions: analyzed.patchSuggestions.length > 0,
              },
              ...continuation,
              currentStage,
              status: agentHints.status === 'ok' ? status : agentHints.status,
              currentSummary,
              artifacts: [
                'report.md',
                'env/entry.js',
                'env/env.js',
                'env/polyfills.js',
                'env/capture.json',
              ],
              ...(outputMode === 'compact'
                ? {}
                : {
                    evidenceAggregates: state.evidenceAggregates,
                    firstDivergence: firstDivergence ?? null,
                  }),
              missingCapabilities: analyzed.missingCapabilities.map(
                item => item.capability,
              ),
              patchSuggestions: analyzed.patchSuggestions,
              recommendedNextAction: agentHints.recommendedNextAction,
              agentGuidance: agentHints,
            },
            outputMode,
          ),
        ),
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});
