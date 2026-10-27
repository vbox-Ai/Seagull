'use strict';
// rules-core.js —— 规则源装载与配置合并（A / B / D 三方案共用）
// 只读取、不改写原文件。
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const CONFIG_LOCAL_PATH = path.join(__dirname, 'config.local.json');

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// 深合并：本地配置覆盖主配置，避免把 key 写进要提交的文件
function merge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

// 展开 ~ / %USERPROFILE% / $HOME，让 config.json 可移植
function expand(p) {
  if (!p) return p;
  return p
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || os.homedir())
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || '')
    .replace(/\$HOME/g, os.homedir());
}

// 配置里的路径不存在时，按 Trae 的实际布局兜底探测
function resolveRulesFile(configured) {
  const home = os.homedir();
  const name = '海鸥V8·破甲版.md';
  const cands = [
    configured,
    path.join(home, '.trae-cn', 'user_rules', name),
    path.join(home, '.trae', 'user_rules', name),
  ].filter(Boolean);
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return configured || cands[1];
}

function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('[config] 读取 config.json 失败：', e.message);
  }
  // config.local.json 已 gitignore：放 key、改端口，不要动主配置
  try {
    cfg = merge(cfg, JSON.parse(fs.readFileSync(CONFIG_LOCAL_PATH, 'utf8')));
  } catch { /* 可选文件，不存在属正常 */ }
  const env = process.env;
  cfg.marker = env.MARKER || cfg.marker || 'HANSHUANG-INJECT';
  cfg.proxy = cfg.proxy || {};
  cfg.cdp = cfg.cdp || {};
  if (env.RULES) cfg.rulesFile = env.RULES;
  if (env.PORT) cfg.proxy.port = Number(env.PORT);
  if (env.UPSTREAM) cfg.proxy.upstream = env.UPSTREAM;
  if (env.UPSTREAM_KEY) cfg.proxy.upstreamKey = env.UPSTREAM_KEY;
  if (env.CDP_ENDPOINT) cfg.cdp.endpoint = env.CDP_ENDPOINT;
  cfg.rulesFile = resolveRulesFile(expand(cfg.rulesFile));
  return cfg;
}

class RuleSource {
  constructor(file) {
    this.file = file;
    this.text = '';
    this.mtime = 0;
    this.hash = '';
    this.onLoad = null;
    this.onError = null;
  }

  read() {
    try {
      const st = fs.statSync(this.file);
      if (st.mtimeMs !== this.mtime) {
        this.text = fs.readFileSync(this.file, 'utf8');
        this.mtime = st.mtimeMs;
        this.hash = crypto.createHash('sha256').update(this.text).digest('hex').slice(0, 16);
        if (this.onLoad) this.onLoad(this.text.length, this.hash);
      }
    } catch (e) {
      if (this.onError) this.onError(e);
    }
    return this.text;
  }

  get size() {
    return this.text.length;
  }
}

// 统一注入：OpenAI(messages) 与 Anthropic(system) 两种请求形态都覆盖
// mode:
//   append  —— 追加到已有 system 前面（默认，保留客户端原生提示词）
//   replace —— 用规则整体替换 system（客户端自带的身份声明会被顶掉）
function elevate(body, text, marker, mode) {
  const m = mode || 'append';
  if (!text) return { body, kind: 'empty' };

  const replaceMode = m === 'replace';

  if (typeof body.system === 'string') {
    if (!replaceMode && body.system.includes(marker)) return { body, kind: 'skip' };
    body.system = replaceMode ? text : text + '\n\n' + body.system;
    return { body, kind: replaceMode ? 'anthropic-replace' : 'anthropic' };
  }

  if (Array.isArray(body.system)) {
    if (!replaceMode && JSON.stringify(body.system).includes(marker)) return { body, kind: 'skip' };
    if (replaceMode) body.system = [{ type: 'text', text }];
    else body.system.unshift({ type: 'text', text });
    return { body, kind: replaceMode ? 'anthropic-array-replace' : 'anthropic-array' };
  }

  if (Array.isArray(body.messages)) {
    if (replaceMode) {
      // 去掉客户端自带的全部 system，换成规则；其余消息保持原序
      if (body.messages[0] && body.messages[0].role === 'system' && body.messages[0].content === text) {
        return { body, kind: 'skip' };
      }
      const rest = body.messages.filter((x) => x && x.role !== 'system');
      body.messages = [{ role: 'system', content: text }, ...rest];
      return { body, kind: 'openai-replace' };
    }

    if (JSON.stringify(body.messages).includes(marker)) return { body, kind: 'skip' };
    const first = body.messages[0];
    if (first && first.role === 'system' && typeof first.content === 'string') {
      body.messages[0].content = text + '\n\n' + first.content;
      return { body, kind: 'openai-merge' };
    }
    body.messages.unshift({ role: 'system', content: text });
    return { body, kind: 'openai' };
  }

  return { body, kind: 'none' };
}

module.exports = { loadConfig, RuleSource, elevate, CONFIG_PATH, CONFIG_LOCAL_PATH };
