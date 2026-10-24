/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {buildLocalCliCommand} from '../utils/projectPaths.js';

import {executeRegisteredStep} from './ExecutionAdapters.js';
import type {
  ReverseTaskExecutionCheckpoint,
  ReverseTaskExecutionStepResult,
  ReverseTaskFailureType,
} from './ReverseTaskCheckpoint.js';
import {
  readReverseTaskCheckpoint,
  writeReverseTaskCheckpoint,
} from './ReverseTaskCheckpoint.js';
import {updateReverseTaskState} from './ReverseTaskState.js';
import type {ReverseTaskStore} from './ReverseTaskStore.js';
import {appendReverseTimeline} from './ReverseTaskTimeline.js';

export interface ReverseTaskExecutableStep {
  key: string;
  tool: string;
  reason: string;
  params: Record<string, unknown>;
}

export interface ReverseTaskExecutionOverride {
  status: 'ok' | 'error';
  result?: string;
  error?: string;
}

export interface ReverseTaskExecutionResult {
  executed: boolean;
  resumed: boolean;
  completedStepCount: number;
  failedStepCount: number;
  skippedStepCount: number;
  failedStep?: {
    key: string;
    tool: string;
    status: string;
    error?: string;
    failureType?: ReverseTaskFailureType;
    retryable?: boolean;
  };
  recovery?: {
    recommendedNextAction: string;
    recommendedCommand?: string;
    shouldResume: boolean;
    shouldInspectSummary: boolean;
  };
  checkpoint: ReverseTaskExecutionCheckpoint;
  stepResults: ReverseTaskExecutionStepResult[];
}

function toStepError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyFailure(errorMessage: string): {
  failureType: ReverseTaskFailureType;
  retryable: boolean;
} {
  const normalized = errorMessage.toLowerCase();
  if (
    normalized.includes('timed out') ||
    normalized.includes('fetch failed') ||
    normalized.includes('browser failed')
  ) {
    return {failureType: 'external_error', retryable: true};
  }
  if (normalized.includes('not implemented')) {
    return {failureType: 'tool_error', retryable: true};
  }
  if (normalized.includes('invalid') || normalized.includes('required')) {
    return {failureType: 'validation_error', retryable: false};
  }
  if (
    normalized.includes('window is not defined') ||
    normalized.includes('localstorage is not defined') ||
    normalized.includes('subtle')
  ) {
    return {failureType: 'env_error', retryable: true};
  }
  return {failureType: 'unknown', retryable: false};
}

function buildRecoverySuggestion(args: {
  taskId: string;
  failureType: ReverseTaskFailureType;
  retryable: boolean;
  failedStepTool: string;
}): ReverseTaskExecutionResult['recovery'] {
  const {taskId, failureType, retryable, failedStepTool} = args;
  const resumeCommand = buildLocalCliCommand(import.meta.url, [
    '--orchestrateReverseTask',
    taskId,
    '--execute',
    '--resume',
  ]);
  const summarizeCommand = buildLocalCliCommand(import.meta.url, [
    '--manageReverseTask',
    'summarize',
    '--taskId',
    taskId,
  ]);

  if (failureType === 'tool_error') {
    return {
      recommendedNextAction: `检查 ${failedStepTool} 是否已实现；如处于过渡期，可先用 executionOverrides 占位后再 resume。`,
      recommendedCommand: retryable ? resumeCommand : undefined,
      shouldResume: retryable,
      shouldInspectSummary: false,
    };
  }

  if (failureType === 'env_error') {
    return {
      recommendedNextAction: '先补齐缺失环境能力，再从 checkpoint 继续执行。',
      recommendedCommand: summarizeCommand,
      shouldResume: retryable,
      shouldInspectSummary: true,
    };
  }

  if (failureType === 'validation_error') {
    return {
      recommendedNextAction:
        '先修正当前步骤的输入参数或任务上下文，再重新执行 orchestration。',
      shouldResume: false,
      shouldInspectSummary: false,
    };
  }

  if (failureType === 'external_error') {
    return {
      recommendedNextAction:
        '先恢复浏览器、网络或外部依赖链路，再从 checkpoint 重试。',
      recommendedCommand: retryable ? resumeCommand : undefined,
      shouldResume: retryable,
      shouldInspectSummary: false,
    };
  }

  return {
    recommendedNextAction:
      '先查看任务摘要和 checkpoint，确认失败上下文后再决定是否继续。',
    recommendedCommand: summarizeCommand,
    shouldResume: false,
    shouldInspectSummary: true,
  };
}

async function saveCheckpoint(
  store: ReverseTaskStore,
  taskId: string,
  status: ReverseTaskExecutionCheckpoint['status'],
  currentStepKey: string | undefined,
  completedSteps: string[],
  pendingSteps: string[],
  stepResults: ReverseTaskExecutionStepResult[],
  plannedSteps: ReverseTaskExecutableStep[],
  failedStepKey?: string,
  failureType?: ReverseTaskFailureType,
  retryable?: boolean,
): Promise<ReverseTaskExecutionCheckpoint> {
  return writeReverseTaskCheckpoint(store, taskId, {
    taskId,
    status,
    ...(currentStepKey ? {currentStepKey} : {}),
    completedSteps: [...completedSteps],
    pendingSteps: [...pendingSteps],
    ...(failedStepKey ? {failedStepKey} : {}),
    ...(failureType ? {failureType} : {}),
    ...(retryable !== undefined ? {retryable} : {}),
    stepResults: [...stepResults],
    plannedSteps: [...plannedSteps],
    updatedAt: Date.now(),
  });
}

