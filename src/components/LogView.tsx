import { useMemo } from "react";

/**
 * 注入日志视图：把 PowerShell 脚本的输出按行分类上色，并把常见英文输出
 * 翻译成中文展示（原文放 title 悬停可见）。单一灰底 pre 的观感太单调，
 * 分类后每行有状态色 + 图形符号，识别度立刻上来。
 */

type LineKind = "ok" | "err" | "warn" | "time" | "info";

const TRANSLATIONS: Array<[RegExp, string]> = [
  [/No existing AGENTS\.md,?\s*creating new/i, "未发现已有 AGENTS.md，将新建"],
  [/Injected prompt\s*->\s*(.*)/i, "提示词已注入 → $1"],
  [/Installed skills:\s*(.*)/i, "已安装技能：$1"],
  [/^\s*(\w[\w.-]*)\s+injection complete/i, "$1 注入完成"],
  [/injection complete/i, "注入完成"],
  [/injection failed/i, "注入失败"],
  [/skill(?:s)? installed/i, "技能安装完成"],
  [/installing skills?/i, "正在安装技能 …"],
  [/backing up/i, "正在备份原文件 …"],
  [/backup created/i, "备份完成"],
  [/backup restored/i, "备份已还原"],
  [/creating (?:the )?(.+)/i, "正在创建 $1"],
  [/created (.+)/i, "已创建 $1"],
  [/writing (.+)/i, "正在写入 $1"],
  [/wrote (.+)/i, "已写入 $1"],
  [/skipping (.+)/i, "跳过 $1"],
  [/not found/i, "未找到"],
  [/done\.?$/i, "完成"],
];

function translate(line: string): string {
  let out = line;
  for (const [re, rep] of TRANSLATIONS) {
    if (re.test(out)) {
      out = out.replace(re, rep);
      break;
    }
  }
  return out;
}

function classify(line: string): LineKind {
  const t = line.trim();
  if (!t) return "info";
  if (/^\[TIME\]/i.test(t)) return "time";
  if (/(失败|错误|error|failed|fatal|超时|timed out|not recognized|无法)/i.test(t)) return "err";
  if (/(警告|warn|跳过|skip|重试|retry)/i.test(t)) return "warn";
  if (/(完成|成功|✓|✅|ok\b|success|complete|installed|已注入|已安装|已写入|已创建)/i.test(t)) return "ok";
  return "info";
}

const KIND_META: Record<LineKind, { cls: string; mark: string }> = {
  ok: { cls: "ok", mark: "✓" },
  err: { cls: "err", mark: "✕" },
  warn: { cls: "warn", mark: "!" },
  time: { cls: "time", mark: "·" },
  info: { cls: "info", mark: "›" },
};

export function LogView({ text }: { text: string }) {
  const lines = useMemo(() => text.split(/\r?\n/).filter((l) => l.trim().length > 0), [text]);
  return (
    <div className="sg-log" role="log">
      {lines.map((raw, i) => {
        const kind = classify(raw);
        const meta = KIND_META[kind];
        const shown = translate(raw).replace(/^\[TIME\]\s*/i, "");
        return (
          <div key={i} className={`sg-log-line ${meta.cls}`} title={raw}>
            <span className="sg-log-mark" aria-hidden="true">
              {meta.mark}
            </span>
            <span className="sg-log-text">{shown}</span>
          </div>
        );
      })}
    </div>
  );
}
