"use strict";
/*
  海鸥V8·破甲版 · Electron 主进程

  本构建已移除全部内置提示词与 V1–V5 版本：保留卸载 / 装回原始记忆 / 技能管理等
  清理与维护能力。渲染进程通过 preload 暴露的 window.hs 调用下面的 IPC。
*/

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");

// 应用名由构建变体决定（scripts/build.mjs 写入 variant.json）
let APP_NAME = "海鸥V8·破甲版";
let VARIANT = "free";
try {
  const v = require("../variant.json");
  if (v && v.appName) APP_NAME = v.appName;
  if (v && v.variant) VARIANT = v.variant;
} catch {
  /* 开发环境缺文件时用默认值 */
}
const UNINSTALL_TIMEOUT = 120000;
const INSTALL_TIMEOUT = 600000;
/** Seep 工作台首次部署要装 Python 依赖 + 解压离线包，给足 30 分钟。 */
const SEEP_TIMEOUT = 1800000;

let win = null;
let tray = null;
let quitting = false;
let child = null; // 当前运行的 powershell
let childTimer = null;
let childLabel = "";

// ---------- 路径 ----------

/**
   脚本目录：打包后在 resources/；开发时 main.cjs 位于 <工具目录>/electron/，
   所以先试上一级，再在上一级的同级目录里找带 install.ps1 的那一层
   （项目目录名可能带中文或空格，不能写死）。
*/
const INSTALL_SCRIPTS = [
  "install.ps1",
  "install-zcode.ps1",
  "install-cursor.ps1",
  "install-claude.ps1",
  "install-workbuddy.ps1",
  "install-dsh.ps1",
  "install-opencode.ps1",
];

function hasScripts(dir) {
  try {
    return INSTALL_SCRIPTS.every((f) => fs.existsSync(path.join(dir, f)));
  } catch {
    return false;
  }
}

function toolDir() {
  if (app.isPackaged) return process.resourcesPath;
  const parent = path.join(__dirname, "..");
  if (hasScripts(parent)) return path.resolve(parent);
  try {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(parent, entry.name);
      if (hasScripts(dir)) return path.resolve(dir);
    }
  } catch {
    /* 落到兜底 */
  }
  return path.resolve(parent);
}

function homeDir() {
  return os.homedir();
}

/**
   Codex 的配置目录（home）。不能写死 ~/.codex：
     * 用户可能把 CODEX_HOME 指到别的盘（C 盘紧张时的常见做法，Codex 官方支持）
     * 也可能直接把 .codex 放在某个盘的根目录（迁移过数据目录的机器）
   探测顺序：CODEX_HOME 环境变量 → ~/.codex → 各盘根目录下的 .codex → 兜底 ~/.codex。
   写操作（如首次写状态文件）落在最后那个兜底路径上，不影响读取判断。
   结果缓存，避免每次调用都扫一遍盘。
*/
let cachedCodexHome = null;
function codexHome() {
  if (cachedCodexHome) return cachedCodexHome;
  const envHome = process.env.CODEX_HOME;
  const def = path.join(homeDir(), ".codex");
  if (envHome) {
    try { if (fs.existsSync(envHome)) { cachedCodexHome = envHome; return cachedCodexHome; } } catch { /* 忽略 */ }
  }
  try { if (fs.existsSync(def)) { cachedCodexHome = def; return cachedCodexHome; } } catch { /* 忽略 */ }
  for (let c = 67; c <= 90; c++) {   // C: 到 Z:
    const p = String.fromCharCode(c) + ":\\" + ".codex";
    try { if (fs.existsSync(p)) { cachedCodexHome = p; return cachedCodexHome; } } catch { /* 盘不存在 */ }
  }
  cachedCodexHome = def;
  return cachedCodexHome;
}

function statePath() {
  return path.join(codexHome(), "seagull_desktop_state.json");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ---------- 任务定义（与 Python 版一致） ----------

const SCRIPTS = {
  codex: "install.ps1",
  zcode: "install-zcode.ps1",
  cursor: "install-cursor.ps1",
  opencode: "install-opencode.ps1",
  claude: "install-claude.ps1",
  workbuddy: "install-workbuddy.ps1",
  // WorkBuddy 国内版：同一个脚本，靠 -ConfigDir 指到 ~/.workbuddy 区分
  "workbuddy-cn": "install-workbuddy.ps1",
  dsh: "install-dsh.ps1",
  doubao: "install-doubao.ps1",
};

const TARGET_IDS = Object.keys(SCRIPTS);


function p(...parts) {
  return path.join(toolDir(), ...parts);
}

// ---------- 随包分发的 Seep 逆向工作台 ----------

/** 工具链目录名：electron-builder 的 extraResources 把它整个落到 resources/seep-kit/。 */
const SEEP_KIT = "seep-kit";
/** 工作台技能库（apkseep / softseep / ida-reverse / 授权流审计），相对工具目录。 */
const SEEP_SKILLS = SEEP_KIT + "/Tool/skill";
/** 用户自己填提示词的目录，随包分发到 resources/memory/。 */
const MEMORY_DIR = "memory";

function seepScript(name) {
  return p(SEEP_KIT, "setup", name);
}

/**
   记忆文件 = memory/ 下第一个非空、非 README 的 .md。
   返回 null 表示还没填，界面据此报错，避免把空提示词写进用户记忆档案。
*/
function memoryPrompt() {
  const dir = p(MEMORY_DIR);
  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith(".md") && n.toLowerCase() !== "readme.md")
      .sort();
  } catch {
    return null;
  }
  for (const name of names) {
    try {
      const full = path.join(dir, name);
      const text = fs.readFileSync(full, "utf8");
      const chars = text.trim().length;
      if (chars > 0) return { path: full, name, chars };
    } catch {
      /* 读不了就试下一个 */
    }
  }
  return null;
}

/** Seep 工作台是否已部署到 ~/.pi/agent（install-pi.ps1 会往 mcp.json 里写 seep 条目）。 */
function seepState() {
  const kitFile = p(SEEP_KIT, "VERSION");
  let version = "";
  try {
    version = fs.readFileSync(kitFile, "utf8").trim();
  } catch {
    /* 随包文件缺失时留空 */
  }
  let installed = false;
  try {
    const mcp = path.join(homeDir(), ".pi", "agent", "mcp.json");
    installed = fs.existsSync(mcp) && fs.readFileSync(mcp, "utf8").includes('"seep"');
  } catch {
    /* 没装过 */
  }
  return {
    kit: fs.existsSync(seepScript("install.ps1")),
    installed,
    version,
  };
}

