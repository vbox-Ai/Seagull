#!/usr/bin/env node
/*
  便携版包 · 敏感信息扫描

  用途：发布前确认产物里没有密钥 / 凭据 / 私钥 / 本机路径，避免推到仓库时被
  GitHub secret scanning 或 push protection 拦下（也可能真的泄密）。

  用法：
    node scripts/scan-secrets.mjs                       # 默认扫 release/win-unpacked
    node scripts/scan-secrets.mjs <目录>                # 扫指定目录（如便携版解压目录）
    node scripts/scan-secrets.mjs <目录> --warn-only    # 只报告，不用退出码报警

  退出码：发现 HIGH 项时返回 1（--warn-only 时始终返回 0）。
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const warnOnly = args.includes("--warn-only");
const target = resolve(args.find((a) => !a.startsWith("--")) || "release/win-unpacked");

/** 只扫文本类文件；二进制（dll/exe/jar/zip/图片/字体）按扩展名跳过。 */
const TEXT_EXT = new Set([
  "", ".md", ".txt", ".json", ".jsonc", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
  ".env", ".example", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".ps1", ".psm1",
  ".bat", ".cmd", ".sh", ".java", ".kt", ".xml", ".html", ".css", ".scss", ".sql", ".properties",
  ".pem", ".key", ".crt", ".cer", ".cs", ".go", ".rs", ".rb", ".php", ".vue", ".svelte",
  ".map", ".lock", ".gitignore", ".gitattributes", ".npmrc", ".editorconfig",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 超过 8MB 的文本文件不逐个读，避免拖慢发布流程

const RULES = [
  // ---- HIGH：真凭据 / 私钥，命中就该拦下来 ----
  { sev: "HIGH", name: "Anthropic API Key", re: /sk-ant-[A-Za-z0-9_-]{24,}/g },
  { sev: "HIGH", name: "OpenRouter API Key", re: /sk-or-v1-[A-Za-z0-9]{32,}/g },
  { sev: "HIGH", name: "OpenAI 风格 Key", re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { sev: "HIGH", name: "Context7 Key", re: /ctx7sk-[A-Za-z0-9-]{10,}/g },
  { sev: "HIGH", name: "GitHub Token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { sev: "HIGH", name: "AWS Access Key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { sev: "HIGH", name: "Google API Key", re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { sev: "HIGH", name: "Slack Token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { sev: "HIGH", name: "GitLab Token", re: /\bglpat-[A-Za-z0-9_-]{15,}/g },
  // 必须带 base64 正文才算真私钥；只出现 "-----BEGIN ... KEY-----" 字面量的库源码不算
  { sev: "HIGH", name: "私钥块", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{64}/g },
  { sev: "HIGH", name: "支付宝/微信商户密钥", re: /\b(?:mch_?key|apiclient_?key)\s*[:=]\s*["'][^"']{16,}["']/gi },

  // ---- MEDIUM：可能是凭据，也可能是示例；需要人工确认 ----
  { sev: "MEDIUM", name: "疑似 Bearer / JWT", re: /Bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { sev: "MEDIUM", name: "JWT 字面量", re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { sev: "MEDIUM", name: "密钥赋值", re: /(?:api[_-]?key|apikey|secret|password|passwd|access[_-]?token|auth[_-]?token)\s*[:=]\s*["'][^"'\s]{16,}["']/gi },
  { sev: "MEDIUM", name: "真实 .env 文件", re: /^(?:[A-Z0-9_]{3,}_(?:KEY|TOKEN|SECRET|PASSWORD))=.{12,}$/gm },

  // ---- LOW：本机路径 / 内部地址，不算泄密但会暴露打包机环境 ----
  { sev: "LOW", name: "本机绝对路径", re: /[A-Za-z]:[\\/](?:Users|好用的|项目|rtyyyyy)[^\s"']{6,}/g },
  { sev: "LOW", name: "内网 IP", re: /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
];

/** 明确是「上游第三方库的公开测试夹具」的白名单：命中但不算问题。 */
const ALLOWLIST = [
  /node_modules[\\/]node_modules[\\/]jose[\\/]/,
  /cryptography[\\/]hazmat[\\/]primitives[\\/]serialization[\\/]ssh\.py$/,
  /pydantic_settings[\\/]sources[\\/]providers[\\/]secrets\.py$/,
  /\.env\.example$/,
];

function* walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

const findings = [];
let scanned = 0;
let skipped = 0;

for (const file of walk(target)) {
  const ext = extname(file).toLowerCase();
  if (!TEXT_EXT.has(ext)) {
    skipped++;
    continue;
  }
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > MAX_BYTES) {
    skipped++;
    continue;
  }
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    skipped++;
    continue;
  }
  scanned++;
  const rel = relative(target, file);
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const hits = text.match(rule.re);
    if (!hits || hits.length === 0) continue;
    if (ALLOWLIST.some((a) => a.test(rel)) && rule.sev !== "HIGH") continue;
    findings.push({
      sev: rule.sev,
      name: rule.name,
      file: rel,
      count: hits.length,
      sample: String(hits[0]).replace(/\s+/g, " ").slice(0, 120),
    });
  }
}

const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));

console.log(`\n=== 敏感信息扫描: ${target} ===`);
console.log(`扫描文本文件 ${scanned} 个，跳过非文本/超大文件 ${skipped} 个\n`);

if (findings.length === 0) {
  console.log("未发现任何密钥 / 凭据 / 本机路径特征。");
} else {
  for (const sev of ["HIGH", "MEDIUM", "LOW"]) {
    const group = findings.filter((f) => f.sev === sev);
    if (group.length === 0) continue;
    console.log(`--- ${sev}（${group.length}）---`);
    for (const f of group) {
      console.log(`  [${f.name}] ${f.file}  x${f.count}\n      ${f.sample}`);
    }
    console.log("");
  }
}

const high = findings.filter((f) => f.sev === "HIGH").length;
const medium = findings.filter((f) => f.sev === "MEDIUM").length;
console.log(`汇总: HIGH ${high} · MEDIUM ${medium} · LOW ${findings.length - high - medium}`);
if (high > 0) {
  console.log("存在高危项 —— 推仓库前请处理（删掉真凭据，或确认是上游测试夹具后加白名单）。");
  if (!warnOnly) process.exit(1);
}
