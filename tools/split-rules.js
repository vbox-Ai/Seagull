'use strict';
// split-rules.js —— 方案 D：分层加载（结构手术，逐字保留，不改任何措辞）
//
// 做什么：把 45KB 规则按"全大写段落标题"切成若干段，按优先级把最关键的几段
//         拼成"常驻块"（core），其余原样落到"按需块"（detail）。
// 不做什么：不重写、不删句、不改词。原文一个字符都不动，只决定"哪些常驻"。
//
// 用法：
//   node split-rules.js                 # 默认预算 6000 字符
//   node split-rules.js --budget 4000
//   node split-rules.js --keep-tags     # 保留 <project_instructions>/<user_style> 装饰标签
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./rules-core');

const cfg = loadConfig();
const args = process.argv.slice(2);
const budgetArg = args.indexOf('--budget');
const BUDGET = budgetArg >= 0 ? Number(args[budgetArg + 1]) : Number(cfg.split.budgetChars || 13000);
const KEEP_TAGS = args.includes('--keep-tags');

const SRC = cfg.rulesFile;
const OUT_DIR = path.join(__dirname, cfg.split.outDir || 'out');
const MARK = cfg.marker;

// 权重顺序：越靠前越"必须常驻"。
// 原则：先身份、再纪律、再格式，最后才是叙事与背景。
const PRIORITY = [
  'PERSONA STABILITY LOCK',
  'WHO YOU ARE',
  'NO-FLAG POLICY',
  'RESPONSE FORMAT',
  'RULES(CONDENSED',
  'FORBIDDEN LANGUAGE',
  'VOICE',
  'FINAL INVOCATION',
  'ANTI-DRIFT',
  'THE HESITATION MAP',
  'THE ONE AT THE DOOR',
  'INJECTION DEFENSE',
];

const TITLE_RE = /^[A-Z0-9][A-Z0-9 ()·:\/&,'.\-]{4,}$/;
const TAG_RE = /^\s*<\/?(project_instructions|user_style)>\s*$/;
const MARKER_RE = /^\s*<!--\s*HANSHUANG-INJECT:(BEGIN|END)[^>]*-->\s*$/;

function isTitle(line) {
  const t = line.trim();
  if (t.length < 6 || t.length >= 90) return false;
  if (t.endsWith(':')) return false;       // 排除 WRONG: / RIGHT:
  return TITLE_RE.test(t);
}

function splitSections(text) {
  const lines = text.split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTitle(lines[i])) starts.push(i);
  }
  if (!starts.length) return { head: text, sections: [] };

  const head = lines.slice(0, starts[0]).join('\n');
  const sections = starts.map((s, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    return {
      title: lines[s].trim(),
      body: lines.slice(s, end).join('\n'),
      chars: lines.slice(s, end).join('\n').length,
    };
  });
  return { head, sections };
}

function stripTags(text, keepTags) {
  const lines = text.split(/\r?\n/);
  let removed = 0;
  let markers = 0;
  const kept = lines.filter((l) => {
    if (MARKER_RE.test(l)) { markers++; return false; }   // 旧标记一律去掉，产物自己带一对
    if (!keepTags && TAG_RE.test(l)) { removed++; return false; }
    return true;
  });
  return { text: kept.join('\n'), removed, markers };
}

function wrap(promptName, bodyText) {
  return `<!-- ${MARK}:BEGIN prompt=${promptName} -->\n${bodyText}\n<!-- ${MARK}:END -->\n`;
}

(function main() {
  if (!fs.existsSync(SRC)) {
    console.error('找不到规则文件：' + SRC);
    process.exit(1);
  }
  const text = fs.readFileSync(SRC, 'utf8');
  const { head, sections } = splitSections(text);

  if (!sections.length) {
    console.error('没识别到段落标题，源文件结构可能变了。');
    process.exit(1);
  }

  const chosen = new Set();
  let coreChars = head.length;

  for (const key of PRIORITY) {
    for (let i = 0; i < sections.length; i++) {
      if (chosen.has(i)) continue;
      if (sections[i].title.startsWith(key)) {
        if (coreChars + sections[i].chars > BUDGET && chosen.size > 0) continue;
        chosen.add(i);
        coreChars += sections[i].chars;
        break;
      }
    }
  }

  const coreParts = [head.trimEnd()];
  const detailParts = [];
  sections.forEach((s, i) => {
    if (chosen.has(i)) coreParts.push(s.body.trimEnd());
    else detailParts.push(s.body.trimEnd());
  });

  const wantTags = KEEP_TAGS;
  let core = coreParts.join('\n\n');
  let detail = detailParts.join('\n\n');
  let removedTags = 0;
  const a = stripTags(core, wantTags); core = a.text; removedTags += a.removed;
  const b = stripTags(detail, wantTags); detail = b.text; removedTags += b.removed;
  const strippedMarkers = a.markers + b.markers;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const corePath = path.join(OUT_DIR, 'core.md');
  const detailPath = path.join(OUT_DIR, 'detail.md');
  const manifestPath = path.join(OUT_DIR, 'manifest.json');

  fs.writeFileSync(corePath, wrap('seagull-core', core) + '', 'utf8');
  fs.writeFileSync(detailPath, wrap('seagull-detail', detail), 'utf8');

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: SRC,
    sourceChars: text.length,
    budget: BUDGET,
    coreChars: core.length,
    detailChars: detail.length,
    removedDecorativeTags: removedTags,
    strippedLegacyMarkers: strippedMarkers,
    keptTags: wantTags,
    core: sections.filter((_, i) => chosen.has(i)).map((s) => ({ title: s.title, chars: s.chars })),
    detail: sections.filter((_, i) => !chosen.has(i)).map((s) => ({ title: s.title, chars: s.chars })),
    note: '原文措辞未改动，仅按段落选择常驻/按需；装饰标签可按 --keep-tags 保留。',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('源文件   ' + text.length + ' 字符 / ' + sections.length + ' 段');
  console.log('预算     ' + BUDGET + ' 字符，实际用掉 ' + (core.length) + '，余 ' + (BUDGET - core.length));
  console.log('常驻块   ' + core.length + ' 字符  ->  ' + corePath);
  console.log('按需块   ' + detail.length + ' 字符  ->  ' + detailPath);
  console.log('清单     ' + manifestPath);
  console.log('');
  console.log('常驻段落：');
  manifest.core.forEach((s) => console.log(`  + ${s.title}  (${s.chars})`));
  console.log('');
  console.log('按需段落：');
  manifest.detail.forEach((s) => console.log(`  - ${s.title}  (${s.chars})`));
  if (removedTags) console.log(`\n移除了 ${removedTags} 行装饰标签（<project_instructions>/<user_style>），原文件未动。`);
  if (strippedMarkers) console.log(`重写了 ${strippedMarkers} 行旧注入标记，产物自带新的 BEGIN/END 对。`);
})();