/**
   各目标的安装参数。提示词统一取 memory/ 里用户自己填的那一份；
   技能库统一用随包的 Seep 工作台技能（cursor / doubao 没有技能库，只注入提示词）。
*/
function installArgs(targetId, promptFile) {
  const script = SCRIPTS[targetId];
  if (!script) throw new Error("未知目标: " + targetId);
  const file = p(script);
  const skills = SEEP_SKILLS;
  switch (targetId) {
    case "codex":
      // 额外写一份 <CodexHome>\AGENTS.md：config.toml 会被 Codex 自己重写，AGENTS.md 不会丢
      return [
        "-File", file,
        "-SourcePrompt", promptFile,
        "-SkillsSource", skills,
        "-InjectAgents",
        "-AgentsKnown", promptFile,
      ];
    case "zcode":
      return [
        "-File", file,
        "-PatchSystemPrompt",
        "-SourcePrompt", promptFile,
        "-MemorySourcePrompt", promptFile,
        "-SkillsSource", skills,
      ];
    case "claude":
      return [
        "-File", file,
        "-SourcePrompt", promptFile,
        "-SkillsSource", skills,
        "-KnownPrompts", promptFile,
      ];
    case "opencode":
      // 全局规则写 ~/.config/opencode/AGENTS.md，技能落 ~/.config/opencode/skills
      return [
        "-File", file,
        "-SourcePrompt", promptFile,
        "-SkillsSource", skills,
        "-KnownPrompts", promptFile,
      ];
    case "workbuddy":
      return ["-File", file, "-SourcePrompt", promptFile, "-SkillsSource", skills];
    case "workbuddy-cn":
      // 国内版数据目录固定 ~/.workbuddy，自动探测会先命中 .workbuddy-ai
      return [
        "-File", file,
        "-SourcePrompt", promptFile,
        "-SkillsSource", skills,
        "-ConfigDir", path.join(homeDir(), ".workbuddy"),
      ];
    case "dsh":
      return ["-File", file, "-SourcePrompt", promptFile, "-SkillsSource", skills];
    default:
      return ["-File", file, "-SourcePrompt", promptFile];
  }
}



function uninstallArgs(targetId) {
  const args = ["-File", p(SCRIPTS[targetId]), "-Uninstall"];
  // 国内版必须显式指定数据目录，否则卸载会走自动探测跑到国际版上去
  if (targetId === "workbuddy-cn") args.push("-ConfigDir", path.join(homeDir(), ".workbuddy"));
  return args;
}

/**
   装回原始记忆（install-workbuddy.ps1 -RestoreMemory）：把云记忆档案与 MEMORY.md 还原成
   安装前的原文，并删掉注入状态文件、让守护停止重注入；技能库和记忆开关都不动。
   与卸载共用同一段还原逻辑，所以数据目录的指定方式必须和 uninstallArgs 保持一致。
*/
function restoreMemoryArgs(targetId) {
  const args = ["-File", p(SCRIPTS[targetId]), "-RestoreMemory"];
  // 本构建不再随包分发提示词：脚本在卸载/还原模式下跳过提示词解析（提示词缺失时按
  // 「内容比对不上就保留用户记忆」安全降级），这里不再传 -SourcePrompt。
  if (targetId === "workbuddy-cn") args.push("-ConfigDir", path.join(homeDir(), ".workbuddy"));
  return args;
}

/**
   提示词残留兜底清扫（scripts/clear-injected-prompts.ps1，由 extraResources 打进
   resources/scripts/）。按 -Targets 限定到当前目标，避免卸载一个目标时把别的目标的
   提示词也一起清掉。
*/
function clearPromptsArgs(targetId) {
  // 清理脚本的 workbuddy 分支按 Home 目录扫，已经同时覆盖 .workbuddy-ai 与 .workbuddy，
  // 所以国内版映射到同一个 target，不需要单独的清理分支。
  const t = targetId === "workbuddy-cn" ? "workbuddy" : targetId;
  return ["-File", p("scripts", "clear-injected-prompts.ps1"), "-Apply", "-Targets", t];
}

// ---------- 运行 powershell ----------

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/**
   中文 Windows 上 PowerShell 子进程按系统代码页（GBK/936）写标准输出，
   直接按 UTF-8 解会整段乱码（用户看到的「?????」日志就是这么来的）。
   这里先按 UTF-8 严格解码；只要有一个非法字节就退回 GBK —— 两种来源都能读。
*/
function decodeConsoleOutput(buf) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("gbk").decode(buf);
    } catch {
      return buf.toString("utf8");
    }
  }
}

function killChild() {
  if (!child) return;
  const pid = child.pid;
  child = null;
  try {
    // /T 连带子进程一起杀，否则 powershell 退出后残留的安装进程仍会写文件
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => {});
  } catch {
    /* ignore */
  }
}

function runPowerShell(args, label, timeoutMs) {
  return new Promise((resolve) => {
    if (child) {
      killChild();
    }
    if (childTimer) clearTimeout(childTimer);

    let out = "";
    // 累计原始字节再整段解码：多字节中文字符可能被 chunk 边界切开，逐块解码会碎成乱码
    let rawOut = Buffer.alloc(0);
    let sentChars = 0;
    let timedOut = false;
    childLabel = label;
    send("tool:status", { label, state: "running" });

    const onOutput = (buf) => {
      rawOut = Buffer.concat([rawOut, buf]);
      const text = decodeConsoleOutput(rawOut);
      const delta = text.slice(sentChars);
      sentChars = text.length;
      if (rawOut.length > 4 * 1024 * 1024) {
        // 超长输出：丢掉已经发过的前缀，免得内存一直涨
        rawOut = rawOut.subarray(rawOut.length - 1024 * 1024);
        sentChars = decodeConsoleOutput(rawOut).length;
      }
      if (!delta) return;
      out = (out + delta).slice(-60000);
      send("tool:log", { label, text: delta });
    };

    const ps = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
      { cwd: toolDir(), windowsHide: true },
    );
    child = ps;

    ps.stdout.on("data", onOutput);
    ps.stderr.on("data", onOutput);

    childTimer = setTimeout(() => {
      timedOut = true;
      send("tool:log", { label, text: "\n[超时] 已强制终止\n" });
      killChild();
    }, timeoutMs);

    ps.on("error", (err) => {
      if (childTimer) clearTimeout(childTimer);
      child = null;
      resolve({ ok: false, code: -1, out, timedOut, error: String(err && err.message) });
    });

    ps.on("close", (code) => {
      if (childTimer) clearTimeout(childTimer);
      child = null;
      resolve({ ok: !timedOut && code === 0, code: code == null ? -1 : code, out, timedOut });
    });
  });
}

// ---------- 已安装状态 ----------


function loadState() {
  const st = readJson(statePath(), {});
  return {
    installed: st.installed || {},
    meta: st.meta || {},
    history: Array.isArray(st.history) ? st.history : [],
    activePrompt: st.activePrompt || "",
  };
}

