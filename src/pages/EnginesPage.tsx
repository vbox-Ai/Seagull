import { useEffect, useState } from "react";
import type { StatusLevel } from "../App";
import { hs, type Dep, type ReaProgress, type ReaState, type SeepState } from "../lib/hs";
import { cx } from "../lib/cx";
import { SeepPage } from "./SeepPage";

type Props = {
  seep: SeepState;
  busy: boolean;
  status: string;
  level: StatusLevel;
  logText: string;
  onSeepInstall: () => void;
  onSeepVerify: () => void;
  onSeepUninstall: () => void;
};

/** Seep 工作台页：Seep（离线）+ REA（在线）+ 依赖检测 + 故障诊断。 */
export function EnginesPage({
  seep,
  busy,
  status,
  level,
  logText,
  onSeepInstall,
  onSeepVerify,
  onSeepUninstall,
}: Props) {
  const [rea, setRea] = useState<ReaState | null>(null);
  const [reaProgress, setReaProgress] = useState<ReaProgress | null>(null);
  const [deps, setDeps] = useState<Dep[] | null>(null);
  const [depsError, setDepsError] = useState("");
  const [depsBusy, setDepsBusy] = useState(false);
  const [report, setReport] = useState("");

  useEffect(() => {
    hs.enginesState().then((s) => setRea(s.rea));
    const off = hs.onReaProgress((p) => setReaProgress(p));
    return off;
  }, []);

  const refreshRea = () => hs.enginesState().then((s) => setRea(s.rea));

  const runReaInstall = async () => {
    setReaProgress({ pct: 0, label: "启动 REA 部署 …" });
    await hs.reaInstall();
    refreshRea();
  };

  const runReaUninstall = async () => {
    await hs.reaUninstall();
    refreshRea();
  };

  const runDepsCheck = async () => {
    setDepsBusy(true);
    setDepsError("");
    const r = await hs.depsCheck();
    setDeps(r.deps);
    if (!r.ok) setDepsError(r.error || "检测失败");
    setDepsBusy(false);
  };

  const runDepsFix = async () => {
    setDepsBusy(true);
    await hs.depsFix();
    setDepsBusy(false);
    runDepsCheck();
  };

  const runDiagnose = async () => {
    setReport(await hs.diagnose());
  };

  return (
    <div className="sg-wizard">
      <SeepPage
        seep={seep}
        busy={busy}
        status={status}
        level={level}
        logText={logText}
        onInstall={onSeepInstall}
        onVerify={onSeepVerify}
        onUninstall={onSeepUninstall}
      />

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">REA 逆向工作台（在线下发）</h2>
            <p className="settings-card-description">
              从 morluto/rea 经 ghfast.top / gh-proxy.com 加速下发，带进度条，单节点失败自动切换。
            </p>
          </div>
          <span className={cx("badge", rea?.installed ? "badge-success" : "badge-neutral")}>
            {rea?.installed ? "已部署" : "未部署"}
          </span>
        </div>
        <div className="app-inline-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={rea?.downloading}
            onClick={runReaInstall}
          >
            {rea?.downloading ? "下发中 …" : "下发 REA"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={rea?.downloading || !rea?.installed}
            onClick={runReaUninstall}
          >
            卸载 REA
          </button>
        </div>
        {reaProgress && (
          <div style={{ marginTop: 12 }}>
            <div className="settings-row-desc" style={{ marginBottom: 6 }}>
              {reaProgress.label}
            </div>
            <div className="sg-progress">
              <div className="sg-progress-bar" style={{ width: reaProgress.pct + "%" }} />
            </div>
          </div>
        )}
      </div>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">依赖检测 / 修复</h2>
            <p className="settings-card-description">
              检测 python / nmap / Radare2 / JADX / Frida / git / 7z 是否就位。
            </p>
          </div>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-secondary" disabled={depsBusy} onClick={runDepsCheck}>
            检测依赖
          </button>
          <button type="button" className="btn btn-primary" disabled={depsBusy} onClick={runDepsFix}>
            修复依赖
          </button>
        </div>
        {deps && (
          <div className="sg-engine-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            {deps.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={cx("sg-dot", d.ok ? "on" : "off")} aria-hidden="true" />
                <span className="settings-row-title" style={{ minWidth: 90 }}>
                  {d.name}
                </span>
                <span className="settings-row-desc">{d.ok ? d.path : "未安装"}</span>
              </div>
            ))}
          </div>
        )}
        {depsError && <p className="settings-card-description">{depsError}</p>}
      </div>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">故障诊断</h2>
            <p className="settings-card-description">一键生成环境与注入状态的完整诊断报告。</p>
          </div>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-secondary" onClick={runDiagnose}>
            生成报告
          </button>
        </div>
        {report && <pre className="sg-report">{report}</pre>}
      </div>
    </div>
  );
}
