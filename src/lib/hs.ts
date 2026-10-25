/** preload 暴露的 IPC 接口的类型包装。 */

export type InstalledMap = Record<string, string | boolean>;

export type InstallResult = {
  ok: boolean;
  code: number;
  out: string;
  timedOut: boolean;
  installed: InstalledMap;
  error?: string;
  /** 依赖修复的分项结果（有值说明走了 repair-tools.ps1 的 RESULT_JSON）。 */
  partial?: boolean;
  depsResults?: { ok: string[]; failed: string[]; partial: boolean };
};

/** 重启 Codex：out 是 PowerShell 的原样输出，失败时 error 里带可读原因。 */
export type RestartResult = { ok: boolean; code?: number; out?: string; error?: string };

export type Skill = { name: string; desc: string; enabled: boolean; custom: boolean };

/** 三层技能库：seep-kit 引擎技能 + REA 工作流技能（注入技能库走 listSkills）。 */
export type SkillLayers = { seep: string[]; rea: string[] };

/** memory/ 下正在使用的提示词文件；null = 用户还没填内容。 */
export type MemoryPrompt = { path: string; name: string; chars: number } | null;

/** 随包 Seep 逆向工作台状态。 */
export type SeepState = {
  /** 随包工具链是否完整（resources/seep-kit/setup/install.ps1 存在）。 */
  kit: boolean;
  /** 是否已部署到 ~/.pi/agent（mcp.json 里有 seep 条目）。 */
  installed: boolean;
  /** 随包工作台版本号。 */
  version: string;
};

export type AppState = {
  installed: InstalledMap;
  version: string;
};

// ---- 功能1：状态总览 ----
export type OverviewTarget = { id: string; installed: boolean; prompt: string; at: number };
export type Overview = { updatedAt: number; targets: OverviewTarget[] };

// ---- 功能2：任务历史 ----
export type HistoryEntry = {
  id: string;
  at: number;
  action: string;
  target: string;
  prompt: string;
  ok: boolean;
  detail?: string;
};

// ---- 功能3：提示词管理 ----
export type PromptFile = { name: string; chars: number; current: boolean };

// ---- 功能5：依赖检测 ----
export type Dep = { name: string; ok: boolean; path: string; hint?: string };
export type DepsResult = { ok: boolean; deps: Dep[]; error?: string };

// ---- 功能4：引擎管理 ----
export type ReaState = { installed: boolean; version: string; downloading: boolean };
export type EnginesState = { seep: SeepState; rea: ReaState };
export type ReaProgress = { pct: number; label: string; done?: boolean; failed?: boolean };

/** 单个提示词文件的导入结果（zip 一个来源可产出多条）。 */
export type PromptImportItem = { ok: boolean; name?: string; chars?: number; error?: string };
export type PromptImportResult = {
  ok: boolean;
  imported?: number;
  total?: number;
  results: PromptImportItem[];
  name?: string;
  chars?: number;
  error?: string;
};

// ---- 自定义技能（Skills 管理页导入 / 删除） ----
export type SkillImportResult = {
  ok: boolean;
  imported?: string[];
  skipped?: string[];
  errors?: string[];
  error?: string;
};
export type SkillDeleteResult = { ok: boolean; error?: string };

// ---- 批量操作（注入 / 卸载 / 还原多平台） ----
export type BatchTargetResult = { target: string; ok: boolean; code?: number; error?: string };
export type BatchResult = {
  ok: boolean;
  okCount?: number;
  total?: number;
  results: BatchTargetResult[];
  error?: string;
};

// ---- 功能6：远程配置 ----
export type RemoteResult = { ok: boolean; data?: unknown; error?: string };

export type LogPayload = { label: string; text: string };
export type StatusPayload = { label: string; state: "running" | "idle" };
export type NotifyPayload = { level: "info" | "warn"; text: string };

export type HsApi = {
  state(): Promise<AppState>;
  memory(): Promise<MemoryPrompt>;
  overview(): Promise<Overview>;
  history(): Promise<HistoryEntry[]>;
  promptsList(): Promise<PromptFile[]>;
  promptsImport(sourcePath?: string | string[]): Promise<PromptImportResult>;
  promptsDelete(name: string): Promise<{ ok: boolean; error?: string }>;
  promptsSelect(name: string): Promise<{ ok: boolean; name?: string; error?: string }>;
  depsCheck(): Promise<DepsResult>;
  depsFix(): Promise<InstallResult>;
  enginesState(): Promise<EnginesState>;
  reaInstall(): Promise<InstallResult>;
  reaUninstall(): Promise<InstallResult>;
  diagnose(): Promise<string>;
  /** 通用文本导出：弹保存框写入文件（诊断报告导出等）。 */
  saveText(defaultName: string, content: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  remoteFetch(url: string): Promise<RemoteResult>;
  install(targetId: string): Promise<InstallResult>;
  uninstall(targetId: string): Promise<InstallResult>;
  /** 装回原始记忆（仅 WorkBuddy）：还原安装前的记忆档案，保留技能库。 */
  restoreMemory(targetId: string): Promise<InstallResult>;
  /** 豆包专属：把完整提示词作为首条消息发进新对话（绕开云记忆 12000 字符上限）。 */
  doubaoChatInject(): Promise<InstallResult>;
  restartCodex(): Promise<RestartResult>;
  restartDsh(): Promise<RestartResult>;
  seepState(): Promise<SeepState>;
  seepInstall(): Promise<InstallResult>;
  seepUninstall(): Promise<InstallResult>;
  seepVerify(): Promise<InstallResult>;
  listSkills(): Promise<Skill[]>;
  skillLayers(): Promise<SkillLayers>;
  saveSkills(disabled: string[]): Promise<{ ok: boolean; error?: string }>;
  skillsImport(kind: "zip" | "dir"): Promise<SkillImportResult>;
  skillsDelete(name: string): Promise<SkillDeleteResult>;
  batchRun(payload: { action: "install" | "uninstall" | "restore"; targets: string[] }): Promise<BatchResult>;
  openQQ(url: string): Promise<{ ok: boolean }>;
  quit(): Promise<{ ok: boolean }>;
  win(action: "minimize" | "maximize" | "close"): Promise<{ ok: boolean }>;
  onLog(cb: (p: LogPayload) => void): () => void;
  onStatus(cb: (p: StatusPayload) => void): () => void;
  onNotify(cb: (p: NotifyPayload) => void): () => void;
  onReaProgress(cb: (p: ReaProgress) => void): () => void;
};

declare global {
  interface Window {
    hs: HsApi;
  }
}

export const hs: HsApi = window.hs;
