import type { StatusLevel } from "../App";
import type { SeepState } from "../lib/hs";
import { cx } from "../lib/cx";

type Props = {
  seep: SeepState;
  busy: boolean;
  status: string;
  level: StatusLevel;
  logText: string;
  onInstall: () => void;
  onVerify: () => void;
  onUninstall: () => void;
};

export function SeepPage({
  seep,
  busy,
  status,
  level,
  logText,
  onInstall,
  onVerify,
  onUninstall,
}: Props) {
  return (
    <>
      <h1 className="settings-section-title">Seep 逆向工作台</h1>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">工作台</h2>
            <p className="settings-card-description">
              随包分发的逆向工程工具链：MCP 服务（Radare2 / JADX / Apktool / Frida）、
              技能库与战术知识库，部署到本机后由 Agent 直接调用。
            </p>
          </div>
          <span className={cx("badge", seep.installed ? "badge-success" : "badge-neutral")}>
            {seep.installed ? "已部署" : "未部署"}
          </span>
        </div>

        <div className="settings-panel">
          <div className="settings-row">
            <span className="settings-row-copy">
              <div className="settings-row-title">随包工具链</div>
              <div className="settings-row-desc">
                {seep.kit
                  ? "版本 " + (seep.version || "未知") + " · 离线可用，无需联网拉取依赖"
                  : "随包目录 seep-kit 缺失，请重新解压完整的便携版"}
              </div>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-row-copy">
              <div className="settings-row-title">部署位置</div>
              <div className="settings-row-desc">
                技能与提示词写入 ~/.pi/agent，同时生成 Claude Code / DSH / OpenCode 配置。
              </div>
            </span>
          </div>
        </div>

        <div className="app-inline-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !seep.kit}
            onClick={onInstall}
          >
            部署工作台
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !seep.kit}
            onClick={onVerify}
          >
            自检
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !seep.kit}
            onClick={onUninstall}
          >
            卸载工作台
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
