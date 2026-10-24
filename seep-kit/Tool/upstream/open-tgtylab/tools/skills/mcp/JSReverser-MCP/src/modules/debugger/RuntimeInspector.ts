/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * RuntimeInspector - 运行时检查
 *
 * 功能：
 * 1. 获取调用堆栈（Call Stack）
 * 2. 获取作用域变量（Scope Variables）
 * 3. 获取对象属性（Object Properties）
 * 4. 表达式求值（Expression Evaluation）
 *
 * 设计原则：
 * - 薄封装CDP Runtime域，直接调用CDP API
 * - 依赖DebuggerManager获取暂停状态
 * - 提供友好的数据格式化
 */

import type {CDPSession} from 'puppeteer-core';

import {logger} from '../../utils/logger.js';
import type {CodeCollector} from '../collector/CodeCollector.js';

import type {DebuggerManager, CallFrame, Scope} from './DebuggerManager.js';

/**
 * 变量信息
 */
export interface VariableInfo {
  name: string;
  value: any;
  type: string;
  objectId?: string;
  className?: string;
  description?: string;
}

/**
 * 作用域变量
 */
export interface ScopeVariables {
  scopeType: string;
  scopeName?: string;
  variables: VariableInfo[];
}

/**
 * 调用堆栈信息
 */
export interface CallStackInfo {
  callFrames: Array<{
    callFrameId: string;
    functionName: string;
    location: {
      scriptId: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    };
    scopeChain: Array<{
      type: string;
      name?: string;
    }>;
  }>;
  reason: string;
  timestamp: number;
}

/**
 * 运行时检查器
 */
export class RuntimeInspector {
  private cdpSession: CDPSession | null = null;
  private enabled = false;

  constructor(
    private collector: CodeCollector,
    private debuggerManager: DebuggerManager,
  ) {}

  /**
   * 初始化运行时检查器（启用CDP Runtime域）
   */
  async init(): Promise<void> {
    if (this.enabled) {
      logger.warn('Runtime inspector already enabled');
      return;
    }

    try {
      const page = await this.collector.getActivePage();
      // ✅ 修复：使用新的API，避免弃用警告
      this.cdpSession = await page.createCDPSession();

      // 启用Runtime域
      await this.cdpSession.send('Runtime.enable');
      this.enabled = true;

      logger.info('Runtime inspector enabled');
    } catch (error) {
      logger.error('Failed to enable runtime inspector:', error);
      throw error;
    }
  }

  /**
   * 启用运行时检查器（别名方法，与其他模块保持一致）
   */
  async enable(): Promise<void> {
    return this.init();
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.enabled;
  }

  /**
   * 🆕 启用异步堆栈追踪（委托给 DebuggerManager，因为需要 Debugger 域）
   *
   * @param maxDepth 最大异步堆栈深度（默认 32）
   */
  async enableAsyncStackTraces(maxDepth = 32): Promise<void> {
    if (!this.debuggerManager.isEnabled()) {
      throw new Error(
        'Debugger is not enabled. Call debuggerManager.enable() first.',
      );
    }

    try {
      await this.debuggerManager.setAsyncCallStackDepth(maxDepth);
      logger.info(`Async stack traces enabled with max depth: ${maxDepth}`);
    } catch (error) {
      logger.error('Failed to enable async stack traces:', error);
      throw error;
    }
  }

  /**
   * 🆕 禁用异步堆栈追踪
   */
  async disableAsyncStackTraces(): Promise<void> {
    if (!this.debuggerManager.isEnabled()) {
      throw new Error('Debugger is not enabled');
    }

    try {
      await this.debuggerManager.setAsyncCallStackDepth(0);
      logger.info('Async stack traces disabled');
    } catch (error) {
      logger.error('Failed to disable async stack traces:', error);
      throw error;
    }
  }

  /**
   * 禁用运行时检查器
   */
  async disable(): Promise<void> {
    if (!this.enabled || !this.cdpSession) {
      logger.warn('Runtime inspector not enabled');
      return;
    }

    try {
      await this.cdpSession.send('Runtime.disable');
      this.enabled = false;

      // ✅ Detach CDP session
      await this.cdpSession.detach();
      this.cdpSession = null;

      logger.info('Runtime inspector disabled and cleaned up');
    } catch (error) {
      logger.error('Failed to disable runtime inspector:', error);
      throw error;
    }
  }

  // ==================== 调用堆栈 ====================

  /**
   * 获取当前调用堆栈
   */
  async getCallStack(): Promise<CallStackInfo | null> {
    const pausedState = this.debuggerManager.getPausedState();

    if (!pausedState) {
      logger.warn('Not in paused state, cannot get call stack');
      return null;
    }

    try {
      const callStackInfo: CallStackInfo = {
        callFrames: pausedState.callFrames.map((frame: CallFrame) => ({
          callFrameId: frame.callFrameId,
          functionName: frame.functionName || '(anonymous)',
          location: {
            scriptId: frame.location.scriptId,
            url: frame.url,
            lineNumber: frame.location.lineNumber,
            columnNumber: frame.location.columnNumber,
          },
          scopeChain: frame.scopeChain.map((scope: Scope) => ({
            type: scope.type,
            name: scope.name,
          })),
        })),
        reason: pausedState.reason,
        timestamp: pausedState.timestamp,
      };

      logger.info('Call stack retrieved', {
        frameCount: callStackInfo.callFrames.length,
        topFrame: callStackInfo.callFrames[0]?.functionName,
      });

      return callStackInfo;
    } catch (error) {
      logger.error('Failed to get call stack:', error);
      throw error;
    }
  }

  // ==================== 作用域变量 ====================