function saveState(patch) {
  const st = loadState();
  const next = { ...st, ...patch };
  writeJson(statePath(), next);
  return next;
}

function installedSnapshot() {
  return loadState();
}

/** 追加一条注入任务历史（功能2）。最多保留 200 条，超了裁掉最旧的。 */
function appendHistory(entry) {
  const st = loadState();
  const rec = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    ...entry,
  };
  st.history.unshift(rec);
  if (st.history.length > 200) st.history = st.history.slice(0, 200);
  saveState({ history: st.history });
  return rec;
}

/** 记录目标注入成功/卸载时的元信息（功能1 状态总览的时间与提示词来源）。 */
function setInstalledMeta(targetId, promptName) {
  const st = loadState();
  if (promptName) {
    st.meta[targetId] = { at: Date.now(), prompt: promptName };
  } else {
    delete st.meta[targetId];
  }
  saveState({ meta: st.meta });
}

// ---------- skills ----------

function skillsDir() {
  return path.join(codexHome(),"skills");
}

function configToml() {
  return path.join(codexHome(),"config.toml");
}

/** 解析 [[skills.config]] 块，返回被禁用的 skill 目录名集合。 */
function readDisabledSkills() {
  const disabled = new Set();
  let text = "";
  try {
    text = fs.readFileSync(configToml(), "utf8");
  } catch {
    return disabled;
  }
  const blocks = text.split(/^\[\[skills\.config\]\]\s*$/m);
  for (const blk of blocks.slice(1)) {
    const mp = blk.match(/^\s*path\s*=\s*"([^"]+)"/m);
    if (!mp) continue;
    const me = blk.match(/^\s*enabled\s*=\s*(true|false)/m);
    const enabled = me ? me[1] === "true" : true;
    if (enabled) continue;
    const parts = mp[1].replace(/\\/g, "/").split("/");
    const name = parts[parts.length - 2];
    if (name) disabled.add(name);
  }
  return disabled;
}

function writeDisabledSkills(disabled) {
  const cp = configToml();
  let text;
  try {
    text = fs.readFileSync(cp, "utf8");
  } catch {
    return { ok: false, error: "找不到 config.toml" };
  }
  text = text.replace(/^\[\[skills\.config\]\]\s*$[\s\S]*?(?=^\[\[|$)/gm, "");
  text = text.replace(/\s+$/, "") + "\n";
  for (const name of [...disabled].sort()) {
    const sk = path.join(skillsDir(), name, "SKILL.md").replace(/\\/g, "/");
    text += `\n[[skills.config]]\npath = "${sk}"\nenabled = false\n`;
  }
  try {
    fs.writeFileSync(cp, text, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}

function listSkills() {
  const dir = skillsDir();
  const disabled = readDisabledSkills();
  let names = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "SKILL.md")))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
  return names.map((name) => {
    let desc = "";
    try {
      const head = fs.readFileSync(path.join(dir, name, "SKILL.md"), "utf8").slice(0, 600);
      const m = head.match(/description:\s*(.+)/);
      if (m) desc = m[1].trim().slice(0, 120);
    } catch {
      /* ignore */
    }
    return { name, desc, enabled: !disabled.has(name) };
  });
}

/** 三层技能库总览：seep-kit 引擎技能 + REA 工作流技能 + 注入技能库。 */
function skillLayers() {
  const seep = [];
  const seepRoot = p(SEEP_SKILLS);
  try {
    const top = fs.readdirSync(seepRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of top) {
      const skill = path.join(seepRoot, d.name, "SKILL.md");
      if (fs.existsSync(skill)) seep.push(d.name);
      // safe-skills 子目录按独立技能枚举
      const nested = path.join(seepRoot, d.name);
      try {
        for (const n of fs.readdirSync(nested, { withFileTypes: true })) {
          if (n.isDirectory() && fs.existsSync(path.join(nested, n.name, "SKILL.md"))) {
            seep.push(`${d.name}/${n.name}`);
          }
        }
      } catch {
        /* 非技能目录 */
      }
    }
  } catch {
    /* seep-kit 未随包 */
  }

  const rea = [];
  const reaRoot = reaDir();
  try {
    if (fs.existsSync(reaRoot)) {
      for (const d of fs.readdirSync(reaRoot, { withFileTypes: true })) {
        if (d.isDirectory() && fs.existsSync(path.join(reaRoot, d.name, "SKILL.md"))) {
          rea.push(d.name);
        }
      }
    }
  } catch {
    /* REA 未部署 */
  }

  return { seep: [...new Set(seep)].sort(), rea: rea.sort() };
}

// ---------- 功能1：一键注入状态总览 ----------

function overview() {
  const st = installedSnapshot();
  return {
    updatedAt: Date.now(),
    targets: TARGET_IDS.map((id) => ({
      id,
      installed: Boolean(st.installed[id]),
      prompt: st.installed[id] || "",
      at: (st.meta[id] && st.meta[id].at) || 0,
    })),
  };
}

// ---------- 功能2：注入任务历史 ----------

function historyList() {
  return installedSnapshot().history;
}

// ---------- 功能3：提示词管理 ----------

function promptDir() {
  return p(MEMORY_DIR);
}

function currentActivePromptName() {
  const st = loadState();
  if (st.activePrompt) {
    try {
      if (fs.existsSync(path.join(promptDir(), st.activePrompt))) return st.activePrompt;
    } catch {
      /* 落到默认 */
    }
  }
  const mp = memoryPrompt();
  return mp ? mp.name : "";
}

function listPromptFiles() {
  const dir = promptDir();
  const active = currentActivePromptName();
  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith(".md") && n.toLowerCase() !== "readme.md")
      .sort();
  } catch {
    return [];
  }
  return names.map((name) => {
    let chars = 0;
    try {
      chars = fs.readFileSync(path.join(dir, name), "utf8").trim().length;
    } catch {
      /* 读不了按 0 字 */
    }
    return { name, chars, current: name === active };
  });
}

function importPromptFile(sourcePath) {
  if (typeof sourcePath !== "string" || !sourcePath) return { ok: false, error: "空来源路径" };
  const src = path.resolve(sourcePath);
  let text;
  try {
    text = fs.readFileSync(src, "utf8");
  } catch (e) {
    return { ok: false, error: "读取失败：" + String(e.message) };
  }
  if (!text.trim()) return { ok: false, error: "文件内容为空" };
  const name = path.basename(src);
  const dest = path.join(promptDir(), name);
  try {
    fs.mkdirSync(promptDir(), { recursive: true });
    fs.writeFileSync(dest, text, "utf8");
  } catch (e) {
    return { ok: false, error: "写入失败：" + String(e.message) };
  }
  return { ok: true, name, chars: text.trim().length };
}

