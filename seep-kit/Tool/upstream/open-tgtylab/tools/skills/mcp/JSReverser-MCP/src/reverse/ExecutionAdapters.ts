/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {diffEnvRequirements, exportRebuildBundle} from '../tools/rebuild.js';

import {autoProgressReverseTask} from './ReverseTaskAutoProgress.js';
import type {
  ReverseTaskExecutableStep,
  ReverseTaskExecutionOverride,
} from './ReverseTaskExecutor.js';
import {getReverseTaskState} from './ReverseTaskQuery.js';
import {updateReverseTaskState} from './ReverseTaskState.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';
import {summarizeReverseTask} from './ReverseTaskSummary.js';
import {appendReverseTimeline} from './ReverseTaskTimeline.js';

export interface ExecutionAdapterContext {
  store: ReverseTaskStore;
  taskId: string;
  currentStage: string;
  step: ReverseTaskExecutableStep;
  override?: ReverseTaskExecutionOverride;
}

export interface ExecutionAdapterResult {
  result?: string;
  nextStage?: string;
}

export type ExecutionAdapter = (
  context: ExecutionAdapterContext,
) => Promise<ExecutionAdapterResult>;

function makeToolResponse(): {
  lines: string[];
  appendResponseLine(value: string): void;
} {
  const lines: string[] = [];
  return {
    lines,
    appendResponseLine(value: string) {
      lines.push(value);
    },
  };
}

function extractToolJson(lines: string[]): Record<string, unknown> | undefined {
  const start = lines.indexOf('```json');
  const end = lines.indexOf('```', start + 1);
  if (start < 0 || end < 0) {
    return undefined;
  }
  return JSON.parse(lines.slice(start + 1, end).join('\n')) as Record<
    string,
    unknown
  >;
}

async function readTaskDescriptor(
  store: ReverseTaskStore,
  taskId: string,
): Promise<Record<string, unknown>> {
  return (
    (await store.readSnapshot<Record<string, unknown>>(taskId, 'task.json')) ??
    {}
  );
}

async function inferRuntimeError(
  store: ReverseTaskStore,
  taskId: string,
): Promise<string> {
  const [state, timeline] = await Promise.all([
    store.readSnapshot<Record<string, unknown>>(taskId, 'state.json'),
    store.readLog('timeline', taskId),
  ]);
  const lastError = [...timeline]
    .reverse()
    .find(entry => String(entry.status ?? '') === 'error');
  if (
    typeof lastError?.result === 'string' &&
    lastError.result.trim().length > 0
  ) {
    return lastError.result;
  }
  if (
    typeof state?.currentSummary === 'string' &&
    state.currentSummary.trim().length > 0
  ) {
    return state.currentSummary;
  }
  return 'ReferenceError: window is not defined';
}

async function syncTaskState(
  store: ReverseTaskStore,
  taskId: string,
  currentStage: string,
  status: 'active' | 'partial',
  currentSummary: string,
): Promise<void> {
  await updateReverseTaskState(store, {
    taskId,
    currentStage,
    status,
    currentSummary,
    nextStepHint: 'manage_reverse_task:summarize',
  });
}

const manageReverseTaskAdapter: ExecutionAdapter = async ({
  store,
  taskId,
  currentStage,
  step,
}) => {
  const action = String(step.params.action ?? 'get');
  if (action === 'progress') {
    const progressed = await autoProgressReverseTask(store, taskId);
    return {
      result: `progressed to ${progressed.currentStage}`,
      nextStage: progressed.currentStage,
    };
  }
  if (action === 'get') {
    await getReverseTaskState(store, taskId);
    return {result: 'refreshed task snapshot'};
  }
  if (action === 'summarize') {
    await summarizeReverseTask(store, taskId);
    return {result: 'summarized task snapshot'};
  }
  if (action === 'timeline') {
    await appendReverseTimeline(store, {
      taskId,
      taskSlug:
        typeof step.params.taskSlug === 'string'
          ? step.params.taskSlug
          : undefined,
      targetUrl:
        typeof step.params.targetUrl === 'string'
          ? step.params.targetUrl
          : undefined,
      goal: typeof step.params.goal === 'string' ? step.params.goal : undefined,
      stage: String(step.params.stage ?? currentStage.toLowerCase()),
      action: String(step.params.timelineAction ?? 'orchestrator'),
      status: String(step.params.timelineStatus ?? 'ok'),
      result:
        typeof step.params.result === 'string'
          ? step.params.result
          : 'orchestrated timeline sync',
      next:
        typeof step.params.next === 'string'
          ? step.params.next
          : 'manage_reverse_task:summarize',
    });
    return {result: 'timeline synced'};
  }
  throw new Error(`Unsupported manage_reverse_task action: ${action}`);
};

