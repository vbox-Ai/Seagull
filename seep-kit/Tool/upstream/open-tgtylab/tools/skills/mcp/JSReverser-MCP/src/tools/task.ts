/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {startReverseTask} from '../reverse/ReverseTaskBootstrap.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool} from './ToolDefinition.js';

export const startReverseTaskTool = defineTool({
  name: 'start_reverse_task',
  description:
    'Initialize a task artifact directory with task.json, state.json, report.md, and first timeline entry.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    taskId: zod.string().min(1),
    taskSlug: zod.string().min(1),
    targetUrl: zod.string().min(1),
    goal: zod.string().min(1),
    currentStage: zod
      .enum([
        'Observe',
        'Capture',
        'Rebuild',
        'Patch',
        'DeepDive',
        'PureExtraction',
        'Port',
      ])
      .optional(),
    currentSummary: zod.string().optional(),
    successCriteria: zod
      .object({
        localRebuild: zod.enum(['pass', 'partial', 'unknown']).optional(),
        serverAcceptance: zod.enum(['pass', 'partial', 'unknown']).optional(),
        browserAlignment: zod.enum(['pass', 'partial', 'unknown']).optional(),
        notes: zod.string().optional(),
      })
      .optional(),
    targetContext: zod
      .object({
        pageUrl: zod.string().optional(),
        triggerAction: zod.string().optional(),
        candidateScripts: zod.array(zod.string()).optional(),
        targetRequest: zod
          .object({
            method: zod.string().optional(),
            url: zod.string().optional(),
            notes: zod.string().optional(),
          })
          .optional(),
      })
      .optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const result = await startReverseTask(
      runtime.reverseTaskStore,
      request.params,
    );
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ok: true,
          ...result,
          nextRecommendedTools: [
            'manage_reverse_task',
            'recommend_next_step',
            'check_browser_health',
            'record_reverse_evidence',
          ],
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

function slugifyRequestTarget(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/[^a-zA-Z0-9]+/g, '-');
    const pathname = parsed.pathname
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return [host, pathname].filter(Boolean).join('-') || 'reverse-task';
  } catch {
    return 'reverse-task';
  }
}

function buildTaskId(reqid: number, url: string): string {
  const slug = slugifyRequestTarget(url).slice(0, 40) || 'reverse-task';
  return `${slug}-req-${reqid}`;
}

function buildGoal(method: string, url: string): string {
  return `从 ${method.toUpperCase()} ${url} 建立 reverse task`;
}

export const createReverseTaskFromRequestTool = defineTool({
  name: 'create_reverse_task_from_request',
  description:
    'Create a reverse task directly from one captured network request.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    requestId: zod.number().int().positive(),
    targetPageIdx: zod.number().int().min(0).optional(),
    taskId: zod.string().min(1).optional(),
    taskSlug: zod.string().min(1).optional(),
    goal: zod.string().min(1).optional(),
  },
  handler: async (request, response, context) => {
    const runtime = getJSHookRuntime();
    const httpRequest = context.getNetworkRequestById(
      request.params.requestId,
      request.params.targetPageIdx,
    );
    const initiator = context.getRequestInitiator(httpRequest);
    const url = httpRequest.url();
    const method = httpRequest.method();
    const headers = httpRequest.headers();
    const headerKeys = Object.keys(headers).slice(0, 8);
    const candidateScripts = [
      ...(initiator?.url ? [initiator.url] : []),
      ...(initiator?.stack?.callFrames ?? [])
        .map(frame => (typeof frame.url === 'string' ? frame.url : ''))
        .filter(value => value.length > 0),
    ]
      .filter((value, index, items) => items.indexOf(value) === index)
      .slice(0, 5);

    const taskId =
      request.params.taskId ?? buildTaskId(request.params.requestId, url);
    const taskSlug = request.params.taskSlug ?? slugifyRequestTarget(url);
    const goal = request.params.goal ?? buildGoal(method, url);
    const pageUrl = httpRequest.frame()?.url();
    const postData = httpRequest.postData();

    const result = await startReverseTask(runtime.reverseTaskStore, {
      taskId,
      taskSlug,
      targetUrl: url,
      goal,
      currentSummary: `已从 request ${request.params.requestId} 初始化任务，待补 initiator、脚本和运行时证据。`,
      targetContext: {
        ...(pageUrl ? {pageUrl} : {}),
        triggerAction: `network_request:get:${request.params.requestId}`,
        candidateScripts,
        targetRequest: {
          method,
          url,
          notes: [
            `resourceType=${httpRequest.resourceType()}`,
            headerKeys.length > 0
              ? `headers=${headerKeys.join(',')}`
              : undefined,
            postData ? `postDataLength=${postData.length}` : undefined,
          ]
            .filter((item): item is string => Boolean(item))
            .join(' | '),
        },
      },
    });

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ok: true,
          ...result,
          requestId: request.params.requestId,
          targetRequest: {
            method,
            url,
          },
          candidateScripts,
          nextRecommendedTools: [
            'manage_reverse_task',
            'get_request_initiator',
            'record_reverse_evidence',
            'orchestrate_reverse_task',
          ],
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});
