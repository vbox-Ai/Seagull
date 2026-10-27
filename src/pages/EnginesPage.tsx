import { useEffect, useState } from "react";
import type { StatusLevel } from "../App";
import { hs, type Dep, type GatewayState, type ReaProgress, type ReaState, type SeepState } from "../lib/hs";
import { cx } from "../lib/cx";
import { LogView } from "../components/LogView";
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
  deps: Dep[] | null;
  depsError: string;
  depsBusy: boolean;
  depsMsg: string;
  fixLog: string;
  fixing: boolean;
  onDepsCheck: () => void;
  onDepsFix: () => void;
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
  deps,
  depsError,
  depsBusy,
  depsMsg,
  fixLog,
  fixing,
  onDepsCheck,
  onDepsFix,
}: Props) {
  const [rea, setRea] = useState<ReaState | null>(null);
  const [reaProgress, setReaProgress] = useState<ReaProgress | null>(null);
  const [report, setReport] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [gateway, setGateway] = useState<GatewayState | null>(null);
  const [gatewayBusy, setGatewayBusy] = useState(false);

  useEffect(() => {
    hs.enginesState().then((s) => setRea(s.rea));
    hs.gatewayState().then(setGateway);
    const off = hs.onReaProgress((p) => {
      setReaProgress(p);
      // 完成 / 失败收尾：进度条短暂停留后立即消失
      if (p.done) {
        window.setTimeout(() => setReaProgress(null), 1200);
      }
    });
    return off;
  }, []);

  const toggleGateway = async () => {
    if (!gateway || gatewayBusy) return;
    setGatewayBusy(true);
    const next = await hs.gatewaySet(!gateway.enabled);
    setGateway(next);
    setGatewayBusy(false);
  };

  const refreshRea = () => hs.enginesState().then((s) => setRea(s.rea));

  const runReaInstall = async () => {
    setReaProgress({ pct: 0, label: "启动 REA 部署 …" });
    const r = await hs.reaInstall();
    await refreshRea();
    // 兜底：无论事件时序如何，下发结束后进度条都不该挂着
    window.setTimeout(() => setReaProgress(null), r.ok ? 1200 : 4000);
  };

  const runReaUninstall = async () => {
    await hs.reaUninstall();
    refreshRea();
  };

  const runDiagnose = async () => {
    setReportMsg("");
    setReport(await hs.diagnose());
  };

  const exportReport = async () => {
    if (!report) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const r = await hs.saveText(`海鸥V8-诊断报告-${stamp}.txt`, report);
    setReportMsg(r.ok ? "报告已导出到：" + r.path : r.error || "导出失败");
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
            <h2 className="settings-card-heading">升权网关</h2>
            <p className="settings-card-description">
              平台无关的破甲引擎：被动监听 127.0.0.1，把客户端自带身份替换成海鸥规则。
              默认开启，只影响被接入器显式指向该端口的平台（当前仅 Trae）。
            </p>
          </div>
          <span className={cx("badge", gateway?.running ? "badge-success" : "badge-neutral")}>
            {gateway?.running ? `运行中 · ${gateway.port}` : gateway?.enabled ? `未运行 · ${gateway.port}` : "已关闭"}
          </span>
        </div>
        <div className="app-inline-actions">
          <button
            type="button"
            className={cx("btn", gateway?.enabled ? "btn-ghost" : "btn-primary")}
            disabled={gatewayBusy || !gateway}
            onClick={toggleGateway}
          >
            {gatewayBusy ? "切换中 …" : gateway?.enabled ? "关闭网关" : "开启网关"}
          </button>
        </div>
        {gateway?.error && <p className="settings-card-description">{gateway.error}</p>}
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
          {/* 三个按钮都要看全局 busy：注入/部署正在进行时再点「修复依赖」，
              以前会在主进程里把那个 PowerShell 连带 taskkill 掉，安装静默失败。 */}
          <button type="button" className="btn btn-secondary" disabled={depsBusy || fixing || busy} onClick={onDepsCheck}>
            {depsBusy ? "检测中 …" : "检测依赖"}
          </button>
          <button type="button" className="btn btn-primary" disabled={depsBusy || fixing || busy} onClick={onDepsFix}>
            {fixing ? "修复中 …" : "修复依赖"}
          </button>
        </div>
        {depsMsg && <p className="settings-card-description">{depsMsg}</p>}
        {fixLog && (
          <div className="panel-card" style={{ padding: "12px 14px", marginTop: 10 }}>
            <LogView text={fixLog} />
          </div>
        )}
        {deps && (
          <div className="sg-engine-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            {deps.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={cx("sg-dot", d.ok ? "on" : "off")} aria-hidden="true" />
                <span className="settings-row-title" style={{ minWidth: 90 }}>
                  {d.name}
                </span>
                <span className="settings-row-desc">
                  {d.ok ? d.path : d.hint || "未安装"}
                </span>
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
          <button type="button" className="btn btn-secondary" disabled={!report} onClick={exportReport}>
            导出报告
          </button>
        </div>
        {reportMsg && <p className="settings-card-description">{reportMsg}</p>}
        {report && <pre className="sg-report">{report}</pre>}
      </div>
    </div>
  );
}
