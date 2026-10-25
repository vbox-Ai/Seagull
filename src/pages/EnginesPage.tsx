import { useEffect, useState } from "react";
import type { StatusLevel } from "../App";
import { hs, type Dep, type ReaProgress, type ReaState, type SeepState } from "../lib/hs";
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
  const [depsMsg, setDepsMsg] = useState("");
  const [fixLog, setFixLog] = useState("");
  const [fixing, setFixing] = useState(false);
  const [report, setReport] = useState("");
  const [reportMsg, setReportMsg] = useState("");

  useEffect(() => {
    hs.enginesState().then((s) => setRea(s.rea));
    const off = hs.onReaProgress((p) => {
      setReaProgress(p);
      // 完成 / 失败收尾：进度条短暂停留后立即消失
      if (p.done) {
        window.setTimeout(() => setReaProgress(null), 1200);
      }
    });
    return off;
  }, []);

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

  const runDepsCheck = async () => {
    setDepsBusy(true);
    setDepsError("");
    const r = await hs.depsCheck();
    setDeps(r.deps);
    if (!r.ok) setDepsError(r.error || "检测失败");
    setDepsBusy(false);
  };

  /**
     修复依赖：修复脚本可能跑几十分钟，必须把实时日志和忙碌状态都亮出来，
     否则用户以为按钮没反应。日志走本地订阅，只显示修复输出。
  */
  const runDepsFix = async () => {
    if (fixing) return;
    setFixing(true);
    setDepsMsg("正在修复依赖，请耐心等待（首次修复需要下载工具链，可能需要较长时间）…");
    setFixLog("");
    const off = hs.onLog((p) => setFixLog((prev) => (prev + p.text).slice(-20000)));
    try {
      const r = await hs.depsFix();
      if (r.partial && r.depsResults) {
        setDepsMsg(
          `部分修复完成：成功 ${r.depsResults.ok.length} 项，失败 ${r.depsResults.failed.length} 项（${r.depsResults.failed.join("、") || "无"}）。可重跑失败项。`,
        );
      } else if (r.ok) {
        setDepsMsg("依赖修复完成，正在重新检测 …");
      } else {
        setDepsMsg(
          "依赖修复失败：" + (r.error || r.out?.slice(-300) || "退出码 " + r.code),
        );
      }
    } finally {
      off();
      setFixing(false);
      runDepsCheck();
    }
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
            <h2 className="settings-card-heading">依赖检测 / 修复</h2>
            <p className="settings-card-description">
              检测 python / nmap / Radare2 / JADX / Frida / git / 7z 是否就位。
            </p>
          </div>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-secondary" disabled={depsBusy || fixing} onClick={runDepsCheck}>
            {depsBusy ? "检测中 …" : "检测依赖"}
          </button>
          <button type="button" className="btn btn-primary" disabled={depsBusy || fixing} onClick={runDepsFix}>
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
