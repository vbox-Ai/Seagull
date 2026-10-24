/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * DebuggerManager - 调试器核心管理
 *
 * 功能：
 * 1. 断点管理（设置、删除、列出、条件断点）
 * 2. 执行控制（暂停、继续、单步执行）
 * 3. 调试状态管理（暂停状态、调用帧）
 *
 * 设计原则：
 * - 薄封装CDP Debugger域，直接调用CDP API
 * - 依赖CodeCollector获取CDP会话
 * - 维护断点和暂停状态的映射
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {CDPSession} from 'puppeteer-core';

import type {
  ScopeVariable,
  BreakpointHitCallback,
  BreakpointHitEvent,
  DebuggerSession,
  GetScopeVariablesOptions,
  GetScopeVariablesResult,
} from '../../types/index.js';
import {logger} from '../../utils/logger.js';
import {resolveDefaultDebuggerSessionsDir} from '../../utils/projectPaths.js';
import type {CodeCollector} from '../collector/CodeCollector.js';

import {BlackboxManager} from './BlackboxManager.js';
import {EventBreakpointManager} from './EventBreakpointManager.js';
import {WatchExpressionManager} from './WatchExpressionManager.js';
import {XHRBreakpointManager} from './XHRBreakpointManager.js';

/**
 * 断点信息
 */
export interface BreakpointInfo {
  breakpointId: string;
  location: {
    scriptId?: string;
    url?: string;
    lineNumber: number;
    columnNumber?: number;
  };
  condition?: string;
  enabled: boolean;
  hitCount: number;
  createdAt: number;
}

/**
 * 暂停状态
 */
export interface PausedState {
  callFrames: CallFrame[];
  reason: string;
  data?: any;
  hitBreakpoints?: string[];
  timestamp: number;
}

/**
 * 调用帧
 */
export interface CallFrame {
  callFrameId: string;
  functionName: string;
  location: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
  url: string;
  scopeChain: Scope[];
  this: any;
}

/**
 * 作用域
 */
export interface Scope {
  type:
    | 'global'
    | 'local'
    | 'with'
    | 'closure'
    | 'catch'
    | 'block'
    | 'script'
    | 'eval'
    | 'module';
  object: {
    type: string;
    objectId?: string;
    className?: string;
    description?: string;
  };
  name?: string;
  startLocation?: {scriptId: string; lineNumber: number; columnNumber: number};
  endLocation?: {scriptId: string; lineNumber: number; columnNumber: number};
}

/**
 * 调试器管理器
 */
export class DebuggerManager {
  private cdpSession: CDPSession | null = null;
  private enabled = false;

  // 断点管理
  private breakpoints = new Map<string, BreakpointInfo>();

  // 暂停状态
  private pausedState: PausedState | null = null;
  private pausedResolvers: Array<(state: PausedState) => void> = [];

  // ✨ 新增：断点命中回调
  private breakpointHitCallbacks = new Set<BreakpointHitCallback>();

  // ✨ 新增：异常断点状态
  private pauseOnExceptionsState: 'none' | 'uncaught' | 'all' = 'none';

  // 🆕 新增管理器（延迟初始化）
  private _watchManager: WatchExpressionManager | null = null;
  private _xhrManager: XHRBreakpointManager | null = null;
  private _eventManager: EventBreakpointManager | null = null;
  private _blackboxManager: BlackboxManager | null = null;

  // 🆕 事件监听器引用（用于清理）
  private pausedListener: ((params: any) => void) | null = null;
  private resumedListener: (() => void) | null = null;
  private breakpointResolvedListener: ((params: any) => void) | null = null;

  constructor(private collector: CodeCollector) {}

  private getDefaultSessionsDir(): string {
    return resolveDefaultDebuggerSessionsDir(import.meta.url);
  }

  /**
   * 🆕 获取共享的 CDP Session（供子管理器使用）
   *
   * 设计原则：所有子管理器应共享同一个 CDP session，避免资源浪费
   */
  getCDPSession(): CDPSession {
    if (!this.cdpSession || !this.enabled) {
      throw new Error(
        'Debugger not enabled. Call init() or enable() first to get CDP session.',
      );
    }
    return this.cdpSession;
  }

