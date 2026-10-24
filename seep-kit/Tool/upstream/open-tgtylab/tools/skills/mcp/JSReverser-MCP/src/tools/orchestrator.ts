/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {buildOrchestrationAgentHints} from '../reverse/ReverseTaskAgentProtocol.js';
import {orchestrateReverseTask} from '../reverse/ReverseTaskOrchestrator.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  buildOrchestrationContinuation,
  compactAgentPayload,
  withSchemaVersion,
} from './response-builder.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool} from './ToolDefinition.js';

export const orchestrateReverseTaskTool = defineTool({
  name: 'orchestrate_reverse_task',
  description:
    'High-level reverse-task orchestrator that syncs task state, picks the primary next step, and returns a compact execution plan.',
  annotations: {
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    taskId: zod.string().min(1),
    persistState: zod.boolean().optional(),
    includeSummary: zod.boolean().optional(),
    execute: zod.boolean().optional(),
    resume: zod.boolean().optional(),
    stopOnError: zod.boolean().optional(),
    strategy: zod
      .enum([
        'observe-first',
        'rebuild-first',
        'env-fix',
        'artifact-sync',
        'evidence-only',
      ])
      .optional(),
    outputMode: zod.enum(['compact', 'verbose']).optional(),
    skipSteps: zod.array(zod.string()).optional(),
    fromStep: zod.string().optional(),
    onlySteps: zod.array(zod.string()).optional(),
    executionOverrides: zod
      .record(
        zod.string(),
        zod.object({
          status: zod.enum(['ok', 'error']),
          result: zod.string().optional(),
          error: zod.string().optional(),
        }),
      )
      .optional(),
  },
  handler: async (request, response) => {
    const runtime = getJSHookRuntime();
    const result = await orchestrateReverseTask(
      runtime.reverseTaskStore,
      request.params.taskId,
      {
        persistState: request.params.persistState,
        includeSummary: request.params.includeSummary,
        execute: request.params.execute,
        resume: request.params.resume,
        stopOnError: request.params.stopOnError,
        strategy: request.params.strategy,
        outputMode: request.params.outputMode,
        skipSteps: request.params.skipSteps,
        fromStep: request.params.fromStep,
        onlySteps: request.params.onlySteps,
        executionOverrides: request.params.executionOverrides,
      },
    );
    response.appendResponseLine('```json');
    const agentGuidance = buildOrchestrationAgentHints({
      taskId: result.taskId,
      primaryStep: result.orchestration.primaryStep,
      execution: result.execution,
      confidence: result.advice.confidence,
    });
    response.appendResponseLine(
      JSON.stringify(
        withSchemaVersion(
          compactAgentPayload(
            {
              ok: true,
              responseSummary:
                request.params.outputMode === 'compact'
                  ? `已生成任务 ${result.taskId} 的 compact orchestration plan。`
                  : `已生成任务 ${result.taskId} 的 orchestration plan。`,
              diagnostics: {
                responseStatus: 'ok',
                outputMode: result.outputMode,
                taskId: result.taskId,
                hasFallbackPlan: Boolean(result.fallbackPlan),
                executed: Boolean(result.execution?.executed),
              },
              ...buildOrchestrationContinuation({
                fallbackPlan: result.fallbackPlan,
                failedStep: result.execution?.failedStep,
                shouldResume: Boolean(result.execution?.recovery?.shouldResume),
                agentGuidance,
              }),
              ...result,
              agentGuidance,
            },
            result.outputMode,
          ),
        ),
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});
