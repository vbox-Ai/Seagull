/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {mkdir, readdir, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {runEnvironmentDiagnostics} from '../diagnostics/environment.js';
import type {HTTPRequest} from '../third_party/index.js';
import {zod} from '../third_party/index.js';
import {getAIRuntimeStatus} from '../utils/config.js';

import {ToolCategory} from './categories.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool, type Response} from './ToolDefinition.js';

type JsonObject = Record<string, unknown>;

interface CodeFileInput {
  url: string;
  content: string;
}

interface CandidateFunctionInput {
  targetUrl?: string;
  parameterNames?: string[];
  headerNames?: string[];
  keywords?: string[];
  files: CodeFileInput[];
  maxCandidates?: number;
}

interface CandidateFunction {
  name: string;
  file: string;
  score: number;
  line: number;
  snippet: string;
  reasons: string[];
}

interface BrowserRepairInput {
  browserUrl?: string;
  wsEndpoint?: string;
  remoteDebuggingUrl?: string;
  devtoolsReachable?: boolean;
}

interface SessionSnapshot {
  cookies?: Array<{name: string; value?: string}>;
  localStorage?: Record<string, unknown>;
  sessionStorage?: Record<string, unknown>;
}

function appendJson(response: Response, payload: unknown): void {
  response.appendResponseLine('```json');
  response.appendResponseLine(JSON.stringify(payload, null, 2));
  response.appendResponseLine('```');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function extractFunctionCandidates(content: string): Array<{
  name: string;
  index: number;
  line: number;
  snippet: string;
}> {
  const candidates: Array<{
    name: string;
    index: number;
    line: number;
    snippet: string;
  }> = [];
  const patterns = [
    /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g,
    /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const name = match[1];
      const index = match.index ?? 0;
      const line = content.slice(0, index).split('\n').length;
      candidates.push({
        name,
        index,
        line,
        snippet: content.slice(index, index + 700),
      });
    }
  }

  if (candidates.length === 0) {
    candidates.push({
      name: '<module-scope>',
      index: 0,
      line: 1,
      snippet: content.slice(0, 700),
    });
  }

  return candidates;
}

export function locateCandidateFunctionsFromFiles(
  input: CandidateFunctionInput,
): CandidateFunction[] {
  const maxCandidates = input.maxCandidates ?? 10;
  const targetTokens = [
    ...asStringArray(input.parameterNames),
    ...asStringArray(input.headerNames),
    ...asStringArray(input.keywords),
    ...(input.targetUrl ? input.targetUrl.split(/[/?#&=._-]+/) : []),
    'sign',
    'signature',
    'token',
    'nonce',
    'timestamp',
    'fetch',
    'xhr',
    'axios',
  ]
    .map(normalizeToken)
    .filter(token => token.length >= 2);

  const scored: CandidateFunction[] = [];
  for (const file of input.files) {
    for (const candidate of extractFunctionCandidates(file.content)) {
      const haystack = `${candidate.name}\n${candidate.snippet}`.toLowerCase();
      const reasons: string[] = [];
      let score = 0;

      for (const param of asStringArray(input.parameterNames)) {
        if (haystack.includes(normalizeToken(param))) {
          score += 6;
          reasons.push(`param:${param}`);
        }
      }
      for (const header of asStringArray(input.headerNames)) {
        if (haystack.includes(normalizeToken(header))) {
          score += 5;
          reasons.push(`header:${header}`);
        }
      }
      for (const token of unique(targetTokens)) {
        if (haystack.includes(token)) {
          score += ['sign', 'signature', 'token', 'nonce'].includes(token)
            ? 3
            : 1;
        }
      }
      if (/fetch|XMLHttpRequest|axios|sendBeacon/.test(candidate.snippet)) {
        score += 4;
        reasons.push('request-sink');
      }
      if (/crypto|md5|sha\d+|hmac|aes|rsa/i.test(candidate.snippet)) {
        score += 4;
        reasons.push('crypto-indicator');
      }
      if (input.targetUrl && file.content.includes(input.targetUrl)) {
        score += 3;
        reasons.push('target-url');
      }

      scored.push({
        name: candidate.name,
        file: file.url,
        score,
        line: candidate.line,
        snippet: candidate.snippet.trim(),
        reasons: unique(reasons),
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, maxCandidates);
}

export function buildBrowserConnectionRepairPlan(input: BrowserRepairInput) {
  const remoteDebuggingUrl =
    input.remoteDebuggingUrl ?? input.browserUrl ?? 'http://127.0.0.1:9222';
  const problems: string[] = [];

  if (input.browserUrl && input.wsEndpoint) {
    problems.push('`--browserUrl` 和 `--wsEndpoint` 只能二选一。');
  }
  if (input.browserUrl && !/127\.0\.0\.1|localhost/.test(input.browserUrl)) {
    problems.push(
      '`--browserUrl` 看起来是业务网站地址；这里应该填 Chrome remote debugging 地址。',
    );
  }
  if (input.devtoolsReachable === false) {
    problems.push(
      `无法访问 ${remoteDebuggingUrl}/json/version，Chrome remote debugging 可能未启动。`,
    );
  }

  return {
    ok: problems.length === 0,
    remoteDebuggingUrl,
    problems,
    repairCommands: [
      `curl ${remoteDebuggingUrl.replace(/\/$/, '')}/json/version`,
      'google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-mcp',
      `node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --browserUrl ${remoteDebuggingUrl}`,
    ],
    notes: [
      'JSReverser-MCP 是 stdio MCP server，不是 HTTP Web 服务。',
      '`json/version` 返回 webSocketDebuggerUrl 后再启动 MCP 客户端。',
    ],
  };
}

export function analyzeSourceMapSummary(input: {
  sourceMapContent: string;
  sourceMapUrl?: string;
}) {
  try {
    const map = JSON.parse(input.sourceMapContent) as {
      version?: number;
      file?: string;
      sources?: string[];
      sourcesContent?: Array<string | null>;
      mappings?: string;
    };
    const sources = map.sources ?? [];
    const sourcesWithContent = (map.sourcesContent ?? []).filter(
      item => typeof item === 'string' && item.length > 0,
    ).length;
    const interestingSources = sources.filter(source =>
      /sign|token|crypto|api|request|auth|encrypt|hash/i.test(source),
    );
    return {
      valid: true,
      sourceMapUrl: input.sourceMapUrl,
      version: map.version,
      file: map.file,
      sourceCount: sources.length,
      sourcesWithContent,
      hasMappings: Boolean(map.mappings),
      interestingSources,
      recommendedNextSteps:
        interestingSources.length > 0
          ? [
              `优先查看 ${interestingSources[0]}，再用 locate_candidate_functions 按参数名定位。`,
            ]
          : ['先按 sources 列表筛选 api/auth/sign/crypto 相关模块。'],
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      recommendedNextSteps: ['确认 source map 是合法 JSON，再重新分析。'],
    };
  }
}

function findFunctionBlock(code: string, functionName: string): string | null {
  const pattern = new RegExp(
    `function\\s+${functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\([^)]*\\)\\s*\\{`,
  );
  const match = pattern.exec(code);
  if (!match || match.index === undefined) {
    return null;
  }
  let depth = 0;
  let end = match.index;
  for (let i = match.index; i < code.length; i++) {
    if (code[i] === '{') {
      depth++;
    } else if (code[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return code.slice(match.index, end);
}

export function buildFunctionSliceDraft(input: {
  code: string;
  functionName: string;
  dependencyNames?: string[];
}) {
  const target = findFunctionBlock(input.code, input.functionName);
  if (!target) {
    return {
      found: false,
      functionName: input.functionName,
      slice: '',
      dependencies: [],
      envShim: buildEnvShimDraft(),
    };
  }

  const dependencyNames =
    input.dependencyNames ??
    unique(
      Array.from(target.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g))
        .map(match => match[1])
        .filter(name => name !== input.functionName),
    );
  const dependencyBlocks = dependencyNames
    .map(name => ({name, block: findFunctionBlock(input.code, name)}))
    .filter(
      (item): item is {name: string; block: string} => item.block !== null,
    );

  return {
    found: true,
    functionName: input.functionName,
    dependencies: dependencyBlocks.map(item => item.name),
    slice: [...dependencyBlocks.map(item => item.block), target].join('\n\n'),
    envShim: buildEnvShimDraft(),
  };
}

function buildEnvShimDraft(): string {
  return [
    'globalThis.window = globalThis;',
    'globalThis.self = globalThis;',
    'globalThis.document ??= {cookie: "", location: {href: ""}};',
    'globalThis.navigator ??= {userAgent: "JSReverser-MCP"};',
    'globalThis.localStorage ??= new Map();',
    'globalThis.sessionStorage ??= new Map();',
  ].join('\n');
}

function mapCookies(snapshot: SessionSnapshot): Record<string, string> {
  return Object.fromEntries(
    (snapshot.cookies ?? []).map(cookie => [
      String(cookie.name),
      String(cookie.value ?? ''),
    ]),
  );
}

function diffRecord(
  before: Record<string, unknown> = {},
  after: Record<string, unknown> = {},
) {
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  return {
    added: unique(afterKeys.filter(key => !(key in before))),
    removed: unique(beforeKeys.filter(key => !(key in after))),
    changed: unique(
      afterKeys.filter(
        key => key in before && String(before[key]) !== String(after[key]),
      ),
    ),
  };
}

export function diffSessionStateSnapshots(input: {
  before: SessionSnapshot;
  after: SessionSnapshot;
}) {
  return {
    cookies: diffRecord(mapCookies(input.before), mapCookies(input.after)),
    localStorage: diffRecord(
      input.before.localStorage,
      input.after.localStorage,
    ),
    sessionStorage: diffRecord(
      input.before.sessionStorage,
      input.after.sessionStorage,
    ),
  };
}

export function inferWebSocketSchemaFromMessages(input: {messages: string[]}) {
  const fieldTypes = new Map<string, Set<string>>();
  let jsonCount = 0;
  let nonJsonCount = 0;
  const messageTypes = new Map<string, number>();

  for (const message of input.messages) {
    try {
      const parsed = JSON.parse(message) as JsonObject;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        nonJsonCount++;
        continue;
      }
      jsonCount++;
      for (const [key, value] of Object.entries(parsed)) {
        const types = fieldTypes.get(key) ?? new Set<string>();
        types.add(Array.isArray(value) ? 'array' : typeof value);
        fieldTypes.set(key, types);
      }
      if (typeof parsed.type === 'string') {
        messageTypes.set(parsed.type, (messageTypes.get(parsed.type) ?? 0) + 1);
      }
    } catch {
      nonJsonCount++;
    }
  }

  return {
    totalMessages: input.messages.length,
    jsonCount,
    nonJsonCount,
    messageTypes: Object.fromEntries(messageTypes.entries()),
    json: {
      fields: Object.fromEntries(
        Array.from(fieldTypes.entries()).map(([key, values]) => [
          key,
          {types: Array.from(values).sort()},
        ]),
      ),
    },
  };
}

export function buildParameterReportDraft(input: {
  targetUrl?: string;
  parameterNames?: string[];
  candidateFunctions?: Array<{name: string; score: number; file: string}>;
  evidence?: string[];
  nextSteps?: string[];
}) {
  const params = input.parameterNames ?? [];
  const candidates = input.candidateFunctions ?? [];
  const evidence = input.evidence ?? [];
  const nextSteps = input.nextSteps ?? [];
  const markdown = [
    '# Parameter Analysis Report',
    '',
    `- Target: ${input.targetUrl ?? 'unknown'}`,
    `- Parameters: ${params.join(', ') || 'unknown'}`,
    '',
    '## Candidate Functions',
    ...candidates.map(
      item => `- ${item.name} (${item.file}, score=${item.score})`,
    ),
    '',
    '## Evidence',
    ...evidence.map(item => `- ${item}`),
    '',
    '## Next Steps',
    ...nextSteps.map(item => `- ${item}`),
  ].join('\n');
  return {
    summary: `参数 ${params.join(', ') || 'unknown'} 的候选函数 ${candidates.length} 个。`,
    markdown,
  };
}

async function fetchDevtoolsVersion(remoteDebuggingUrl: string) {
  try {
    const response = await fetch(
      `${remoteDebuggingUrl.replace(/\/$/, '')}/json/version`,
    );
    if (!response.ok) {
      return {reachable: false, status: response.status};
    }
    return {
      reachable: true,
      status: response.status,
      body: await response.json(),
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function requestToHarEntry(request: HTTPRequest) {
  const response = request.response();
  return {
    startedDateTime: new Date().toISOString(),
    request: {
      method: request.method(),
      url: request.url(),
      headers: Object.entries(request.headers()).map(([name, value]) => ({
        name,
        value,
      })),
      postData: request.postData(),
    },
    response: response
      ? {
          status: response.status(),
          statusText: response.statusText(),
          headers: Object.entries(response.headers()).map(([name, value]) => ({
            name,
            value,
          })),
        }
      : null,
    resourceType: request.resourceType(),
  };
}

async function listArtifactsForTask(taskId: string) {
  const runtime = getJSHookRuntime();
  const taskDir = runtime.reverseTaskStore.getTaskDir(taskId);
  const entries = await readdir(taskDir, {withFileTypes: true});
  const rows = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(taskDir, entry.name);
      const itemStat = await stat(fullPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        sizeBytes: itemStat.size,
        updatedAt: itemStat.mtimeMs,
      };
    }),
  );
  return {
    taskId,
    taskDir,
    artifacts: rows.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export const repairBrowserConnection = defineTool({
  name: 'repair_browser_connection',
  description:
    'Diagnose Chrome remote-debugging connectivity and return concrete repair commands.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    browserUrl: zod.string().optional(),
    wsEndpoint: zod.string().optional(),
    remoteDebuggingUrl: zod.string().optional(),
    checkReachability: zod.boolean().optional(),
  },
  handler: async (request, response) => {
    const remoteDebuggingUrl =
      request.params.remoteDebuggingUrl ??
      request.params.browserUrl ??
      'http://127.0.0.1:9222';
    const reachability =
      request.params.checkReachability === false
        ? undefined
        : await fetchDevtoolsVersion(remoteDebuggingUrl);
    appendJson(response, {
      ...buildBrowserConnectionRepairPlan({
        browserUrl: request.params.browserUrl,
        wsEndpoint: request.params.wsEndpoint,
        remoteDebuggingUrl,
        devtoolsReachable: reachability?.reachable,
      }),
      reachability,
    });
  },
});

export const locateCandidateFunctions = defineTool({
  name: 'locate_candidate_functions',
  description:
    'Score likely signature/token/request functions from code files, params, headers, and target URL hints.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    targetUrl: zod.string().optional(),
    parameterNames: zod.array(zod.string()).optional(),
    headerNames: zod.array(zod.string()).optional(),
    keywords: zod.array(zod.string()).optional(),
    files: zod
      .array(zod.object({url: zod.string(), content: zod.string()}))
      .optional(),
    maxCandidates: zod.number().int().positive().optional(),
  },
  handler: async (request, response) => {
    appendJson(
      response,
      locateCandidateFunctionsFromFiles({
        targetUrl: request.params.targetUrl,
        parameterNames: request.params.parameterNames,
        headerNames: request.params.headerNames,
        keywords: request.params.keywords,
        files: request.params.files ?? [],
        maxCandidates: request.params.maxCandidates,
      }),
    );
  },
});

export const traceRequestToCode = defineTool({
  name: 'trace_request_to_code',
  description:
    'Trace a captured network request to initiator stack frames and optional static code candidates.',
  annotations: {category: ToolCategory.NETWORK, readOnlyHint: true},
  schema: {
    reqid: zod.number().int().positive().optional(),
    targetPageIdx: zod.number().int().min(0).optional(),
    parameterNames: zod.array(zod.string()).optional(),
    files: zod
      .array(zod.object({url: zod.string(), content: zod.string()}))
      .optional(),
  },
  handler: async (request, response, context) => {
    const reqid = request.params.reqid;
    const networkRequest = reqid
      ? context.getNetworkRequestById(reqid, request.params.targetPageIdx)
      : undefined;
    const initiator = reqid
      ? context.getRequestInitiatorById(reqid)
      : undefined;
    const stackFrames = [
      ...(initiator?.stack?.callFrames ?? []),
      ...(initiator?.stack?.parent?.callFrames ?? []),
    ];
    appendJson(response, {
      request: networkRequest
        ? {
            reqid,
            method: networkRequest?.method(),
            url: networkRequest?.url(),
            resourceType: networkRequest?.resourceType(),
          }
        : null,
      initiator,
      stackFrames,
      candidateFunctions: locateCandidateFunctionsFromFiles({
        targetUrl: networkRequest?.url(),
        parameterNames: request.params.parameterNames,
        files: request.params.files ?? [],
      }),
    });
  },
});

export const analyzeSourceMaps = defineTool({
  name: 'analyze_source_maps',
  description:
    'Parse a source map and summarize original sources, embedded content coverage, and likely reverse targets.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    sourceMapContent: zod.string(),
    sourceMapUrl: zod.string().optional(),
  },
  handler: async (request, response) => {
    appendJson(response, analyzeSourceMapSummary(request.params));
  },
});

export const exportFunctionSlice = defineTool({
  name: 'export_function_slice',
  description:
    'Build a minimal function slice draft with direct helper dependencies and a Node env shim.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    code: zod.string(),
    functionName: zod.string(),
    dependencyNames: zod.array(zod.string()).optional(),
  },
  handler: async (request, response) => {
    appendJson(response, buildFunctionSliceDraft(request.params));
  },
});

export const probeRuntimeCapabilities = defineTool({
  name: 'probe_runtime_capabilities',
  description:
    'Probe browser runtime capabilities and compare them with Node rebuild assumptions.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    targetPageIdx: zod.number().int().min(0).optional(),
  },
  handler: async (request, response, context) => {
    const page = context.getPageByOptionalIdx(request.params.targetPageIdx);
    const browserCapabilities = await page.evaluate(() => ({
      window: typeof window !== 'undefined',
      document: typeof document !== 'undefined',
      navigator: typeof navigator !== 'undefined',
      crypto: typeof crypto !== 'undefined',
      localStorage: typeof localStorage !== 'undefined',
      sessionStorage: typeof sessionStorage !== 'undefined',
      canvas:
        typeof document !== 'undefined'
          ? Boolean(document.createElement('canvas').getContext)
          : false,
      webgl:
        typeof document !== 'undefined'
          ? Boolean(document.createElement('canvas').getContext('webgl'))
          : false,
      performance: typeof performance !== 'undefined',
    }));
    appendJson(response, {
      browserCapabilities,
      nodeCapabilities: {
        window: typeof globalThis.window !== 'undefined',
        document: typeof globalThis.document !== 'undefined',
        navigator: typeof globalThis.navigator !== 'undefined',
        crypto: typeof globalThis.crypto !== 'undefined',
        performance: typeof globalThis.performance !== 'undefined',
      },
      patchSuggestions: Object.entries(browserCapabilities)
        .filter(([key, value]) => value && !(key in globalThis))
        .map(([key]) => `补齐 globalThis.${key}`),
    });
  },
});

export const autoRebuildFixLoop = defineTool({
  name: 'auto_rebuild_fix_loop',
  description:
    'Create a resumable env-fix loop plan from runtime errors and observed capabilities.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  requiresBrowser: false,
  schema: {
    taskId: zod.string().optional(),
    runtimeError: zod.string().optional(),
    observedCapabilities: zod.record(zod.string(), zod.unknown()).optional(),
    maxIterations: zod.number().int().positive().optional(),
  },
  handler: async (request, response) => {
    const runtimeError = request.params.runtimeError ?? '';
    appendJson(response, {
      taskId: request.params.taskId,
      maxIterations: request.params.maxIterations ?? 3,
      loop: [
        'run local rebuild selftest',
        'capture first divergence / runtime error',
        'call diff_env_requirements with observed capabilities',
        'apply minimal env shim patch draft',
        'rerun selftest and stop on env-pass',
      ],
      patchDraft: {
        missingDocument: /document is not defined/.test(runtimeError),
        missingWindow: /window is not defined/.test(runtimeError),
        missingNavigator: /navigator is not defined/.test(runtimeError),
        observedCapabilities: request.params.observedCapabilities ?? {},
      },
      continuation: {
        invoke: 'get_rebuild_health_report',
        requiredParams: request.params.taskId ? ['taskId'] : [],
      },
    });
  },
});

export const exportHarSnapshot = defineTool({
  name: 'export_har_snapshot',
  description:
    'Export selected page network requests into a compact HAR-like snapshot for offline analysis.',
  annotations: {category: ToolCategory.NETWORK, readOnlyHint: true},
  schema: {
    targetPageIdx: zod.number().int().min(0).optional(),
    includePreservedRequests: zod.boolean().optional(),
    urlFilter: zod.string().optional(),
  },
  handler: async (request, response, context) => {
    const requests = context
      .getNetworkRequests(
        request.params.includePreservedRequests,
        request.params.targetPageIdx,
      )
      .filter(item =>
        request.params.urlFilter
          ? item.url().includes(request.params.urlFilter)
          : true,
      );
    appendJson(response, {
      log: {
        version: '1.2',
        creator: {name: 'JSReverser-MCP', version: '2.0.4'},
        entries: requests.map(requestToHarEntry),
      },
    });
  },
});

export const generateParameterReport = defineTool({
  name: 'generate_parameter_report',
  description:
    'Generate a concise parameter-chain report from target, candidates, evidence, and next steps.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    targetUrl: zod.string().optional(),
    parameterNames: zod.array(zod.string()).optional(),
    candidateFunctions: zod
      .array(
        zod.object({
          name: zod.string(),
          score: zod.number(),
          file: zod.string(),
        }),
      )
      .optional(),
    evidence: zod.array(zod.string()).optional(),
    nextSteps: zod.array(zod.string()).optional(),
  },
  handler: async (request, response) => {
    appendJson(response, buildParameterReportDraft(request.params));
  },
});

export const listTaskArtifacts = defineTool({
  name: 'list_task_artifacts',
  description:
    'List files, sizes, and update times for a reverse task artifact directory.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    taskId: zod.string(),
  },
  handler: async (request, response) => {
    appendJson(response, await listArtifactsForTask(request.params.taskId));
  },
});

export const pruneTaskArtifacts = defineTool({
  name: 'prune_task_artifacts',
  description:
    'Remove old task artifact directories by age, with dry-run support by default.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  requiresBrowser: false,
  schema: {
    olderThanDays: zod.number().int().positive(),
    dryRun: zod.boolean().optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const rootDir = runtime.reverseTaskStore.rootDir;
    const entries = await readdir(rootDir, {withFileTypes: true}).catch(
      () => [],
    );
    const cutoff =
      Date.now() - request.params.olderThanDays * 24 * 60 * 60 * 1000;
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '_TEMPLATE') {
        continue;
      }
      const fullPath = path.join(rootDir, entry.name);
      const itemStat = await stat(fullPath);
      if (itemStat.mtimeMs < cutoff) {
        candidates.push({taskId: entry.name, path: fullPath});
      }
    }
    if (request.params.dryRun !== false) {
      appendJson(response, {dryRun: true, candidates});
      return;
    }
    for (const candidate of candidates) {
      await rm(candidate.path, {recursive: true, force: true});
    }
    appendJson(response, {dryRun: false, removed: candidates});
  },
});

export const recordPageFlow = defineTool({
  name: 'record_page_flow',
  description:
    'Persist a page interaction flow draft for later replay and evidence reuse.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: false},
  schema: {
    taskId: zod.string().optional(),
    name: zod.string().optional(),
    actions: zod.array(zod.record(zod.string(), zod.unknown())).optional(),
  },
  handler: async (request, response, context) => {
    const flow = {
      name: request.params.name ?? 'page-flow',
      recordedAt: Date.now(),
      currentUrl: context.getSelectedPage().url(),
      actions: request.params.actions ?? [],
    };
    if (request.params.taskId) {
      const runtime = getJSHookRuntime();
      const taskDir = runtime.reverseTaskStore.getTaskDir(
        request.params.taskId,
      );
      await mkdir(taskDir, {recursive: true});
      await writeFile(
        path.join(taskDir, `${flow.name}.flow.json`),
        `${JSON.stringify(flow, null, 2)}\n`,
        'utf8',
      );
    }
    appendJson(response, flow);
  },
});

export const replayPageFlow = defineTool({
  name: 'replay_page_flow',
  description: 'Replay recorded page flow actions through PageController.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: false},
  schema: {
    actions: zod.array(zod.record(zod.string(), zod.unknown())),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const replay = await runtime.pageController.replayActions(
      request.params.actions as unknown as Parameters<
        typeof runtime.pageController.replayActions
      >[0],
    );
    appendJson(response, {replay});
  },
});

export const diffSessionState = defineTool({
  name: 'diff_session_state',
  description:
    'Compare cookies, localStorage, and sessionStorage snapshots before and after a page action.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    before: zod.object({}).passthrough(),
    after: zod.object({}).passthrough(),
  },
  handler: async (request, response) => {
    appendJson(
      response,
      diffSessionStateSnapshots({
        before: request.params.before,
        after: request.params.after,
      }),
    );
  },
});