  /**
   * 🆕 获取 Watch Expression Manager（延迟初始化）
   */
  getWatchManager(): WatchExpressionManager {
    if (!this._watchManager) {
      throw new Error(
        'WatchExpressionManager not initialized. Call initAdvancedFeatures() first.',
      );
    }
    return this._watchManager;
  }

  /**
   * 🆕 获取 XHR Breakpoint Manager（延迟初始化）
   */
  getXHRManager(): XHRBreakpointManager {
    if (!this._xhrManager) {
      throw new Error(
        'XHRBreakpointManager not initialized. Call initAdvancedFeatures() first.',
      );
    }
    return this._xhrManager;
  }

  /**
   * 🆕 获取 Event Breakpoint Manager（延迟初始化）
   */
  getEventManager(): EventBreakpointManager {
    if (!this._eventManager) {
      throw new Error(
        'EventBreakpointManager not initialized. Call initAdvancedFeatures() first.',
      );
    }
    return this._eventManager;
  }

  /**
   * 🆕 获取 Blackbox Manager（延迟初始化）
   */
  getBlackboxManager(): BlackboxManager {
    if (!this._blackboxManager) {
      throw new Error(
        'BlackboxManager not initialized. Call initAdvancedFeatures() first.',
      );
    }
    return this._blackboxManager;
  }

  /**
   * 初始化调试器（启用CDP Debugger域）
   */
  async init(): Promise<void> {
    if (this.enabled) {
      logger.warn('Debugger already enabled');
      return;
    }

    try {
      const page = await this.collector.getActivePage();
      // ✅ 修复：使用新的API，避免弃用警告
      this.cdpSession = await page.createCDPSession();

      // 启用Debugger域
      await this.cdpSession.send('Debugger.enable');
      this.enabled = true;

      // 🆕 创建事件监听器引用
      this.pausedListener = (params: any) => this.handlePaused(params);
      this.resumedListener = () => this.handleResumed();
      this.breakpointResolvedListener = (params: any) =>
        this.handleBreakpointResolved(params);

      // 监听暂停事件
      this.cdpSession.on('Debugger.paused', this.pausedListener);

      // 监听恢复事件
      this.cdpSession.on('Debugger.resumed', this.resumedListener);

      // 监听断点解析事件
      this.cdpSession.on(
        'Debugger.breakpointResolved',
        this.breakpointResolvedListener,
      );

      logger.info('Debugger enabled successfully');
    } catch (error) {
      logger.error('Failed to enable debugger:', error);
      throw error;
    }
  }

  /**
   * 启用调试器（别名方法，与其他模块保持一致）
   */
  async enable(): Promise<void> {
    return this.init();
  }

