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
  /** 全局是否有任务在跑（注入/还原/依赖修复共用主进程的单条 PowerShell 通道）。 */
  busy: boolean;
  /** 依赖修复是否正在进行 + 它自己的说明文案。 */
  fixing: boolean;
  fixMsg: string;
  status: string;
  level: StatusLevel;
  logText: string;
  onInstall: () => void;
  onRestore: () => void;
  onChatInject: () => void;
  onRestartDsh: () => void;
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
  fixing,
  fixMsg,
  status,
  level,
  logText,
  onInstall,
  onRestore,
  onChatInject,
  onRestartDsh,
  onBack,
  onManagePrompts,
}: Props) {
  const [step, setStep] = useState(0);
  const [useSeep, setUseSeep] = useState(true);
  const [useRea, setUseRea] = useState(false);
  const isDsh = target.id === "dsh";
  const isDoubao = target.id === "doubao";

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
          {isDsh && (
            <div className="sg-hint" style={{ marginBottom: 10 }}>
              DSH 只在启动时读取 ~/.dsh/AGENTS.md。注入或还原后，点「重启 DSH」让改动真正生效。
            </div>
          )}
          <div className="sg-wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              返回首页
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRestore}>
              还原恢复
            </button>
            {isDsh && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRestartDsh}>
                {busy ? "执行中 …" : "重启 DSH"}
              </button>
            )}
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
            提示词来自提示词库（独立存放，卸载或换版本不会丢）。选择一个作为当前注入源，之后正常安装即用。
          </p>
          {prompts.length === 0 ? (
            <div className="sg-hint">
              提示词库为空，请先点「去管理」导入提示词。
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {prompts.map((p) => (
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
              ))}
            </div>
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
          <p className="app-prose">
            引擎是可选的：只注入提示词也行，逆向工具链等需要时再去 Seep 工作台装。
          </p>
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
          {!useSeep && !useRea && (
            <div className="sg-hint">未选引擎：将只注入提示词，不部署任何逆向工具链。</div>
          )}
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
            <button type="button" className="btn btn-primary" onClick={next}>
              下一步
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="sg-wizard-card">
          <h2 className="sg-wizard-title">执行注入</h2>
          <div className="sg-engine-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="sg-summary-line">
              <span className="badge badge-neutral">{target.nav}</span>
              <span className="badge badge-success">{selectedPrompt || "（未选）"}</span>
              <span className="badge badge-warning">
                {[useSeep && "Seep", useRea && "REA"].filter(Boolean).join(" + ") || "仅提示词"}
              </span>
            </div>
          </div>
          <div className="sg-wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={prev} disabled={busy}>
              上一步
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRestore}>
              {busy ? "执行中 …" : "还原恢复"}
            </button>
            {isDsh && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRestartDsh}>
                {busy ? "执行中 …" : "重启 DSH"}
              </button>
            )}
            {isDoubao && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onChatInject}>
                {busy ? "执行中 …" : "开启破甲对话（完整提示词）"}
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onInstall}>
              {busy ? "执行中 …" : "开始注入"}
            </button>
          </div>
          {isDoubao && (
            <p className="app-prose" style={{ marginTop: 12 }}>
              豆包的云端全局记忆有 12000 字符硬上限，完整提示词塞不进去。
              「开启破甲对话」会新建一个对话，把整份提示词作为第一条消息发进去，绕开这个上限——
              每开新对话点一次即可。
            </p>
          )}
        </div>
      )}

      {/* 状态与日志在所有步骤都可见：还原/重启按钮在第一步就有，不能点完没反馈 */}
      {(status || logText || fixing) && (
        <div className="settings-card-block" style={{ marginTop: 16 }}>
          <div className="settings-card-heading-row">
            <p className="settings-card-description">
              {status}
              {level === "err" ? "（详见下方日志）" : ""}
            </p>
          </div>
          {/* 依赖修复是长时间下载（工具链几十 MB），只挂一串原始日志会让人以为卡死了。
              这里补一句人在看的说明，并说明它结束后会自动重新检测。 */}
          {fixing && (
            <p className="settings-card-description" style={{ color: "var(--ds-text-warning, #b8860b)" }}>
              {fixMsg || "正在修复逆向工具链 …"}
              {" "}下载进度见下方日志；百分比按整数显示，慢网下会在一格停留较久，属正常现象。
              修复期间其它注入操作会提示「正有任务在运行」，等它结束即可。
            </p>
          )}
          {logText ? (
            <div className="panel-card" style={{ padding: "12px 14px" }}>
              <LogView text={logText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