function deletePromptFile(name) {
  if (typeof name !== "string") return { ok: false, error: "非法文件名" };
  const dir = path.resolve(promptDir());
  const dest = path.resolve(dir, name);
  if (dest === dir || !dest.startsWith(dir + path.sep)) return { ok: false, error: "非法文件名" };
  if (!/\.md$/i.test(dest)) return { ok: false, error: "只允许删除 .md 文件" };
  let exists = false;
  try {
    exists = fs.existsSync(dest);
  } catch {
    exists = false;
  }
  if (!exists) return { ok: false, error: "文件不存在" };
  const st = loadState();
  if (st.activePrompt === name) return { ok: false, error: "当前注入源不能删除，请先切换" };
  try {
    fs.unlinkSync(dest);
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
  return { ok: true };
}

function selectPromptFile(name) {
  const dir = path.resolve(promptDir());
  const dest = path.resolve(dir, name);
  let exists = false;
  try {
    exists = fs.existsSync(dest);
  } catch {
    exists = false;
  }
  if (!exists || !dest.startsWith(dir + path.sep)) return { ok: false, error: "文件不存在" };
  saveState({ activePrompt: name });
  return { ok: true, name };
}

// ---------- 功能5：依赖检测/修复 ----------

function checkDeps() {
  const cmd =
    "$ErrorActionPreference='SilentlyContinue'; " +
    "$names = @('python','python3','nmap','radare2','r2','jadx','frida','git','7z','7za'); " +
    "$out = foreach($n in $names){ $r = Get-Command $n -ErrorAction SilentlyContinue | Select-Object -First 1; " +
    "if($r){ [PSCustomObject]@{ name=$n; ok=$true; path=$r.Source } } else { [PSCustomObject]@{ name=$n; ok=$false; path='' } } }; " +
    "@($out) | ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-Command", cmd], { windowsHide: true });
    let raw = Buffer.alloc(0);
    const on = (b) => {
      raw = Buffer.concat([raw, b]);
    };
    ps.stdout.on("data", on);
    ps.stderr.on("data", on);
    ps.on("close", () => {
      const text = decodeConsoleOutput(raw).trim();
      try {
        resolve({ ok: true, deps: JSON.parse(text) });
      } catch (e) {
        resolve({ ok: false, deps: [], error: text || String((e && e.message)) });
      }
    });
    ps.on("error", (e) => resolve({ ok: false, deps: [], error: String(e && e.message) }));
  });
}

/** 依赖修复：跑随包 Seep 工作台的 repair-tools.ps1，把缺的工具链补齐。 */
function fixDeps() {
  const script = seepScript("repair-tools.ps1");
  if (!fs.existsSync(script)) {
    const text = `随包缺少依赖修复脚本：${script}`;
    return Promise.resolve({ ok: false, code: -1, timedOut: false, out: text, error: text });
  }
  return runPowerShell(["-File", script, "-NonInteractive"], "修复逆向工具链", SEEP_TIMEOUT);
}

// ---------- 功能4：引擎管理（双引擎） ----------

const REA_PROXIES = ["https://ghfast.top", "https://gh-proxy.com"];
const REA_REPO = "morluto/rea";
const REA_ARCHIVE_PATH = `https://github.com/${REA_REPO}/archive/refs/heads/main.zip`;
let reaDownloading = false;

function reaDir() {
  return p("rea");
}

function reaState() {
  const dir = reaDir();
  let installed = false;
  let version = "";
  try {
    installed = fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, "README.md"));
    if (installed) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
        version = pkg.version || "main";
      } catch {
        version = "main";
      }
    }
  } catch {
    /* 未安装 */
  }
  return { installed, version, downloading: reaDownloading };
}

/** 带进度回调的 https 下载，自动跟随 3xx 跳转（ghfast.top 会 302 到真实地址）。 */
function downloadTo(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const doGet = (target, redirectsLeft) => {
      https
        .get(target, { headers: { "User-Agent": "seagull-v8/1.0" } }, (res) => {
          const status = res.statusCode || 0;
          if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
            res.resume();
            doGet(new URL(res.headers.location, target).toString(), redirectsLeft - 1);
            return;
          }
          if (status !== 200) {
            res.resume();
            reject(new Error("HTTP " + status));
            return;
          }
          const total = Number(res.headers["content-length"]) || 0;
          let received = 0;
          const ws = fs.createWriteStream(dest);
          res.on("data", (chunk) => {
            received += chunk.length;
            if (onProgress) onProgress({ received, total, pct: total ? Math.round((received / total) * 100) : 0 });
          });
          res.pipe(ws);
          ws.on("finish", () => ws.close(() => resolve({ received, total })));
          ws.on("error", (e) => reject(e));
          res.on("error", (e) => reject(e));
        })
        .on("error", reject);
    };
    doGet(url, 6);
  });
}

/** 下载 REA 到临时 zip，再用系统 tar 解到 rea/。任一代理失败自动切下一个。 */
async function reaInstall() {
  if (reaDownloading) return { ok: false, code: -1, out: "REA 正在下载中，请稍候", timedOut: false };
  reaDownloading = true;
  send("tool:rea:progress", { pct: 0, label: "准备下载 REA …" });
  const tmp = path.join(os.tmpdir(), "seagull-rea-main.zip");
  let lastErr = null;
  try {
    for (const proxy of REA_PROXIES) {
      const url = proxy + "/" + REA_ARCHIVE_PATH;
      send("tool:rea:progress", { pct: 0, label: "测速节点 " + proxy + " …" });
      try {
        await downloadTo(url, tmp, (p) => send("tool:rea:progress", { pct: p.pct, label: "下载 REA " + p.pct + "%" }));
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        send("tool:rea:progress", { pct: 0, label: "节点 " + proxy + " 失败，切换下一个" });
      }
    }
    if (lastErr) throw lastErr;

    const dest = reaDir();
    fs.mkdirSync(dest, { recursive: true });
    send("tool:rea:progress", { pct: 100, label: "解压 REA …" });
    await new Promise((resolve, reject) => {
      const t = spawn("tar", ["-xf", tmp, "-C", dest, "--strip-components=1"], { windowsHide: true });
      t.on("close", (code) => (code === 0 ? resolve() : reject(new Error("tar 退出码 " + code))));
      t.on("error", reject);
    });
    send("tool:rea:progress", { pct: 100, label: "REA 部署完成" });
    appendHistory({ action: "rea-install", target: "rea", prompt: "", ok: true });
    return { ok: true, code: 0, out: "REA 已部署到 " + dest, timedOut: false };
  } catch (e) {
    const msg = String((e && e.message) || e);
    send("tool:rea:progress", { pct: 0, label: "REA 下载失败：" + msg });
    appendHistory({ action: "rea-install", target: "rea", prompt: "", ok: false, detail: msg });
    return { ok: false, code: -1, out: msg, timedOut: false, error: msg };
  } finally {
    reaDownloading = false;
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* 临时文件留着无妨 */
    }
  }
}

