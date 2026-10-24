import { useEffect, useState } from "react";

import { hs, type Skill, type SkillLayers, type BatchResult } from "../lib/hs";
import { TARGETS } from "../data/targets";
import { cx } from "../lib/cx";

type Props = {
  skills: Skill[];
  onSave: (disabled: string[]) => void;
  onReload: () => void;
};

type Feedback = { kind: "ok" | "err" | "info"; text: string };

export function SkillsPage({ skills, onSave, onReload }: Props) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [layers, setLayers] = useState<SkillLayers>({ seep: [], rea: [] });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 批量模式（决策点3）：开关入口在 Skills 管理页
  const [batchMode, setBatchMode] = useState(false);
  const [batchAction, setBatchAction] = useState<"install" | "uninstall" | "restore">("install");
  const [batchTargets, setBatchTargets] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const reloadLayers = () => hs.skillLayers().then(setLayers);
  useEffect(() => {
    reloadLayers();
  }, []);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const s of skills) next[s.name] = s.enabled;
    setEnabled(next);
  }, [skills]);

  const total = skills.length;
  const onCount = skills.filter((s) => enabled[s.name]).length;
  const customCount = skills.filter((s) => s.custom).length;

  const toggle = (name: string) => setEnabled((prev) => ({ ...prev, [name]: !prev[name] }));
  const setAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of skills) next[s.name] = value;
    setEnabled(next);
  };
  const save = () => onSave(skills.filter((s) => !enabled[s.name]).map((s) => s.name));

  const importSkills = async (kind: "zip" | "dir") => {
    setBusy(true);
    setFeedback(null);
    const r = await hs.skillsImport(kind);
    setBusy(false);
    if (r.ok) {
      const parts: string[] = [];
      if (r.imported?.length) parts.push(`导入 ${r.imported.length} 个：${r.imported.join(" · ")}`);
      if (r.skipped?.length) parts.push(`跳过 ${r.skipped.length} 个（${r.skipped.join(" · ")}）`);
      if (r.errors?.length) parts.push(`失败 ${r.errors.length} 个（${r.errors.join(" · ")}）`);
      setFeedback({ kind: "ok", text: parts.join("；") || "导入完成" });
    } else {
      setFeedback({ kind: r.error === "已取消" ? "info" : "err", text: r.error || "导入失败" });
    }
    onReload();
  };

  const doDelete = async (name: string) => {
    setBusy(true);
    const r = await hs.skillsDelete(name);
    setBusy(false);
    setConfirmDelete(null);
    setFeedback(r.ok ? { kind: "ok", text: `已删除自定义技能「${name}」` } : { kind: "err", text: r.error || "删除失败" });
    onReload();
  };

  // 决策点4：删除技能 =「禁用 + 删除」双态；这里提供「仅禁用」分支
  const doDisableOnly = (name: string) => {
    setEnabled((prev) => ({ ...prev, [name]: false }));
    setConfirmDelete(null);
    setFeedback({ kind: "info", text: `已把「${name}」标记为禁用，点「保存」后生效` });
  };

  const toggleBatchTarget = (id: string) =>
    setBatchTargets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const runBatch = async () => {
    if (batchTargets.length === 0) {
      setFeedback({ kind: "err", text: "请先勾选至少一个平台" });
      return;
    }
    setBusy(true);
    setBatchResult(null);
    const r = await hs.batchRun({ action: batchAction, targets: batchTargets });
    setBusy(false);
    setBatchResult(r);
    const act = batchAction === "install" ? "注入" : batchAction === "uninstall" ? "卸载" : "还原";
    setFeedback(
      r.ok
        ? { kind: "ok", text: `批量${act}完成：成功 ${r.okCount}/${r.total}` }
        : { kind: "err", text: r.error || `批量${act}失败` },
    );
    onReload();
  };

  return (
    <>
      <h1 className="settings-section-title">Skills 管理</h1>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">三层技能库总览</h2>
            <p className="settings-card-description">
              引擎技能随 seep-kit 分发，工作流技能随 REA 下发，注入技能库随提示词写入 AI 助手。
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={reloadLayers}>
            刷新总览
          </button>
        </div>
        <div className="settings-panel">
          <div className="settings-row">
            <span className="settings-row-copy">
              <div className="settings-row-title">Seep 引擎技能</div>
              <div className="settings-row-desc">{layers.seep.length ? layers.seep.join(" · ") : "seep-kit 未随包或未检出"}</div>
            </span>
            <span className="settings-row-control">
              <span className="badge badge-neutral">{layers.seep.length} 项</span>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-row-copy">
              <div className="settings-row-title">REA 工作流技能</div>
              <div className="settings-row-desc">{layers.rea.length ? layers.rea.join(" · ") : "未下发 REA（去 Seep 工作台部署）"}</div>
            </span>
            <span className="settings-row-control">
              <span className="badge badge-neutral">{layers.rea.length} 项</span>
            </span>
          </div>
        </div>
      </div>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">自定义技能</h2>
            <p className="settings-card-description">
              导入含 SKILL.md 的技能目录或 .zip 技能包；真源保存到 ~/.seagull/custom-skills 并同步注入 Codex。
            </p>
          </div>
          <span className="badge badge-neutral">{customCount} 个自定义</span>
        </div>
        <div className="app-inline-actions app-inline-actions-top">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => importSkills("zip")}>
            导入 .zip 技能包
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => importSkills("dir")}>
            导入技能文件夹
          </button>
        </div>
        {feedback && (
          <div className={cx("skill-feedback", feedback.kind)}>
            {feedback.text}
          </div>
        )}
      </div>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">注入技能库</h2>
            <p className="settings-card-description">
              勾选 = 启用，取消 = 禁用。保存后需重启 Codex 生效；自定义技能可单独删除。
            </p>
          </div>
          <span className="badge badge-neutral">
            共 {total} 个 · 启用 {onCount} · 禁用 {total - onCount}
          </span>
        </div>

        <div className="app-inline-actions app-inline-actions-top">
          <button type="button" className="btn btn-secondary" onClick={() => setAll(true)}>
            全选
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAll(false)}>
            一键关闭
          </button>
          <button type="button" className="btn btn-ghost" onClick={onReload}>
            重新读取
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            保存
          </button>
          <button
            type="button"
            className={cx("btn", batchMode ? "btn-primary" : "btn-ghost")}
            onClick={() => setBatchMode((v) => !v)}
          >
            批量模式{batchMode ? "：开" : "：关"}
          </button>
        </div>

        {batchMode && (
          <div className="skill-batch">
            <div className="skill-batch-actions">
              <label className="skill-batch-label">操作</label>
              {(
                [
                  ["install", "注入"],
                  ["uninstall", "卸载"],
                  ["restore", "还原"],
                ] as const
              ).map(([act, label]) => (
                <button
                  key={act}
                  type="button"
                  className={cx("btn", batchAction === act ? "btn-primary" : "btn-secondary")}
                  onClick={() => setBatchAction(act)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="skill-batch-actions">
              <label className="skill-batch-label">平台</label>
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={cx("skill-chip", batchTargets.includes(t.id) && "on")}
                  onClick={() => toggleBatchTarget(t.id)}
                >
                  {t.nav}
                </button>
              ))}
            </div>
            <div className="app-inline-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={runBatch}>
                {busy ? "执行中…" : "执行批量操作"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setBatchTargets([])}>
                清空选择
              </button>
            </div>
            {batchResult && (
              <div className="skill-batch-results">
                {batchResult.results.map((r) => (
                  <div key={r.target} className={cx("skill-batch-row", r.ok ? "ok" : "err")}>
                    <span className="skill-batch-target">{TARGETS.find((t) => t.id === r.target)?.nav || r.target}</span>
                    <span className="skill-batch-state">{r.ok ? "成功" : `失败${r.code != null ? `（${r.code}）` : ""}${r.error ? " · " + r.error : ""}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {total === 0 ? (
          <p className="settings-card-description">未在 ~/.codex/skills 下找到技能目录。</p>
        ) : (
          <div className="settings-panel">
            {skills.map((s) => (
              <div key={s.name} className="settings-row">
                <button
                  type="button"
                  className="settings-row-copy app-row-button"
                  onClick={() => toggle(s.name)}
                >
                  <div className="settings-row-title">
                    {s.name}
                    {s.custom && <span className="badge badge-success skill-custom-badge">自定义</span>}
                  </div>
                  <div className="settings-row-desc">{s.desc}</div>
                </button>
                <span className="settings-row-control">
                  {s.custom && (
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      disabled={busy}
                      onClick={() => setConfirmDelete(s.name)}
                    >
                      删除
                    </button>
                  )}
                  <button
                    type="button"
                    className={cx("settings-toggle", enabled[s.name] && "on")}
                    aria-label={`切换 ${s.name}`}
                    onClick={() => toggle(s.name)}
                  >
                    <span className="settings-toggle-thumb" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="overlay">
          <div className="dialog">
            <h2 className="settings-card-heading">删除技能「{confirmDelete}」</h2>
            <p className="settings-card-description skill-confirm-copy">
              删除会同时移除 Codex 技能目录与 ~/.seagull/custom-skills 源目录，无法恢复。
              如果只是想临时关掉，请选「仅禁用」。
            </p>
            <div className="app-inline-actions">
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => doDelete(confirmDelete)}>
                删除技能
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => doDisableOnly(confirmDelete)}>
                仅禁用
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
