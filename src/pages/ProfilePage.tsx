import { useCallback, useEffect, useState } from "react";
import type { StatusLevel } from "../App";
import { hs, type HistoryEntry } from "../lib/hs";
import { cx } from "../lib/cx";
import { IconMoon, IconSun } from "../components/icons";

type Props = {
  version: string;
  status: string;
  level: StatusLevel;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenQQ: () => void;
  onOpenTutorial: () => void;
  onQuit: () => void;
  onOpenDiag: () => void;
};

/** 个人中心：加群 + 使用教程 + 版本 + 偏好 + 任务历史 + 远程配置热更新。 */
export function ProfilePage({ version, status, level, theme, onToggleTheme, onOpenQQ, onOpenTutorial, onQuit, onOpenDiag }: Props) {
  const statusTone =
    level === "err" ? "badge-error" : level === "ok" ? "badge-success" : "badge-neutral";

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteMsg, setRemoteMsg] = useState("");

  const reload = useCallback(() => {
    hs.history().then(setHistory);
  }, []);

  useEffect(reload, [reload]);

  const fetchRemote = async () => {
    if (!remoteUrl.trim()) {
      setRemoteMsg("请输入远程配置地址");
      return;
    }
    const r = await hs.remoteFetch(remoteUrl.trim());
    setRemoteMsg(r.ok ? "远程配置已更新" : r.error || "拉取失败");
  };

  const actionLabel = (a: string) =>
    ({ install: "注入", uninstall: "卸载", restore: "还原", "rea-install": "REA下发" }[a] || a);

  return (
    <div className="sg-wizard">
      <h1 className="settings-section-title">个人中心</h1>

      <div className="settings-card-block">
        <h2 className="settings-card-heading">账号信息</h2>
        <div className="settings-panel">
          <div className="settings-row">
            <span className="settings-row-copy">
              <div className="settings-row-title">状态</div>
              <div className="settings-row-desc">本地工具 · 无需登录 · 所有注入均在本机完成</div>
            </span>
            <span className="settings-row-control">
              <span className={cx("badge", statusTone)}>{status}</span>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-row-copy">
              <div className="settings-row-title">版本</div>
            </span>
            <span className="settings-row-control">
              <span className="badge badge-neutral">{version ? "v" + version : "—"}</span>
            </span>
          </div>
          <button type="button" className="settings-row app-row-button" onClick={onOpenQQ}>
            <span className="settings-row-copy">
              <div className="settings-row-title">QQ 群</div>
              <div className="settings-row-desc">永久免费 · 更新与答疑都在群里</div>
            </span>
            <span className="settings-row-control app-qq-control">
              <span className="badge badge-neutral">694080138</span>
              <span className="app-link">加入QQ群</span>
            </span>
          </button>
          <button type="button" className="settings-row app-row-button" onClick={onOpenTutorial}>
            <span className="settings-row-copy">
              <div className="settings-row-title">使用教程</div>
              <div className="settings-row-desc">三步装好，立刻开用</div>
            </span>
            <span className="settings-row-control">
              <span className="app-link">查看教程</span>
            </span>
          </button>
        </div>
      </div>

      <div className="settings-card-block">
        <h2 className="settings-card-heading">偏好</h2>
        <div className="settings-row">
          <span className="settings-row-copy">
            <div className="settings-row-title">深浅色</div>
            <div className="settings-row-desc">当前：{theme === "dark" ? "深色" : "浅色"}模式</div>
          </span>
          <span className="settings-row-control">
            <button type="button" className="btn btn-secondary" onClick={onToggleTheme}>
              {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
              <span style={{ marginLeft: 6 }}>{theme === "dark" ? "切换浅色" : "切换深色"}</span>
            </button>
          </span>
        </div>
      </div>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <h2 className="settings-card-heading">注入任务历史</h2>
        </div>
        {history.length === 0 ? (
          <p className="settings-card-description">还没有注入记录。</p>
        ) : (
          <div className="settings-panel" style={{ maxHeight: 260, overflow: "auto" }}>
            {history.slice(0, 50).map((h) => (
              <div key={h.id} className="settings-row">
                <span className="settings-row-copy">
                  <div className="settings-row-title">
                    {actionLabel(h.action)} · {h.target}
                    {h.prompt ? " · " + h.prompt : ""}
                  </div>
                  <div className="settings-row-desc">
                    {new Date(h.at).toLocaleString()}
                    {h.detail ? " · " + String(h.detail).slice(0, 80) : ""}
                  </div>
                </span>
                <span className="settings-row-control">
                  <span className={cx("badge", h.ok ? "badge-success" : "badge-error")}>
                    {h.ok ? "成功" : "失败"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-card-block">
        <h2 className="settings-card-heading">远程配置热更新</h2>
        <div className="settings-row">
          <span className="settings-row-copy">
            <input
              className="settings-row-title"
              style={{ width: "100%", border: "1px solid var(--ds-border-default)", borderRadius: "var(--radius-sm)", padding: "8px 10px", background: "var(--ds-bg-inset)", color: "var(--ds-text-primary)" }}
              placeholder="https://example.com/config.json"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
            />
          </span>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-primary" onClick={fetchRemote}>
            拉取并应用
          </button>
        </div>
        {remoteMsg && <p className="settings-card-description">{remoteMsg}</p>}
      </div>

      <div className="settings-card-block">
        <h2 className="settings-card-heading">系统</h2>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-secondary" onClick={onOpenDiag}>
            系统诊断
          </button>
          <button type="button" className="btn btn-ghost" onClick={onQuit}>
            退出工具
          </button>
        </div>
      </div>
    </div>
  );
}
