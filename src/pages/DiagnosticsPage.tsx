import { useState } from "react";
import { hs, type DepsResult } from "../lib/hs";
import { cx } from "../lib/cx";
import { LogView } from "../components/LogView";

/** 系统诊断：依赖检测/修复（功能5）+ 故障诊断报告（功能7）。 */
export function DiagnosticsPage() {
  const [deps, setDeps] = useState<DepsResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixMsg, setFixMsg] = useState("");
  const [fixLog, setFixLog] = useState("");
  const [report, setReport] = useState("");
  const [reporting, setReporting] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    setFixMsg("");
    const r = await hs.depsCheck();
    setDeps(r);
    setChecking(false);
  };

  const runFix = async () => {
    if (fixing) return;
    setFixing(true);
    setFixMsg("");
    setFixLog("");
    const off = hs.onLog((p) => setFixLog((prev) => (prev + p.text).slice(-20000)));
    try {
      const r = await hs.depsFix();
      if (r.partial && r.depsResults) {
        setFixMsg(
          `部分修复完成：成功 ${r.depsResults.ok.length} 项，失败 ${r.depsResults.failed.length} 项（${r.depsResults.failed.join("、") || "无"}）。可重跑失败项。`,
        );
      } else {
        setFixMsg(r.ok ? "修复完成：工具链已补齐。" : "修复失败：" + (r.error || r.out || "退出码 " + r.code));
      }
    } finally {
      off();
      setFixing(false);
      runCheck();
    }
  };

  const runDiagnose = async () => {
    setReporting(true);
    const text = await hs.diagnose();
    setReport(text);
    setReporting(false);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setFixMsg("诊断报告已复制到剪贴板");
    } catch {
      setFixMsg("复制失败，请手动全选复制");
    }
  };

  return (
    <div className="sg-wizard">
      <h1 className="settings-section-title">系统诊断</h1>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <h2 className="settings-card-heading">依赖检测 / 修复</h2>
          <p className="settings-card-description">
            检测 nmap / Radare2 / JADX / Frida / Python 等逆向工具链是否就绪，缺什么一键修复。
          </p>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-primary" onClick={runCheck} disabled={checking}>
            {checking ? "检测中…" : "开始检测"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={runFix} disabled={fixing || !deps}>
            {fixing ? "修复中…" : "一键修复缺失依赖"}
          </button>
        </div>
        {fixMsg && <p className="settings-card-description">{fixMsg}</p>}
        {fixLog && (
          <div className="panel-card" style={{ padding: "12px 14px", marginTop: 10 }}>
            <LogView text={fixLog} />
          </div>
        )}
        {deps && !deps.ok && (
          <p className="settings-card-description" style={{ color: "var(--ds-text-danger, #c0392b)" }}>
            {deps.error}
          </p>
        )}
        {deps && deps.ok && (
          <div className="settings-panel">
            {deps.deps.map((d) => (
              <div key={d.name} className="settings-row">
                <span className="settings-row-copy">
                  <div className="settings-row-title">{d.name}</div>
                  <div className="settings-row-desc">
                    {d.ok ? d.path : d.hint || "未安装"}
                  </div>
                </span>
                <span className="settings-row-control">
                  <span className={cx("badge", d.ok ? "badge-success" : "badge-error")}>
                    {d.ok ? "就绪" : "缺失"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <h2 className="settings-card-heading">故障诊断报告</h2>
          <p className="settings-card-description">一键收集本机环境快照，用于排查注入失败或引擎异常。</p>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-primary" onClick={runDiagnose} disabled={reporting}>
            {reporting ? "生成中…" : "生成诊断报告"}
          </button>
          {report && (
            <button type="button" className="btn btn-secondary" onClick={copyReport}>
              复制报告
            </button>
          )}
        </div>
        {report && (
          <pre
            style={{
              marginTop: 12,
              padding: 14,
              background: "var(--ds-bg-inset)",
              border: "1px solid var(--ds-border-default)",
              borderRadius: "var(--radius-md)",
              color: "var(--ds-text-primary)",
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 420,
              overflow: "auto",
            }}
          >
            {report}
          </pre>
        )}
      </div>
    </div>
  );
}
