/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {zod} from '../third_party/index.js';
import {getAIRuntimeStatus} from '../utils/config.js';
import {TokenBudgetManager} from '../utils/TokenBudgetManager.js';

import {ToolCategory} from './categories.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool} from './ToolDefinition.js';

const aiModeSchema = zod.enum(['auto', 'required', 'off']);

function assertAIRequiredModeAvailable(aiMode?: 'auto' | 'required' | 'off') {
  if (aiMode !== 'required') {
    return;
  }
  const aiRuntime = getAIRuntimeStatus();
  if (!aiRuntime.enabled) {
    throw new Error(
      `AI mode required but no provider is available: ${aiRuntime.reason}`,
    );
  }
}

function withAIRuntime<T>(
  result: T,
): T & {aiRuntime: ReturnType<typeof getAIRuntimeStatus>} {
  const aiRuntime = getAIRuntimeStatus();
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return {result, aiRuntime} as unknown as T & {
      aiRuntime: ReturnType<typeof getAIRuntimeStatus>;
    };
  }
  return {
    ...(result as Record<string, unknown>),
    aiRuntime,
  } as T & {aiRuntime: ReturnType<typeof getAIRuntimeStatus>};
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(MODULE_DIR, '..', '..');
const PACKAGE_ROOT = path.resolve(BUILD_DIR, '..');
const DOCS_MANIFEST_PATH = path.join(BUILD_DIR, 'docs-manifest.json');

interface ReferenceDocsManifest {
  core: Record<string, string>;
  extra: Record<string, string>;
}

const referenceDocIds = [
  'case-safety-policy',
  'env-patching',
  'pure-extraction',
  'reverse-bootstrap',
  'reverse-task-index',
  'reverse-workflow',
  'tool-io-contract',
  'algorithm-upgrade-template',
  'reverse-artifacts',
  'reverse-report-template',
  'reverse-update-prompt-template',
  'tool-reference',
] as const;

type ReferenceDocId = (typeof referenceDocIds)[number];

async function readReferenceDocsManifest(): Promise<ReferenceDocsManifest> {
  return JSON.parse(
    await readFile(DOCS_MANIFEST_PATH, 'utf8'),
  ) as ReferenceDocsManifest;
}

async function resolveReferenceDoc(docId: string): Promise<{
  group: 'core' | 'extra';
  path: string;
  content: string;
}> {
  const manifest = await readReferenceDocsManifest();

  for (const group of ['core', 'extra'] as const) {
    const relativePath = manifest[group][docId];
    if (!relativePath) {
      continue;
    }
    const absolutePath = path.resolve(PACKAGE_ROOT, relativePath);
    const content = await readFile(absolutePath, 'utf8');
    return {
      group,
      path: relativePath,
      content,
    };
  }

  throw new Error(`Unknown packaged reference doc: ${docId}`);
}

function summarizeReferenceContent(
  content: string,
  maxSections: number,
): {
  summary: string;
  highlights: string[];
} {
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const headings = lines
    .filter(line => /^#+\s+/.test(line))
    .slice(0, Math.max(1, maxSections));
  const bullets = lines
    .filter(line => /^[-*]\s+/.test(line))
    .slice(0, Math.max(2, maxSections * 2));
  const summaryParts = [...headings, ...bullets].slice(
    0,
    Math.max(3, maxSections + 2),
  );

  return {
    summary: summaryParts.join(' | '),
    highlights: [...new Set([...headings, ...bullets])].slice(
      0,
      Math.max(3, maxSections * 2),
    ),
  };
}

const stageToDocsMap: Record<
  string,
  Array<{docId: ReferenceDocId; reason: string}>
> = {
  Observe: [
    {docId: 'reverse-bootstrap', reason: '新任务开场先读入口协议与硬边界。'},
    {docId: 'reverse-workflow', reason: '确认当前阶段、目标和禁止事项。'},
    {docId: 'reverse-task-index', reason: '按逆向目标快速定位对应工具。'},
  ],
  Capture: [
    {
      docId: 'reverse-workflow',
      reason: '确认 Capture 阶段的最小侵入采样要求。',
    },
    {
      docId: 'tool-reference',
      reason: '按工具说明选择 hook、network、script 工具。',
    },
    {docId: 'tool-io-contract', reason: '确认采集数据写到哪里，避免读写错位。'},
  ],
  Rebuild: [
    {docId: 'reverse-workflow', reason: '确认进入 Rebuild 的前提与产物。'},
    {docId: 'reverse-artifacts', reason: '明确 task-local 产物结构。'},
    {docId: 'env-patching', reason: '开始本地运行前先看补环境边界。'},
  ],
  Patch: [
    {
      docId: 'env-patching',
      reason: 'Patch 阶段核心规范，先代理日志和 first divergence。',
    },
    {docId: 'reverse-workflow', reason: '确认 Patch 完成判据与阶段切换红线。'},
    {docId: 'tool-io-contract', reason: '确认证据面和 hook 数据来源。'},
  ],
  PureExtraction: [
    {docId: 'pure-extraction', reason: '纯算法提纯阶段的主协议。'},
    {docId: 'reverse-workflow', reason: '确认 PureExtraction 的进入条件。'},
    {docId: 'reverse-artifacts', reason: '明确 fixture 与 pure 产物沉淀位置。'},
  ],
  Port: [
    {docId: 'pure-extraction', reason: 'Port 前先确认 Node pure 已稳定。'},
    {
      docId: 'reverse-report-template',
      reason: '迁移时按报告模板说明输入边界与对齐结果。',
    },
    {
      docId: 'algorithm-upgrade-template',
      reason: '若迁移中出现分叉，可按 first divergence 模板回溯。',
    },
  ],
  Upgrade: [
    {
      docId: 'algorithm-upgrade-template',
      reason: '版本漂移与 first divergence 追踪主模板。',
    },
    {docId: 'reverse-workflow', reason: '确认当前分叉属于哪一阶段。'},
    {
      docId: 'env-patching',
      reason: '若漂移发生在 env rebuild，回到 Patch 规范。',
    },
  ],
};

const topicToDocsMap: Record<
  string,
  Array<{docId: ReferenceDocId; reason: string}>
> = {
  'workflow-entry': [
    {
      docId: 'reverse-bootstrap',
      reason: '新任务入口、必读顺序与第一条正式回复要求。',
    },
    {docId: 'reverse-workflow', reason: '总阶段协议与阶段切换规则。'},
    {docId: 'case-safety-policy', reason: '仓库与 task-local 产物边界。'},
  ],
  websocket: [
    {docId: 'tool-reference', reason: '查看 websocket 相关工具参数与能力。'},
    {docId: 'tool-io-contract', reason: '确认 websocket 数据的读取平面。'},
    {
      docId: 'reverse-task-index',
      reason: '按逆向目标回溯 websocket 相关工具。',
    },
  ],
  hook: [
    {
      docId: 'tool-reference',
      reason: '查看 hook、inject、get_hook_data 等工具说明。',
    },
    {docId: 'tool-io-contract', reason: '确认 hook 数据写入与读取口径。'},
    {docId: 'reverse-workflow', reason: '明确 Hook-preferred 的阶段性要求。'},
  ],
  breakpoint: [
    {
      docId: 'tool-reference',
      reason: '查看 breakpoint、pause、step 等工具说明。',
    },
    {
      docId: 'reverse-workflow',
      reason: '确认 Breakpoint-last 原则，避免过早断点。',
    },
    {docId: 'tool-io-contract', reason: '确认调试相关数据面与读取路径。'},
  ],
  'env-rebuild': [
    {
      docId: 'env-patching',
      reason: '补环境主规范，先代理日志与 first divergence。',
    },
    {
      docId: 'reverse-workflow',
      reason: '确认 Rebuild/Patch 阶段目标与完成判据。',
    },
    {
      docId: 'reverse-artifacts',
      reason: '确认 env、run、report 等 task-local 产物位置。',
    },
  ],
  'algorithm-upgrade': [
    {docId: 'algorithm-upgrade-template', reason: '升级/漂移问题的主模板。'},
    {
      docId: 'reverse-workflow',
      reason: '确认当前 first divergence 属于哪一阶段。',
    },
    {
      docId: 'env-patching',
      reason: '若漂移发生在本地复现链路，回到 Patch 规范。',
    },
  ],
  artifacts: [
    {
      docId: 'reverse-artifacts',
      reason: '任务证据、env、run、report 的正式结构说明。',
    },
    {
      docId: 'case-safety-policy',
      reason: '确认哪些产物能进仓库，哪些只能留 task-local。',
    },
    {docId: 'reverse-report-template', reason: '最终对外报告的内容结构。'},
  ],
  reporting: [
    {docId: 'reverse-report-template', reason: '完整结果报告模板。'},
    {
      docId: 'reverse-update-prompt-template',
      reason: '继续迭代时的更新提示模板。',
    },
    {docId: 'reverse-artifacts', reason: '报告里需要引用哪些任务产物。'},
  ],
};

function inferRecommendation(query: string): {
  topic: keyof typeof topicToDocsMap;
  stage:
    | 'Observe'
    | 'Capture'
    | 'Rebuild'
    | 'Patch'
    | 'PureExtraction'
    | 'Port'
    | 'Upgrade';
  reason: string;
} {
  const normalized = query.toLowerCase();

  if (
    normalized.includes('升级') ||
    normalized.includes('漂移') ||
    normalized.includes('first divergence') ||
    normalized.includes('不一致')
  ) {
    return {
      topic: 'algorithm-upgrade',
      stage: 'Upgrade',
      reason:
        '提到升级、漂移、first divergence 或结果不一致，优先走升级排查模板。',
    };
  }

  if (
    normalized.includes('补环境') ||
    normalized.includes('env') ||
    normalized.includes('rebuild')
  ) {
    return {
      topic: 'env-rebuild',
      stage: 'Patch',
      reason: '提到补环境或 rebuild，优先查看 Patch/Rebuild 相关规范。',
    };
  }

  if (normalized.includes('websocket') || normalized.includes('ws')) {
    return {
      topic: 'websocket',
      stage: 'Capture',
      reason: '提到 websocket，优先查看网络采样与 websocket 工具说明。',
    };
  }

  if (normalized.includes('hook') || normalized.includes('preload')) {
    return {
      topic: 'hook',
      stage: 'Capture',
      reason: '提到 hook/preload，优先走 Capture 阶段的最小侵入采样流程。',
    };
  }

  if (
    normalized.includes('断点') ||
    normalized.includes('breakpoint') ||
    normalized.includes('pause') ||
    normalized.includes('step')
  ) {
    return {
      topic: 'breakpoint',
      stage: 'Capture',
      reason: '提到断点调试，先确认 Breakpoint-last 原则与调试工具约束。',
    };
  }

  if (
    normalized.includes('报告') ||
    normalized.includes('总结') ||
    normalized.includes('report')
  ) {
    return {
      topic: 'reporting',
      stage: 'Port',
      reason: '提到报告/总结，优先读取报告模板与产物说明。',
    };
  }

  if (
    normalized.includes('artifact') ||
    normalized.includes('产物') ||
    normalized.includes('task')
  ) {
    return {
      topic: 'artifacts',
      stage: 'Rebuild',
      reason: '提到 task/artifact，优先确认 task-local 产物结构与边界。',
    };
  }

  return {
    topic: 'workflow-entry',
    stage: 'Observe',
    reason: '默认回到工作流入口，先确认阶段、边界和入口文档。',
  };
}

const referenceModeValues = ['doc', 'summary'] as const;
const referenceRouteModeValues = ['stage', 'topic', 'recommend'] as const;
const referenceStageValues = [
  'Observe',
  'Capture',
  'Rebuild',
  'Patch',
  'PureExtraction',
  'Port',
  'Upgrade',
] as const;
const referenceTopicValues = [
  'workflow-entry',
  'websocket',
  'hook',
  'breakpoint',
  'env-rebuild',
  'algorithm-upgrade',
  'artifacts',
  'reporting',
] as const;

export const getReference = defineTool({
  name: 'get_reference',
  description:
    'Read one packaged reference doc, or return its compact summary.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    mode: zod.enum(referenceModeValues),
    docId: zod.enum(referenceDocIds),
    maxSections: zod.number().int().positive().max(12).default(5).optional(),
  },
  handler: async (request, response) => {
    const doc = await resolveReferenceDoc(request.params.docId);
    response.appendResponseLine('```json');
    if (request.params.mode === 'summary') {
      const summary = summarizeReferenceContent(
        doc.content,
        request.params.maxSections ?? 5,
      );
      response.appendResponseLine(
        JSON.stringify(
          {
            mode: request.params.mode,
            docId: request.params.docId,
            group: doc.group,
            path: doc.path,
            summary: summary.summary,
            highlights: summary.highlights,
          },
          null,
          2,
        ),
      );
    } else {
      response.appendResponseLine(
        JSON.stringify(
          {
            mode: request.params.mode,
            docId: request.params.docId,
            group: doc.group,
            path: doc.path,
            content: doc.content,
          },
          null,
          2,
        ),
      );
    }
    response.appendResponseLine('```');
  },
});

