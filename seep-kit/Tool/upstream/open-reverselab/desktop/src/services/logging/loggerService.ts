import { LogEntry, LogLevel } from "../../core";

type LogListener = (entry: LogEntry) => void;

class LoggerService {
  private buffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private listeners: Set<LogListener> = new Set();

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public log(
    level: LogLevel,
    agentId: string,
    message: string,
    extra?: { command?: string; durationMs?: number; payload?: any }
  ): LogEntry {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      level,
      agentId,
      message,
      command: extra?.command,
      durationMs: extra?.durationMs,
      payload: extra?.payload,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    this.listeners.forEach((fn) => fn(entry));
    return entry;
  }

  public info(agentId: string, message: string, payload?: any) {
    return this.log("info", agentId, message, { payload });
  }

  public warn(agentId: string, message: string, payload?: any) {
    return this.log("warn", agentId, message, { payload });
  }

  public tool(agentId: string, command: string, durationMs?: number, payload?: any) {
    return this.log("tool", agentId, `Execute: ${command}`, { command, durationMs, payload });
  }

  public evidence(agentId: string, title: string, data: any) {
    return this.log("evidence", agentId, `Capture Evidence: ${title}`, { payload: data });
  }

  public error(agentId: string, message: string, error?: any) {
    return this.log("error", agentId, message, { payload: error });
  }

  public getHistory(): LogEntry[] {
    return [...this.buffer];
  }

  public clear() {
    this.buffer = [];
  }
}

export const logger = new LoggerService();