export const inferWebSocketSchema = defineTool({
  name: 'infer_websocket_schema',
  description:
    'Infer JSON field types, message type distribution, and non-JSON counts from WebSocket messages.',
  annotations: {category: ToolCategory.NETWORK, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    messages: zod.array(zod.string()),
  },
  handler: async (request, response) => {
    appendJson(response, inferWebSocketSchemaFromMessages(request.params));
  },
});

export const exportDiagnosticBundle = defineTool({
  name: 'export_diagnostic_bundle',
  description:
    'Export a compact support bundle with environment, AI runtime, browser, and setup diagnostics.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: true},
  requiresBrowser: false,
  schema: {
    remoteDebuggingUrl: zod.string().optional(),
  },
  handler: async (request, response) => {
    const remoteDebuggingUrl =
      request.params.remoteDebuggingUrl ?? 'http://127.0.0.1:9222';
    const devtools = await fetchDevtoolsVersion(remoteDebuggingUrl);
    appendJson(response, {
      generatedAt: new Date().toISOString(),
      environment: runEnvironmentDiagnostics(),
      aiRuntime: getAIRuntimeStatus(),
      browserRepair: buildBrowserConnectionRepairPlan({
        remoteDebuggingUrl,
        devtoolsReachable: devtools.reachable,
      }),
      devtools,
    });
  },
});

export const optimizationTools = [
  analyzeSourceMaps,
  autoRebuildFixLoop,
  diffSessionState,
  exportDiagnosticBundle,
  exportFunctionSlice,
  exportHarSnapshot,
  generateParameterReport,
  inferWebSocketSchema,
  listTaskArtifacts,
  locateCandidateFunctions,
  probeRuntimeCapabilities,
  pruneTaskArtifacts,
  recordPageFlow,
  repairBrowserConnection,
  replayPageFlow,
  traceRequestToCode,
];
