import type { Target } from "../data/targets";
import type { StatusLevel } from "../App";
import type { MemoryPrompt } from "../lib/hs";
import { cx } from "../lib/cx";

type Props = {
  target: Target;
  installed?: string | boolean;
  memory: MemoryPrompt;
  busy: boolean;
  status: string;
  level: StatusLevel;
  logText: string;
  onInstall: () => void;
  onUninstall: () => void;
  onRestoreMemory: () => void;
  onRestart: () => void;
};

export function InstallPage({
  target,
  installed,
  memory,
  busy,
  status,
  level,
  logText,
  onInstall,
  onUninstall,
  onRestoreMemory,
  onRestart,
}: Props) {
  const isInstalled = Boolean(installed);

  return (
    <>
      <h1 className="settings-section-title">{target.title}</h1>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">版本</h2>
            <p className="settings-card-description">{target.desc}</p>
          </div>
          <span className={cx("badge", isInstalled ? "badge-success" : "badge-neutral")}>
            {isInstalled
              ? "曾安装" + (typeof installed === "string" ? " · " + installed : "")
              : "未安装"}
          </span>
        </div>

        {/* 提示词来源：memory/ 下用户自己填的那一份 */}
        <div className="settings-panel">
          <div className="settings-row">
            <span className="settings-row-copy">
              <div className="settings-row-title">
                {memory ? "记忆文件 · " + memory.name : "记忆文件 · 还没填"}
              </div>
              <div className="settings-row-desc">
                {memory
                  ? "已读取 " + memory.chars + " 字；安装时会连同 Seep 工作台技能库一起写入该目标。"
                  : "把提示词粘进随包的 memory 目录下的 .md 文件（默认「破甲记忆.md」）后再点安装。"}
              </div>
            </span>
          </div>
        </div>

        <div className="app-inline-actions">
          {target.id === "codex" && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRestart}>
              重启 Codex
            </button>
          )}
          {/* 安装：提示词来自 memory/，技能库来自随包的 Seep 工作台 */}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onInstall}>
            安装
          </button>
          {/* 装回原始记忆：只把注入的内容还原成原版，技能库保留 */}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onRestoreMemory}
          >
            装回原始记忆
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onUninstall}>
            {target.uninstallLabel}
          </button>
        </div>
      </div>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">运行状态</h2>
            <p className="settings-card-description">
              {status}
              {level === "err" ? "（详见下方日志）" : ""}
            </p>
          </div>
        </div>
        {logText ? (
          <div className="panel-card" style={{ padding: "12px 14px" }}>
            <pre className="app-pre">{logText}</pre>
          </div>
        ) : null}
      </div>
    </>
  );
}