  /**
   * 🆕 初始化高级功能（Watch、XHR、Event、Blackbox）
   *
   * 注意：必须在 init() 之后调用
   *
   * @param runtimeInspector RuntimeInspector 实例（用于 WatchExpressionManager）
   */
  async initAdvancedFeatures(runtimeInspector?: any): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error(
        'Debugger must be enabled before initializing advanced features. Call init() first.',
      );
    }

    try {
      // 🔧 修复：如果提供了 runtimeInspector，初始化 Watch Expression Manager
      if (runtimeInspector) {
        this._watchManager = new WatchExpressionManager(runtimeInspector);
        logger.info('WatchExpressionManager initialized');
      }

      // 🔧 修复：传递共享的 CDP session 而不是 collector
      // 子管理器将直接使用 DebuggerManager 的 session，避免重复创建
      this._xhrManager = new XHRBreakpointManager(this.cdpSession);
      logger.info('XHRBreakpointManager initialized');

      this._eventManager = new EventBreakpointManager(this.cdpSession);
      logger.info('EventBreakpointManager initialized');

      this._blackboxManager = new BlackboxManager(this.cdpSession);
      logger.info('BlackboxManager initialized');

      logger.info('All advanced debugging features initialized');
    } catch (error) {
      logger.error('Failed to initialize advanced features:', error);
      throw error;
    }
  }

  /**
   * 禁用调试器
   */
  async disable(): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      logger.warn('Debugger not enabled');
      return;
    }

    try {
      // 🔧 修复：先清理子管理器
      if (this._xhrManager) {
        await this._xhrManager.close();
        this._xhrManager = null;
      }

      if (this._eventManager) {
        await this._eventManager.close();
        this._eventManager = null;
      }

      if (this._blackboxManager) {
        await this._blackboxManager.close();
        this._blackboxManager = null;
      }

      if (this._watchManager) {
        this._watchManager.clearAll();
        this._watchManager = null;
      }

      // 🆕 移除事件监听器（防止内存泄漏）
      if (this.pausedListener) {
        this.cdpSession.off('Debugger.paused', this.pausedListener);
        this.pausedListener = null;
      }
      if (this.resumedListener) {
        this.cdpSession.off('Debugger.resumed', this.resumedListener);
        this.resumedListener = null;
      }
      if (this.breakpointResolvedListener) {
        this.cdpSession.off(
          'Debugger.breakpointResolved',
          this.breakpointResolvedListener,
        );
        this.breakpointResolvedListener = null;
      }

      await this.cdpSession.send('Debugger.disable');
    } catch (error) {
      logger.error('Failed to disable debugger:', error);
    } finally {
      // 🆕 无论成功失败，都清理状态（确保状态一致性）
      this.enabled = false;
      this.breakpoints.clear();
      this.pausedState = null;
      this.pausedResolvers = [];

      // Detach CDP session
      if (this.cdpSession) {
        try {
          await this.cdpSession.detach();
        } catch (e) {
          logger.warn('Failed to detach CDP session:', e);
        }
        this.cdpSession = null;
      }

      logger.info('Debugger disabled and cleaned up');
    }
  }

  /**
   * 检查调试器是否已启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 设置异步调用堆栈深度（需要 Debugger 域已启用）
   */
  async setAsyncCallStackDepth(maxDepth: number): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger is not enabled. Call enable() first.');
    }
    await this.cdpSession.send('Debugger.setAsyncCallStackDepth', {maxDepth});
  }

  // ==================== 断点管理 ====================

  /**
   * 按URL设置断点（最常用）
   */
  async setBreakpointByUrl(params: {
    url: string;
    lineNumber: number;
    columnNumber?: number;
    condition?: string;
  }): Promise<BreakpointInfo> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error(
        'Debugger is not enabled. Call init() or enable() first.',
      );
    }

    // ✅ 参数验证
    if (!params.url) {
      throw new Error('url parameter is required');
    }

    if (params.lineNumber < 0) {
      throw new Error('lineNumber must be a non-negative number');
    }

    if (params.columnNumber !== undefined && params.columnNumber < 0) {
      throw new Error('columnNumber must be a non-negative number');
    }

    try {
      // 调用CDP API设置断点
      const result = await this.cdpSession.send('Debugger.setBreakpointByUrl', {
        url: params.url,
        lineNumber: params.lineNumber,
        columnNumber: params.columnNumber,
        condition: params.condition,
      });

      // 创建断点信息
      const breakpointInfo: BreakpointInfo = {
        breakpointId: result.breakpointId,
        location: {
          url: params.url,
          lineNumber: params.lineNumber,
          columnNumber: params.columnNumber,
        },
        condition: params.condition,
        enabled: true,
        hitCount: 0,
        createdAt: Date.now(),
      };

      // 保存断点信息
      this.breakpoints.set(result.breakpointId, breakpointInfo);

      logger.info(`Breakpoint set: ${params.url}:${params.lineNumber}`, {
        breakpointId: result.breakpointId,
        condition: params.condition,
      });

      return breakpointInfo;
    } catch (error) {
      logger.error('Failed to set breakpoint:', error);
      throw error;
    }
  }

  /**
   * 按脚本ID设置断点
   */
  async setBreakpoint(params: {
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
    condition?: string;
  }): Promise<BreakpointInfo> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error(
        'Debugger is not enabled. Call init() or enable() first.',
      );
    }

    // ✅ 参数验证
    if (!params.scriptId) {
      throw new Error('scriptId parameter is required');
    }

    if (params.lineNumber < 0) {
      throw new Error('lineNumber must be a non-negative number');
    }

    if (params.columnNumber !== undefined && params.columnNumber < 0) {
      throw new Error('columnNumber must be a non-negative number');
    }

    try {
      const result = await this.cdpSession.send('Debugger.setBreakpoint', {
        location: {
          scriptId: params.scriptId,
          lineNumber: params.lineNumber,
          columnNumber: params.columnNumber,
        },
        condition: params.condition,
      });

      const breakpointInfo: BreakpointInfo = {
        breakpointId: result.breakpointId,
        location: {
          scriptId: params.scriptId,
          lineNumber: params.lineNumber,
          columnNumber: params.columnNumber,
        },
        condition: params.condition,
        enabled: true,
        hitCount: 0,
        createdAt: Date.now(),
      };

      this.breakpoints.set(result.breakpointId, breakpointInfo);

      logger.info(
        `Breakpoint set: scriptId=${params.scriptId}:${params.lineNumber}`,
        {
          breakpointId: result.breakpointId,
        },
      );

      return breakpointInfo;
    } catch (error) {
      logger.error('Failed to set breakpoint:', error);
      throw error;
    }
  }

  /**
   * 删除断点
   */
  async removeBreakpoint(breakpointId: string): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error(
        'Debugger is not enabled. Call init() or enable() first.',
      );
    }

    // ✅ 参数验证
    if (!breakpointId) {
      throw new Error('breakpointId parameter is required');
    }

    if (!this.breakpoints.has(breakpointId)) {
      throw new Error(
        `Breakpoint not found: ${breakpointId}. Use listBreakpoints() to see active breakpoints.`,
      );
    }

    try {
      await this.cdpSession.send('Debugger.removeBreakpoint', {breakpointId});
      this.breakpoints.delete(breakpointId);

      logger.info(`Breakpoint removed: ${breakpointId}`);
    } catch (error) {
      logger.error(`Failed to remove breakpoint ${breakpointId}:`, error);
      throw error;
    }
  }

  /**
   * 列出所有断点
   */
  listBreakpoints(): BreakpointInfo[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * 获取断点信息
   */
  getBreakpoint(breakpointId: string): BreakpointInfo | undefined {
    return this.breakpoints.get(breakpointId);
  }

  /**
   * 清除所有断点
   */
  async clearAllBreakpoints(): Promise<void> {
    const breakpointIds = Array.from(this.breakpoints.keys());

    for (const id of breakpointIds) {
      await this.removeBreakpoint(id);
    }

    logger.info(`Cleared ${breakpointIds.length} breakpoints`);
  }

  /**
   * 设置异常断点（在异常时暂停）
   */
  async setPauseOnExceptions(
    state: 'none' | 'uncaught' | 'all',
  ): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    try {
      await this.cdpSession.send('Debugger.setPauseOnExceptions', {state});
      this.pauseOnExceptionsState = state; // ✨ 跟踪状态
      logger.info(`Pause on exceptions set to: ${state}`);
    } catch (error) {
      logger.error('Failed to set pause on exceptions:', error);
      throw error;
    }
  }

  /**
   * 获取当前异常断点状态
   */
  getPauseOnExceptionsState(): 'none' | 'uncaught' | 'all' {
    return this.pauseOnExceptionsState;
  }

  // ==================== 执行控制 ====================

  /**
   * 暂停执行（在下一个语句处暂停）
   */
  async pause(): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    try {
      await this.cdpSession.send('Debugger.pause');
      logger.info('Execution paused');
    } catch (error) {
      logger.error('Failed to pause execution:', error);
      throw error;
    }
  }

  /**
   * 继续执行
   */
  async resume(): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    try {
      await this.cdpSession.send('Debugger.resume');
      logger.info('Execution resumed');
    } catch (error) {
      logger.error('Failed to resume execution:', error);
      throw error;
    }
  }

  /**
   * 单步进入（Step Into）
   */
  async stepInto(): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    try {
      await this.cdpSession.send('Debugger.stepInto');
      logger.info('Step into');
    } catch (error) {
      logger.error('Failed to step into:', error);
      throw error;
    }
  }

  /**
   * 单步跳过（Step Over）
   */
  async stepOver(): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    try {
      await this.cdpSession.send('Debugger.stepOver');
      logger.info('Step over');
    } catch (error) {
      logger.error('Failed to step over:', error);
      throw error;
    }
  }

  /**
   * 单步跳出（Step Out）
   */
  async stepOut(): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    try {
      await this.cdpSession.send('Debugger.stepOut');
      logger.info('Step out');
    } catch (error) {
      logger.error('Failed to step out:', error);
      throw error;
    }
  }

  // ==================== 暂停状态管理 ====================

  /**
   * 获取当前暂停状态
   */
  getPausedState(): PausedState | null {
    return this.pausedState;
  }

  /**
   * 检查是否处于暂停状态
   */
  isPaused(): boolean {
    return this.pausedState !== null;
  }

  /**
   * 等待暂停事件（用于异步等待断点触发）
   */
  async waitForPaused(timeout = 30000): Promise<PausedState> {
    if (this.pausedState) {
      return this.pausedState;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.pausedResolvers.indexOf(resolve);
        if (index > -1) {
          this.pausedResolvers.splice(index, 1);
        }
        reject(new Error('Timeout waiting for paused event'));
      }, timeout);

      this.pausedResolvers.push(state => {
        clearTimeout(timer);
        resolve(state);
      });
    });
  }

  /**
   * 在调用帧上求值表达式
   */
  async evaluateOnCallFrame(params: {
    callFrameId: string;
    expression: string;
    returnByValue?: boolean;
  }): Promise<any> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    if (!this.pausedState) {
      throw new Error('Not in paused state');
    }

    try {
      const result = await this.cdpSession.send(
        'Debugger.evaluateOnCallFrame',
        {
          callFrameId: params.callFrameId,
          expression: params.expression,
          returnByValue: params.returnByValue !== false,
        },
      );

      logger.info(`Evaluated on call frame: ${params.expression}`, {
        result: result.result.value,
      });

      return result.result;
    } catch (error) {
      logger.error('Failed to evaluate on call frame:', error);
      throw error;
    }
  }

  // ==================== ✨ 作用域变量获取（增强版） ====================

  /**
   * 获取指定调用帧的作用域变量
   *
   * @param options 获取选项
   * @returns 作用域变量列表和错误信息
   */
  async getScopeVariables(
    options: GetScopeVariablesOptions = {},
  ): Promise<GetScopeVariablesResult> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error('Debugger not enabled');
    }

    if (!this.pausedState) {
      throw new Error(
        'Not in paused state. Use pause() or set a breakpoint first.',
      );
    }

    const {
      callFrameId,
      includeObjectProperties = false,
      maxDepth = 1,
      skipErrors = true,
    } = options;

    try {
      // 获取目标调用帧
      const targetFrame = callFrameId
        ? this.pausedState.callFrames.find(f => f.callFrameId === callFrameId)
        : this.pausedState.callFrames[0]; // 默认使用顶层帧

      if (!targetFrame) {
        throw new Error(`Call frame not found: ${callFrameId || 'top frame'}`);
      }

      const variables: ScopeVariable[] = [];
      const errors: Array<{scope: string; error: string}> = [];
      let successfulScopes = 0;

      // 遍历作用域链
      for (const scope of targetFrame.scopeChain) {
        try {
          // 获取作用域对象的属性
          if (scope.object.objectId) {
            const properties = await this.cdpSession.send(
              'Runtime.getProperties',
              {
                objectId: scope.object.objectId,
                ownProperties: true,
              },
            );

            // 处理每个属性
            for (const prop of properties.result) {
              if (prop.name === '__proto__') continue; // 跳过原型

              const variable: ScopeVariable = {
                name: prop.name,
                value: prop.value?.value,
                type: prop.value?.type || 'unknown',
                scope: scope.type,
                writable: prop.writable,
                configurable: prop.configurable,
                enumerable: prop.enumerable,
                objectId: prop.value?.objectId,
              };

              variables.push(variable);

              // 如果需要展开对象属性
              if (
                includeObjectProperties &&
                prop.value?.objectId &&
                maxDepth > 0
              ) {
                try {
                  const nestedProps = await this.getObjectProperties(
                    prop.value.objectId,
                    maxDepth - 1,
                  );
                  // 将嵌套属性添加到变量中（可以用特殊格式表示层级）
                  for (const nested of nestedProps) {
                    variables.push({
                      ...nested,
                      name: `${prop.name}.${nested.name}`,
                      scope: scope.type,
                    });
                  }
                } catch (nestedError) {
                  // 忽略嵌套属性获取失败
                  logger.debug(
                    `Failed to get nested properties for ${prop.name}:`,
                    nestedError,
                  );
                }
              }
            }

            successfulScopes++;
          }
        } catch (error: any) {
          const errorMsg = error.message || String(error);

          // ✅ 增强错误处理：记录错误但不中断流程
          logger.warn(
            `Failed to get properties for scope ${scope.type}:`,
            errorMsg,
          );

          errors.push({
            scope: scope.type,
            error: errorMsg,
          });

          // 如果不跳过错误，则抛出异常
          if (!skipErrors) {
            throw error;
          }
        }
      }

      const result: GetScopeVariablesResult = {
        success: true,
        variables,
        callFrameId: targetFrame.callFrameId,
        callFrameInfo: {
          functionName: targetFrame.functionName || '(anonymous)',
          location: `${targetFrame.url}:${targetFrame.location.lineNumber}:${targetFrame.location.columnNumber}`,
        },
        totalScopes: targetFrame.scopeChain.length,
        successfulScopes,
      };

      // 如果有错误，添加到结果中
      if (errors.length > 0) {
        result.errors = errors;
      }

      logger.info(
        `Got ${variables.length} variables from ${successfulScopes}/${targetFrame.scopeChain.length} scopes`,
        {
          callFrameId: targetFrame.callFrameId,
          functionName: targetFrame.functionName,
          errors: errors.length,
        },
      );

      return result;
    } catch (error) {
      logger.error('Failed to get scope variables:', error);
      throw error;
    }
  }

  /**
   * 递归获取对象属性（用于展开嵌套对象）
   */
  private async getObjectProperties(
    objectId: string,
    maxDepth: number,
  ): Promise<ScopeVariable[]> {
    if (maxDepth <= 0 || !this.cdpSession) {
      return [];
    }

    try {
      const properties = await this.cdpSession.send('Runtime.getProperties', {
        objectId,
        ownProperties: true,
      });

      const variables: ScopeVariable[] = [];

      for (const prop of properties.result) {
        if (prop.name === '__proto__') continue;

        variables.push({
          name: prop.name,
          value: prop.value?.value,
          type: prop.value?.type || 'unknown',
          scope: 'local', // 嵌套属性默认标记为 local
          objectId: prop.value?.objectId,
        });
      }

      return variables;
    } catch (error) {
      logger.debug(`Failed to get object properties for ${objectId}:`, error);
      return [];
    }
  }

  // ==================== ✨ 断点命中回调管理 ====================

  /**
   * 注册断点命中回调
   */
  onBreakpointHit(callback: BreakpointHitCallback): void {
    this.breakpointHitCallbacks.add(callback);
    logger.info('Breakpoint hit callback registered', {
      totalCallbacks: this.breakpointHitCallbacks.size,
    });
  }

  /**
   * 移除断点命中回调
   */
  offBreakpointHit(callback: BreakpointHitCallback): void {
    this.breakpointHitCallbacks.delete(callback);
    logger.info('Breakpoint hit callback removed', {
      totalCallbacks: this.breakpointHitCallbacks.size,
    });
  }

  /**
   * 清除所有断点命中回调
   */
  clearBreakpointHitCallbacks(): void {
    this.breakpointHitCallbacks.clear();
    logger.info('All breakpoint hit callbacks cleared');
  }

  /**
   * 获取当前注册的回调数量
   */
  getBreakpointHitCallbackCount(): number {
    return this.breakpointHitCallbacks.size;
  }

  // ==================== 事件处理 ====================

  /**
   * 处理暂停事件（增强版 - 支持断点命中回调）
   */
  private async handlePaused(params: any): Promise<void> {
    this.pausedState = {
      callFrames: params.callFrames,
      reason: params.reason,
      data: params.data,
      hitBreakpoints: params.hitBreakpoints,
      timestamp: Date.now(),
    };

    // 更新断点命中次数
    if (params.hitBreakpoints) {
      for (const breakpointId of params.hitBreakpoints) {
        const bp = this.breakpoints.get(breakpointId);
        if (bp) {
          bp.hitCount++;
        }
      }
    }

    logger.info('Execution paused', {
      reason: params.reason,
      location: params.callFrames[0]?.location,
      hitBreakpoints: params.hitBreakpoints,
    });

    // 先通知 waitForPaused() 的等待者（不应被回调阻塞）
    for (const resolver of this.pausedResolvers) {
      resolver(this.pausedState);
    }
    this.pausedResolvers = [];

    // ✨ 异步触发断点命中回调（不阻塞 paused 事件处理）
    if (
      params.hitBreakpoints &&
      params.hitBreakpoints.length > 0 &&
      this.breakpointHitCallbacks.size > 0
    ) {
      // 使用 queueMicrotask 确保回调不阻塞事件循环
      const callbacks = Array.from(this.breakpointHitCallbacks);
      const hitBreakpoints = params.hitBreakpoints;
      const topFrame = params.callFrames[0];

      (async () => {
        // 尝试自动获取顶层作用域变量
        let variables: ScopeVariable[] | undefined;
        try {
          const result = await this.getScopeVariables({skipErrors: true});
          variables = result.variables;
        } catch (error) {
          logger.debug(
            'Failed to auto-fetch variables for breakpoint hit callback:',
            error,
          );
        }

        // 构建事件对象
        const event: BreakpointHitEvent = {
          breakpointId: hitBreakpoints[0],
          breakpointInfo: this.breakpoints.get(hitBreakpoints[0]),
          location: {
            scriptId: topFrame.location.scriptId,
            lineNumber: topFrame.location.lineNumber,
            columnNumber: topFrame.location.columnNumber,
            url: topFrame.url,
          },
          callFrames: params.callFrames,
          timestamp: Date.now(),
          variables,
          reason: params.reason,
        };

        for (const callback of callbacks) {
          try {
            await Promise.resolve(callback(event));
          } catch (error) {
            logger.error('Breakpoint hit callback error:', error);
          }
        }
      })().catch(error => {
        logger.error('Breakpoint hit callback pipeline error:', error);
      });
    }
  }

  /**
   * 处理恢复事件
   */
  private handleResumed(): void {
    this.pausedState = null;
    logger.info('Execution resumed');
  }

  /**
   * 处理断点解析事件
   */
  private handleBreakpointResolved(params: any): void {
    const bp = this.breakpoints.get(params.breakpointId);
    if (bp) {
      logger.info('Breakpoint resolved', {
        breakpointId: params.breakpointId,
        location: params.location,
      });
    }
  }

  // ==================== ✨ 调试会话保存/恢复 ====================

  /**
   * 导出当前调试会话为 JSON 对象
   */
  exportSession(metadata?: DebuggerSession['metadata']): DebuggerSession {
    const session: DebuggerSession = {
      version: '1.0',
      timestamp: Date.now(),
      breakpoints: Array.from(this.breakpoints.values()).map(bp => ({
        location: {
          scriptId: bp.location.scriptId,
          url: bp.location.url,
          lineNumber: bp.location.lineNumber,
          columnNumber: bp.location.columnNumber,
        },
        condition: bp.condition,
        enabled: bp.enabled,
      })),
      pauseOnExceptions: this.pauseOnExceptionsState,
      metadata: metadata || {},
    };

    logger.info('Session exported', {
      breakpointCount: session.breakpoints.length,
      pauseOnExceptions: session.pauseOnExceptions,
    });

    return session;
  }

  /**
   * 保存调试会话到文件
   *
   * @param filePath 保存路径（可选，默认保存到 ./debugger-sessions/session-{timestamp}.json）
   * @param metadata 会话元数据
   * @returns 保存的文件路径
   */
  async saveSession(
    filePath?: string,
    metadata?: DebuggerSession['metadata'],
  ): Promise<string> {
    const session = this.exportSession(metadata);

    // 如果未指定路径，使用默认路径
    if (!filePath) {
      const sessionsDir = this.getDefaultSessionsDir();
      await fs.mkdir(sessionsDir, {recursive: true});
      filePath = path.join(sessionsDir, `session-${Date.now()}.json`);
    } else {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, {recursive: true});
    }

    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');

    logger.info(`Session saved to ${filePath}`, {
      breakpointCount: session.breakpoints.length,
    });

    return filePath;
  }

  /**
   * 从文件加载调试会话
   *
   * @param filePath 会话文件路径
   */
  async loadSessionFromFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const session: DebuggerSession = JSON.parse(content);

    await this.importSession(session);

    logger.info(`Session loaded from ${filePath}`, {
      breakpointCount: session.breakpoints.length,
    });
  }

  /**
   * 导入调试会话（从 JSON 对象或字符串）
   *
   * @param sessionData 会话数据（JSON 对象或字符串）
   */
  async importSession(sessionData: DebuggerSession | string): Promise<void> {
    if (!this.enabled) {
      throw new Error(
        'Debugger must be enabled before importing session. Call init() or enable() first.',
      );
    }

    const session: DebuggerSession =
      typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;

    // 验证会话版本
    if (session.version !== '1.0') {
      logger.warn(
        `Session version mismatch: ${session.version} (expected 1.0)`,
      );
    }

    logger.info('Importing session...', {
      breakpointCount: session.breakpoints.length,
      pauseOnExceptions: session.pauseOnExceptions,
      timestamp: new Date(session.timestamp).toISOString(),
    });

    // 清除现有断点
    await this.clearAllBreakpoints();

    // 恢复断点
    let successCount = 0;
    let failCount = 0;

    for (const bp of session.breakpoints) {
      try {
        if (bp.location.url) {
          // URL 断点
          await this.setBreakpointByUrl({
            url: bp.location.url,
            lineNumber: bp.location.lineNumber,
            columnNumber: bp.location.columnNumber,
            condition: bp.condition,
          });
          successCount++;
        } else if (bp.location.scriptId) {
          // scriptId 断点
          await this.setBreakpoint({
            scriptId: bp.location.scriptId,
            lineNumber: bp.location.lineNumber,
            columnNumber: bp.location.columnNumber,
            condition: bp.condition,
          });
          successCount++;
        } else {
          logger.warn('Breakpoint has neither url nor scriptId, skipping', bp);
          failCount++;
        }
      } catch (error) {
        logger.error('Failed to restore breakpoint:', error, bp);
        failCount++;
      }
    }

    // 恢复异常断点设置
    if (session.pauseOnExceptions) {
      await this.setPauseOnExceptions(session.pauseOnExceptions);
    }

    logger.info('Session imported', {
      totalBreakpoints: session.breakpoints.length,
      successCount,
      failCount,
      pauseOnExceptions: session.pauseOnExceptions,
    });
  }

  /**
   * 列出所有已保存的会话文件
   */
  async listSavedSessions(): Promise<
    Array<{path: string; timestamp: number; metadata?: any}>
  > {
    const sessionsDir = this.getDefaultSessionsDir();

    try {
      await fs.access(sessionsDir);
    } catch {
      // 目录不存在
      return [];
    }

    const files = await fs.readdir(sessionsDir);
    const sessions: Array<{path: string; timestamp: number; metadata?: any}> =
      [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(sessionsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const session: DebuggerSession = JSON.parse(content);
          sessions.push({
            path: filePath,
            timestamp: session.timestamp,
            metadata: session.metadata,
          });
        } catch (error) {
          logger.warn(`Failed to read session file ${file}:`, error);
        }
      }
    }

    // 按时间戳降序排序
    sessions.sort((a, b) => b.timestamp - a.timestamp);

    return sessions;
  }

  /**
   * 关闭调试器
   */
  async close(): Promise<void> {
    // disable() 内部已处理 detach 和状态清理，无需重复操作
    if (this.enabled) {
      await this.disable();
    }

    // 仅在 disable() 未能清理时兜底
    if (this.cdpSession) {
      try {
        await this.cdpSession.detach();
      } catch (e) {
        logger.warn('Failed to detach CDP session in close():', e);
      }
      this.cdpSession = null;
    }

    this.breakpointHitCallbacks.clear();
    logger.info('Debugger manager closed');
  }
}
