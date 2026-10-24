/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {mkdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

import type {ReverseStage} from '../modules/workflows/types.js';

import type {ReverseTaskStore} from './ReverseTaskStore.js';

export interface StartReverseTaskInput {
  taskId: string;
  taskSlug: string;
  targetUrl: string;
  goal: string;
  currentStage?: ReverseStage;
  currentSummary?: string;
  successCriteria?: {
    localRebuild?: 'pass' | 'partial' | 'unknown';
    serverAcceptance?: 'pass' | 'partial' | 'unknown';
    browserAlignment?: 'pass' | 'partial' | 'unknown';
    notes?: string;
  };
  targetContext?: {
    pageUrl?: string;
    triggerAction?: string;
    candidateScripts?: string[];
    targetRequest?: {
      method?: string;
      url?: string;
      notes?: string;
    };
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileIfMissing(
  targetPath: string,
  contents: string,
): Promise<void> {
  if (await pathExists(targetPath)) {
    return;
  }
  await mkdir(path.dirname(targetPath), {recursive: true});
  await writeFile(targetPath, contents, 'utf8');
}

function buildInitialReport(input: StartReverseTaskInput): string {
  const stage = input.currentStage ?? 'Observe';
  const targetRequest = input.targetContext?.targetRequest;
  const candidateScripts = input.targetContext?.candidateScripts ?? [];
  return [
    '# Reverse Task Report',
    '',
    '## Current Stage',
    `- stage: \`${stage}\``,
    '- status: `active`',
    '',
    '## Goal',
    `- ${input.goal}`,
    '',
    '## Confirmed',
    `- ${input.currentSummary ?? '已初始化任务，等待补充目标请求、脚本和运行时证据'}`,
    '',
    '## Unconfirmed',
    '- 目标请求、候选脚本、关键函数和最小触发动作仍可继续补充',
    '',
    '## Target Request',
    `- method: \`${targetRequest?.method ?? 'GET|POST'}\``,
    `- url: \`${targetRequest?.url ?? input.targetUrl}\``,
    `- request shape: \`${targetRequest?.notes ?? '待补充'}\``,
    '',
    '## Target Context',
    `- page: \`${input.targetContext?.pageUrl ?? '待补充'}\``,
    `- trigger action: \`${input.targetContext?.triggerAction ?? '待补充'}\``,
    `- initiator hint: \`${candidateScripts.join(', ') || '待补充'}\``,
    '',
    '## Runtime Evidence Summary',
    '- 当前尚未初始化运行时证据，下一步可进入 Observe / Capture。',
    '',
    '## Local Rebuild Status',
    '- entry: `env/entry.js`',
    '- env patch: `env/env.js`',
    '- polyfills: `env/polyfills.js`',
    '- capture: `env/capture.json`',
    '- current result: `未开始`',
    '',
    '## First Divergence',
    '- `N/A`',
    '',
    '## Browser Alignment',
    '- sample source: `N/A`',
    '- aligned fields: `N/A`',
    '- status: `unknown`',
    '- notes: `当前还没有浏览器真值样本`',
    '',
    '## Acceptance',
    `- local rebuild: \`${input.successCriteria?.localRebuild ?? 'unknown'}\``,
    `- server acceptance: \`${input.successCriteria?.serverAcceptance ?? 'unknown'}\``,
    `- browser alignment: \`${input.successCriteria?.browserAlignment ?? 'unknown'}\``,
    '',
    '## Next Step',
    '- 使用 `recommend_next_step` 或先补第一批 Observe 证据',
    '',
  ].join('\n');
}

export async function startReverseTask(
  store: ReverseTaskStore,
  input: StartReverseTaskInput,
): Promise<{
  taskId: string;
  taskDir: string;
  taskFile: string;
  stateFile: string;
  reportFile: string;
}> {
  const task = await store.openTask({
    taskId: input.taskId,
    slug: input.taskSlug,
    targetUrl: input.targetUrl,
    goal: input.goal,
    currentStage: input.currentStage ?? 'Observe',
    currentSummary:
      input.currentSummary ?? '任务已初始化，等待补第一批 Observe 证据。',
    successCriteria: input.successCriteria ?? {
      localRebuild: 'unknown',
      serverAcceptance: 'unknown',
      browserAlignment: 'unknown',
      notes: '初始化阶段',
    },
    targetContext: input.targetContext ?? {},
  });

  const state = {
    taskId: input.taskId,
    currentStage: input.currentStage ?? 'Observe',
    status: 'active',
    nextStepHint: 'recommend_next_step',
    successCriteria: input.successCriteria ?? {
      localRebuild: 'unknown',
      serverAcceptance: 'unknown',
      browserAlignment: 'unknown',
      notes: '初始化阶段',
    },
    updatedAt: Date.now(),
  };

  await task.writeSnapshot('state.json', state);
  await task.writeSnapshot('target-context.json', input.targetContext ?? {});
  await writeFileIfMissing(
    path.join(task.taskDir, 'report.md'),
    `${buildInitialReport(input)}\n`,
  );
  await task.appendTimeline({
    stage: String(input.currentStage ?? 'Observe').toLowerCase(),
    action: 'start_reverse_task',
    status: 'ok',
    result: 'initialized task artifacts',
    next: 'fill Observe evidence or call recommend_next_step',
  });

  return {
    taskId: task.taskId,
    taskDir: task.taskDir,
    taskFile: path.join(task.taskDir, 'task.json'),
    stateFile: path.join(task.taskDir, 'state.json'),
    reportFile: path.join(task.taskDir, 'report.md'),
  };
}
