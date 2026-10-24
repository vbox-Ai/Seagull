/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * 缓存适配器 - 将现有缓存适配到 UnifiedCacheManager
 *
 * 适配器模式：
 * - 不修改现有缓存实现
 * - 提供统一的接口
 * - 支持异步和同步方法
 */

import type {CodeCache} from '../modules/collector/CodeCache.js';
import type {CodeCompressor} from '../modules/collector/CodeCompressor.js';

import type {DetailedDataManager} from './detailedDataManager.js';
import type {CacheInstance, CacheStats} from './UnifiedCacheManager.js';

/**
 * DetailedDataManager 适配器
 */
export class DetailedDataManagerAdapter implements CacheInstance {
  name = 'DetailedDataManager';

  constructor(private manager: DetailedDataManager) {}

  getStats(): CacheStats {
    const stats = this.manager.getStats();
    return {
      entries: stats.cacheSize,
      size: this.estimateSize(stats.cacheSize),
      hits: 0, // DetailedDataManager 不追踪命中率
      misses: 0,
      ttl: stats.defaultTTLSeconds * 1000, // 🆕 使用 defaultTTLSeconds
      maxSize: stats.maxCacheSize,
    };
  }

  clear(): void {
    this.manager.clear();
  }

  /**
   * 估算缓存大小
   *
   * ⚠️  注意：这是粗略估算，实际大小可能有较大偏差
   * - 假设每个条目平均 50KB
   * - 实际大小取决于数据类型和内容
   */
  private estimateSize(entries: number): number {
    return entries * 50 * 1024; // 50KB per entry (估算值)
  }
}

/**
 * CodeCache 适配器
 */
export class CodeCacheAdapter implements CacheInstance {
  name = 'CodeCache';

  constructor(private cache: CodeCache) {}

  async getStats(): Promise<CacheStats> {
    const stats = await this.cache.getStats();
    return {
      entries: stats.memoryEntries + stats.diskEntries,
      size: stats.totalSize,
      hits: 0, // CodeCache 不追踪命中率
      misses: 0,
    };
  }

  async cleanup(): Promise<void> {
    await this.cache.cleanup();
  }

  async clear(): Promise<void> {
    await this.cache.clear();
  }
}

/**
 * CodeCompressor 适配器
 */
export class CodeCompressorAdapter implements CacheInstance {
  name = 'CodeCompressor';

  constructor(private compressor: CodeCompressor) {}

  getStats(): CacheStats {
    const stats = this.compressor.getStats();
    const cacheSize = this.compressor.getCacheSize();

    // 计算命中率
    const total = stats.cacheHits + stats.cacheMisses;
    const hitRate = total > 0 ? stats.cacheHits / total : 0;

    return {
      entries: cacheSize,
      size: this.estimateSize(cacheSize, stats.totalCompressedSize),
      hits: stats.cacheHits,
      misses: stats.cacheMisses,
      hitRate,
    };
  }

  clear(): void {
    this.compressor.clearCache();
  }

  /**
   * 估算缓存大小
   *
   * ⚠️  注意：使用累计压缩大小计算平均值
   * - totalCompressed 是历史累计值，不是当前缓存大小
   * - 实际缓存大小可能小于估算值
   */
  private estimateSize(entries: number, totalCompressed: number): number {
    if (entries === 0) return 0;
    const avgSize = totalCompressed / Math.max(1, entries);
    return entries * avgSize; // 基于平均值的估算
  }
}

/**
 * 创建所有适配器的工厂函数
 */
export function createCacheAdapters(
  detailedDataManager: DetailedDataManager,
  codeCache: CodeCache,
  codeCompressor: CodeCompressor,
): CacheInstance[] {
  return [
    new DetailedDataManagerAdapter(detailedDataManager),
    new CodeCacheAdapter(codeCache),
    new CodeCompressorAdapter(codeCompressor),
  ];
}
