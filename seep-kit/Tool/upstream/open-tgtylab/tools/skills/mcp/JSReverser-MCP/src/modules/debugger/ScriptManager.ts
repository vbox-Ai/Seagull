/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * 脚本管理器 - 薄封装CDP Debugger域
 *
 * 功能:
 * - 获取页面所有已加载的脚本列表
 * - 获取指定脚本的完整源码
 * - 监听脚本加载事件
 *
 * 设计原则:
 * - 薄封装CDP Debugger.scriptParsed事件和Debugger.getScriptSource方法
 * - 依赖CodeCollector获取Page实例
 */

import type {CDPSession} from 'puppeteer-core';

import {logger} from '../../utils/logger.js';
import type {CodeCollector} from '../collector/CodeCollector.js';

export interface ScriptInfo {
  scriptId: string;
  url: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  sourceLength?: number;
  source?: string;
}

/**
 * 脚本分片（100KB/片）
 */
interface ScriptChunk {
  scriptId: string;
  chunkIndex: number;
  content: string;
  size: number;
}

/**
 * 关键词索引条目
 */
interface KeywordIndexEntry {
  scriptId: string;
  url: string;
  line: number;
  column: number;
  context: string;
}

export class ScriptManager {
  private cdpSession: CDPSession | null = null;
  private scripts = new Map<string, ScriptInfo>();
  private scriptsByUrl = new Map<string, ScriptInfo[]>();
  private initialized = false;

  // 🆕 内存索引系统
  private keywordIndex = new Map<string, KeywordIndexEntry[]>();
  private scriptChunks = new Map<string, ScriptChunk[]>();
  private readonly CHUNK_SIZE = 100 * 1024; // 100KB per chunk

  // ✅ 修复：保存事件监听器引用，便于清理
  private scriptParsedListener: ((params: any) => void) | null = null;

  constructor(private collector: CodeCollector) {}

  /**
   * 初始化CDP会话并启用Debugger
   */
  async init(): Promise<void> {
    if (this.initialized) {
      logger.warn('ScriptManager already initialized');
      return;
    }

    // 🆕 移除冗余检查（initialized 为 true 时 cdpSession 一定不为 null）
    const page = await this.collector.getActivePage();
    this.cdpSession = await page.createCDPSession();

    // 启用Debugger域
    await this.cdpSession.send('Debugger.enable');

    // ✅ 修复：保存监听器引用，便于后续清理
    this.scriptParsedListener = (params: any) => {
      const scriptInfo: ScriptInfo = {
        scriptId: params.scriptId,
        url: params.url,
        startLine: params.startLine,
        startColumn: params.startColumn,
        endLine: params.endLine,
        endColumn: params.endColumn,
        sourceLength: params.length,
      };

      // 存储脚本信息
      this.scripts.set(params.scriptId, scriptInfo);

      // 按URL索引
      if (params.url) {
        if (!this.scriptsByUrl.has(params.url)) {
          this.scriptsByUrl.set(params.url, []);
        }
        this.scriptsByUrl.get(params.url)!.push(scriptInfo);
      }

      logger.debug(
        `Script parsed: ${params.url || 'inline'} (${params.scriptId})`,
      );
    };

    // 监听脚本解析事件
    this.cdpSession.on('Debugger.scriptParsed', this.scriptParsedListener);

    // 🔧 修复：等待脚本解析事件稳定（替代硬编码2秒延迟）
    // 当启用 Debugger 域时，CDP 会重新触发所有已解析脚本的事件
    // 通过轮询检测脚本数量是否稳定来判断事件是否完成
    let lastCount = 0;
    let stableRounds = 0;
    const maxWait = 5000; // 最大等待 5 秒
    const pollInterval = 200; // 每 200ms 检查一次
    const requiredStableRounds = 3; // 连续 3 次数量不变视为稳定
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      const currentCount = this.scripts.size;
      if (currentCount === lastCount && currentCount > 0) {
        stableRounds++;
        if (stableRounds >= requiredStableRounds) break;
      } else {
        stableRounds = 0;
      }
      lastCount = currentCount;
    }

