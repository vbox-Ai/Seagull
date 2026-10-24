/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import type {
  ParameterWorkflowDocument,
  ParameterWorkflowIndex,
  ParameterWorkflowIndexEntry,
  ParameterWorkflowMetadata,
} from './types.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(MODULE_DIR, '..', '..', '..');
const KNOWLEDGE_ROOT = path.join(
  BUILD_DIR,
  'docs',
  'knowledge',
  'parameter-blueprints',
);

const TEMPLATE_METADATA = {
  id: 'replace-me',
  title: 'Replace Me Blueprint',
  aliases: ['replace-me'],
  keywords: ['replace-me'],
  category: 'header-signature',
  status: 'draft',
  version: '0.1.0',
  lastUpdated: 'YYYY-MM-DD',
  summary: '一句话说明该 blueprint 适用的参数或链路。',
};

const TEMPLATE_PARTS = {
  parameter: 'replace-me',
  parts: [
    {
      index: 1,
      name: 'segment_name',
      role: 'time|digest|env|constant|payload|encoding',
      source: 'runtime|request|header|query|body|cookie|storage|bundle',
      how_to_get: '写清这一段从哪里观察、用什么证据确认。',
      confidence: 'confirmed|inferred',
    },
  ],
};

const TEMPLATE_MUTATIONS = {
  parameter: 'replace-me',
  mutations: [
    {
      id: 'example-mutation',
      applies_to_part: 1,
      kind: 'encoding-variant',
      base_algorithm: 'base64',
      mutation_summary: '写清魔改发生在哪一步。',
      logic: ['先做什么', '再做什么'],
      reproduce_hint: '复现时不要直接套标准库。',
      upgrade_watch: ['算法升级时优先检查的点'],
      confidence: 'inferred',
    },
  ],
};

const TEMPLATE_WORKFLOW = `# Replace Me Blueprint

## 适用范围

- 描述该 blueprint 适用于什么参数/链路

## 目标契约

- 参数位置、伴生字段、成功判定

## 识别特征

- 描述关键词、参数位置、入口现象

## 前置输入

- 请求样本
- MCP 页面上下文

## 推荐工具顺序

- 写清推荐工具顺序

## 步骤清单

### Step 1

- 写清第一步要做什么

## 常见分叉

- 记录升级或迁移的常见分叉

## 失败分支与转向

- 写清失败后优先转向

## 最小 artifacts 契约

- request-summary.json
- network.jsonl
- hooks.jsonl

## 验收标准

- 写清通过与失败的业务标准

## 成功判定

- 说明成功标准

## 禁止事项

- 不放完整实现
`;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

export class ParameterWorkflowLibrary {
  constructor(private readonly rootDir = KNOWLEDGE_ROOT) {}

  async readIndex(): Promise<ParameterWorkflowIndex> {
    return readJsonFile<ParameterWorkflowIndex>(
      path.join(this.rootDir, 'index.json'),
    );
  }

  async listWorkflows(): Promise<ParameterWorkflowMetadata[]> {
    const index = await this.readIndex();
    const docs = await Promise.all(
      index.workflows.map(item => this.getWorkflow(item.id)),
    );
    return docs.map(item => item.metadata);
  }

  async getWorkflow(id: string): Promise<ParameterWorkflowDocument> {
    const index = await this.readIndex();
    const entry = index.workflows.find(
      item => item.id === id || item.aliases.includes(id),
    );
    if (!entry) {
      throw new Error(`Unknown parameter workflow: ${id}`);
    }
    return this.readWorkflowEntry(entry);
  }

  async recommendWorkflow(query: string): Promise<ParameterWorkflowDocument> {
    const index = await this.readIndex();
    const normalizedQuery = normalize(query);

    const exact = index.workflows.find(item => {
      if (normalize(item.id) === normalizedQuery) {
        return true;
      }
      return item.aliases.some(alias => normalize(alias) === normalizedQuery);
    });
    if (exact) {
      return this.readWorkflowEntry(exact);
    }

    const containsMatch = index.workflows.find(item => {
      const tokens = [item.id, ...item.aliases, ...(item.keywords ?? [])].map(
        normalize,
      );
      return tokens.some(
        token =>
          normalizedQuery.includes(token) || token.includes(normalizedQuery),
      );
    });
    if (containsMatch) {
      return this.readWorkflowEntry(containsMatch);
    }

    const fallbackId =
      normalizedQuery.includes('header') ||
      normalizedQuery.includes('x-sign') ||
      normalizedQuery.includes('sign')
        ? 'generic-header-sign'
        : 'generic-query-token';
    return this.getWorkflow(fallbackId);
  }

