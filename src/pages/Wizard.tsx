import { useState } from "react";
import type { Target } from "../data/targets";
import type { StatusLevel } from "../App";
import type { EnginesState, PromptFile, ReaProgress } from "../lib/hs";
import { cx } from "../lib/cx";
import { BrandIcon } from "../components/brand";
import { LogView } from "../components/LogView";

type Props = {
  target: Target;
  prompts: PromptFile[];
  selectedPrompt: string;
  onSelectPrompt: (name: string) => void;
  engines: EnginesState | null;
  reaProgress: ReaProgress | null;
  busy: boolean;
  status: string;
  level: StatusLevel;
  logText: string;
  onInstall: () => void;
  onRestore: () => void;
  onBack: () => void;
  onManagePrompts: () => void;
};

const STEPS = ["确认目标", "选提示词", "选引擎", "执行"];

/** 二级向导：确认目标 → 选提示词 → 选引擎 → 执行。 */
export function Wizard({
  target,
  prompts,
  selectedPrompt,
  onSelectPrompt,
  engines,
  reaProgress,
  busy,
  status,
  level,
  logText,
  onInstall,
  onRestore,
  onBack,
  onManagePrompts,
}: Props) {
  const [step, setStep] = useState(0);
  const [useSeep, setUseSeep] = useState(true);
  const [useRea, setUseRea] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => (step === 0 ? onBack() : setStep((s) => s - 1));

  return (
    <div className="sg-wizard">
      <div className="sg-steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cx("sg-step", step === i && "active", i < step && "done")}
          >
            <span className="sg-step-idx">{i < step ? "✓" : i + 1}</span>
            <span>{label}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true">›</span>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="sg-wizard-card">
          <h2 className="sg-wizard-title">{target.title}</h2>
          <p className="app-prose">{target.desc}</p>
          <div className="sg-engine-row">
            <span className="sg-card-icon">
              <BrandIcon id={target.icon} size={24} />
            </span>
            <div>
              <div className="sg-engine-name">{target.nav}</div>
              <div className="sg-engine-desc">确认目标平台无误后进入下一步</div>
            </div>
          </div>
          <div className="sg-wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              返回首页
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRestore}>
              还原恢复
            </button>
            <button type="button" className="btn btn-primary" onClick={next}>
              下一步
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="sg-wizard-card">
          <h2 className="sg-wizard-title">选择注入提示词</h2>
          <p className="app-prose">
            提示词来自 memory 目录。选择一个作为当前注入源，之后正常安装即用。
          </p>
          {prompts.length === 0 ? (
            <div className="sg-hint">
              提示词库为空，请先点「去管理」导入提示词。
            </div>
          ) : (
            prompts.map((p) => (
              <div key={p.name} className="sg-engine-row">
                <label>
                  <div className="sg-engine-name">
                    {p.name}
                    {p.current ? "（当前）" : ""}
                  </div>
                  <div className="sg-engine-desc">{p.chars} 字</div>
                </label>
                <input
                  type="radio"
                  name="prompt"
                  checked={selectedPrompt === p.name}
                  onChange={() => onSelectPrompt(p.name)}
                />
              </div>
            ))
          )}
          <div className="sg-wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={prev}>
              上一步
            </button>
            <button type="button" className="btn btn-secondary" onClick={onManagePrompts}>
              去管理
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedPrompt}
              onClick={next}
            >
              下一步
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="sg-wizard-card">
          <h2 className="sg-wizard-title">选择引擎</h2>
          <div className="sg-engine-row">
            <label>
              <div className="sg-engine-name">Seep 逆向工作台（离线）</div>
              <div className="sg-engine-desc">
                {engines?.seep.installed ? "已部署 · 版本 " + (engines.seep.version || "未知") : "随包离线秒装，nmap + Radare2/JADX/Frida"}
              </div>
            </label>
            <input type="checkbox" checked={useSeep} onChange={(e) => setUseSeep(e.target.checked)} />
          </div>
          <div className="sg-engine-row">
            <label>
              <div className="sg-engine-name">REA（在线下发）</div>
              <div className="sg-engine-desc">
                {engines?.rea.installed ? "已部署 · 版本 " + (engines.rea.version || "main") : "在线下发工作流技能，走 ghfast.top / gh-proxy.com 加速"}
              </div>
            </label>
            <input type="checkbox" checked={useRea} onChange={(e) => setUseRea(e.target.checked)} />
          </div>
          {reaProgress && (
            <div className="sg-engine-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="sg-engine-desc">{reaProgress.label}</div>
              <div className="sg-progress">
                <div className="sg-progress-bar" style={{ width: reaProgress.pct + "%" }} />
              </div>
            </div>
          )}
          <div className="sg-wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={prev}>
              上一步
            </button>
            <button type="button" className="btn btn-primary" disabled={!useSeep && !useRea} onClick={next}>
              下一步
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="sg-wizard-card">
          <h2 className="sg-wizard-title">执行注入</h2>
          <p className="app-prose">
            目标 {target.nav} · 提示词 {selectedPrompt || "（未选）"} · 引擎{" "}
            {[useSeep && "Seep", useRea && "REA"].filter(Boolean).join(" + ") || "（未选）"}
          </p>
          <div className="sg-wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={prev} disabled={busy}>
              上一步
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRestore}>
              {busy ? "执行中 …" : "还原恢复"}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onInstall}>
              {busy ? "执行中 …" : "开始注入"}
            </button>
          </div>
          {(status || logText) && (
            <div className="settings-card-block" style={{ marginTop: 16 }}>
              <div className="settings-card-heading-row">
                <p className="settings-card-description">
                  {status}
                  {level === "err" ? "（详见下方日志）" : ""}
                </p>
              </div>
              {logText ? (
                <div className="panel-card" style={{ padding: "12px 14px" }}>
                  <LogView text={logText} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
