import { useCallback, useEffect, useState } from "react";
import { hs, type PromptFile, type PromptImportPreview, type PromptImportResult } from "../lib/hs";

type Props = {
  /** 提示词库改动（导入/删除/设为当前）后，通知 App 同步注入向导的列表。 */
  onPromptsChanged?: (selected?: string) => void;
};

/** 导入结果 → 一行可读摘要。 */
function summarize(r: PromptImportResult) {
  const parts: string[] = [];
  if (r.imported) parts.push(`导入 ${r.imported} 份`);
  if (r.overwritten) parts.push(`覆盖 ${r.overwritten} 份`);
  if (r.skippedCount) parts.push(`跳过 ${r.skippedCount} 份`);
  if (r.errors?.length) parts.push(`失败 ${r.errors.length} 份：${r.errors.map((e) => `${e.name || "未知"}（${e.error}）`).join("；")}`);
  return parts.join("，") || "没有可导入的提示词";
}

/** 提示词管理：导入 / 删除 / 设为当前注入源（对应安装脚本 -SourcePrompt）。 */
export function PromptsPage({ onPromptsChanged }: Props) {
  const [prompts, setPrompts] = useState<PromptFile[]>([]);
  const [promptMsg, setPromptMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 重复导入的待确认状态：第二阶段按「覆盖 / 取消」落盘
  const [pending, setPending] = useState<PromptImportPreview | null>(null);

  const reload = useCallback(() => {
    hs.promptsList().then(setPrompts);
  }, []);

  useEffect(reload, [reload]);

  const applyImport = async (sources: string[], mode: "overwrite" | "skip") => {
    setBusy(true);
    try {
      const r = await hs.promptsImport({ sources, mode });
      setPromptMsg(summarize(r));
    } finally {
      setBusy(false);
      setPending(null);
    }
    reload();
    onPromptsChanged?.();
  };

  const importPrompt = async () => {
    setBusy(true);
    let r: PromptImportResult | null = null;
    try {
      // 第一阶段：只解析并比对，不写盘
      r = await hs.promptsImport();
    } finally {
      setBusy(false);
    }
    if (!r) return;
    if (!r.ok && r.stage !== "preview") {
      setPromptMsg(r.error || "导入失败");
      return;
    }
    const sources = r.sources || [];
    if (!sources.length) {
      setPromptMsg("没有选择文件");
      return;
    }
    const preview = r as PromptImportPreview;
    if ((preview.conflicts?.length || 0) > 0) {
      // 有同名 / 内容重复 → 弹窗让用户选覆盖还是跳过
      setPending(preview);
      return;
    }
    await applyImport(sources, "skip");
  };

  const deletePrompt = async (name: string) => {
    const r = await hs.promptsDelete(name);
    setPromptMsg(r.ok ? "已删除" : r.error || "删除失败");
    reload();
    onPromptsChanged?.();
  };

  const selectPrompt = async (name: string) => {
    const r = await hs.promptsSelect(name);
    setPromptMsg(r.ok ? `当前注入源：${name}` : r.error || "切换失败");
    reload();
    if (r.ok) onPromptsChanged?.(name);
  };

  return (
    <div className="sg-wizard">
      <h1 className="settings-section-title">提示词管理</h1>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">提示词库</h2>
            <p className="settings-card-description">
              导入 / 删除 / 设为当前注入源（对应安装脚本 -SourcePrompt）。支持 .md / .txt / .zip（可多选，zip 自动解包）；遇到同名或内容重复会先弹窗确认。
            </p>
          </div>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={importPrompt}>
            {busy ? "处理中…" : "导入提示词"}
          </button>
        </div>
        {promptMsg && (
          <p className="settings-card-description" style={{ whiteSpace: "pre-wrap" }}>
            {promptMsg}
          </p>
        )}
        {prompts.length === 0 ? (
          <p className="settings-card-description">提示词库为空。</p>
        ) : (
          <div className="settings-panel" style={{ maxHeight: 320, overflow: "auto" }}>
            {prompts.map((p) => (
              <div key={p.name} className="settings-row">
                <span className="settings-row-copy">
                  <div className="settings-row-title">
                    {p.name}
                    {p.current ? "（当前）" : ""}
                  </div>
                  <div className="settings-row-desc">{p.chars} 字</div>
                </span>
                <span className="settings-row-control app-inline-actions" style={{ marginTop: 0 }}>
                  <button type="button" className="btn btn-secondary" disabled={p.current} onClick={() => selectPrompt(p.name)}>
                    设为当前
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={p.current} onClick={() => deletePrompt(p.name)}>
                    删除
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pending && (
        <div className="overlay">
          <div className="dialog">
            <h2 className="settings-card-heading">
              发现 {(pending.conflicts || []).length} 份重复提示词
            </h2>
            <p className="settings-card-description sg-conflict-copy">
              下列提示词与库内已有内容重复或文件名相同。选「覆盖」会用新内容替换已有文件；
              选「取消」只跳过这些重复项，其余不重复的照常导入。
            </p>
            <div className="sg-conflict-list">
              {(pending.conflicts || []).map((c) => (
                <div key={`${c.name}-${c.existing}`} className="sg-conflict-row">
                  <span className="sg-conflict-name">{c.name}</span>
                  <span className="sg-conflict-reason">
                    {c.reason} · 已有 {c.existing}
                  </span>
                </div>
              ))}
            </div>
            {(pending.created || []).length > 0 && (
              <p className="settings-card-description">
                另有 {(pending.created || []).length} 份不重复，确认后一并导入。
              </p>
            )}
            <div className="app-inline-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => applyImport(pending.sources, "overwrite")}
              >
                覆盖
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => applyImport(pending.sources, "skip")}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
