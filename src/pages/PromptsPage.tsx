import { useCallback, useEffect, useState } from "react";
import { hs, type PromptFile } from "../lib/hs";

type Props = {
  /** 提示词库改动（导入/删除/设为当前）后，通知 App 同步注入向导的列表。 */
  onPromptsChanged?: (selected?: string) => void;
};

/** 提示词管理：导入 / 删除 / 设为当前注入源（对应安装脚本 -SourcePrompt）。 */
export function PromptsPage({ onPromptsChanged }: Props) {
  const [prompts, setPrompts] = useState<PromptFile[]>([]);
  const [promptMsg, setPromptMsg] = useState("");

  const reload = useCallback(() => {
    hs.promptsList().then(setPrompts);
  }, []);

  useEffect(reload, [reload]);

  const importPrompt = async () => {
    const r = await hs.promptsImport();
    if (r.ok && (r.results?.length || 0) > 1) {
      const lines = r.results.map((x) => (x.ok ? `✓ ${x.name}（${x.chars} 字）` : `✕ ${x.name || "未知"}：${x.error}`));
      setPromptMsg(`已导入 ${r.imported}/${r.total} 份：\n` + lines.join("\n"));
    } else {
      setPromptMsg(r.ok ? `已导入：${r.name || (r.results && r.results[0]?.name)}` : r.error || "导入失败");
    }
    reload();
    onPromptsChanged?.();
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
              导入 / 删除 / 设为当前注入源（对应安装脚本 -SourcePrompt）。支持 .md / .txt / .zip（可多选，zip 自动解包）。
            </p>
          </div>
        </div>
        <div className="app-inline-actions">
          <button type="button" className="btn btn-primary" onClick={importPrompt}>
            导入提示词
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
    </div>
  );
}
