/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * 代码缓存管理器 - 缓存已收集的代码，避免重复收集
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {CodeFile, CollectCodeResult} from '../../types/index.js';
import {logger} from '../../utils/logger.js';
import {resolveDefaultCodeCacheDir} from '../../utils/projectPaths.js';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface CacheEntry {
  url: string;
  files: CodeFile[];
  totalSize: number;
  collectTime: number;
  timestamp: number;
  hash: string;
}

export interface CacheOptions {
  cacheDir?: string;
  maxAge?: number; // 缓存过期时间（毫秒）
  maxSize?: number; // 最大缓存大小（字节）
  cleanupIntervalMs?: number; // 自动清理最小间隔（毫秒）
}

export class CodeCache {
  private cacheDir: string;
  private maxAge: number;
  private maxSize: number;
  private cleanupIntervalMs: number;
  private lastCleanupAt = 0;
  private memoryCache = new Map<string, CacheEntry>();

  // 🆕 内存缓存大小限制（防止内存泄漏）
  private readonly MAX_MEMORY_CACHE_SIZE = 100; // 最多 100 个条目

  constructor(options: CacheOptions = {}) {
    this.cacheDir =
      options.cacheDir || resolveDefaultCodeCacheDir(import.meta.url);
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 默认24小时
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 默认100MB
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 60_000;
  }

  /**
   * 初始化缓存目录
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, {recursive: true});
      logger.debug(`Cache directory initialized: ${this.cacheDir}`);
    } catch (error) {
      logger.error('Failed to initialize cache directory:', error);
    }
  }

  /**
   * 生成缓存键
   */
  private generateKey(url: string, options?: Record<string, unknown>): string {
    const data = stableStringify({url, options});
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 获取缓存文件路径
   */
  private getCachePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  private isMissingCacheDirError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }

  /**
   * 检查缓存是否过期
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.maxAge;
  }

  private rememberInMemory(key: string, entry: CacheEntry): void {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    }

    this.memoryCache.set(key, entry);

    while (this.memoryCache.size > this.MAX_MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (!firstKey) {
        break;
      }
      this.memoryCache.delete(firstKey);
      logger.debug(`Memory cache evicted: ${firstKey}`);
    }
  }

  /**
   * 从缓存获取
   */
  async get(
    url: string,
    options?: Record<string, unknown>,
  ): Promise<CollectCodeResult | null> {
    const key = this.generateKey(url, options);

    // 先检查内存缓存
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key)!;
      if (!this.isExpired(entry)) {
        this.rememberInMemory(key, entry);
        logger.debug(`Cache hit (memory): ${url}`);
        return {
          files: entry.files,
          dependencies: {nodes: [], edges: []},
          totalSize: entry.totalSize,
          collectTime: entry.collectTime,
        };
      } else {
        this.memoryCache.delete(key);
      }
    }

    // 检查磁盘缓存
    try {
      const cachePath = this.getCachePath(key);
      const data = await fs.readFile(cachePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(data);

      if (this.isExpired(entry)) {
        logger.debug(`Cache expired: ${url}`);
        await fs.unlink(cachePath);
        return null;
      }

      // 加载到内存缓存
      this.rememberInMemory(key, entry);

      logger.debug(`Cache hit (disk): ${url}`);
      return {
        files: entry.files,
        dependencies: {nodes: [], edges: []},
        totalSize: entry.totalSize,
        collectTime: entry.collectTime,
      };
    } catch {
      // 缓存不存在或读取失败
      return null;
    }
  }

  /**
   * 保存到缓存
   */
  async set(
    url: string,
    result: CollectCodeResult,
    options?: Record<string, unknown>,
  ): Promise<void> {
    const key = this.generateKey(url, options);
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(result.files))
      .digest('hex');

    const entry: CacheEntry = {
      url,
      files: result.files,
      totalSize: result.totalSize,
      collectTime: result.collectTime,
      timestamp: Date.now(),
      hash,
    };

    // 保存到内存缓存
    this.rememberInMemory(key, entry);

    // 保存到磁盘缓存
    try {
      await fs.mkdir(this.cacheDir, {recursive: true});
      const cachePath = this.getCachePath(key);
      await fs.writeFile(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
      logger.debug(
        `Cache saved: ${url} (${(result.totalSize / 1024).toFixed(2)} KB)`,
      );
    } catch (error) {
      logger.error('Failed to save cache:', error);
    }

    // 节流自动清理，避免批量采集时每次写入都扫描磁盘目录。
    await this.cleanup(false);
  }

  /**
   * 清理过期缓存
   */
  async cleanup(force = true): Promise<void> {
    try {
      const now = Date.now();
      if (!force && now - this.lastCleanupAt < this.cleanupIntervalMs) {
        return;
      }
      this.lastCleanupAt = now;

      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      const entries: Array<{file: string; mtime: Date; size: number}> = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        entries.push({
          file: filePath,
          mtime: stats.mtime,
          size: stats.size,
        });
      }

      // 如果总大小超过限制，删除最旧的文件
      if (totalSize > this.maxSize) {
        entries.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

        let removedSize = 0;
        for (const entry of entries) {
          if (totalSize - removedSize <= this.maxSize * 0.8) break;

          await fs.unlink(entry.file);
          removedSize += entry.size;
          logger.debug(`Removed old cache: ${entry.file}`);
        }

        logger.info(`Cache cleanup: removed ${removedSize} bytes`);
      }
    } catch (error) {
      if (this.isMissingCacheDirError(error)) {
        return;
      }
      logger.error('Failed to cleanup cache:', error);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      this.memoryCache.clear();
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }

      logger.info('All cache cleared');
    } catch (error) {
      if (this.isMissingCacheDirError(error)) {
        return;
      }
      logger.error('Failed to clear cache:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    memoryEntries: number;
    diskEntries: number;
    totalSize: number;
  }> {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      let diskEntries = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        diskEntries++;
      }

      return {
        memoryEntries: this.memoryCache.size,
        diskEntries,
        totalSize,
      };
    } catch (error) {
      if (this.isMissingCacheDirError(error)) {
        return {
          memoryEntries: this.memoryCache.size,
          diskEntries: 0,
          totalSize: 0,
        };
      }
      logger.error('Failed to get cache stats:', error);
      return {
        memoryEntries: this.memoryCache.size,
        diskEntries: 0,
        totalSize: 0,
      };
    }
  }

  /**
   * 预热缓存（加载常用URL到内存）
   */
  async warmup(urls: string[]): Promise<void> {
    logger.info(`Warming up cache for ${urls.length} URLs...`);

    for (const url of urls) {
      await this.get(url);
    }

    logger.info('Cache warmup completed');
  }
}