const overrideAdapter: ExecutionAdapter = async ({
  store,
  taskId,
  currentStage,
  step,
  override,
}) => {
  await appendReverseTimeline(store, {
    taskId,
    stage: currentStage.toLowerCase(),
    action: step.tool,
    status: 'ok',
    result: override?.result ?? `${step.tool} executed by orchestrator`,
    next: 'manage_reverse_task:summarize',
  });
  await syncTaskState(
    store,
    taskId,
    currentStage,
    'active',
    `自动编排已执行 ${step.tool}`,
  );
  return {result: override?.result ?? `${step.tool} executed by orchestrator`};
};

const exportRebuildBundleAdapter: ExecutionAdapter = async ({
  store,
  taskId,
  currentStage,
}) => {
  const task = await readTaskDescriptor(store, taskId);
  const response = makeToolResponse();
  await exportRebuildBundle.handler(
    {
      params: {
        taskId,
        taskSlug: String(task.slug ?? taskId),
        targetUrl: String(task.targetUrl ?? ''),
        goal: String(task.goal ?? ''),
        entryCode: `import "./env.js";\nimport "./polyfills.js";\nconsole.log("orchestrated rebuild entry");`,
        envCode: `globalThis.window = globalThis;\nglobalThis.document ??= {cookie: "", location: {href: ""}};\nglobalThis.navigator ??= {userAgent: "JSReverser-MCP"};`,
        polyfillsCode: '',
        capture: {
          taskId,
          source: 'orchestrator',
          page: {url: String(task.targetUrl ?? '')},
        },
        notes: ['generated by orchestrator execution path'],
      },
    } as Parameters<typeof exportRebuildBundle.handler>[0],
    response as unknown as Parameters<typeof exportRebuildBundle.handler>[1],
    {} as Parameters<typeof exportRebuildBundle.handler>[2],
  );
  const payload = extractToolJson(response.lines);
  await appendReverseTimeline(store, {
    taskId,
    stage: currentStage.toLowerCase(),
    action: 'export_rebuild_bundle',
    status: 'ok',
    result: `generated ${Array.isArray(payload?.files) ? payload.files.length : 0} rebuild artifacts`,
    next: 'manage_reverse_task:summarize',
  });
  await syncTaskState(
    store,
    taskId,
    currentStage,
    'active',
    '自动编排已导出本地 rebuild bundle',
  );
  return {result: 'rebuild bundle exported'};
};

const diffEnvRequirementsAdapter: ExecutionAdapter = async ({
  store,
  taskId,
  currentStage,
}) => {
  const runtimeError = await inferRuntimeError(store, taskId);
  const response = makeToolResponse();
  await diffEnvRequirements.handler(
    {
      params: {
        runtimeError,
        observedCapabilities: [
          'window',
          'document',
          'navigator',
          'localStorage',
          'sessionStorage',
          'crypto',
        ],
      },
    } as Parameters<typeof diffEnvRequirements.handler>[0],
    response as unknown as Parameters<typeof diffEnvRequirements.handler>[1],
    {} as Parameters<typeof diffEnvRequirements.handler>[2],
  );
  const payload = extractToolJson(response.lines);
  const missingCapabilities = Array.isArray(payload?.missingCapabilities)
    ? payload.missingCapabilities.map(item => String(item)).join(', ')
    : 'unknown';
  await appendReverseTimeline(store, {
    taskId,
    stage: currentStage.toLowerCase(),
    action: 'diff_env_requirements',
    status: 'ok',
    result: `missing capabilities: ${missingCapabilities}`,
    next: 'manage_reverse_task:summarize',
  });
  await syncTaskState(
    store,
    taskId,
    currentStage,
    'partial',
    `自动编排已分析补环境缺口：${missingCapabilities}`,
  );
  return {result: `missing capabilities: ${missingCapabilities}`};
};

const adapterRegistry: Record<string, ExecutionAdapter> = {
  manage_reverse_task: manageReverseTaskAdapter,
  export_rebuild_bundle: exportRebuildBundleAdapter,
  diff_env_requirements: diffEnvRequirementsAdapter,
};

export async function executeRegisteredStep(
  context: ExecutionAdapterContext,
): Promise<ExecutionAdapterResult> {
  if (context.override?.status === 'ok') {
    return overrideAdapter(context);
  }
  if (context.override?.status === 'error') {
    throw new Error(
      context.override.error ?? `Override for ${context.step.tool} failed`,
    );
  }

  const adapter = adapterRegistry[context.step.tool];
  if (!adapter) {
    throw new Error(
      `Automatic execution for tool "${context.step.tool}" is not implemented yet`,
    );
  }
  return adapter(context);
}
