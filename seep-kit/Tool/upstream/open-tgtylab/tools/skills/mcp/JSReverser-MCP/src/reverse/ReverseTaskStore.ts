/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  ReverseTaskDescriptor,
  ReverseTaskEvent,
  ReverseTaskHandle,
  ReverseTaskOpenInput,
  ReverseTaskReadApi,
  ReverseTaskStoreOptions,
} from '../types/index.js';
import {resolveDefaultArtifactsTasksDir} from '../utils/projectPaths.js';

function nowTimestamp(): number {
  return Date.now();
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readExistingDescriptor(
  taskFilePath: string,
): Promise<ReverseTaskDescriptor | undefined> {
  if (!(await pathExists(taskFilePath))) {
    return undefined;
  }
  const raw = await readFile(taskFilePath, 'utf8');
  return JSON.parse(raw) as ReverseTaskDescriptor;
}

async function writeJsonFile(
  targetPath: string,
  value: unknown,
): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function containsPlaceholderToken(value: unknown): boolean {
  if (typeof value === 'string') {
    return /^<[^>]+>$/.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(item => containsPlaceholderToken(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(item => containsPlaceholderToken(item));
  }
  return false;
}

async function shouldResetPlaceholderJsonl(
  targetPath: string,
): Promise<boolean> {
  if (!(await pathExists(targetPath))) {
    return false;
  }
  const raw = (await readFile(targetPath, 'utf8')).trim();
  if (raw.length === 0) {
    return false;
  }
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  if (lines.length === 0) {
    return false;
  }
  try {
    return lines.every(line => containsPlaceholderToken(JSON.parse(line)));
  } catch {
    return false;
  }
}

function resolveDefaultTaskRootDir(): string {
  return resolveDefaultArtifactsTasksDir(import.meta.url);
}

export class ReverseTaskStore implements ReverseTaskReadApi {
  readonly rootDir: string;

  constructor(options: ReverseTaskStoreOptions = {}) {
    this.rootDir = options.rootDir ?? resolveDefaultTaskRootDir();
  }

  async openTask(input: ReverseTaskOpenInput): Promise<ReverseTaskHandle> {
    const taskDir = path.join(this.rootDir, input.taskId);
    await mkdir(taskDir, {recursive: true});

    const taskFilePath = path.join(taskDir, 'task.json');
    const existing = await readExistingDescriptor(taskFilePath);
    const descriptor: ReverseTaskDescriptor = existing ?? {
      taskId: input.taskId,
      slug: input.slug,
      targetUrl: input.targetUrl,
      goal: input.goal,
      ...(input.currentStage ? {currentStage: input.currentStage} : {}),
      ...(input.currentSummary ? {currentSummary: input.currentSummary} : {}),
      ...(input.successCriteria
        ? {successCriteria: input.successCriteria}
        : {}),
      ...(input.targetContext ? {targetContext: input.targetContext} : {}),
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    };

    if (existing) {
      descriptor.slug = input.slug;
      descriptor.targetUrl = input.targetUrl;
      descriptor.goal = input.goal;
      if (input.currentStage !== undefined) {
        descriptor.currentStage = input.currentStage;
      }
      if (input.currentSummary !== undefined) {
        descriptor.currentSummary = input.currentSummary;
      }
      if (input.successCriteria !== undefined) {
        descriptor.successCriteria = input.successCriteria;
      }
      if (input.targetContext !== undefined) {
        descriptor.targetContext = input.targetContext;
      }
      descriptor.updatedAt = nowTimestamp();
    }

    await writeJsonFile(taskFilePath, descriptor);

    return {
      taskId: descriptor.taskId,
      taskDir,
      descriptor,
      appendTimeline: async (event: ReverseTaskEvent) => {
        await this.appendJsonLine(path.join(taskDir, 'timeline.jsonl'), {
          timestamp: nowTimestamp(),
          ...event,
        });
        descriptor.updatedAt = nowTimestamp();
        await writeJsonFile(taskFilePath, descriptor);
      },
      appendLog: async (name: string, value: Record<string, unknown>) => {
        await this.appendJsonLine(path.join(taskDir, `${name}.jsonl`), {
          timestamp: nowTimestamp(),
          ...value,
        });
        descriptor.updatedAt = nowTimestamp();
        await writeJsonFile(taskFilePath, descriptor);
      },
      writeSnapshot: async (name: string, value: unknown) => {
        await writeJsonFile(path.join(taskDir, name), value);
        descriptor.updatedAt = nowTimestamp();
        await writeJsonFile(taskFilePath, descriptor);
      },
    };
  }

  getTaskDir(taskId: string): string {
    return path.join(this.rootDir, taskId);
  }

  async readSnapshot<T>(taskId: string, name: string): Promise<T | undefined> {
    const filePath = path.join(this.getTaskDir(taskId), name);
    if (!(await pathExists(filePath))) {
      return undefined;
    }
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  }

  async readLog(
    name: string,
    taskId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const filePath = path.join(this.getTaskDir(taskId), `${name}.jsonl`);
    if (!(await pathExists(filePath))) {
      return [];
    }
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line) as Record<string, unknown>);
  }

  async listTaskIds(): Promise<string[]> {
    if (!(await pathExists(this.rootDir))) {
      return [];
    }
    const entries = await readdir(this.rootDir, {withFileTypes: true});
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  }

  private async appendJsonLine(
    targetPath: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const line = `${JSON.stringify(value)}\n`;
    if (await shouldResetPlaceholderJsonl(targetPath)) {
      await writeFile(targetPath, line, 'utf8');
      return;
    }
    await appendFile(targetPath, line, 'utf8');
  }
}