export const getReferenceRoute = defineTool({
  name: 'get_reference_route',
  description:
    'Route by stage, topic, or natural-language query to the most relevant reference docs.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    mode: zod.enum(referenceRouteModeValues),
    stage: zod.enum(referenceStageValues).optional(),
    topic: zod.enum(referenceTopicValues).optional(),
    query: zod.string().optional(),
  },
  handler: async (request, response) => {
    const route =
      request.params.mode === 'recommend'
        ? inferRecommendation(request.params.query ?? '')
        : request.params.mode === 'topic'
          ? {
              topic: request.params.topic ?? 'workflow-entry',
              stage: undefined,
              reason: `按 topic=${request.params.topic ?? 'workflow-entry'} 路由。`,
            }
          : {
              topic: undefined,
              stage: request.params.stage ?? 'Observe',
              reason: `按 stage=${request.params.stage ?? 'Observe'} 路由。`,
            };

    const sourceEntries =
      request.params.mode === 'stage'
        ? (stageToDocsMap[route.stage ?? 'Observe'] ?? [])
        : (topicToDocsMap[route.topic ?? 'workflow-entry'] ?? []);

    const recommendedDocs = await Promise.all(
      sourceEntries.map(async entry => {
        const resolved = await resolveReferenceDoc(entry.docId);
        const summary = summarizeReferenceContent(resolved.content, 3);
        return {
          docId: entry.docId,
          group: resolved.group,
          path: resolved.path,
          reason: entry.reason,
          summary: summary.summary,
        };
      }),
    );

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          mode: request.params.mode,
          ...(route.stage ? {stage: route.stage} : {}),
          ...(route.topic ? {topic: route.topic} : {}),
          ...(request.params.query ? {query: request.params.query} : {}),
          reason: route.reason,
          recommendedDocs,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const deobfuscateCode = defineTool({
  name: 'deobfuscate_code',
  description: 'AI-assisted JavaScript deobfuscation.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    code: zod.string(),
    aggressive: zod.boolean().optional(),
    renameVariables: zod.boolean().optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const result = await runtime.deobfuscator.deobfuscate(request.params);
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(withAIRuntime(result), null, 2));
    response.appendResponseLine('```');
  },
});

export const understandCode = defineTool({
  name: 'understand_code',
  description:
    'Analyze code structure/business/security with AI + static analysis.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    code: zod.string(),
    focus: zod.enum(['all', 'structure', 'business', 'security']).optional(),
    aiMode: aiModeSchema.optional(),
  },
  handler: async (request, response) => {
    assertAIRequiredModeAvailable(request.params.aiMode);
    const runtime = getJSHookRuntime();
    const result = await runtime.analyzer.understand(request.params);
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(withAIRuntime(result), null, 2));
    response.appendResponseLine('```');
  },
});

export const summarizeCode = defineTool({
  name: 'summarize_code',
  description:
    'Summarize one code file, multiple files, or project-level context.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    mode: zod.enum(['single', 'batch', 'project']).default('single'),
    code: zod.string().optional(),
    url: zod.string().optional(),
    files: zod
      .array(
        zod.object({
          url: zod.string(),
          content: zod.string(),
          size: zod.number().int().nonnegative(),
          type: zod.enum([
            'inline',
            'external',
            'dynamic',
            'service-worker',
            'web-worker',
          ]),
        }),
      )
      .optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();

    if (request.params.mode === 'project') {
      const result = await runtime.summarizer.summarizeProject(
        request.params.files ?? [],
      );
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result, null, 2));
      response.appendResponseLine('```');
      return;
    }

    if (request.params.mode === 'batch') {
      const result = await runtime.summarizer.summarizeBatch(
        request.params.files ?? [],
      );
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result, null, 2));
      response.appendResponseLine('```');
      return;
    }

    const file = {
      url: request.params.url ?? 'inline-input.js',
      content: request.params.code ?? '',
      size: (request.params.code ?? '').length,
      type: 'inline' as const,
    };
    const result = await runtime.summarizer.summarizeFile(file);
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(result, null, 2));
    response.appendResponseLine('```');
  },
});

