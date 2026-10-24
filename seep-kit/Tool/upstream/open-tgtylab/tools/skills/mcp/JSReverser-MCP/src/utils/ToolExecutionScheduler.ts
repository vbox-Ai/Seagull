/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {Mutex} from '../Mutex.js';

export interface ToolExecutionOptions {
  priority?: number;
  timeoutMs?: number;
}

interface QueuedWrite<T> {
  priority: number;
  sequence: number;
  run: () => Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

export class ToolExecutionScheduler {
  private readonly writeMutex = new Mutex();
  private writeQueue: Array<QueuedWrite<unknown>> = [];
  private writeDraining = false;
  private sequence = 0;

  async execute<T>(
    readOnly: boolean,
    fn: () => Promise<T>,
    options: ToolExecutionOptions = {},
  ): Promise<T> {
    const run = () => this.withTimeout(fn(), options.timeoutMs);
    if (readOnly) {
      return run();
    }

    return new Promise<T>((resolve, reject) => {
      this.writeQueue.push({
        priority: options.priority ?? 0,
        sequence: this.sequence++,
        run,
        resolve,
        reject,
      });
      void this.drainWriteQueue();
    });
  }

  private async drainWriteQueue(): Promise<void> {
    if (this.writeDraining) {
      return;
    }
    this.writeDraining = true;

    const guard = await this.writeMutex.acquire();
    try {
      let firstQueuedWrite = true;
      while (this.writeQueue.length > 0) {
        this.writeQueue.sort((a, b) =>
          firstQueuedWrite
            ? a.sequence - b.sequence
            : b.priority - a.priority || a.sequence - b.sequence,
        );
        firstQueuedWrite = false;
        const item = this.writeQueue.shift()!;
        try {
          item.resolve(await item.run());
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      guard.dispose();
      this.writeDraining = false;
      if (this.writeQueue.length > 0) {
        void this.drainWriteQueue();
      }
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
  ): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) {
      return promise;
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`Tool execution timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