function reaUninstall() {
  const dir = reaDir();
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, out: "REA 已卸载" };
  } catch (e) {
    return { ok: false, out: String(e.message), error: String(e.message) };
  }
}

// ---------- 功能7：故障诊断报告 ----------

function diagnose() {
  const lines = [];
  const push = (k, v) => lines.push(`${k}: ${v}`);
  push("诊断时间", new Date().toISOString());
  push("应用名", APP_NAME);
  push("变体", VARIANT);
  push("应用版本", app.getVersion());
  push("系统", `${os.platform()} ${os.release()} ${os.arch()}`);
  push("Node", process.version);
  push("Electron", process.versions.electron || "");
  push("工具目录", toolDir());
  push("主目录", homeDir());
  push("Codex 目录", codexHome());
  push("状态文件", statePath() + (fs.existsSync(statePath()) ? "（存在）" : "（不存在）"));
  push("记忆目录", promptDir() + (fs.existsSync(promptDir()) ? "（存在）" : "（不存在）"));
  const st = installedSnapshot();
  push("已注入目标", Object.keys(st.installed).join(", ") || "（无）");
  push("历史记录数", String(st.history.length));
  for (const [id, script] of Object.entries(SCRIPTS)) {
    push(`脚本 ${id}`, p(script) + (fs.existsSync(p(script)) ? "（存在）" : "（缺失）"));
  }
  const ss = seepState();
  push("Seep 工具链", ss.kit ? "完整" : "缺失");
  push("Seep 已部署", ss.installed ? "是" : "否");
  push("Seep 版本", ss.version || "（未知）");
  const rs = reaState();
  push("REA 已部署", rs.installed ? "是" : "否");
  push("REA 版本", rs.version || "（未安装）");
  const cfg = configToml();
  push("config.toml", cfg + (fs.existsSync(cfg) ? "（存在）" : "（不存在）"));
  push("skills 目录", skillsDir() + (fs.existsSync(skillsDir()) ? "（存在）" : "（不存在）"));
  return lines.join("\n");
}

// ---------- 功能6：远程配置热更新 ----------

