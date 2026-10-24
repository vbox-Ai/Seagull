export type LogLevel = "info" | "warn" | "error" | "tool" | "evidence";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  agentId: string;
  message: string;
  command?: string;
  durationMs?: number;
  payload?: any;
}
