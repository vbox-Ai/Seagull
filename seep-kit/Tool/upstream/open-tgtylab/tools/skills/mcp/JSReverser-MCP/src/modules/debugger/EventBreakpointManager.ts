/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * EventBreakpointManager - 事件监听器断点管理
 *
 * 功能：
 * 1. 设置事件监听器断点（按事件类型）
 * 2. 在事件触发时暂停执行
 * 3. 支持预定义的事件类别（鼠标、键盘、定时器等）
 *
 * 设计原则：
 * - 使用 CDP DOMDebugger.setEventListenerBreakpoint
 * - 提供常用事件类别的快捷方法
 * - 支持自定义事件名称
 */

import type {CDPSession} from 'puppeteer-core';

import {logger} from '../../utils/logger.js';

/**
 * 事件断点信息
 */
export interface EventBreakpoint {
  id: string;
  eventName: string;
  targetName?: string;
  enabled: boolean;
  hitCount: number;
  createdAt: number;
}

/**
 * 事件断点管理器
 *
 * 🔧 重构：使用共享的 CDP session，不再创建独立 session
 */
export class EventBreakpointManager {
  private eventBreakpoints = new Map<string, EventBreakpoint>();
  private breakpointCounter = 0;

  // 预定义的事件类别
  static readonly MOUSE_EVENTS = [
    'click',
    'dblclick',
    'mousedown',
    'mouseup',
    'mousemove',
    'mouseenter',
    'mouseleave',
  ];
  static readonly KEYBOARD_EVENTS = ['keydown', 'keyup', 'keypress'];
  // Timer 使用 Instrumentation Breakpoint（非 DOM 事件）
  static readonly TIMER_INSTRUMENTATION_EVENTS = [
    'TimerInstall',
    'TimerFire',
    'AnimationFrameFired',
  ];
  static readonly WEBSOCKET_EVENTS = ['message', 'open', 'close', 'error'];

  /**
   * @param cdpSession 共享的 CDP Session（由 DebuggerManager 提供）
   */
  constructor(private cdpSession: CDPSession) {
    logger.info('EventBreakpointManager initialized with shared CDP session');
  }

  /**
   * 设置事件监听器断点
   *
   * @param eventName 事件名称（如 'click', 'setTimeout'）
   * @param targetName 可选的目标名称
   */
  async setEventListenerBreakpoint(
    eventName: string,
    targetName?: string,
  ): Promise<string> {
    try {
      // 调用 CDP API 设置事件监听器断点
      await this.cdpSession.send('DOMDebugger.setEventListenerBreakpoint', {
        eventName,
        targetName,
      });

      // 创建断点信息
      const breakpointId = `event_${++this.breakpointCounter}`;
      this.eventBreakpoints.set(breakpointId, {
        id: breakpointId,
        eventName,
        targetName,
        enabled: true,
        hitCount: 0,
        createdAt: Date.now(),
      });

      logger.info(`Event listener breakpoint set: ${eventName}`, {
        breakpointId,
        targetName,
      });
      return breakpointId;
    } catch (error) {
      logger.error('Failed to set event listener breakpoint:', error);
      throw error;
    }
  }

  /**
   * 删除事件监听器断点
   */
  async removeEventListenerBreakpoint(breakpointId: string): Promise<boolean> {
    const breakpoint = this.eventBreakpoints.get(breakpointId);
    if (!breakpoint) {
      return false;
    }

    try {
      if (breakpoint.targetName === '__instrumentation__') {
        await this.cdpSession.send(
          'DOMDebugger.removeInstrumentationBreakpoint',
          {
            eventName: breakpoint.eventName,
          },
        );
      } else {
        await this.cdpSession.send(
          'DOMDebugger.removeEventListenerBreakpoint',
          {
            eventName: breakpoint.eventName,
            targetName: breakpoint.targetName,
          },
        );
      }

      this.eventBreakpoints.delete(breakpointId);
      logger.info(`Event listener breakpoint removed: ${breakpointId}`);
      return true;
    } catch (error) {
      logger.error('Failed to remove event listener breakpoint:', error);
      throw error;
    }
  }