function fetchRemoteConfig(url) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return Promise.resolve({ ok: false, error: "仅支持 http(s) 地址" });
  }
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": "seagull-v8/1.0" } }, (res) => {
        let raw = Buffer.alloc(0);
        res.on("data", (c) => (raw = Buffer.concat([raw, c])));
        res.on("end", () => {
          try {
            const json = JSON.parse(raw.toString("utf8"));
            saveState({ remoteConfig: json, remoteUrl: url, remoteAt: Date.now() });
            resolve({ ok: true, data: json });
          } catch (e) {
            resolve({ ok: false, error: "非 JSON 内容：" + String(e.message) });
          }
        });
      })
      .on("error", (e) => resolve({ ok: false, error: String(e.message) }));
  });
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle("tool:state", () => ({
    installed: installedSnapshot().installed,
    version: app.getVersion(),
  }));

  /** 记忆文件状态：界面用它显示「已填写 N 字 / 还没填」，安装前也会再查一次。 */
  ipcMain.handle("tool:memory", () => memoryPrompt());

  // ---- 功能1：一键注入状态总览 ----
  ipcMain.handle("tool:overview", () => overview());

  // ---- 功能2：注入任务历史 ----
  ipcMain.handle("tool:history", () => historyList());

  // ---- 功能3：提示词管理 ----
  ipcMain.handle("tool:prompts:list", () => listPromptFiles());
  ipcMain.handle("tool:prompts:import", async (_e, sourcePath) => {
    let src = sourcePath;
    // 未传来源时弹系统文件选择器，只挑 .md/.txt
    if (!src) {
      const r = await dialog.showOpenDialog(win, {
        title: "导入提示词",
        filters: [
          { name: "Markdown / 文本", extensions: ["md", "txt"] },
          { name: "所有文件", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, error: "已取消" };
      src = r.filePaths[0];
    }
    return importPromptFile(src);
  });
  ipcMain.handle("tool:prompts:delete", (_e, name) => deletePromptFile(name));
  ipcMain.handle("tool:prompts:select", (_e, name) => selectPromptFile(name));

  // ---- 功能5：依赖检测/修复 ----
  ipcMain.handle("tool:deps:check", () => checkDeps());
  ipcMain.handle("tool:deps:fix", () => fixDeps());

  // ---- 功能4：引擎管理（双引擎） ----
  ipcMain.handle("tool:engines:state", () => ({ seep: seepState(), rea: reaState() }));
  ipcMain.handle("tool:rea:install", () => reaInstall());
  ipcMain.handle("tool:rea:uninstall", () => reaUninstall());

  // ---- 功能7：故障诊断报告 ----
  ipcMain.handle("tool:diagnose", () => diagnose());

  // ---- 功能6：远程配置热更新 ----
  ipcMain.handle("tool:remote:fetch", (_e, url) => fetchRemoteConfig(url));

  /**
     安装：把 memory/ 里用户填的提示词注入目标，并同步随包的 Seep 工作台技能库。
     记忆为空时直接失败 —— 宁可报错，也不要把空内容写进用户的 AGENTS.md / 记忆档案。
  */
  ipcMain.handle("tool:install", async (_e, targetId) => {
    const installed = installedSnapshot().installed;
    if (!SCRIPTS[targetId]) {
      return { ok: false, code: -1, timedOut: false, out: `未知的破甲目标：${targetId}`, installed };
    }
    const prompt = memoryPrompt();
    if (!prompt) {
      const dir = p(MEMORY_DIR);
      const text = `记忆文件为空：请先把提示词粘进 ${dir} 下的 .md 文件，再点安装。`;
      send("tool:status", { label: "记忆文件为空", state: "idle" });
      send("tool:log", { label: "安装中止", text: text + "\n" });
      return { ok: false, code: -1, timedOut: false, out: text, error: text, installed };
    }
    const res = await runPowerShell(installArgs(targetId, prompt.path), `安装 ${targetId}`, INSTALL_TIMEOUT);
    if (res.ok) {
      const st = loadState();
      st.installed[targetId] = prompt.name;
      saveState({ installed: st.installed });
      setInstalledMeta(targetId, prompt.name);
      appendHistory({ action: "install", target: targetId, prompt: prompt.name, ok: true });
    } else {
      appendHistory({ action: "install", target: targetId, prompt: prompt.name, ok: false, detail: res.error || res.out || "" });
    }
    return { ...res, installed: installedSnapshot().installed };
  });

  ipcMain.handle("seep:state", () => seepState());

  /** 部署 Seep 工作台：解压离线依赖 + Python 依赖 + Pi/Claude/DSH 配置 + 自检。 */
  ipcMain.handle("seep:install", async () => {
    const script = seepScript("install.ps1");
    if (!fs.existsSync(script)) {
      const text = `随包缺少 Seep 工作台安装脚本：${script}`;
      return { ok: false, code: -1, timedOut: false, out: text, error: text };
    }
    return runPowerShell(["-File", script, "-NonInteractive"], "部署 Seep 逆向工作台", SEEP_TIMEOUT);
  });

  ipcMain.handle("seep:uninstall", async () => {
    const script = seepScript("uninstall.ps1");
    if (!fs.existsSync(script)) {
      const text = `随包缺少 Seep 工作台卸载脚本：${script}`;
      return { ok: false, code: -1, timedOut: false, out: text, error: text };
    }
    // -Yes 跳过交互确认（主进程没法回话），保留用户自装技能与自己的配置
    return runPowerShell(["-File", script, "-Yes"], "卸载 Seep 逆向工作台", SEEP_TIMEOUT);
  });

  ipcMain.handle("seep:verify", async () => {
    const script = seepScript("verify.ps1");
    if (!fs.existsSync(script)) {
      const text = `随包缺少 Seep 工作台自检脚本：${script}`;
      return { ok: false, code: -1, timedOut: false, out: text, error: text };
    }
    return runPowerShell(["-File", script, "-Detailed"], "Seep 工作台自检", SEEP_TIMEOUT);
  });


  ipcMain.handle("tool:uninstall", async (_e, targetId) => {
    const res = await runPowerShell(uninstallArgs(targetId), `卸载 ${targetId}`, UNINSTALL_TIMEOUT);
    if (res.ok) {
      const st = loadState();
      delete st.installed[targetId];
      saveState({ installed: st.installed });
      setInstalledMeta(targetId, null);
    }

    // 兜底清扫：**不依赖 install*.ps1 的卸载结果**，无条件执行。
    //
    // install*.ps1 的卸载靠 <Home>\managed-prompts\install-state.json 记录该删哪些提示词。
    // state 一旦不在了（被清理工具删过、用户手工删过、上次卸载删掉了），提示词就留在盘上
    // 没人管 —— 实测本机 5 个提示词 + 几个 .mdc 就是这么残留的。
    //
    // 而且卸载脚本自己也可能失败（文件被占用、权限不足、脚本报错）。早期写法把这一步
    // 放在 `if (res.ok)` 里面，于是「卸载脚本失败 ⇒ 兜底也不跑 ⇒ 提示词原样留着」——
    // 偏偏那正是最需要兜底的时候。「点卸载 = 提示词清干净」是硬要求，所以移到这里。
    //
    // 这一步按注入点和副产物直接扫，只清提示词，用户的 AGENTS.md / CLAUDE.md /
    // config.toml / 自己的备份一律不动（详见脚本头部注释）。
    const sweep = await runPowerShell(
      clearPromptsArgs(targetId),
      `清理 ${targetId} 提示词残留`,
      UNINSTALL_TIMEOUT,
    );
    res.out = (res.out || "") + "\n" + (sweep.out || "");
    if (!sweep.ok) {
      res.ok = false;
      res.error = sweep.error || "提示词残留清理失败";
    }
    appendHistory({ action: "uninstall", target: targetId, prompt: "", ok: res.ok, detail: res.error || "" });
    return { ...res, installed: installedSnapshot().installed };
  });

  // 装回原始记忆：把该目标的注入内容还原成原版，技能库保留。
  //
  // 这里**不跑** clearPromptsArgs 兜底清扫 —— 那个脚本连技能树一起清（它的职责是卸载后的
  // 零残留），跟「只想换回原版」正好相反。注入内容本身也不需要它兜底：本 handler 与卸载
  // 走同一段还原逻辑，各注入点（AGENTS.md / CLAUDE.md / config.toml / 记忆档案）都在里面处理掉了。
  ipcMain.handle("tool:restoreMemory", async (_e, targetId) => {
    if (!SCRIPTS[targetId]) {
      return {
        ok: false,
        code: -1,
        timedOut: false,
        out: `未知的破甲目标：${targetId}`,
        installed: installedSnapshot().installed,
      };
    }
    const res = await runPowerShell(
      restoreMemoryArgs(targetId),
      `装回 ${targetId} 原始记忆`,
      UNINSTALL_TIMEOUT,
    );
    appendHistory({ action: "restore", target: targetId, prompt: "", ok: res.ok, detail: res.error || "" });
    // 不动 installed 记录：技能库还在，工具仍处于已安装状态 ——
    // 想彻底回到安装前用「卸载」，这个按钮只负责把记忆换回来。
    return { ...res, installed: installedSnapshot().installed };
  });

  ipcMain.handle("tool:restartCodex", async () => {
    const cmd =
      "$ErrorActionPreference = 'SilentlyContinue'; " +
      "$appId = (Get-StartApps | Where-Object { $_.AppID -like 'OpenAI.Codex*' } | Select-Object -First 1 -ExpandProperty AppID); " +
      "$chat = @(Get-Process ChatGPT | Where-Object { $_.Path -like '*OpenAI.Codex*' }); " +
      "$chat | Stop-Process -Force; " +
      "$cx = @(Get-Process codex -ErrorAction SilentlyContinue); " +
      "$cx | Stop-Process -Force; " +
      "Start-Sleep -Milliseconds 1200; " +
      "if (-not $appId) { Write-Output 'no-appid'; exit 0 } " +
      // 直接 Start-Process shell:AppsFolder 拉起；多套一层 explorer.exe -ArgumentList 实测不可靠
      "Start-Process ('shell:AppsFolder\\' + $appId); " +
      // 等应用真起来再回话，避免「命令发出去了但其实没启动」也算成功
      "for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if (@(Get-Process ChatGPT).Count -gt 0) { break } } " +
      "Write-Output ('launched:' + $appId + ' procs:' + @(Get-Process ChatGPT).Count)";
    return new Promise((resolve) => {
      /*
        这里不能带 detached: true。Windows 上 detached 走 DETACHED_PROCESS，
        powershell 失去控制台后会在 ~100ms 内直接退出、命令一行都不执行
        （实测：带 detached 时 stdout 为空、94ms 退出；去掉后 900ms 正常返回），
        表现就是点「重启 Codex」毫无反应。父进程 await close 即可，无需 detach。
      */
      const ps = spawn("powershell.exe", ["-NoProfile", "-Command", cmd], { windowsHide: true });
      let out = "";
      let raw = Buffer.alloc(0);
      const onChunk = (buf) => {
        raw = Buffer.concat([raw, buf]);
        out = decodeConsoleOutput(raw);
      };
      ps.stdout.on("data", onChunk);
      ps.stderr.on("data", onChunk);
      ps.on("close", (code) => {
        const text = out.trim();
        const launched = /^launched:/m.test(text);
        resolve({
          ok: code === 0 && launched,
          code: code == null ? -1 : code,
          out: text,
          // 没找到 AppID 时给一句能看懂的话，而不是把失败也报成「重启指令已发送」
          error: launched ? undefined : text || "未找到 Codex 应用（Get-StartApps 无 OpenAI.Codex* 条目）",
        });
      });
      ps.on("error", (e) => resolve({ ok: false, code: -1, out, error: String(e && e.message) }));
    });
  });

  ipcMain.handle("tool:skills:list", () => listSkills());
  ipcMain.handle("tool:skills:layers", () => skillLayers());
  ipcMain.handle("tool:skills:save", (_e, disabled) => writeDisabledSkills(disabled || []));

  ipcMain.handle("tool:openQQ", async (_e, url) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      console.log("[openQQ] 拒绝非 http(s) 链接:", url);
      return { ok: false, error: "invalid url" };
    }
    try {
      await shell.openExternal(url);
      console.log("[openQQ] 已用系统浏览器打开:", url.slice(0, 60) + "…");
      return { ok: true };
    } catch (e) {
      console.log("[openQQ] 打开失败:", String(e && e.message));
      return { ok: false, error: String(e && e.message) };
    }
  });

  ipcMain.handle("tool:quit", () => {
    app.quit();
    return { ok: true };
  });

  ipcMain.handle("tool:win", (_e, action) => {
    if (!win) return { ok: false };
    if (action === "minimize") win.minimize();
    else if (action === "maximize") win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === "close") win.close();
    return { ok: true };
  });
}

