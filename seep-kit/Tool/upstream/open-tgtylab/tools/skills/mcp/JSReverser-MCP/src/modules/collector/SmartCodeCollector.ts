/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * 智能代码收集器 - 解决token溢出问题
 *
 * 核心策略：
 * 1. 分批收集 - 按优先级分批返回代码
 * 2. 智能过滤 - 只收集关键代码（加密、API调用等）
 * 3. 摘要模式 - 返回代码摘要而非完整内容
 * 4. 增量收集 - 支持按需获取特定文件
 */

import type {Page} from 'puppeteer-core';

import type {CodeFile} from '../../types/index.js';
import {logger} from '../../utils/logger.js';

export interface SmartCollectOptions {
  mode: 'summary' | 'priority' | 'incremental' | 'full';
  maxTotalSize?: number; // 最大总大小（字节）
  maxFileSize?: number; // 单个文件最大大小
  priorities?: string[]; // 优先级URL模式（正则）
  includePatterns?: string[]; // 包含模式
  excludePatterns?: string[]; // 排除模式
}

export interface CodeSummary {
  url: string;
  size: number;
  type: string;
  hasEncryption: boolean; // 是否包含加密相关代码
  hasAPI: boolean; // 是否包含API调用
  hasObfuscation: boolean; // 是否混淆
  functions: string[]; // 主要函数列表
  imports: string[]; // 导入的模块
  preview: string; // 前100行预览
}

export class SmartCodeCollector {
  // 🔧 修复：降低默认限制，防止 MCP token 溢出
  // MCP 通常限制在 200K tokens ≈ 800KB-1MB 文本
  private readonly DEFAULT_MAX_TOTAL_SIZE = 512 * 1024; // 512KB (原2MB)
  private readonly DEFAULT_MAX_FILE_SIZE = 100 * 1024; // 100KB (原500KB)
  private readonly PREVIEW_LINES = 50; // 50行 (原100行)

  /**
   * 智能收集代码
   */
  async smartCollect(
    _page: Page, // 预留，未来可用于动态分析
    files: CodeFile[],
    options: SmartCollectOptions,
  ): Promise<CodeFile[] | CodeSummary[]> {
    logger.info(`Smart code collection mode: ${options.mode}`);

    switch (options.mode) {
      case 'summary':
        return this.collectSummaries(files);

      case 'priority':
        return this.collectByPriority(files, options);

      case 'incremental':
        return this.collectIncremental(files, options);

      case 'full':
      default:
        return this.collectWithLimit(files, options);
    }
  }

  /**
   * 模式1: 摘要模式 - 只返回代码摘要，不返回完整内容
   */
  private async collectSummaries(files: CodeFile[]): Promise<CodeSummary[]> {
    logger.info('Generating code summaries...');

    return files.map(file => {
      const lines = file.content.split('\n');
      const preview = lines.slice(0, this.PREVIEW_LINES).join('\n');

      return {
        url: file.url,
        size: file.size,
        type: file.type,
        hasEncryption: this.detectEncryption(file.content),
        hasAPI: this.detectAPI(file.content),
        hasObfuscation: this.detectObfuscation(file.content),
        functions: this.extractFunctions(file.content),
        imports: this.extractImports(file.content),
        preview,
      };
    });
  }

  /**
   * 模式2: 优先级模式 - 按优先级收集，优先返回关键代码
   */
  private collectByPriority(
    files: CodeFile[],
    options: SmartCollectOptions,
  ): CodeFile[] {
    const maxTotalSize = options.maxTotalSize || this.DEFAULT_MAX_TOTAL_SIZE;
    const maxFileSize = options.maxFileSize || this.DEFAULT_MAX_FILE_SIZE;

    // 计算每个文件的优先级分数
    const scoredFiles = files.map(file => ({
      file,
      score: this.calculatePriority(file, options.priorities || []),
    }));

    // 按分数排序
    scoredFiles.sort((a, b) => b.score - a.score);

    // 收集文件直到达到大小限制
    const result: CodeFile[] = [];
    let currentSize = 0;

    for (const {file} of scoredFiles) {
      let content = file.content;
      let truncated = false;

      // 截断超大文件
      if (file.size > maxFileSize) {
        content = content.substring(0, maxFileSize);
        truncated = true;
      }

      // 检查是否超过总大小限制
      if (currentSize + content.length > maxTotalSize) {
        logger.warn(
          `Reached max total size limit (${maxTotalSize} bytes), stopping collection`,
        );
        break;
      }

      result.push({
        ...file,
        content,
        size: content.length,
        metadata: {
          ...file.metadata,
          truncated,
          originalSize: file.size,
          priorityScore: this.calculatePriority(file, options.priorities || []),
        },
      });

      currentSize += content.length;
    }

    logger.info(
      `Collected ${result.length}/${files.length} files by priority (${(currentSize / 1024).toFixed(2)} KB)`,
    );
    return result;
  }

