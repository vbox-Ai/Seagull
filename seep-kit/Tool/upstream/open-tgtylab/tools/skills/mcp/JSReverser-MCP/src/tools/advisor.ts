/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {recommendNextStep} from '../modules/workflows/NextStepAdvisor.js';
import {getReverseStageGuide} from '../modules/workflows/ReverseStageGuide.js';
import {zod} from '../third_party/index.js';
import type {ReverseTaskState} from '../types/index.js';

import {ToolCategory} from './categories.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool} from './ToolDefinition.js';

interface RecommendNextStepParams {
  taskId?: string;
  browserHealthy?: boolean;
  pageReady?: boolean;
  taskGoal?: string;
  currentStage?:
    | 'Observe'
    | 'Capture'
    | 'Rebuild'
    | 'Patch'
    | 'DeepDive'
    | 'PureExtraction'
    | 'Port';
  taskStatus?: string;
  hasTargetRequest?: boolean;
  hookRecordCount?: number;
  hasRebuildBundle?: boolean;
  hasPassingRebuild?: boolean;
  firstDivergenceKnown?: boolean;
}

async function buildTaskAwareAdvice(params: RecommendNextStepParams) {
  if (!params.taskId) {
    return recommendNextStep(params);
  }

  const runtime = getJSHookRuntime();
  const [taskState, taskDescriptor, runtimeEvidence] = await Promise.all([
    runtime.reverseTaskStore.readSnapshot<ReverseTaskState>(
      params.taskId,
      'state.json',
    ),
    runtime.reverseTaskStore.readSnapshot<Record<string, unknown>>(
      params.taskId,
      'task.json',
    ),
    runtime.reverseTaskStore.readLog('runtime-evidence', params.taskId),
  ]);

  const hasTargetRequest =
    params.hasTargetRequest ??
    (Boolean(
      (taskDescriptor?.targetContext as Record<string, unknown> | undefined)
        ?.targetRequest,
    ) ||
      [
        'Capture',
        'Rebuild',
        'Patch',
        'DeepDive',
        'PureExtraction',
        'Port',
      ].includes(
        String(taskState?.currentStage ?? taskDescriptor?.currentStage ?? ''),
      ) ||
      runtimeEvidence.some(entry => Boolean(entry.request)));
  const hookRecordCount =
    params.hookRecordCount ??
    runtimeEvidence.filter(
      entry => entry.kind === 'hook-hit' || entry.source === 'hook',
    ).length;
  const successCriteria = (taskState?.successCriteria ??
    taskDescriptor?.successCriteria ??
    {}) as Record<string, unknown>;
  const hasRebuildBundle =
    params.hasRebuildBundle ??
    (['Rebuild', 'Patch', 'PureExtraction', 'Port'].includes(
      String(taskState?.currentStage ?? taskDescriptor?.currentStage ?? ''),
    ) ||
      ['pass', 'partial'].includes(String(successCriteria.localRebuild ?? '')));
  const localRebuild = successCriteria.localRebuild;
  const currentStage =
    params.currentStage ??
    taskState?.currentStage ??
    String(taskDescriptor?.currentStage ?? 'Observe');
  const advice = recommendNextStep({
    ...params,
    currentStage,
    taskStatus: params.taskStatus ?? taskState?.status,
    taskGoal: params.taskGoal ?? String(taskDescriptor?.goal ?? ''),
    hasTargetRequest,
    hookRecordCount,
    hasRebuildBundle,
    hasPassingRebuild: params.hasPassingRebuild ?? localRebuild === 'pass',
  });

  return {
    ...advice,
    taskContext: {
      taskId: params.taskId,
      currentStage,
      taskStatus: taskState?.status ?? 'active',
      hookRecordCount,
      hasTargetRequest,
      hasRebuildBundle,
    },
  };
}

export const recommendNextStepTool = defineTool({
  name: 'recommend_next_step',
  description:
    'Recommend the next reverse-engineering action from lightweight workflow signals.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    taskId: zod.string().optional(),
    browserHealthy: zod.boolean().optional(),
    pageReady: zod.boolean().optional(),
    taskGoal: zod.string().optional(),
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
    taskStatus: zod.string().optional(),
    hasTargetRequest: zod.boolean().optional(),
    hookRecordCount: zod.number().int().nonnegative().optional(),
    hasRebuildBundle: zod.boolean().optional(),
    hasPassingRebuild: zod.boolean().optional(),
    firstDivergenceKnown: zod.boolean().optional(),
  },
  handler: async (request, response) => {
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(await buildTaskAwareAdvice(request.params), null, 2),
    );
    response.appendResponseLine('```');
  },
});

export const explainReverseStage = defineTool({
  name: 'explain_reverse_stage',
  description:
    'Explain a reverse-engineering stage with goals, entry criteria, avoid list, and recommended tools.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    stage: zod.enum([
      'Observe',
      'Capture',
      'Rebuild',
      'Patch',
      'DeepDive',
      'PureExtraction',
      'Port',
    ]),
    includeDocs: zod.boolean().optional(),
  },
  handler: async (request, response) => {
    const guide = getReverseStageGuide(request.params.stage);
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          ...guide,
          ...(request.params.includeDocs === false ? {docRefs: undefined} : {}),
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});