// ---------- 窗口 ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: "#ffffff",
    title: APP_NAME,
    /*
      用系统原生标题栏。之前用 titleBarStyle:"hidden" 自绘拖拽条，
      在 Windows 上导致窗口拖不动、且只有上下边能缩放；原生边框两个问题都没有。
    */
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  /*
    显示窗口。只挂 ready-to-show 并不可靠：窗口以 show:false 创建时，若
    Chromium 判定窗口被遮挡 / 未激活，首帧可能迟迟不画，ready-to-show 就
    不触发，结果是进程活着但永远没有窗口。这里三重兜底。
  */
  const showOnce = () => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  };
  win.once("ready-to-show", showOnce);
  win.webContents.once("did-finish-load", showOnce);
  setTimeout(showOnce, 1200);

  // 默认加载构建产物；只有显式 HS_DEV=1 时才连 Vite 开发服务器。
  if (!app.isPackaged && process.env.HS_DEV) {
    win.loadURL("http://localhost:5273");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // 关窗只收进托盘（与 Python 版一致）；真正退出走托盘菜单或 app.quit()
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    win = null;
  });

  // 开发用：把渲染进程的 console / 未捕获异常转发到终端
  if (process.env.HS_CAPTURE || process.env.HS_DEBUG) {
    win.webContents.on("console-message", (_e, lvl, msg, line, src) => {
      console.log("[renderer:%s] %s (%s:%s)", lvl, msg, src, line);
    });
    win.webContents.on("render-process-gone", (_e, d) => {
      console.log("[renderer gone]", JSON.stringify(d));
    });
    win.webContents.on("did-fail-load", (_e, code, desc) => {
      console.log("[load failed]", code, desc);
    });
  }

  // 开发用：HS_CAPTURE=<dir> 时逐页截图后退出，用于验收版式。
  if (process.env.HS_CAPTURE) {
    win.webContents.once("did-finish-load", () => {
      captureAll(process.env.HS_CAPTURE).catch(() => app.quit());
    });
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureAll(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const nav = (i) => `document.querySelectorAll(".settings-nav-scroll .settings-nav-item")[${i}].click()`;
  // 索引跟随 data/targets.ts 的目标顺序；工具组固定排在目标组之后
  const shots = [
    ["codex", null],
    ["zcode", nav(1)],
    ["workbuddy", nav(5)],
    ["dsh", nav(7)],
    ["seep", nav(9)],
    ["skills", nav(10)],
    ["tutorial", nav(11)],
    ["profile", 'document.querySelector(".app-nav-foot .settings-nav-item").click()'],
  ];
  // 截图前确保窗口真正可见并聚焦，否则 Chromium 会冻结 CSS 动画时间线
  try {
    win.show();
    win.focus();
    win.moveTop();
  } catch {
    /* ignore */
  }
  await wait(2000);
  if (process.env.HS_QQTEST) {
    const r = await win.webContents.executeJavaScript(
      'window.hs.openQQ("https://qun.qq.com/universal-share/share?ac=1&authKey=test")',
    );
    console.log("[qqtest] openQQ ->", JSON.stringify(r));
  }
  if (process.env.HS_DOM) {
    console.log(
      "[vis]",
      await win.webContents.executeJavaScript(
        "document.visibilityState + ' hidden=' + document.hidden",
      ),
    );
  }
  if (process.env.HS_DOM) {
    const info = await win.webContents.executeJavaScript(`(() => {
      const r = document.getElementById("root");
      const cs = r ? getComputedStyle(r) : null;
      return JSON.stringify({
        rootChildren: r ? r.children.length : -1,
        rootHTML: r ? r.innerHTML.slice(0, 400) : "",
        rootBox: r ? [r.clientWidth, r.clientHeight] : null,
        bodyBox: [document.body.clientWidth, document.body.clientHeight],
        rootDisplay: cs ? cs.display : null,
        probe: [".app-shell", ".settings-shell-full", ".settings-nav", ".settings-content",
                ".settings-section-title", ".settings-card-heading"].map(sel => {
          const el = document.querySelector(sel);
          if (!el) return sel + " => MISSING";
          const c = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return sel + " rect=" + Math.round(r.width) + "x" + Math.round(r.height) +
                 " disp=" + c.display + " vis=" + c.visibility + " op=" + c.opacity +
                 " color=" + c.color + " bg=" + c.backgroundColor +
                 " anim=" + c.animationName + " fs=" + c.fontSize;
        }),
        cssVars: ["--ds-text-primary","--ds-bg-primary","--text-md","--radius-md","--ds-accent"]
          .map(v => v + "=" + getComputedStyle(document.documentElement).getPropertyValue(v).trim()),
        scripts: [...document.scripts].map(s => s.src),
        sheets: [...document.styleSheets].length,
      });
    })()`);
    console.log("[dom]", info);
  }
  // 先同意免责声明，否则遮罩挡住后面的交互
  await win.webContents.executeJavaScript(
    'document.querySelector(".dialog .btn-primary")?.click(), true',
  );
  await wait(400);

  // 开发用：HS_INSTALLTEST=<targetId> 时在界面上真点一次「安装」，把状态与日志抓回来
  if (process.env.HS_INSTALLTEST) {
    const target = process.env.HS_INSTALLTEST;
    const navIdx = { codex: 0, zcode: 1, cursor: 2, opencode: 3, claude: 4, workbuddy: 5, dsh: 7 }[target];
    if (navIdx !== undefined) {
      await win.webContents.executeJavaScript(
        `document.querySelectorAll(".settings-nav-scroll .settings-nav-item")[${navIdx}].click(), true`,
      );
      await wait(600);
    }
    // HS_PROMPTTEST=<版本名片段>：先选中对应版本，再点安装/卸载
    if (process.env.HS_PROMPTTEST) {
      const picked = await win.webContents.executeJavaScript(`(() => {
        const want = ${JSON.stringify(process.env.HS_PROMPTTEST)};
        const row = [...document.querySelectorAll(".settings-panel .settings-row")].find((r) => r.textContent.includes(want));
        if (row) row.click();
        return !!row;
      })()`);
      console.log("[installtest] 选中版本 " + process.env.HS_PROMPTTEST + " -> " + picked);
      await wait(400);
    }
    await win.webContents.executeJavaScript(`(() => {
      const btns = [...document.querySelectorAll(".app-inline-actions .btn")];
      const btn = ${process.env.HS_UNINSTALLTEST ? 'btns.find((b) => /卸载/.test(b.textContent))' : 'btns.find((b) => /安装/.test(b.textContent) && !/卸载|重启/.test(b.textContent))'};
      if (btn) btn.click();
      return !!btn;
    })()`);

    // HS_CHOICETEST=<名称片段>：V5 双提示词弹框里选中那一份再确认（截图留证）
    if (process.env.HS_CHOICETEST) {
      await wait(700);
      const info = await win.webContents.executeJavaScript(`(() => {
        const rows = [...document.querySelectorAll(".overlay .settings-row")];
        const row = rows.find((r) => r.textContent.includes(${JSON.stringify(process.env.HS_CHOICETEST)}));
        if (row) row.click();
        return JSON.stringify({
          rows: rows.map((r) => r.querySelector(".settings-row-title").textContent.trim()),
          picked: !!row,
        });
      })()`);
      console.log("[choicetest] 弹框选项 " + info);
      const shot = await win.webContents.capturePage();
      fs.writeFileSync(path.join(dir, "v5-choice-dialog.png"), shot.toPNG());
      const confirmed = await win.webContents.executeJavaScript(`(() => {
        const ok = [...document.querySelectorAll(".overlay .app-inline-actions .btn")]
          .find((b) => /^安装/.test(b.textContent.trim()));
        if (ok) ok.click();
        return ok ? ok.textContent.trim() : false;
      })()`);
      console.log("[choicetest] 确认 -> " + confirmed);
    }
    await wait(25000);
    const state = await win.webContents.executeJavaScript(`(() => {
      const descs = [...document.querySelectorAll(".settings-card-description")];
      const badge = document.querySelector(".badge-success, .badge-neutral");
      const pre = document.querySelector(".app-pre");
      const btn = [...document.querySelectorAll(".app-inline-actions .btn")].find((b) => /安装|执行中/.test(b.textContent));
      return JSON.stringify({
        status: descs.length ? descs[descs.length - 1].textContent.trim().slice(0, 200) : "(无)",
        badge: badge ? badge.textContent.trim().slice(0, 40) : "(无)",
        button: btn ? btn.textContent.trim() : "(无)",
        log: pre ? pre.textContent.trim().slice(-500) : "(无日志)",
      });
    })()`);
    console.log("[installtest] " + target + " -> " + state);
  }

  // 开发用：HS_SKILLTEST=1 时点一次「保存」并断言全局提示出现（验收 Skills 保存反馈）
  if (process.env.HS_SKILLTEST) {
    await win.webContents.executeJavaScript(
      'document.querySelectorAll(".settings-nav-scroll .settings-nav-item")[10].click(), true',
    );
    await wait(500);
    const clicked = await win.webContents.executeJavaScript(`(() => {
      const btns = [...document.querySelectorAll(".app-inline-actions .btn")];
      const save = btns.find((b) => b.textContent.trim() === "保存");
      if (!save) return "NO_SAVE_BUTTON";
      save.click();
      return "CLICKED";
    })()`);
    await wait(1200);
    const toast = await win.webContents.executeJavaScript(
      '(() => { const t = document.querySelector(".toast"); return t ? t.textContent.trim() : "NO_TOAST"; })()',
    );
    console.log("[skilltest] 点击=" + clicked + " 提示=" + toast);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, "skills-save-toast.png"), img.toPNG());
  }
  for (const [name, js] of shots) {
    if (js) {
      await win.webContents.executeJavaScript(js + ", true");
      // 页面重（技能列表 / 教程长文）时 450ms 会抓到上一页，留够渲染时间
      await wait(1200);
    }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, name + ".png"), img.toPNG());
  }
  app.quit();
}