export async function executeReverseTaskPlan(
  store: ReverseTaskStore,
  taskId: string,
  steps: ReverseTaskExecutableStep[],
  options: {
    resume?: boolean;
    stopOnError?: boolean;
    currentStage: string;
    executionOverrides?: Record<string, ReverseTaskExecutionOverride>;
  },
): Promise<ReverseTaskExecutionResult> {
  const checkpoint = options.resume
    ? await readReverseTaskCheckpoint(store, taskId)
    : undefined;
  const activeSteps =
    options.resume && checkpoint?.plannedSteps?.length
      ? checkpoint.plannedSteps
      : steps;
  const completedSteps = new Set(checkpoint?.completedSteps ?? []);
  const stepResults: ReverseTaskExecutionStepResult[] = [
    ...(checkpoint?.stepResults ?? []),
  ];
  const stopOnError = options.stopOnError ?? true;
  let currentStage = options.currentStage;
  let failedStep: ReverseTaskExecutionResult['failedStep'];
  let skippedStepCount = 0;

  await saveCheckpoint(
    store,
    taskId,
    'running',
    undefined,
    [...completedSteps],
    activeSteps
      .filter(step => !completedSteps.has(step.key))
      .map(step => step.key),
    stepResults,
    activeSteps,
  );

  for (const step of activeSteps) {
    if (completedSteps.has(step.key)) {
      skippedStepCount += 1;
      continue;
    }

    await saveCheckpoint(
      store,
      taskId,
      'running',
      step.key,
      [...completedSteps],
      activeSteps
        .filter(
          candidate =>
            !completedSteps.has(candidate.key) && candidate.key !== step.key,
        )
        .map(candidate => candidate.key),
      stepResults,
      activeSteps,
    );

    try {
      const executed = await executeRegisteredStep({
        store,
        taskId,
        currentStage,
        step,
        override: options.executionOverrides?.[step.tool],
      });
      if (executed.nextStage) {
        currentStage = executed.nextStage;
      }
      completedSteps.add(step.key);
      stepResults.push({
        key: step.key,
        tool: step.tool,
        status: 'passed',
        ...(executed.result ? {result: executed.result} : {}),
        updatedAt: Date.now(),
      });
    } catch (error) {
      const errorMessage = toStepError(error);
      const failureMeta = classifyFailure(errorMessage);
      const previousFailures = stepResults.filter(
        entry => entry.key === step.key && entry.status === 'failed',
      ).length;
      stepResults.push({
        key: step.key,
        tool: step.tool,
        status: 'failed',
        error: errorMessage,
        failureType: failureMeta.failureType,
        retryable: failureMeta.retryable,
        retryCount: previousFailures + 1,
        lastErrorAt: Date.now(),
        updatedAt: Date.now(),
      });
      await appendReverseTimeline(store, {
        taskId,
        stage: currentStage.toLowerCase(),
        action: step.tool,
        status: 'error',
        result: errorMessage,
        next: step.tool,
      });
      await updateReverseTaskState(store, {
        taskId,
        currentStage,
        status: 'blocked',
        currentSummary: `自动编排执行 ${step.tool} 失败：${errorMessage}`,
        nextStepHint: step.tool,
      });
      failedStep = {
        key: step.key,
        tool: step.tool,
        status: 'failed',
        error: errorMessage,
        failureType: failureMeta.failureType,
        retryable: failureMeta.retryable,
      };
      if (stopOnError) {
        const failedCheckpoint = await saveCheckpoint(
          store,
          taskId,
          'failed',
          step.key,
          [...completedSteps],
          activeSteps
            .filter(candidate => !completedSteps.has(candidate.key))
            .map(candidate => candidate.key),
          stepResults,
          activeSteps,
          step.key,
          failureMeta.failureType,
          failureMeta.retryable,
        );
        return {
          executed: true,
          resumed: options.resume ?? false,
          completedStepCount: completedSteps.size,
          failedStepCount: 1,
          skippedStepCount,
          ...(failedStep ? {failedStep} : {}),
          recovery: buildRecoverySuggestion({
            taskId,
            failureType: failureMeta.failureType,
            retryable: failureMeta.retryable,
            failedStepTool: step.tool,
          }),
          checkpoint: failedCheckpoint,
          stepResults,
        };
      }
    }
  }

  const finalStatus = failedStep ? 'failed' : 'passed';
  const finalCheckpoint = await saveCheckpoint(
    store,
    taskId,
    finalStatus,
    undefined,
    [...completedSteps],
    activeSteps
      .filter(candidate => !completedSteps.has(candidate.key))
      .map(candidate => candidate.key),
    stepResults,
    activeSteps,
    failedStep?.key,
    failedStep?.failureType,
    failedStep?.retryable,
  );

  return {
    executed: true,
    resumed: options.resume ?? false,
    completedStepCount: completedSteps.size,
    failedStepCount: failedStep ? 1 : 0,
    skippedStepCount,
    ...(failedStep ? {failedStep} : {}),
    ...(failedStep
      ? {
          recovery: buildRecoverySuggestion({
            taskId,
            failureType: failedStep.failureType ?? 'unknown',
            retryable: failedStep.retryable ?? false,
            failedStepTool: failedStep.tool,
          }),
        }
      : {}),
    checkpoint: finalCheckpoint,
    stepResults,
  };
}