  /**
   * 设置所有鼠标事件断点
   */
  async setMouseEventBreakpoints(): Promise<string[]> {
    const breakpointIds: string[] = [];
    for (const event of EventBreakpointManager.MOUSE_EVENTS) {
      const id = await this.setEventListenerBreakpoint(event);
      breakpointIds.push(id);
    }
    logger.info(`Set ${breakpointIds.length} mouse event breakpoints`);
    return breakpointIds;
  }

  /**
   * 设置所有键盘事件断点
   */
  async setKeyboardEventBreakpoints(): Promise<string[]> {
    const breakpointIds: string[] = [];
    for (const event of EventBreakpointManager.KEYBOARD_EVENTS) {
      const id = await this.setEventListenerBreakpoint(event);
      breakpointIds.push(id);
    }
    logger.info(`Set ${breakpointIds.length} keyboard event breakpoints`);
    return breakpointIds;
  }

  /**
   * 设置所有定时器事件断点（使用 Instrumentation Breakpoint）
   */
  async setTimerEventBreakpoints(): Promise<string[]> {
    const breakpointIds: string[] = [];
    for (const event of EventBreakpointManager.TIMER_INSTRUMENTATION_EVENTS) {
      try {
        await this.cdpSession.send('DOMDebugger.setInstrumentationBreakpoint', {
          eventName: event,
        });

        const breakpointId = `event_${++this.breakpointCounter}`;
        this.eventBreakpoints.set(breakpointId, {
          id: breakpointId,
          eventName: event,
          targetName: '__instrumentation__',
          enabled: true,
          hitCount: 0,
          createdAt: Date.now(),
        });
        breakpointIds.push(breakpointId);
      } catch (error) {
        logger.warn(
          `Failed to set timer instrumentation breakpoint: ${event}`,
          error,
        );
      }
    }
    logger.info(`Set ${breakpointIds.length} timer event breakpoints`);
    return breakpointIds;
  }

  /**
   * 设置所有 WebSocket 事件断点
   */
  async setWebSocketEventBreakpoints(): Promise<string[]> {
    const breakpointIds: string[] = [];
    for (const event of EventBreakpointManager.WEBSOCKET_EVENTS) {
      const id = await this.setEventListenerBreakpoint(event, 'WebSocket');
      breakpointIds.push(id);
    }
    logger.info(`Set ${breakpointIds.length} WebSocket event breakpoints`);
    return breakpointIds;
  }

  /**
   * 获取所有事件断点
   */
  getAllEventBreakpoints(): EventBreakpoint[] {
    return Array.from(this.eventBreakpoints.values());
  }

  /**
   * 获取特定事件断点
   */
  getEventBreakpoint(breakpointId: string): EventBreakpoint | undefined {
    return this.eventBreakpoints.get(breakpointId);
  }

  /**
   * 清除所有事件断点
   */
  async clearAllEventBreakpoints(): Promise<void> {
    const breakpoints = Array.from(this.eventBreakpoints.values());

    for (const bp of breakpoints) {
      try {
        if (bp.targetName === '__instrumentation__') {
          // Instrumentation 断点用对应的 remove API
          await this.cdpSession.send(
            'DOMDebugger.removeInstrumentationBreakpoint',
            {
              eventName: bp.eventName,
            },
          );
        } else {
          await this.cdpSession.send(
            'DOMDebugger.removeEventListenerBreakpoint',
            {
              eventName: bp.eventName,
              targetName: bp.targetName,
            },
          );
        }
      } catch (error) {
        logger.warn(`Failed to remove event breakpoint ${bp.id}:`, error);
      }
    }

    this.eventBreakpoints.clear();
    logger.info('All event breakpoints cleared');
  }

  /**
   * 🆕 关闭并清理资源
   */
  async close(): Promise<void> {
    try {
      await this.clearAllEventBreakpoints();
      logger.info('EventBreakpointManager closed');
    } catch (error) {
      logger.error('Failed to close EventBreakpointManager:', error);
      throw error;
    }
  }
}