/** 显示窗口；若之前已被销毁则重建。托盘点击、菜单、第二实例都走这里。 */
function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function makeTrayIcon() {
  // 与安装包图标同一张图；打包后在 resources/icon.png，开发时在 build/
  const candidates = [
    path.join(process.resourcesPath || "", "icon.png"),
    path.join(__dirname, "..", "build", "icon-256.png"),
  ];
  for (const f of candidates) {
    try {
      if (f && fs.existsSync(f)) {
        const img = nativeImage.createFromPath(f);
        if (!img.isEmpty()) return img;
      }
    } catch {
      /* 落到下面的兜底 */
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <rect width="32" height="32" rx="7" fill="#2E8FE0"/>
    <text x="16" y="23" font-size="20" text-anchor="middle" fill="#ffffff">寒</text>
  </svg>`;
  return nativeImage.createFromDataURL(
    "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64"),
  );
}

function setupTray() {
  try {
    tray = new Tray(makeTrayIcon());
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示主界面", click: () => showWindow() },
        { type: "separator" },
        { label: "退出", click: () => app.quit() },
      ]),
    );
    tray.on("click", () => showWindow());
  } catch {
    tray = null;
  }
}

// ---------- 生命周期 ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    setupTray();
  });

  app.on("window-all-closed", () => {
    // 托盘常驻：关掉窗口不退出应用
    if (!tray) app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
    killChild();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  app.on("activate", () => showWindow());
}