  /**
   * 获取指定调用帧的所有作用域变量
   */
  async getScopeVariables(callFrameId: string): Promise<ScopeVariables[]> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error(
        'Runtime inspector is not enabled. Call init() or enable() first.',
      );
    }

    if (!callFrameId) {
      throw new Error('callFrameId parameter is required');
    }

    const pausedState = this.debuggerManager.getPausedState();
    if (!pausedState) {
      throw new Error(
        'Not in paused state. Debugger must be paused to get scope variables.',
      );
    }

    // 查找指定的调用帧
    const callFrame = pausedState.callFrames.find(
      (frame: CallFrame) => frame.callFrameId === callFrameId,
    );

    if (!callFrame) {
      throw new Error(
        `Call frame not found: ${callFrameId}. Use getCallStack() to see available frames.`,
      );
    }

    try {
      const scopeVariablesList: ScopeVariables[] = [];

      // 遍历所有作用域
      for (const scope of callFrame.scopeChain) {
        if (!scope.object.objectId) {
          continue;
        }

        // 获取作用域对象的属性
        const properties = await this.getObjectProperties(
          scope.object.objectId,
        );

        scopeVariablesList.push({
          scopeType: scope.type,
          scopeName: scope.name,
          variables: properties,
        });
      }

      logger.info(`Scope variables retrieved for call frame ${callFrameId}`, {
        scopeCount: scopeVariablesList.length,
      });

      return scopeVariablesList;
    } catch (error) {
      logger.error('Failed to get scope variables:', error);
      throw error;
    }
  }

  /**
   * 获取当前调用帧的所有作用域变量（便捷方法）
   */
  async getCurrentScopeVariables(): Promise<ScopeVariables[]> {
    const pausedState = this.debuggerManager.getPausedState();

    if (!pausedState || pausedState.callFrames.length === 0) {
      throw new Error('Not in paused state or no call frames');
    }

    const topFrame = pausedState.callFrames[0];
    if (!topFrame) {
      throw new Error('No top frame available');
    }

    return await this.getScopeVariables(topFrame.callFrameId);
  }

  // ==================== 对象属性 ====================

  /**
   * 获取对象的所有属性
   */
  async getObjectProperties(objectId: string): Promise<VariableInfo[]> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error(
        'Runtime inspector is not enabled. Call init() or enable() first.',
      );
    }

    if (!objectId) {
      throw new Error('objectId parameter is required');
    }

    try {
      const result = await this.cdpSession.send('Runtime.getProperties', {
        objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: true,
      });

      const variables: VariableInfo[] = [];

      for (const prop of result.result) {
        if (!prop.value) {
          continue;
        }

        variables.push({
          name: prop.name,
          value: this.formatValue(prop.value),
          type: prop.value.type,
          objectId: prop.value.objectId,
          className: prop.value.className,
          description: prop.value.description,
        });
      }

      logger.info(`Object properties retrieved: ${objectId}`, {
        propertyCount: variables.length,
      });

      return variables;
    } catch (error) {
      logger.error('Failed to get object properties:', error);
      throw error;
    }
  }

  // ==================== 表达式求值 ====================

  /**
   * 在当前调用帧上求值表达式
   */
  async evaluate(expression: string, callFrameId?: string): Promise<any> {
    // ✅ 参数验证
    if (!expression || expression.trim() === '') {
      throw new Error('expression parameter is required and cannot be empty');
    }

    const pausedState = this.debuggerManager.getPausedState();

    if (!pausedState) {
      throw new Error(
        'Not in paused state. Use evaluateGlobal() for global context evaluation.',
      );
    }

    // 如果没有指定callFrameId，使用顶层调用帧
    const targetCallFrameId =
      callFrameId || pausedState.callFrames[0]?.callFrameId;

    if (!targetCallFrameId) {
      throw new Error('No call frame available for evaluation');
    }

    try {
      const result = await this.debuggerManager.evaluateOnCallFrame({
        callFrameId: targetCallFrameId,
        expression,
        returnByValue: true,
      });

      logger.info(`Expression evaluated: ${expression}`, {
        result: result.value,
      });

      return this.formatValue(result);
    } catch (error) {
      logger.error('Failed to evaluate expression:', error);
      throw error;
    }
  }

  /**
   * 在全局上下文中求值表达式（不需要暂停状态）
   */
  async evaluateGlobal(expression: string): Promise<any> {
    if (!this.enabled || !this.cdpSession) {
      throw new Error(
        'Runtime inspector is not enabled. Call init() or enable() first.',
      );
    }

    // ✅ 参数验证
    if (!expression || expression.trim() === '') {
      throw new Error('expression parameter is required and cannot be empty');
    }

    try {
      const result = await this.cdpSession.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      });

      logger.info(`Global expression evaluated: ${expression}`, {
        result: result.result.value,
      });

      return this.formatValue(result.result);
    } catch (error) {
      logger.error('Failed to evaluate global expression:', error);
      throw error;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 格式化值（将CDP的RemoteObject转换为友好格式）
   */
  private formatValue(remoteObject: any): any {
    if (remoteObject.type === 'undefined') {
      return undefined;
    }

    if (remoteObject.type === 'object' && remoteObject.subtype === 'null') {
      return null;
    }

    if (remoteObject.value !== undefined) {
      return remoteObject.value;
    }

    if (remoteObject.description) {
      return remoteObject.description;
    }

    return `[${remoteObject.type}]`;
  }

  /**
   * 关闭运行时检查器
   */
  async close(): Promise<void> {
    // disable() 内部已处理 detach 和状态清理
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

    logger.info('Runtime inspector closed');
  }
}