  async exportWorkflow(id: string, targetDir: string): Promise<void> {
    const workflow = await this.getWorkflow(id);
    await mkdir(targetDir, {recursive: true});
    await writeFile(
      path.join(targetDir, 'metadata.json'),
      `${JSON.stringify(workflow.metadata, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(targetDir, 'workflow.md'),
      workflow.workflow,
      'utf8',
    );
    if (workflow.parts) {
      await writeFile(
        path.join(targetDir, 'parts.json'),
        `${JSON.stringify(workflow.parts, null, 2)}\n`,
        'utf8',
      );
    }
    if (workflow.mutations) {
      await writeFile(
        path.join(targetDir, 'mutations.json'),
        `${JSON.stringify(workflow.mutations, null, 2)}\n`,
        'utf8',
      );
    }
  }

  async validateWorkflowDirectory(
    targetDir: string,
  ): Promise<{valid: boolean; errors: string[]}> {
    const errors: string[] = [];
    const metadataPath = path.join(targetDir, 'metadata.json');
    const workflowPath = path.join(targetDir, 'workflow.md');
    const partsPath = path.join(targetDir, 'parts.json');
    const mutationsPath = path.join(targetDir, 'mutations.json');

    try {
      await access(metadataPath);
    } catch {
      errors.push('metadata.json 不存在');
    }

    try {
      await access(workflowPath);
    } catch {
      errors.push('workflow.md 不存在');
    }

    if (errors.length > 0) {
      return {valid: false, errors};
    }

    const metadata =
      await readJsonFile<Partial<ParameterWorkflowMetadata>>(metadataPath);
    const workflow = await readFile(workflowPath, 'utf8');

    for (const field of [
      'id',
      'title',
      'aliases',
      'category',
      'status',
      'version',
      'lastUpdated',
      'summary',
    ] as const) {
      if (!metadata[field]) {
        errors.push(`metadata.json 缺少字段: ${field}`);
      }
    }

    for (const heading of ['## 适用范围', '## 成功判定', '## 禁止事项']) {
      if (!workflow.includes(heading)) {
        errors.push(`workflow.md 缺少章节: ${heading}`);
      }
    }

    try {
      await access(partsPath);
      const parts = await readJsonFile<{parameter?: string; parts?: unknown[]}>(
        partsPath,
      );
      if (!parts.parameter || !Array.isArray(parts.parts)) {
        errors.push('parts.json 缺少 parameter 或 parts 数组');
      }
    } catch {
      // optional
    }

    try {
      await access(mutationsPath);
      const mutations = await readJsonFile<{
        parameter?: string;
        mutations?: unknown[];
      }>(mutationsPath);
      if (!mutations.parameter || !Array.isArray(mutations.mutations)) {
        errors.push('mutations.json 缺少 parameter 或 mutations 数组');
      }
    } catch {
      // optional
    }

    return {valid: errors.length === 0, errors};
  }

  private async readWorkflowEntry(
    entry: ParameterWorkflowIndexEntry,
  ): Promise<ParameterWorkflowDocument> {
    const baseDir = path.join(this.rootDir, entry.path);
    const metadata = await readJsonFile<ParameterWorkflowMetadata>(
      path.join(baseDir, 'metadata.json'),
    );
    const workflow = await readFile(path.join(baseDir, 'workflow.md'), 'utf8');
    let parts: ParameterWorkflowDocument['parts'];
    let mutations: ParameterWorkflowDocument['mutations'];
    try {
      parts = await readJsonFile<
        NonNullable<ParameterWorkflowDocument['parts']>
      >(path.join(baseDir, 'parts.json'));
    } catch {
      parts = undefined;
    }
    try {
      mutations = await readJsonFile<
        NonNullable<ParameterWorkflowDocument['mutations']>
      >(path.join(baseDir, 'mutations.json'));
    } catch {
      mutations = undefined;
    }
    return {
      metadata,
      workflow,
      path: entry.path,
      parts,
      mutations,
    };
  }
}

let cachedLibrary: ParameterWorkflowLibrary | undefined;

export async function getParameterWorkflowLibrary(): Promise<ParameterWorkflowLibrary> {
  cachedLibrary ??= new ParameterWorkflowLibrary();
  return cachedLibrary;
}

export function resetParameterWorkflowLibraryForTest(): void {
  cachedLibrary = undefined;
}

export async function exportParameterWorkflowTemplate(
  targetDir: string,
): Promise<void> {
  await mkdir(targetDir, {recursive: true});
  await writeFile(
    path.join(targetDir, 'metadata.json'),
    `${JSON.stringify(TEMPLATE_METADATA, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(targetDir, 'workflow.md'),
    TEMPLATE_WORKFLOW,
    'utf8',
  );
  await writeFile(
    path.join(targetDir, 'parts.json'),
    `${JSON.stringify(TEMPLATE_PARTS, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(targetDir, 'mutations.json'),
    `${JSON.stringify(TEMPLATE_MUTATIONS, null, 2)}\n`,
    'utf8',
  );
}

export async function listParameterWorkflows() {
  const library = await getParameterWorkflowLibrary();
  return library.listWorkflows();
}

export async function showParameterWorkflow(id: string) {
  const library = await getParameterWorkflowLibrary();
  const doc = await library.getWorkflow(id);
  return {
    id: doc.metadata.id,
    title: doc.metadata.title,
    aliases: doc.metadata.aliases,
    category: doc.metadata.category,
    summary: doc.metadata.summary,
    parts: doc.parts,
    mutations: doc.mutations,
    workflow: doc.workflow,
  };
}

export async function validateParameterWorkflow(targetDir: string) {
  const library = await getParameterWorkflowLibrary();
  return library.validateWorkflowDirectory(targetDir);
}