  /**
   * 模式3: 增量模式 - 只收集匹配模式的文件
   */
  private collectIncremental(
    files: CodeFile[],
    options: SmartCollectOptions,
  ): CodeFile[] {
    const includePatterns = options.includePatterns || [];
    const excludePatterns = options.excludePatterns || [];

    const filtered = files.filter(file => {
      // 检查排除模式
      if (excludePatterns.some(pattern => new RegExp(pattern).test(file.url))) {
        return false;
      }

      // 检查包含模式
      if (includePatterns.length === 0) {
        return true;
      }

      return includePatterns.some(pattern =>
        new RegExp(pattern).test(file.url),
      );
    });

    logger.info(
      `Incremental collection: ${filtered.length}/${files.length} files matched`,
    );
    return this.collectWithLimit(filtered, options);
  }

  /**
   * 模式4: 限制模式 - 应用大小限制
   */
  private collectWithLimit(
    files: CodeFile[],
    options: SmartCollectOptions,
  ): CodeFile[] {
    const maxTotalSize = options.maxTotalSize || this.DEFAULT_MAX_TOTAL_SIZE;
    const maxFileSize = options.maxFileSize || this.DEFAULT_MAX_FILE_SIZE;

    const result: CodeFile[] = [];
    let currentSize = 0;

    for (const file of files) {
      let content = file.content;
      let truncated = false;

      // 截断超大文件
      if (file.size > maxFileSize) {
        content = content.substring(0, maxFileSize);
        truncated = true;
      }

      // 检查总大小限制
      if (currentSize + content.length > maxTotalSize) {
        logger.warn(
          `Reached max total size limit, collected ${result.length}/${files.length} files`,
        );
        break;
      }

      result.push({
        ...file,
        content,
        size: content.length,
        metadata: {
          ...file.metadata,
          truncated,
          originalSize: file.size,
        },
      });

      currentSize += content.length;
    }

    return result;
  }

  /**
   * 计算文件优先级分数
   */
  private calculatePriority(file: CodeFile, priorities: string[]): number {
    let score = 0;

    // 基础分数：文件类型
    if (file.type === 'inline') score += 10;
    if (file.type === 'external') score += 5;

    // URL匹配优先级模式
    for (let i = 0; i < priorities.length; i++) {
      const pattern = priorities[i];
      if (pattern && new RegExp(pattern).test(file.url)) {
        score += (priorities.length - i) * 20; // 越靠前优先级越高
      }
    }

    // 内容特征加分
    if (this.detectEncryption(file.content)) score += 50;
    if (this.detectAPI(file.content)) score += 30;
    if (this.detectObfuscation(file.content)) score += 20;

    // 文件大小惩罚（小文件优先）
    if (file.size < 10 * 1024)
      score += 10; // < 10KB
    else if (file.size > 500 * 1024) score -= 20; // > 500KB

    return score;
  }

  /**
   * 检测是否包含加密相关代码
   */
  private detectEncryption(content: string): boolean {
    const patterns = [
      /crypto|encrypt|decrypt|cipher|aes|rsa|md5|sha/i,
      /CryptoJS|forge|sjcl/i,
      /btoa|atob/i,
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * 检测是否包含API调用
   */
  private detectAPI(content: string): boolean {
    const patterns = [
      /fetch\s*\(/,
      /XMLHttpRequest/,
      /axios|request|ajax/i,
      /\.get\(|\.post\(/,
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  /**
   * 检测是否混淆
   */
  private detectObfuscation(content: string): boolean {
    // 简单的混淆检测
    const lines = content.split('\n');
    const avgLineLength = content.length / lines.length;

    // 平均行长度过长可能是混淆
    if (avgLineLength > 200) return true;

    // 检查常见混淆特征
    if (/\\x[0-9a-f]{2}/i.test(content)) return true; // 十六进制编码
    if (/\\u[0-9a-f]{4}/i.test(content)) return true; // Unicode编码
    if (/eval\s*\(/i.test(content)) return true; // eval调用

    return false;
  }

  /**
   * 提取函数名列表
   */
  private extractFunctions(content: string): string[] {
    const functions: string[] = [];
    const patterns = [
      /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/g,
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !functions.includes(match[1])) {
          functions.push(match[1]);
        }
      }
    }

    return functions.slice(0, 20); // 最多返回20个
  }

  /**
   * 提取导入模块列表
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const patterns = [
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !imports.includes(match[1])) {
          imports.push(match[1]);
        }
      }
    }

    return imports;
  }
}
