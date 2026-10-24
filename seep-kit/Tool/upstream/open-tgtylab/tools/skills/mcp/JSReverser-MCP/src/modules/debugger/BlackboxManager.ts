/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * BlackboxManager - 黑盒化管理
 *
 * 功能：
 * 1. 黑盒化脚本（按 URL 模式）
 * 2. 单步调试时自动跳过黑盒化的代码
 * 3. 调用栈中隐藏黑盒化的帧
 *
 * 设计原则：
 * - 使用 CDP Debugger.setBlackboxPatterns
 * - 提供常用库的预定义黑盒化规则
 * - 支持自定义模式
 */

import type {CDPSession} from 'puppeteer-core';

import {logger} from '../../utils/logger.js';

/**
 * 黑盒化管理器
 *
 * 🔧 重构：使用共享的 CDP session，不再创建独立 session
 */
export class BlackboxManager {
  private blackboxedPatterns = new Set<string>();

  // 预定义的常用库模式（CDP Debugger.setBlackboxPatterns 要求正则表达式）
  static readonly COMMON_LIBRARY_PATTERNS = [
    '.*jquery.*\\.js',
    '.*react.*\\.js',
    '.*react-dom.*\\.js',
    '.*vue.*\\.js',
    '.*angular.*\\.js',
    '.*lodash.*\\.js',
    '.*underscore.*\\.js',
    '.*moment.*\\.js',
    '.*axios.*\\.js',
    '.*node_modules/.*',
    '.*webpack.*',
    '.*bundle.*\\.js',
    '.*vendor.*\\.js',
  ];

  /**
   * @param cdpSession 共享的 CDP Session（由 DebuggerManager 提供）
   */
  constructor(private cdpSession: CDPSession) {
    logger.info('BlackboxManager initialized with shared CDP session');
  }

  /**
   * 黑盒化脚本（按 URL 模式）
   *
   * @param urlPattern URL 模式（支持通配符 *）
   */
  async blackboxByPattern(urlPattern: string): Promise<void> {
    this.blackboxedPatterns.add(urlPattern);

    try {
      // 调用 CDP API 设置黑盒化模式
      await this.cdpSession.send('Debugger.setBlackboxPatterns', {
        patterns: Array.from(this.blackboxedPatterns),
      });

      logger.info(`Blackboxed pattern: ${urlPattern}`);
    } catch (error) {
      logger.error('Failed to set blackbox pattern:', error);
      this.blackboxedPatterns.delete(urlPattern);
      throw error;
    }
  }

  /**
   * 取消黑盒化
   */
  async unblackboxByPattern(urlPattern: string): Promise<boolean> {
    const deleted = this.blackboxedPatterns.delete(urlPattern);
    if (!deleted) {
      return false;
    }

    try {
      await this.cdpSession.send('Debugger.setBlackboxPatterns', {
        patterns: Array.from(this.blackboxedPatterns),
      });

      logger.info(`Unblackboxed pattern: ${urlPattern}`);
      return true;
    } catch (error) {
      logger.error('Failed to remove blackbox pattern:', error);
      this.blackboxedPatterns.add(urlPattern);
      throw error;
    }
  }

  /**
   * 黑盒化所有常用库
   */
  async blackboxCommonLibraries(): Promise<void> {
    for (const pattern of BlackboxManager.COMMON_LIBRARY_PATTERNS) {
      this.blackboxedPatterns.add(pattern);
    }

    try {
      await this.cdpSession.send('Debugger.setBlackboxPatterns', {
        patterns: Array.from(this.blackboxedPatterns),
      });

      logger.info(
        `Blackboxed ${BlackboxManager.COMMON_LIBRARY_PATTERNS.length} common library patterns`,
      );
    } catch (error) {
      logger.error('Failed to blackbox common libraries:', error);
      throw error;
    }
  }

  /**
   * 获取所有黑盒化模式
   */
  getAllBlackboxedPatterns(): string[] {
    return Array.from(this.blackboxedPatterns);
  }

  /**
   * 清除所有黑盒化模式
   */
  async clearAllBlackboxedPatterns(): Promise<void> {
    this.blackboxedPatterns.clear();

    try {
      await this.cdpSession.send('Debugger.setBlackboxPatterns', {
        patterns: [],
      });

      logger.info('All blackbox patterns cleared');
    } catch (error) {
      logger.error('Failed to clear blackbox patterns:', error);
      throw error;
    }
  }

  /**
   * 🆕 关闭并清理资源
   */
  async close(): Promise<void> {
    try {
      await this.clearAllBlackboxedPatterns();
      logger.info('BlackboxManager closed');
    } catch (error) {
      logger.error('Failed to close BlackboxManager:', error);
      throw error;
    }
  }
}