    this.initialized = true;
    logger.info(
      `ScriptManager initialized, collected ${this.scripts.size} scripts`,
    );
  }

  /**
   * 启用脚本管理器（别名方法，与其他模块保持一致）
   */
  async enable(): Promise<void> {
    return this.init();
  }

  /**
   * 获取所有已加载的脚本列表
   *
   * ⚠️ 警告：如果 includeSource=true，会一次性加载所有脚本源码，可能导致内存溢出
   * 建议：对于大型网站，使用 getScriptSource() 按需加载单个脚本
   *
   * @param includeSource 是否包含源码（默认false，推荐false）
   * @param maxScripts 最大脚本数量限制（默认1000，防止内存溢出）
   */
  async getAllScripts(
    includeSource = false,
    maxScripts = 1000,
  ): Promise<ScriptInfo[]> {
    if (!this.cdpSession) {
      await this.init();
    }

    const scripts = Array.from(this.scripts.values());

    // 🔧 修复：检查脚本数量，防止内存溢出
    if (scripts.length > maxScripts) {
      logger.warn(
        `Found ${scripts.length} scripts, limiting to ${maxScripts}. Increase maxScripts parameter if needed.`,
      );
    }

    const limitedScripts = scripts.slice(0, maxScripts);

    // 如果需要包含源码，逐个获取
    if (includeSource) {
      logger.warn(
        `Loading source code for ${limitedScripts.length} scripts. This may use significant memory.`,
      );

      let loadedCount = 0;
      let failedCount = 0;

      for (const script of limitedScripts) {
        if (!script.source) {
          try {
            const {scriptSource} = await this.cdpSession!.send(
              'Debugger.getScriptSource',
              {
                scriptId: script.scriptId,
              },
            );
            script.source = scriptSource;
            loadedCount++;

            // 每加载 10 个脚本输出进度
            if (loadedCount % 10 === 0) {
              logger.debug(
                `Loaded ${loadedCount}/${limitedScripts.length} scripts...`,
              );
            }
          } catch (error) {
            logger.warn(
              `Failed to get source for script ${script.scriptId}:`,
              error,
            );
            failedCount++;
          }
        }
      }

      logger.info(
        `getAllScripts: ${limitedScripts.length} scripts (loaded: ${loadedCount}, failed: ${failedCount})`,
      );
    } else {
      logger.info(
        `getAllScripts: ${limitedScripts.length} scripts (source not included)`,
      );
    }

    return limitedScripts;
  }

  /**
   * 获取指定脚本的源码
   */
  async getScriptSource(
    scriptId?: string,
    url?: string,
  ): Promise<ScriptInfo | null> {
    // ✅ 参数验证
    if (!scriptId && !url) {
      throw new Error('Either scriptId or url parameter must be provided');
    }

    if (!this.cdpSession) {
      await this.init();
    }

    let targetScript: ScriptInfo | undefined;

    // 通过scriptId查找
    if (scriptId) {
      targetScript = this.scripts.get(scriptId);
    }
    // 通过URL查找（支持通配符）
    else if (url) {
      const urlPattern = url.replace(/\*/g, '.*');

      // ✅ 修复：添加正则表达式错误处理
      let regex: RegExp;
      try {
        regex = new RegExp(urlPattern);
      } catch (error) {
        logger.error(`Invalid URL pattern: ${url}`, error);
        return null;
      }

      for (const [scriptUrl, scripts] of this.scriptsByUrl.entries()) {
        if (regex.test(scriptUrl)) {
          targetScript = scripts[0]; // 取第一个匹配的脚本
          break;
        }
      }
    }

    if (!targetScript) {
      logger.warn(`Script not found: ${scriptId || url}`);
      return null;
    }

    // 获取源码
    if (!targetScript.source) {
      try {
        const {scriptSource} = await this.cdpSession!.send(
          'Debugger.getScriptSource',
          {
            scriptId: targetScript.scriptId,
          },
        );
        targetScript.source = scriptSource;
        targetScript.sourceLength = scriptSource.length;

        // 🆕 自动建立索引和分片
        this.buildKeywordIndex(
          targetScript.scriptId,
          targetScript.url,
          scriptSource,
        );
        this.chunkScript(targetScript.scriptId, scriptSource);
      } catch (error) {
        logger.error(
          `Failed to get script source for ${targetScript.scriptId}:`,
          error,
        );
        return null;
      }
    }

    logger.info(
      `getScriptSource: ${targetScript.url || 'inline'} (${targetScript.sourceLength} bytes)`,
    );
    return targetScript;
  }

  /**
   * 通过URL模式查找脚本
   */
  async findScriptsByUrl(urlPattern: string): Promise<ScriptInfo[]> {
    if (!this.cdpSession) {
      await this.init();
    }

    const pattern = urlPattern.replace(/\*/g, '.*');

    // ✅ 修复：添加正则表达式错误处理
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch (error) {
      logger.error(`Invalid URL pattern: ${urlPattern}`, error);
      return [];
    }

    const results: ScriptInfo[] = [];

    for (const [url, scripts] of this.scriptsByUrl.entries()) {
      if (regex.test(url)) {
        results.push(...scripts);
      }
    }

    logger.info(
      `findScriptsByUrl: ${urlPattern} - found ${results.length} scripts`,
    );
    return results;
  }

  /**
   * 清除缓存的脚本信息（已废弃，使用 clear() 代替）
   */
  clearCache(): void {
    this.clear();
  }

  /**
   * 搜索关键词（在所有脚本中）
   */
  async searchInScripts(
    keyword: string,
    options: {
      isRegex?: boolean;
      caseSensitive?: boolean;
      contextLines?: number;
      maxMatches?: number;
    } = {},
  ): Promise<{
    keyword: string;
    totalMatches: number;
    matches: Array<{
      scriptId: string;
      url: string;
      line: number;
      column: number;
      matchText: string;
      context: string;
    }>;
  }> {
    if (!this.cdpSession) {
      await this.init();
    }

    const {
      isRegex = false,
      caseSensitive = false,
      contextLines = 3,
      maxMatches = 100,
    } = options;

    // ✅ 修复：添加正则表达式错误处理
    let searchRegex: RegExp;
    try {
      searchRegex = isRegex
        ? new RegExp(keyword, caseSensitive ? 'g' : 'gi')
        : new RegExp(
            keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            caseSensitive ? 'g' : 'gi',
          );
    } catch (error) {
      logger.error(`Invalid search pattern: ${keyword}`, error);
      return {
        keyword,
        totalMatches: 0,
        matches: [],
      };
    }

    const matches: Array<{
      scriptId: string;
      url: string;
      line: number;
      column: number;
      matchText: string;
      context: string;
    }> = [];

    // ✅ 修复：先获取脚本列表（不包含源码），避免一次性加载所有源码
    const scriptList = await this.getAllScripts(false);
    logger.info(`Searching in ${scriptList.length} scripts...`);

    // 逐个加载脚本源码并搜索
    for (const scriptInfo of scriptList) {
      if (matches.length >= maxMatches) break;

      // 按需加载单个脚本源码
      const script = await this.getScriptSource(scriptInfo.scriptId);
      if (!script || !script.source) continue;

      const lines = script.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const lineMatches = Array.from(line.matchAll(searchRegex));

        for (const match of lineMatches) {
          if (matches.length >= maxMatches) break;

          // 提取上下文
          const startLine = Math.max(0, i - contextLines);
          const endLine = Math.min(lines.length - 1, i + contextLines);
          const contextArray = lines.slice(startLine, endLine + 1);
          const context = contextArray.join('\n');

          matches.push({
            scriptId: script.scriptId,
            url: script.url || 'inline',
            line: i + 1,
            column: match.index || 0,
            matchText: match[0],
            context,
          });
        }
      }
    }

    logger.info(
      `searchInScripts: "${keyword}" - found ${matches.length} matches`,
    );

    return {
      keyword,
      totalMatches: matches.length,
      matches,
    };
  }

  /**
   * 提取函数及其依赖树
   *
   * ⚠️ 注意：此方法需要 Babel 依赖。如果 Babel 未安装，将抛出错误。
   */
  async extractFunctionTree(
    scriptId: string,
    functionName: string,
    options: {
      maxDepth?: number;
      maxSize?: number; // KB
      includeComments?: boolean;
    } = {},
  ): Promise<{
    mainFunction: string;
    code: string;
    functions: Array<{
      name: string;
      code: string;
      dependencies: string[];
      startLine: number;
      endLine: number;
      size: number;
    }>;
    callGraph: Record<string, string[]>;
    totalSize: number;
    extractedCount: number;
  }> {
    const {maxDepth = 3, maxSize = 500, includeComments = true} = options;

    // 获取脚本源码
    const script = await this.getScriptSource(scriptId);
    if (!script || !script.source) {
      throw new Error(`Script not found: ${scriptId}`);
    }

    // 🔧 修复：为 Babel 动态 import 添加错误处理
    let parser: any, traverse: any, generate: any, t: any;

    try {
      parser = await import('@babel/parser');
      traverse = (await import('@babel/traverse')).default;
      generate = (await import('@babel/generator')).default;
      t = await import('@babel/types');
    } catch (error: any) {
      throw new Error(
        `Failed to load Babel dependencies. Please install: npm install @babel/parser @babel/traverse @babel/generator @babel/types\nError: ${error.message}`,
      );
    }

    let ast: any;

    try {
      ast = parser.parse(script.source, {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'typescript'],
      });
    } catch (error: any) {
      throw new Error(`Failed to parse script ${scriptId}: ${error.message}`);
    }

    const allFunctions = new Map<
      string,
      {
        name: string;
        code: string;
        dependencies: string[];
        startLine: number;
        endLine: number;
        size: number;
      }
    >();
    const callGraph: Record<string, string[]> = {};

    // 提取依赖的辅助函数
    const extractDependencies = (path: any): string[] => {
      const deps = new Set<string>();
      path.traverse({
        CallExpression(callPath: any) {
          if (t.isIdentifier(callPath.node.callee)) {
            deps.add(callPath.node.callee.name);
          }
        },
      });
      return Array.from(deps);
    };

    // 收集所有函数定义
    traverse(ast, {
      FunctionDeclaration(path: any) {
        const name = path.node.id?.name;
        if (!name) return;

        const funcCode = generate(path.node, {comments: includeComments}).code;
        const deps = extractDependencies(path);

        allFunctions.set(name, {
          name,
          code: funcCode,
          startLine: path.node.loc?.start.line || 0,
          endLine: path.node.loc?.end.line || 0,
          dependencies: deps,
          size: funcCode.length,
        });

        callGraph[name] = deps;
      },

      VariableDeclarator(path: any) {
        if (
          t.isIdentifier(path.node.id) &&
          (t.isFunctionExpression(path.node.init) ||
            t.isArrowFunctionExpression(path.node.init))
        ) {
          const name = path.node.id.name;
          const funcCode = generate(path.node, {
            comments: includeComments,
          }).code;
          const deps = extractDependencies(path);

          allFunctions.set(name, {
            name,
            code: funcCode,
            startLine: path.node.loc?.start.line || 0,
            endLine: path.node.loc?.end.line || 0,
            dependencies: deps,
            size: funcCode.length,
          });

          callGraph[name] = deps;
        }
      },
    });

    // BFS 按层级提取依赖
    const extracted = new Set<string>();
    let currentLevel = [functionName];
    let currentDepth = 0;

    while (currentLevel.length > 0 && currentDepth < maxDepth) {
      const nextLevel: string[] = [];

      for (const current of currentLevel) {
        if (extracted.has(current)) continue;

        const func = allFunctions.get(current);
        if (!func) continue;

        extracted.add(current);

        // 收集下一层依赖
        for (const dep of func.dependencies) {
          if (!extracted.has(dep) && allFunctions.has(dep)) {
            nextLevel.push(dep);
          }
        }
      }

      currentLevel = nextLevel;
      currentDepth++;
    }

    // 生成最终代码
    const functions = Array.from(extracted)
      .map(name => allFunctions.get(name)!)
      .filter(Boolean);

    const code = functions.map(f => f.code).join('\n\n');
    const totalSize = code.length;

    // 检查大小限制
    if (totalSize > maxSize * 1024) {
      logger.warn(
        `Extracted code size (${(totalSize / 1024).toFixed(2)}KB) exceeds limit (${maxSize}KB)`,
      );
    }

    logger.info(
      `extractFunctionTree: ${functionName} - extracted ${functions.length} functions (${(totalSize / 1024).toFixed(2)}KB)`,
    );

    return {
      mainFunction: functionName,
      code,
      functions,
      callGraph,
      totalSize,
      extractedCount: functions.length,
    };
  }

  /**
   * 🆕 清除所有数据（换网站时调用）
   */
  clear(): void {
    this.scripts.clear();
    this.scriptsByUrl.clear();
    this.keywordIndex.clear();
    this.scriptChunks.clear();
    logger.info('✅ ScriptManager cleared - ready for new website');
  }

  /**
   * 🆕 关闭 ScriptManager 并释放所有资源
   */
  async close(): Promise<void> {
    // 清除所有数据
    this.clear();

    // ✅ 修复：移除事件监听器，防止内存泄漏
    if (this.cdpSession && this.scriptParsedListener) {
      try {
        this.cdpSession.off('Debugger.scriptParsed', this.scriptParsedListener);
        this.scriptParsedListener = null;
        logger.debug('Event listener removed');
      } catch (error) {
        logger.warn('Failed to remove event listener:', error);
      }
    }

    // Disable Debugger 并 Detach CDP session
    if (this.cdpSession) {
      try {
        await this.cdpSession.send('Debugger.disable');
        await this.cdpSession.detach();
        logger.info('CDP session closed');
      } catch (error) {
        logger.warn('Failed to close CDP session:', error);
      }
      this.cdpSession = null;
    }

    // 重置初始化状态
    this.initialized = false;
    logger.info('✅ ScriptManager closed');
  }

  /**
   * 🆕 获取统计信息
   */
  getStats(): {
    totalScripts: number;
    totalUrls: number;
    indexedKeywords: number;
    totalChunks: number;
  } {
    let totalChunks = 0;
    for (const chunks of this.scriptChunks.values()) {
      totalChunks += chunks.length;
    }

    return {
      totalScripts: this.scripts.size,
      totalUrls: this.scriptsByUrl.size,
      indexedKeywords: this.keywordIndex.size,
      totalChunks,
    };
  }

  /**
   * 🆕 建立关键词索引（在获取脚本源码时自动调用）
   */
  private buildKeywordIndex(
    scriptId: string,
    url: string,
    content: string,
  ): void {
    const lines = content.split('\n');
    const keywordRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]{2,}\b/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const matches = Array.from(line.matchAll(keywordRegex));

      for (const match of matches) {
        const keyword = match[0].toLowerCase();

        // 提取上下文（前后3行）
        const startLine = Math.max(0, i - 3);
        const endLine = Math.min(lines.length - 1, i + 3);
        const context = lines.slice(startLine, endLine + 1).join('\n');

        const entry: KeywordIndexEntry = {
          scriptId,
          url,
          line: i + 1,
          column: match.index || 0,
          context,
        };

        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, []);
        }
        this.keywordIndex.get(keyword)!.push(entry);
      }
    }

    logger.debug(`📇 Indexed ${this.keywordIndex.size} keywords for ${url}`);
  }

  /**
   * 🆕 分片存储脚本（在获取脚本源码时自动调用）
   */
  private chunkScript(scriptId: string, content: string): void {
    const chunks: ScriptChunk[] = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < content.length) {
      const chunk = content.substring(offset, offset + this.CHUNK_SIZE);
      chunks.push({
        scriptId,
        chunkIndex,
        content: chunk,
        size: chunk.length,
      });
      offset += this.CHUNK_SIZE;
      chunkIndex++;
    }

    this.scriptChunks.set(scriptId, chunks);
    logger.debug(`📦 Chunked script ${scriptId} into ${chunks.length} chunks`);
  }

  /**
   * 🆕 获取脚本片段
   */
  getScriptChunk(scriptId: string, chunkIndex: number): string | null {
    const chunks = this.scriptChunks.get(scriptId);
    if (!chunks || chunkIndex >= chunks.length) {
      return null;
    }
    const chunk = chunks[chunkIndex];
    return chunk ? chunk.content : null;
  }

  /**
   * 🆕 增强的搜索（使用内存索引，避免重复加载脚本源码）
   */
  async searchInScriptsEnhanced(
    keyword: string,
    options: {
      isRegex?: boolean;
      caseSensitive?: boolean;
      contextLines?: number;
      maxMatches?: number;
    } = {},
  ): Promise<{
    keyword: string;
    totalMatches: number;
    matches: Array<{
      scriptId: string;
      url: string;
      line: number;
      column: number;
      matchText: string;
      context: string;
    }>;
    searchMethod: 'indexed' | 'regex';
  }> {
    const {isRegex = false, caseSensitive = false, maxMatches = 100} = options;

    const searchTerm = caseSensitive ? keyword : keyword.toLowerCase();
    const matches: Array<{
      scriptId: string;
      url: string;
      line: number;
      column: number;
      matchText: string;
      context: string;
    }> = [];

    if (!isRegex) {
      // 使用索引快速查找 - O(1)
      for (const [indexedKeyword, entries] of this.keywordIndex.entries()) {
        if (indexedKeyword.includes(searchTerm)) {
          for (const entry of entries) {
            matches.push({
              scriptId: entry.scriptId,
              url: entry.url,
              line: entry.line,
              column: entry.column,
              matchText: indexedKeyword,
              context: entry.context,
            });

            if (matches.length >= maxMatches) {
              break;
            }
          }
        }

        if (matches.length >= maxMatches) {
          break;
        }
      }

      logger.info(
        `🔍 Enhanced search (indexed) found ${matches.length} matches for "${keyword}"`,
      );

      return {
        keyword,
        totalMatches: matches.length,
        matches,
        searchMethod: 'indexed',
      };
    } else {
      // 正则搜索（降级到原始方法）
      const result = await this.searchInScripts(keyword, options);
      return {
        ...result,
        searchMethod: 'regex',
      };
    }
  }
}