export const detectCrypto = defineTool({
  name: 'detect_crypto',
  description:
    'Detect cryptographic algorithms/libraries from JavaScript source.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    code: zod.string(),
    useAI: zod.boolean().optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const result = await runtime.cryptoDetector.detect(request.params);
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        request.params.useAI ? withAIRuntime(result) : result,
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

function normalizeCollectedFiles(
  result: unknown,
): Array<{url: string; content: string; size: number; type: string}> {
  if (!result || typeof result !== 'object') {
    return [];
  }
  const files = (result as {files?: unknown}).files;
  if (!Array.isArray(files)) {
    return [];
  }
  return files
    .filter(
      (
        item,
      ): item is {
        url?: unknown;
        content?: unknown;
        size?: unknown;
        type?: unknown;
      } => Boolean(item && typeof item === 'object'),
    )
    .map(file => ({
      url: typeof file.url === 'string' ? file.url : 'unknown',
      content: typeof file.content === 'string' ? file.content : '',
      size:
        typeof file.size === 'number'
          ? file.size
          : typeof file.content === 'string'
            ? file.content.length
            : 0,
      type: typeof file.type === 'string' ? file.type : 'external',
    }));
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function toMirroredNetworkEntry(
  entry: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const request = toRecord(entry.request);
  if (!request || typeof request.url !== 'string') {
    return undefined;
  }
  const mirrored: Record<string, unknown> = {
    ...(typeof entry.ts === 'string' ? {ts: entry.ts} : {}),
    ...(typeof entry.stage === 'string' ? {stage: entry.stage} : {}),
    ...(typeof entry.source === 'string' ? {source: entry.source} : {}),
    request,
  };
  const response = toRecord(entry.response);
  if (response) {
    mirrored.response = response;
  }
  if (typeof entry.note === 'string') {
    mirrored.note = entry.note;
  }
  return mirrored;
}

function toMirroredScriptEntry(
  entry: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const scriptUrl =
    typeof entry.scriptUrl === 'string'
      ? entry.scriptUrl
      : typeof entry.url === 'string'
        ? entry.url
        : undefined;
  const hasLocator = Boolean(toRecord(entry.locator));
  const hasScriptId = typeof entry.scriptId === 'string';
  if (!scriptUrl || (!hasLocator && !hasScriptId)) {
    return undefined;
  }
  const mirrored: Record<string, unknown> = {
    ...(typeof entry.ts === 'string' ? {ts: entry.ts} : {}),
    ...(typeof entry.source === 'string' ? {source: entry.source} : {}),
    url: scriptUrl,
  };
  if (hasScriptId) {
    mirrored.scriptId = entry.scriptId;
  }
  const locator = toRecord(entry.locator);
  if (locator) {
    mirrored.locator = locator;
  }
  if (typeof entry.note === 'string') {
    mirrored.note = entry.note;
  }
  return mirrored;
}

function buildHookTimeline(
  hookRecords: Array<{hookId: string; records: Array<Record<string, unknown>>}>,
): Array<{
  hookId: string;
  target: string;
  url?: string;
  event?: string;
  method?: string;
  status?: number;
  signatureIndicators?: string[];
  timestamp: number;
}> {
  const findSignatureIndicators = (value: unknown): string[] => {
    if (typeof value !== 'string' || value.length === 0) {
      return [];
    }
    const text = value.toLowerCase();
    const indicators = [
      'sign',
      'signature',
      'token',
      'auth',
      'x-sign',
      'hmac',
      'nonce',
    ].filter(keyword => text.includes(keyword));
    return [...new Set(indicators)];
  };

  const timeline = hookRecords.flatMap(entry =>
    entry.records.map(record => ({
      hookId: entry.hookId,
      target: typeof record.target === 'string' ? record.target : 'unknown',
      url: typeof record.url === 'string' ? record.url : undefined,
      event: typeof record.event === 'string' ? record.event : undefined,
      method:
        typeof record.method === 'string'
          ? record.method.toUpperCase()
          : undefined,
      status: typeof record.status === 'number' ? record.status : undefined,
      signatureIndicators: [
        ...findSignatureIndicators(record.url),
        ...findSignatureIndicators(record.method),
        ...findSignatureIndicators(record.body),
        ...findSignatureIndicators(record.requestBody),
        ...findSignatureIndicators(record.data),
      ],
      timestamp:
        typeof record.timestamp === 'number' ? record.timestamp : Date.now(),
    })),
  );
  timeline.sort((a, b) => a.timestamp - b.timestamp);
  return timeline;
}

function correlateNetworkFlows(
  timeline: Array<{
    hookId: string;
    target: string;
    url?: string;
    event?: string;
    method?: string;
    status?: number;
    signatureIndicators?: string[];
    timestamp: number;
  }>,
  timeWindowMs: number,
  maxFlows: number,
): Array<{
  url: string;
  method: string;
  firstTimestamp: number;
  lastTimestamp: number;
  eventCount: number;
  hookIds: string[];
  events: string[];
  statuses: number[];
  signatureIndicators: string[];
}> {
  const buckets: Array<{
    key: string;
    url: string;
    method: string;
    firstTimestamp: number;
    lastTimestamp: number;
    eventCount: number;
    hookIds: Set<string>;
    events: Set<string>;
    statuses: Set<number>;
    signatureIndicators: Set<string>;
  }> = [];

  for (const item of timeline) {
    if (!item.url) {
      continue;
    }
    const method =
      item.method ?? (item.target === 'websocket' ? 'WS' : 'UNKNOWN');
    const key = `${item.url}::${method}`;
    const eventName = item.event ?? item.target;
    const existing = buckets.find(
      bucket =>
        bucket.key === key &&
        item.timestamp - bucket.lastTimestamp <= timeWindowMs,
    );

    if (existing) {
      existing.lastTimestamp = item.timestamp;
      existing.eventCount += 1;
      existing.hookIds.add(item.hookId);
      existing.events.add(eventName);
      if (typeof item.status === 'number') {
        existing.statuses.add(item.status);
      }
      for (const indicator of item.signatureIndicators ?? []) {
        existing.signatureIndicators.add(indicator);
      }
      continue;
    }

    buckets.push({
      key,
      url: item.url,
      method,
      firstTimestamp: item.timestamp,
      lastTimestamp: item.timestamp,
      eventCount: 1,
      hookIds: new Set([item.hookId]),
      events: new Set([eventName]),
      statuses:
        typeof item.status === 'number' ? new Set([item.status]) : new Set(),
      signatureIndicators: new Set(item.signatureIndicators ?? []),
    });
  }

  return buckets
    .sort(
      (a, b) =>
        b.eventCount - a.eventCount || b.lastTimestamp - a.lastTimestamp,
    )
    .slice(0, maxFlows)
    .map(bucket => ({
      url: bucket.url,
      method: bucket.method,
      firstTimestamp: bucket.firstTimestamp,
      lastTimestamp: bucket.lastTimestamp,
      eventCount: bucket.eventCount,
      hookIds: Array.from(bucket.hookIds),
      events: Array.from(bucket.events),
      statuses: Array.from(bucket.statuses),
      signatureIndicators: Array.from(bucket.signatureIndicators),
    }));
}

function buildUrlPattern(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const normalizedPath = parsed.pathname
      .replace(/\/\d{2,}(?=\/|$)/g, '/:num')
      .replace(/\/[a-f0-9]{8,}(?=\/|$)/gi, '/:hex');
    const queryKeys = Array.from(parsed.searchParams.keys()).sort();
    const queryPattern = queryKeys.length > 0 ? `?${queryKeys.join('&')}` : '';
    return `${parsed.origin}${normalizedPath || '/'}${queryPattern}`;
  } catch {
    return rawUrl
      .split('?')[0]
      .replace(/\/\d{2,}(?=\/|$)/g, '/:num')
      .replace(/\/[a-f0-9]{8,}(?=\/|$)/gi, '/:hex');
  }
}

function buildRequestFingerprints(
  flows: Array<{
    url: string;
    method: string;
    eventCount: number;
    statuses: number[];
    signatureIndicators: string[];
  }>,
  maxFingerprints: number,
): Array<{
  fingerprint: string;
  urlPattern: string;
  methods: string[];
  flowCount: number;
  totalEvents: number;
  signatureIndicators: string[];
  signatureIndicatorCount: number;
  suspiciousScore: number;
  sampleUrls: string[];
}> {
  const buckets = new Map<
    string,
    {
      urlPattern: string;
      methods: Set<string>;
      flowCount: number;
      totalEvents: number;
      signatureIndicators: Set<string>;
      suspiciousScore: number;
      sampleUrls: Set<string>;
    }
  >();

  for (const flow of flows) {
    const urlPattern = buildUrlPattern(flow.url);
    const key = urlPattern;
    const existing = buckets.get(key);
    const flowScore =
      Math.min(flow.eventCount, 10) +
      Math.min(flow.signatureIndicators.length, 5) * 3 +
      (flow.statuses.some(status => status >= 400) ? 2 : 0);

    if (existing) {
      existing.methods.add(flow.method);
      existing.flowCount += 1;
      existing.totalEvents += flow.eventCount;
      existing.suspiciousScore += flowScore;
      for (const indicator of flow.signatureIndicators) {
        existing.signatureIndicators.add(indicator);
      }
      existing.sampleUrls.add(flow.url);
      continue;
    }

    buckets.set(key, {
      urlPattern,
      methods: new Set([flow.method]),
      flowCount: 1,
      totalEvents: flow.eventCount,
      signatureIndicators: new Set(flow.signatureIndicators),
      suspiciousScore: flowScore,
      sampleUrls: new Set([flow.url]),
    });
  }

  return Array.from(buckets.values())
    .sort(
      (a, b) =>
        b.suspiciousScore - a.suspiciousScore || b.totalEvents - a.totalEvents,
    )
    .slice(0, maxFingerprints)
    .map(bucket => {
      const methods = Array.from(bucket.methods).sort();
      const signatureIndicators = Array.from(bucket.signatureIndicators).sort();
      const fingerprint = `${methods.join('+')} ${bucket.urlPattern}`.trim();
      return {
        fingerprint,
        urlPattern: bucket.urlPattern,
        methods,
        flowCount: bucket.flowCount,
        totalEvents: bucket.totalEvents,
        signatureIndicators,
        signatureIndicatorCount: signatureIndicators.length,
        suspiciousScore: bucket.suspiciousScore,
        sampleUrls: Array.from(bucket.sampleUrls).slice(0, 3),
      };
    });
}

function buildPriorityTargets(input: {
  requestFingerprints: Array<{
    urlPattern: string;
    methods: string[];
    suspiciousScore: number;
    signatureIndicatorCount: number;
  }>;
  signatureHints: {
    signatureParams: string[];
    candidateFunctions: string[];
    requestSinks: string[];
  };
  maxTargets: number;
}): Array<{
  target: string;
  type: 'network' | 'function';
  priorityScore: number;
  reasons: string[];
}> {
  const networkTargets = input.requestFingerprints.map(item => {
    const isWritePath = item.methods.some(method =>
      ['POST', 'PUT', 'PATCH', 'DELETE', 'WS'].includes(method),
    );
    const score =
      item.suspiciousScore +
      item.signatureIndicatorCount * 2 +
      (isWritePath ? 3 : 0) +
      (input.signatureHints.requestSinks.length > 0 ? 1 : 0);
    return {
      target: item.urlPattern,
      type: 'network' as const,
      priorityScore: score,
      reasons: [
        item.signatureIndicatorCount > 0
          ? `signature indicators: ${item.signatureIndicatorCount}`
          : null,
        isWritePath ? `write-like methods: ${item.methods.join(', ')}` : null,
      ].filter((value): value is string => Boolean(value)),
    };
  });

  const functionTargets = input.signatureHints.candidateFunctions
    .slice(0, 5)
    .map(name => ({
      target: name,
      type: 'function' as const,
      priorityScore:
        6 + Math.min(input.signatureHints.signatureParams.length, 4),
      reasons: [
        'name matches signing/encryption keywords',
        input.signatureHints.signatureParams.length > 0
          ? `related params: ${input.signatureHints.signatureParams.slice(0, 4).join(', ')}`
          : null,
      ].filter((value): value is string => Boolean(value)),
    }));

  return [...networkTargets, ...functionTargets]
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore || a.target.localeCompare(b.target),
    )
    .slice(0, input.maxTargets);
}

function extractSignatureChainHints(code: string): {
  signatureParams: string[];
  candidateFunctions: string[];
  requestSinks: string[];
} {
  const signatureParamRegex =
    /\b(sign(?:ature)?|token|auth|nonce|timestamp|x-sign)\b/gi;
  const functionNameRegex =
    /(function\s+([A-Za-z_$][\w$]*)\s*\(|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(|([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function)/g;
  const requestSinkRegex =
    /\b(fetch|XMLHttpRequest|sendBeacon|axios\.(?:get|post|request)|\$.ajax)\b/g;

  const params = new Set<string>();
  for (const match of code.matchAll(signatureParamRegex)) {
    if (match[1]) {
      params.add(match[1].toLowerCase());
    }
  }

  const functions = new Set<string>();
  for (const match of code.matchAll(functionNameRegex)) {
    const name = match[2] || match[3] || match[4];
    if (
      name &&
      /(sign|token|encrypt|hash|auth|nonce|hmac|md5|sha)/i.test(name)
    ) {
      functions.add(name);
    }
  }

  const sinks = new Set<string>();
  for (const match of code.matchAll(requestSinkRegex)) {
    if (match[1]) {
      sinks.add(match[1]);
    }
  }

  return {
    signatureParams: Array.from(params).slice(0, 20),
    candidateFunctions: Array.from(functions).slice(0, 20),
    requestSinks: Array.from(sinks).slice(0, 20),
  };
}

interface SignatureFunctionCandidate {
  functionName: string;
  score: number;
  evidence: string[];
  scriptUrl?: string;
  relatedParams: string[];
  apiSignals: string[];
  observedFunctionHit?: boolean;
  candidateScriptHit?: boolean;
}

function collectFunctionCandidatesFromCode(input: {
  code: string;
  scriptUrl?: string;
  targetParam: string;
  relatedParams?: string[];
  candidateScripts?: string[];
  observedFunctions?: string[];
  preferredUrlPatterns?: string[];
  maxCandidates: number;
}): SignatureFunctionCandidate[] {
  const functionBlocks = Array.from(
    input.code.matchAll(
      /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{([\s\S]*?)\n?\}/g,
    ),
  );
  const targetParam = input.targetParam.toLowerCase();
  const relatedParams = (input.relatedParams ?? []).map(item =>
    item.toLowerCase(),
  );
  const candidateScripts = (input.candidateScripts ?? []).map(item =>
    item.toLowerCase(),
  );
  const observedFunctions = new Set(
    (input.observedFunctions ?? []).map(item => item.toLowerCase()),
  );
  const preferredUrlPatterns = (input.preferredUrlPatterns ?? []).map(item =>
    item.toLowerCase(),
  );
  const requestSinkRegex =
    /\b(fetch|XMLHttpRequest|sendBeacon|axios\.(?:get|post|request)|\$.ajax)\b/i;
  const apiSignals = [
    'crypto.subtle',
    'digest',
    'TextEncoder',
    'Date.now',
    'performance.now',
    'encodeURIComponent',
    'URLSearchParams',
  ];

  const candidates = functionBlocks.map(match => {
    const functionName = match[1] ?? 'anonymous';
    const params = (match[2] ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    const body = match[3] ?? '';
    const bodyLower = body.toLowerCase();
    const scriptUrlLower = input.scriptUrl?.toLowerCase() ?? '';
    const evidence: string[] = [];
    let score = 0;

    if (functionName.toLowerCase().includes(targetParam)) {
      score += 8;
      evidence.push(`function name matches target param: ${input.targetParam}`);
    }
    if (bodyLower.includes(targetParam)) {
      score += 6;
      evidence.push(`body references target param: ${input.targetParam}`);
    }
    if (
      /(sign|token|encrypt|hash|auth|nonce|hmac|md5|sha|h5st)/i.test(
        functionName,
      )
    ) {
      score += 5;
      evidence.push('function name matches signing keywords');
    }

    const matchedRelatedParams = relatedParams.filter(item => {
      return (
        params.some(param => param.toLowerCase().includes(item)) ||
        bodyLower.includes(item)
      );
    });
    if (matchedRelatedParams.length > 0) {
      score += matchedRelatedParams.length * 2;
      evidence.push(
        `related params matched: ${matchedRelatedParams.join(', ')}`,
      );
    }

    const matchedApiSignals = apiSignals.filter(signal =>
      body.includes(signal),
    );
    if (matchedApiSignals.length > 0) {
      score += matchedApiSignals.length * 2;
      evidence.push(`api signals: ${matchedApiSignals.join(', ')}`);
    }

    if (requestSinkRegex.test(body)) {
      score += 2;
      evidence.push('request sink found in function body');
    }

    const observedFunctionHit = observedFunctions.has(
      functionName.toLowerCase(),
    );
    if (observedFunctionHit) {
      score += 7;
      evidence.push('function observed in task evidence');
    }

    const candidateScriptHit = candidateScripts.some(item =>
      scriptUrlLower.includes(item),
    );
    if (candidateScriptHit) {
      score += 4;
      evidence.push('script matches candidateScripts from task context');
    }

    const preferredUrlHit = preferredUrlPatterns.some(item =>
      scriptUrlLower.includes(item),
    );
    if (preferredUrlHit) {
      score += 3;
      evidence.push('script matches preferred URL patterns');
    }

    return {
      functionName,
      score,
      evidence,
      scriptUrl: input.scriptUrl,
      relatedParams: matchedRelatedParams,
      apiSignals: matchedApiSignals,
      observedFunctionHit,
      candidateScriptHit,
    };
  });

  return candidates
    .filter(item => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.functionName.localeCompare(b.functionName),
    )
    .slice(0, input.maxCandidates);
}

async function collectLocateSignatureCode(
  runtime: ReturnType<typeof getJSHookRuntime>,
  params: {
    url: string;
    topN?: number;
    collect?: {
      smartMode?: 'summary' | 'priority' | 'incremental' | 'full';
      includeInline?: boolean;
      includeExternal?: boolean;
      includeDynamic?: boolean;
      maxTotalSize?: number;
      maxFileSize?: number;
    };
  },
): Promise<Array<{url: string; content: string; size: number; type: string}>> {
  const topN = params.topN ?? 8;
  const collectResult = await runtime.collector.collect({
    url: params.url,
    smartMode: params.collect?.smartMode ?? 'priority',
    includeInline: params.collect?.includeInline,
    includeExternal: params.collect?.includeExternal,
    includeDynamic: params.collect?.includeDynamic ?? true,
    maxTotalSize: params.collect?.maxTotalSize,
    maxFileSize: params.collect?.maxFileSize,
  });

  const normalizedFiles = normalizeCollectedFiles(collectResult);
  const topPriority = runtime.collector.getTopPriorityFiles(topN);
  return topPriority.files.length > 0
    ? topPriority.files
    : normalizedFiles.slice(0, topN);
}

function buildActionPlan(result: {
  target: string;
  topHookIds: Array<{hookId: string; type: string}>;
  suspiciousFlows: Array<{
    url: string;
    method: string;
    signatureIndicators: string[];
  }>;
  priorityTargets: Array<{
    target: string;
    type: 'network' | 'function';
    priorityScore: number;
  }>;
  signatureHints: {
    signatureParams: string[];
    candidateFunctions: string[];
    requestSinks: string[];
  };
}): string[] {
  const steps: string[] = [];
  const addStep = (text: string) => {
    steps.push(`${steps.length + 1}) ${text}`);
  };
  addStep(
    `调用 collect_code，参数: {"url":"${result.target}","returnMode":"top-priority","topN":10}`,
  );

  if (result.suspiciousFlows.length > 0) {
    const flow = result.suspiciousFlows[0];
    addStep(
      `重点观察可疑请求: ${flow.method} ${flow.url}，命中指标: ${flow.signatureIndicators.join(', ')}`,
    );
  } else {
    addStep(
      '先触发登录/下单/关键业务操作，再重新运行 analyze_target 捕获动态请求',
    );
  }

  if (result.priorityTargets.length > 0) {
    const top = result.priorityTargets[0];
    if (top.type === 'network') {
      addStep(
        `优先复现网络链路: ${top.target}（priority=${top.priorityScore}）`,
      );
    } else {
      addStep(`优先审计函数: ${top.target}（priority=${top.priorityScore}）`);
    }
  }

  if (result.signatureHints.candidateFunctions.length > 0) {
    const fnName = result.signatureHints.candidateFunctions[0];
    addStep(
      `使用 search_in_scripts 搜索函数名 "${fnName}"，并用 understand_code 深挖调用链`,
    );
  } else {
    addStep(
      '使用 search_in_scripts 搜索关键词 sign/token/auth/nonce，定位签名生成点',
    );
  }

  if (result.topHookIds.length > 0) {
    addStep(
      `调用 get_hook_data 查看首个 hook 数据: {"hookId":"${result.topHookIds[0].hookId}"}`,
    );
  } else {
    addStep('用 create_hook + inject_hook 手工注入 fetch/xhr hook 后再采样');
  }

  addStep(
    '对疑似签名代码调用 deobfuscate_code（aggressive=true）并复测请求参数变化',
  );
  return steps;
}

function buildWhyTheseSteps(input: {
  requestFingerprints: Array<{fingerprint: string}>;
  candidateFunctions: string[];
  hookRecordCount: number;
}): string[] {
  return [
    input.requestFingerprints.length > 0
      ? `Observed suspicious request fingerprints: ${input.requestFingerprints
          .slice(0, 2)
          .map(item => item.fingerprint)
          .join('; ')}`
      : 'No stable request fingerprint yet, so the next steps keep observation and capture lightweight.',
    input.candidateFunctions.length > 0
      ? `Candidate signing functions were found: ${input.candidateFunctions.slice(0, 3).join(', ')}`
      : 'No obvious signing function names were found, so the workflow should rely on request and hook evidence first.',
    input.hookRecordCount > 0
      ? `Hook capture already produced ${input.hookRecordCount} runtime records, enough to start correlation and local rebuild.`
      : 'Hook capture has not produced data yet, so the workflow should avoid premature local rebuild guesses.',
  ];
}

function buildStopConditions(input: {
  hookRecordCount: number;
  suspiciousFlowCount: number;
}): string[] {
  return [
    input.suspiciousFlowCount > 0
      ? 'Stop broadening capture once the target request path is confirmed and export a rebuild bundle.'
      : 'Stop and trigger the target action if no suspicious request path has been confirmed yet.',
    input.hookRecordCount > 200
      ? 'Stop expanding hooks until noisy capture is reduced with summary view or narrower targets.'
      : 'Stop escalating to breakpoints unless hook evidence still cannot expose the required runtime context.',
  ];
}

type AnalyzeTargetParams = zod.infer<
  zod.ZodObject<{
    url: zod.ZodString;
    topN: zod.ZodOptional<zod.ZodNumber>;
    useAI: zod.ZodOptional<zod.ZodBoolean>;
    aiMode: zod.ZodOptional<zod.ZodEnum<['auto', 'required', 'off']>>;
    runDeobfuscation: zod.ZodOptional<zod.ZodBoolean>;
    hookPreset: zod.ZodOptional<
      zod.ZodEnum<['none', 'api-signature', 'network-core']>
    >;
    autoInjectHooks: zod.ZodOptional<zod.ZodBoolean>;
    waitAfterHookMs: zod.ZodOptional<zod.ZodNumber>;
    correlationWindowMs: zod.ZodOptional<zod.ZodNumber>;
    maxCorrelatedFlows: zod.ZodOptional<zod.ZodNumber>;
    maxFingerprints: zod.ZodOptional<zod.ZodNumber>;
    autoReplayActions: zod.ZodOptional<
      zod.ZodArray<
        zod.ZodObject<{
          action: zod.ZodEnum<
            [
              'navigate',
              'click',
              'type',
              'wait',
              'scroll',
              'pressKey',
              'evaluate',
            ]
          >;
          url: zod.ZodOptional<zod.ZodString>;
          selector: zod.ZodOptional<zod.ZodString>;
          text: zod.ZodOptional<zod.ZodString>;
          delay: zod.ZodOptional<zod.ZodNumber>;
          timeout: zod.ZodOptional<zod.ZodNumber>;
          x: zod.ZodOptional<zod.ZodNumber>;
          y: zod.ZodOptional<zod.ZodNumber>;
          key: zod.ZodOptional<zod.ZodString>;
          code: zod.ZodOptional<zod.ZodString>;
        }>
      >
    >;
    collect: zod.ZodOptional<
      zod.ZodObject<{
        smartMode: zod.ZodOptional<
          zod.ZodEnum<['summary', 'priority', 'incremental', 'full']>
        >;
        includeInline: zod.ZodOptional<zod.ZodBoolean>;
        includeExternal: zod.ZodOptional<zod.ZodBoolean>;
        includeDynamic: zod.ZodOptional<zod.ZodBoolean>;
        maxTotalSize: zod.ZodOptional<zod.ZodNumber>;
        maxFileSize: zod.ZodOptional<zod.ZodNumber>;
      }>
    >;
  }>
>;

function pickHookTypes(
  hookPreset: 'none' | 'api-signature' | 'network-core',
): string[] {
  if (hookPreset === 'none') {
    return [];
  }
  if (hookPreset === 'network-core') {
    return ['fetch', 'xhr', 'websocket', 'eval', 'timer'];
  }
  return ['fetch', 'xhr', 'websocket'];
}

async function collectAnalyzeTargetCode(
  runtime: ReturnType<typeof getJSHookRuntime>,
  params: AnalyzeTargetParams,
): Promise<{
  collectResult: unknown;
  normalizedFiles: Array<{
    url: string;
    content: string;
    size: number;
    type: string;
  }>;
  candidateFiles: Array<{
    url: string;
    content: string;
    size: number;
    type: string;
  }>;
  analysisCode: string;
}> {
  const topN = params.topN ?? 8;
  const collectResult = await runtime.collector.collect({
    url: params.url,
    smartMode: params.collect?.smartMode ?? 'priority',
    includeInline: params.collect?.includeInline,
    includeExternal: params.collect?.includeExternal,
    includeDynamic: params.collect?.includeDynamic ?? true,
    maxTotalSize: params.collect?.maxTotalSize,
    maxFileSize: params.collect?.maxFileSize,
  });

  const normalizedFiles = normalizeCollectedFiles(collectResult);
  const topPriority = runtime.collector.getTopPriorityFiles(topN);
  const candidateFiles =
    topPriority.files.length > 0
      ? topPriority.files
      : normalizedFiles.slice(0, topN);
  const mergedCode = candidateFiles
    .map(file => `// ${file.url}\n${file.content}`)
    .join('\n\n');
  const analysisCode =
    mergedCode.length > 300000 ? mergedCode.slice(0, 300000) : mergedCode;
  return {collectResult, normalizedFiles, candidateFiles, analysisCode};
}

async function installAnalyzeHooks(
  runtime: ReturnType<typeof getJSHookRuntime>,
  hookPreset: 'none' | 'api-signature' | 'network-core',
  autoInjectHooks: boolean,
): Promise<Array<{hookId: string; type: string}>> {
  const injectedHooks: Array<{hookId: string; type: string}> = [];
  for (const type of pickHookTypes(hookPreset)) {
    const created = runtime.hookManager.create({
      type,
      description: `[analyze_target] ${type} hook`,
      action: 'log',
    });
    if (autoInjectHooks) {
      await runtime.pageController.injectScript(created.script);
    }
    injectedHooks.push({hookId: created.hookId, type});
  }
  return injectedHooks;
}

async function runAnalyzeTargetWorkflow(
  runtime: ReturnType<typeof getJSHookRuntime>,
  params: AnalyzeTargetParams,
) {
  const startedAt = Date.now();
  const hookPreset = params.hookPreset ?? 'api-signature';
  const autoInjectHooks = params.autoInjectHooks ?? true;
  const correlationWindowMs = params.correlationWindowMs ?? 1500;
  const maxCorrelatedFlows = params.maxCorrelatedFlows ?? 20;
  const maxFingerprints = params.maxFingerprints ?? 12;

  const {collectResult, normalizedFiles, candidateFiles, analysisCode} =
    await collectAnalyzeTargetCode(runtime, params);
  const injectedHooks = await installAnalyzeHooks(
    runtime,
    hookPreset,
    autoInjectHooks,
  );

  const replayResults = params.autoReplayActions?.length
    ? await runtime.pageController.replayActions(params.autoReplayActions)
    : [];

  if (params.waitAfterHookMs && params.waitAfterHookMs > 0) {
    await new Promise(resolve => setTimeout(resolve, params.waitAfterHookMs));
  }

  const [understand, crypto] = await Promise.all([
    runtime.analyzer.understand({
      code: analysisCode,
      focus: 'security',
      aiMode: params.aiMode,
    }),
    runtime.cryptoDetector.detect({
      code: analysisCode,
      useAI: params.aiMode === 'off' ? false : params.useAI,
    }),
  ]);

  const deobfuscation = params.runDeobfuscation
    ? await runtime.deobfuscator.deobfuscate({
        code: analysisCode.slice(0, 120000),
        aggressive: true,
        renameVariables: true,
      })
    : undefined;

  const hookRecords = injectedHooks.map(hook => ({
    hookId: hook.hookId,
    records: runtime.hookManager.getRecords(hook.hookId),
  }));
  const hookTimeline = buildHookTimeline(
    hookRecords as Array<{
      hookId: string;
      records: Array<Record<string, unknown>>;
    }>,
  );
  const urlActivity = hookTimeline.reduce<Record<string, number>>(
    (acc, item) => {
      if (item.url) {
        acc[item.url] = (acc[item.url] ?? 0) + 1;
      }
      return acc;
    },
    {},
  );
  const activeUrls = Object.entries(urlActivity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([url, count]) => ({url, count}));
  const correlatedFlows = correlateNetworkFlows(
    hookTimeline,
    correlationWindowMs,
    maxCorrelatedFlows,
  );
  const suspiciousFlows = correlatedFlows.filter(
    flow => flow.signatureIndicators.length > 0,
  );
  const requestFingerprints = buildRequestFingerprints(
    correlatedFlows,
    maxFingerprints,
  );
  const signatureHints = extractSignatureChainHints(analysisCode);
  const priorityTargets = buildPriorityTargets({
    requestFingerprints,
    signatureHints,
    maxTargets: 10,
  });
  const actionPlan = buildActionPlan({
    target: params.url,
    topHookIds: injectedHooks,
    suspiciousFlows,
    priorityTargets,
    signatureHints,
  });
  const collectionDependencies =
    collectResult && typeof collectResult === 'object'
      ? (collectResult as {dependencies?: unknown}).dependencies
      : undefined;

  return {
    target: params.url,
    durationMs: Date.now() - startedAt,
    collection: {
      totalCollected: normalizedFiles.length,
      selectedForAnalysis: candidateFiles.length,
      dependencies: collectionDependencies ?? {nodes: [], edges: []},
    },
    analysis: {
      qualityScore: understand.qualityScore,
      securityRiskCount: understand.securityRisks.length,
      cryptoAlgorithms: crypto.algorithms.map(item => item.name),
    },
    deobfuscation: deobfuscation
      ? {
          confidence: deobfuscation.confidence,
          readabilityScore: deobfuscation.readabilityScore,
          transformations: deobfuscation.transformations.length,
        }
      : null,
    hooks: {
      preset: hookPreset,
      autoInjected: autoInjectHooks,
      hookIds: injectedHooks,
      totalRecords: hookTimeline.length,
      activeUrls,
      correlatedFlows,
      suspiciousFlows: suspiciousFlows.slice(0, 10),
      timelineSample: hookTimeline.slice(0, 30),
    },
    replay: replayResults,
    requestFingerprints,
    priorityTargets,
    signatureChain: {
      params: signatureHints.signatureParams,
      candidateFunctions: signatureHints.candidateFunctions,
      requestSinks: signatureHints.requestSinks,
    },
    actionPlan,
    recommendedNextSteps: actionPlan,
    whyTheseSteps: buildWhyTheseSteps({
      requestFingerprints,
      candidateFunctions: signatureHints.candidateFunctions,
      hookRecordCount: hookTimeline.length,
    }),
    stopIf: buildStopConditions({
      hookRecordCount: hookTimeline.length,
      suspiciousFlowCount: suspiciousFlows.length,
    }),
    nextActions: [
      crypto.algorithms.length > 0
        ? 'Focus on crypto-related files from top-priority list.'
        : null,
      hookTimeline.length === 0
        ? 'Trigger page interactions and rerun get_hook_data / analyze_target.'
        : null,
      understand.securityRisks.length > 0
        ? 'Review high-severity security findings and verify call stacks.'
        : null,
    ].filter((item): item is string => Boolean(item)),
  };
}

export const recordReverseEvidence = defineTool({
  name: 'record_reverse_evidence',
  description:
    'Append structured reverse-engineering evidence to a task artifact log.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    taskId: zod.string(),
    taskSlug: zod.string(),
    targetUrl: zod.string(),
    goal: zod.string(),
    channel: zod.string().default('runtime-evidence'),
    targetKeywords: zod.array(zod.string()).optional(),
    targetUrlPatterns: zod.array(zod.string()).optional(),
    targetFunctionNames: zod.array(zod.string()).optional(),
    targetActionDescription: zod.string().optional(),
    entry: zod.record(zod.string(), zod.unknown()),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const task = await runtime.reverseTaskStore.openTask({
      taskId: request.params.taskId,
      slug: request.params.taskSlug,
      targetUrl: request.params.targetUrl,
      goal: request.params.goal,
    });
    const targetContext = {
      targetKeywords: request.params.targetKeywords ?? [],
      targetUrlPatterns: request.params.targetUrlPatterns ?? [],
      targetFunctionNames: request.params.targetFunctionNames ?? [],
      targetActionDescription: request.params.targetActionDescription ?? '',
    };
    const hasTargetContext =
      targetContext.targetKeywords.length > 0 ||
      targetContext.targetUrlPatterns.length > 0 ||
      targetContext.targetFunctionNames.length > 0 ||
      targetContext.targetActionDescription.length > 0;

    const artifactEntry = {
      ...request.params.entry,
      ...(hasTargetContext ? {targetContext} : {}),
    };

    await task.appendLog(request.params.channel, artifactEntry);

    const mirroredChannels: string[] = [];
    if (request.params.channel === 'runtime-evidence') {
      const mirroredNetworkEntry = toMirroredNetworkEntry(request.params.entry);
      if (mirroredNetworkEntry) {
        await task.appendLog('network', mirroredNetworkEntry);
        mirroredChannels.push('network');
      }
      const mirroredScriptEntry = toMirroredScriptEntry(request.params.entry);
      if (mirroredScriptEntry) {
        await task.appendLog('scripts', mirroredScriptEntry);
        mirroredChannels.push('scripts');
      }
    }

    if (hasTargetContext) {
      const existingTargetContext = await runtime.reverseTaskStore.readSnapshot<
        Record<string, unknown>
      >(request.params.taskId, 'target-context.json');
      await task.writeSnapshot('target-context.json', {
        ...existingTargetContext,
        ...targetContext,
      });
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ok: true,
          taskId: task.taskId,
          taskDir: task.taskDir,
          channel: request.params.channel,
          mirroredChannels,
          targetContext: hasTargetContext ? targetContext : undefined,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const analyzeTarget = defineTool({
  name: 'analyze_target',
  description:
    'One-shot reverse workflow: collect code, run security/crypto analysis, optional deobfuscation, and hook timeline correlation.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().url(),
    topN: zod.number().int().positive().optional(),
    useAI: zod.boolean().optional(),
    aiMode: aiModeSchema.optional(),
    runDeobfuscation: zod.boolean().optional(),
    hookPreset: zod.enum(['none', 'api-signature', 'network-core']).optional(),
    autoInjectHooks: zod.boolean().optional(),
    waitAfterHookMs: zod.number().int().nonnegative().optional(),
    correlationWindowMs: zod.number().int().positive().optional(),
    maxCorrelatedFlows: zod.number().int().positive().optional(),
    maxFingerprints: zod.number().int().positive().optional(),
    autoReplayActions: zod
      .array(
        zod.object({
          action: zod.enum([
            'navigate',
            'click',
            'type',
            'wait',
            'scroll',
            'pressKey',
            'evaluate',
          ]),
          url: zod.string().url().optional(),
          selector: zod.string().optional(),
          text: zod.string().optional(),
          delay: zod.number().int().nonnegative().optional(),
          timeout: zod.number().int().positive().optional(),
          x: zod.number().optional(),
          y: zod.number().optional(),
          key: zod.string().optional(),
          code: zod.string().optional(),
        }),
      )
      .optional(),
    collect: zod
      .object({
        smartMode: zod
          .enum(['summary', 'priority', 'incremental', 'full'])
          .optional(),
        includeInline: zod.boolean().optional(),
        includeExternal: zod.boolean().optional(),
        includeDynamic: zod.boolean().optional(),
        maxTotalSize: zod.number().int().positive().optional(),
        maxFileSize: zod.number().int().positive().optional(),
      })
      .optional(),
  },
  handler: async (request, response) => {
    assertAIRequiredModeAvailable(request.params.aiMode);
    const runtime = getJSHookRuntime();
    const result = await runAnalyzeTargetWorkflow(runtime, request.params);

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(withAIRuntime(result), null, 2));
    response.appendResponseLine('```');
  },
});

export const locateSignatureFunction = defineTool({
  name: 'locate_signature_function',
  description:
    'Collect candidate scripts and rank likely signature-generation functions for a target parameter.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().url(),
    taskId: zod.string().optional(),
    taskSlug: zod.string().optional(),
    goal: zod.string().optional(),
    persistResult: zod.boolean().optional().default(false),
    targetParam: zod.string().default('sign'),
    relatedParams: zod.array(zod.string()).optional(),
    candidateScripts: zod.array(zod.string()).optional(),
    observedFunctions: zod.array(zod.string()).optional(),
    preferredUrlPatterns: zod.array(zod.string()).optional(),
    topN: zod.number().int().positive().optional(),
    maxCandidates: zod.number().int().positive().optional(),
    collect: zod
      .object({
        smartMode: zod
          .enum(['summary', 'priority', 'incremental', 'full'])
          .optional(),
        includeInline: zod.boolean().optional(),
        includeExternal: zod.boolean().optional(),
        includeDynamic: zod.boolean().optional(),
        maxTotalSize: zod.number().int().positive().optional(),
        maxFileSize: zod.number().int().positive().optional(),
      })
      .optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const selectedFiles = await collectLocateSignatureCode(
      runtime,
      request.params,
    );
    const maxCandidates = request.params.maxCandidates ?? 5;
    const candidates = selectedFiles
      .flatMap(file =>
        collectFunctionCandidatesFromCode({
          code: file.content,
          scriptUrl: file.url,
          targetParam: request.params.targetParam,
          relatedParams: request.params.relatedParams,
          candidateScripts: request.params.candidateScripts,
          observedFunctions: request.params.observedFunctions,
          preferredUrlPatterns: request.params.preferredUrlPatterns,
          maxCandidates,
        }),
      )
      .sort(
        (a, b) =>
          b.score - a.score || a.functionName.localeCompare(b.functionName),
      )
      .slice(0, maxCandidates);

    const result = {
      target: request.params.url,
      persisted: false,
      targetParam: request.params.targetParam,
      selectedFiles: selectedFiles.map(file => ({
        url: file.url,
        size: file.size,
        type: file.type,
      })),
      candidates,
      nextAction:
        candidates.length > 0
          ? {
              tool: 'search_in_scripts',
              params: {pattern: candidates[0]?.functionName, limit: 5},
              reason: `先搜索候选函数 "${candidates[0]?.functionName}"，再配合 extract_function_tree 做最小切片。`,
            }
          : {
              tool: 'search_in_scripts',
              params: {pattern: request.params.targetParam, limit: 10},
              reason:
                '当前没有高置信候选函数，先回到参数名和相关字段继续缩圈。',
            },
      followUpPlan:
        candidates.length > 0
          ? [
              {
                step: 1,
                tool: 'search_in_sources',
                params: {
                  query: candidates[0]?.functionName,
                  isRegex: false,
                  caseSensitive: true,
                  maxResults: 10,
                  ...(candidates[0]?.scriptUrl
                    ? {urlFilter: candidates[0].scriptUrl}
                    : {}),
                },
                reason:
                  '先在已加载源码里按函数名和候选脚本过滤，拿到更接近 extract_function_tree 的 script 线索。',
              },
              {
                step: 2,
                tool: 'extract_function_tree',
                params: {
                  scriptId: '<from-search-result>',
                  functionName: candidates[0]?.functionName,
                  maxDepth: 2,
                },
                reason:
                  '确认 scriptId 后，立即提取最小依赖闭包，避免全量阅读 bundle。',
              },
            ]
          : [],
    };

    if (
      request.params.persistResult &&
      request.params.taskId &&
      request.params.taskSlug &&
      request.params.goal
    ) {
      const task = await runtime.reverseTaskStore.openTask({
        taskId: request.params.taskId,
        slug: request.params.taskSlug,
        targetUrl: request.params.url,
        goal: request.params.goal,
      });
      const existingTargetContext = await runtime.reverseTaskStore.readSnapshot<
        Record<string, unknown>
      >(request.params.taskId, 'target-context.json');
      const mergedTargetContext = {
        ...(existingTargetContext ?? {}),
        ...(candidates[0]?.scriptUrl
          ? {
              candidateScripts: Array.from(
                new Set([
                  ...((existingTargetContext?.candidateScripts as
                    | string[]
                    | undefined) ?? []),
                  candidates[0].scriptUrl,
                ]),
              ),
            }
          : {}),
        locatedSignature: candidates[0]
          ? {
              functionName: candidates[0].functionName,
              scriptUrl: candidates[0].scriptUrl,
              score: candidates[0].score,
              targetParam: request.params.targetParam,
              relatedParams: candidates[0].relatedParams,
              evidence: candidates[0].evidence,
            }
          : undefined,
      };
      await task.writeSnapshot('target-context.json', mergedTargetContext);
      await task.writeSnapshot('signature-locate.json', {
        target: request.params.url,
        targetParam: request.params.targetParam,
        candidates,
        followUpPlan: result.followUpPlan,
        persistedAt: Date.now(),
      });
      if (candidates[0]) {
        await task.appendLog('runtime-evidence', {
          source: 'locate_signature_function',
          kind: 'signature-locate',
          functionName: candidates[0].functionName,
          url: candidates[0].scriptUrl,
          note: `located candidate for ${request.params.targetParam}`,
          score: candidates[0].score,
          evidence: candidates[0].evidence,
        });
      }
      result.persisted = true;
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(withAIRuntime(result), null, 2));
    response.appendResponseLine('```');
  },
});

function toMarkdownReport(report: {
  generatedAt: string;
  collector: {
    totalFiles: number;
    totalBytes: number;
  };
  hooks: {
    totalHooks: number;
    enabledHooks: number;
    totalRecords: number;
  };
  tokenBudget: {
    usedTokens: number;
    maxTokens: number;
    usagePercent: number;
  };
}): string {
  return [
    '# Session Report',
    '',
    `Generated At: ${report.generatedAt}`,
    '',
    '## Collector',
    `- Files: ${report.collector.totalFiles}`,
    `- Total Bytes: ${report.collector.totalBytes}`,
    '',
    '## Hooks',
    `- Total Hooks: ${report.hooks.totalHooks}`,
    `- Enabled Hooks: ${report.hooks.enabledHooks}`,
    `- Total Records: ${report.hooks.totalRecords}`,
    '',
    '## Token Budget',
    `- Used: ${report.tokenBudget.usedTokens}/${report.tokenBudget.maxTokens}`,
    `- Usage: ${report.tokenBudget.usagePercent.toFixed(2)}%`,
  ].join('\n');
}

export const riskPanel = defineTool({
  name: 'risk_panel',
  description:
    'Build a combined risk score from analyzer, crypto detector and hook signals.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    code: zod.string().optional(),
    useAI: zod.boolean().optional(),
    includeHookSignals: zod.boolean().optional(),
    hookId: zod.string().optional(),
    topN: zod.number().int().positive().optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();

    let code = request.params.code;
    if (!code) {
      const top = runtime.collector.getTopPriorityFiles(
        request.params.topN ?? 5,
      );
      if (top.files.length === 0) {
        throw new Error(
          'No code provided and no collected files found. Run collect_code first.',
        );
      }
      code = top.files
        .map(file => `// ${file.url}\n${file.content}`)
        .join('\n\n');
    }

    const [understand, crypto] = await Promise.all([
      runtime.analyzer.understand({code, focus: 'security'}),
      runtime.cryptoDetector.detect({code}),
    ]);

    const securityRisks = Array.isArray(understand.securityRisks)
      ? understand.securityRisks
      : [];
    const highSeverityCount = securityRisks.filter(
      risk => risk.severity === 'critical' || risk.severity === 'high',
    ).length;
    const cryptoResult = crypto as {
      securityIssues?: unknown[];
      algorithms?: Array<{name?: string}>;
    };
    const cryptoIssues = Array.isArray(cryptoResult.securityIssues)
      ? cryptoResult.securityIssues
      : [];
    const algorithms = Array.isArray(cryptoResult.algorithms)
      ? cryptoResult.algorithms
      : [];
    const dangerousAlgorithms = algorithms.filter(algo =>
      ['md5', 'sha1', 'rc4', 'des'].includes(
        String(algo.name ?? '').toLowerCase(),
      ),
    );

    let hookSignalCount = 0;
    if (request.params.includeHookSignals !== false) {
      if (request.params.hookId) {
        hookSignalCount = runtime.hookManager.getRecords(
          request.params.hookId,
        ).length;
      } else {
        hookSignalCount = runtime.hookManager
          .getAllKnownHookIds()
          .reduce(
            (sum, hookId) =>
              sum + runtime.hookManager.getRecords(hookId).length,
            0,
          );
      }
    }

    const rawScore =
      highSeverityCount * 20 +
      cryptoIssues.length * 15 +
      dangerousAlgorithms.length * 10 +
      Math.min(hookSignalCount, 10) * 2;
    const score = Math.max(0, Math.min(100, rawScore));
    const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

    const result = {
      score,
      level,
      factors: {
        securityRisks: securityRisks.length,
        highSeverityRisks: highSeverityCount,
        cryptoAlgorithms: algorithms.length,
        cryptoIssues: cryptoIssues.length,
        dangerousAlgorithms: dangerousAlgorithms.map(
          algo => algo.name ?? 'unknown',
        ),
        hookSignals: hookSignalCount,
      },
      recommendations: [
        highSeverityCount > 0
          ? 'Prioritize high-severity security findings first.'
          : null,
        dangerousAlgorithms.length > 0
          ? 'Replace weak crypto algorithms (MD5/SHA1/RC4/DES).'
          : null,
        hookSignalCount > 0
          ? 'Review hook records to confirm if suspicious paths are expected.'
          : null,
      ].filter((item): item is string => Boolean(item)),
    };

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(withAIRuntime(result), null, 2));
    response.appendResponseLine('```');
  },
});

export const exportSessionReport = defineTool({
  name: 'export_session_report',
  description:
    'Export current reverse-engineering session as JSON or Markdown.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    format: zod.enum(['json', 'markdown']).default('json'),
    includeHookData: zod.boolean().optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const summaries = runtime.collector.getCollectedFilesSummary();
    const collectorStats = await runtime.collector.getAllStats();
    const hookStats = runtime.hookManager.getStats();
    const totalHookRecords = runtime.hookManager
      .getAllKnownHookIds()
      .reduce(
        (sum, hookId) => sum + runtime.hookManager.getRecords(hookId).length,
        0,
      );
    const tokenStats = TokenBudgetManager.getInstance().getStats();

    const report = {
      generatedAt: new Date().toISOString(),
      collector: {
        totalFiles: summaries.length,
        totalBytes: summaries.reduce((sum, file) => sum + file.size, 0),
        cacheStats: collectorStats,
      },
      hooks: {
        ...hookStats,
        totalRecords: totalHookRecords,
      },
      tokenBudget: {
        usedTokens: tokenStats.currentUsage,
        maxTokens: tokenStats.maxTokens,
        usagePercent: tokenStats.usagePercentage,
      },
      hookData: request.params.includeHookData
        ? runtime.hookManager.exportData('json')
        : undefined,
    };

    if (request.params.format === 'markdown') {
      const markdown = toMarkdownReport(report);
      response.appendResponseLine(markdown);
      return;
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(report, null, 2));
    response.appendResponseLine('```');
  },
});
