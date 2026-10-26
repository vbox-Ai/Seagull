import { useState } from "react";
import { hs, type DepsResult } from "../lib/hs";
import { cx } from "../lib/cx";
import { LogView } from "../components/LogView";

type Props = {
  depsResult: DepsResult | null;
  checking: boolean;
  fixing: boolean;
  /** 全局是否有任务在跑（注入/部署）。有则禁用修复按钮，避免主进程里互杀。 */
  busy: boolean;
  fixMsg: string;
  fixLog: string;
  onCheck: () => void;
  onFix: () => void;
};

/** 系统诊断：依赖检测/修复（功能5）+ 故障诊断报告（功能7）。
 *  依赖检测/修复的状态由 App 持有，切页后仍保留，后台修复进程继续时 UI 不丢。 */
export function DiagnosticsPage({ depsResult, checking, fixing, busy, fixMsg, fixLog, onCheck, onFix }: Props) {
  const [report, setReport] = useState("");
  const [reporting, setReporting] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  const runDiagnose = async () => {
    setReporting(true);
    const text = await hs.diagnose();
    setReport(text);
    setReporting(false);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopyMsg("诊断报告已复制到剪贴板");
    } catch {
      setCopyMsg("复制失败，请手动全选复制");
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
          <button type="button" className="btn btn-primary" onClick={onCheck} disabled={checking || fixing || busy}>
            {checking ? "检测中…" : "开始检测"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onFix} disabled={fixing || !depsResult || busy}>
            {fixing ? "修复中…" : "一键修复缺失依赖"}
          </button>
        </div>
        {fixMsg && <p className="settings-card-description">{fixMsg}</p>}
        {fixLog && (
          <div className="panel-card" style={{ padding: "12px 14px", marginTop: 10 }}>
            <LogView text={fixLog} />
          </div>
        )}
        {depsResult && !depsResult.ok && (
          <p className="settings-card-description" style={{ color: "var(--ds-text-danger, #c0392b)" }}>
            {depsResult.error}
          </p>
        )}
        {depsResult && depsResult.ok && (
          <div className="settings-panel">
            {depsResult.deps.map((d) => (
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
        {copyMsg && <p className="settings-card-description">{copyMsg}</p>}
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
