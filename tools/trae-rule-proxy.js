'use strict';
// trae-rule-proxy.js —— 方案 A：本地代理升权
//
// 原理：不让 Trae 决定 role。把 user_rules 原文原样读出，作为 system 消息
//       插入请求体最前面，再流式转发给上游。规则文件一个字不改。
//
// 用法：
//   node trae-rule-proxy.js
//   set UPSTREAM=https://api.deepseek.com && set UPSTREAM_KEY=sk-xxx && node trae-rule-proxy.js
//
// 自检端点：
//   GET  /__status   注入统计与规则状态
//   GET  /__rules    规则预览（头 240 字 + 尾 120 字 + 长度 + sha）
//   任意路径追加 ?norules=1 可跳过注入（对照组用）
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { loadConfig, RuleSource, elevate } = require('./rules-core');

const cfg = loadConfig();
const PORT = Number(cfg.proxy.port || 8787);
const UPSTREAM = new URL(cfg.proxy.upstream);
const API_KEY = cfg.proxy.upstreamKey || '';
const MARK = cfg.marker;
const INJECT_MODE = process.env.INJECT_MODE || cfg.proxy.injectMode || 'append';

const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, `proxy-${new Date().toISOString().slice(0, 10)}.log`);

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* 日志失败不影响主流程 */ }
}

const rules = new RuleSource(cfg.rulesFile);
rules.onLoad = (n, h) => log(`规则已加载 ${n} 字符 sha=${h}`);
rules.onError = (e) => log('读规则失败：' + e.message);
rules.read();

const stat = {
  startedAt: new Date().toISOString(),
  requests: 0,
  injected: 0,
  skipped: 0,
  bypassed: 0,
  passthrough: 0,
  lastKind: '-',
  lastAt: '-',
  errors: 0,
};

function buildPath(reqUrl) {
  const base = UPSTREAM.pathname.replace(/\/+$/, '');
  if (!base) return reqUrl;
  return reqUrl.startsWith(base + '/') ? reqUrl : base + reqUrl;
}

function sendJson(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
  res.end(buf);
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || '/';

  // ---- 自检端点 ----
  if (reqUrl.startsWith('/__status')) {
    const text = rules.read();
    return sendJson(res, 200, {
      ok: true,
      upstream: UPSTREAM.origin,
      rulesFile: cfg.rulesFile,
      rulesChars: text.length,
      rulesSha: rules.hash,
      marker: MARK,
      stat,
    });
  }
  if (reqUrl.startsWith('/__rules')) {
    const text = rules.read();
    return sendJson(res, 200, {
      chars: text.length,
      sha: rules.hash,
      head: text.slice(0, 240),
      tail: text.slice(-120),
    });
  }
  if (reqUrl === '/' || reqUrl === '/favicon.ico') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('rule-proxy ok\nGET /__status 看统计');
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('error', () => { stat.errors++; });
  req.on('end', () => {
    stat.requests++;
    let raw = Buffer.concat(chunks);
    let body = null;
    let modified = false;

    if (raw.length) {
      try { body = JSON.parse(raw.toString('utf8')); } catch { body = null; }
    }

    if (body) {
      const bypass = /[?&]norules=1/.test(reqUrl);
      if (bypass) {
        stat.bypassed++;
      } else {
        const out = elevate(body, rules.read(), MARK, INJECT_MODE);
        body = out.body;
        stat.lastKind = out.kind;
        stat.lastAt = new Date().toISOString();
        if (out.kind === 'skip') stat.skipped++;
        else if (out.kind === 'none' || out.kind === 'empty') stat.passthrough++;
        else stat.injected++;
        if (cfg.proxy.logRequests) {
          log(`注入 kind=${out.kind} path=${reqUrl.slice(0, 60)} body=${raw.length}B -> ${Buffer.byteLength(JSON.stringify(body))}B`);
        }
      }
      raw = Buffer.from(JSON.stringify(body), 'utf8');
      modified = true;
    } else {
      stat.passthrough++;
    }

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers['transfer-encoding'];
    // 改写过 body 就不能再声明原来的压缩方式，否则上游会解错
    if (modified) delete headers['content-encoding'];
    headers['content-length'] = Buffer.byteLength(raw);
    if (API_KEY) {
      headers.authorization = `Bearer ${API_KEY}`;
      if (headers['x-api-key']) headers['x-api-key'] = API_KEY;
    }

    const lib = UPSTREAM.protocol === 'https:' ? https : http;
    const up = lib.request({
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port || (UPSTREAM.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: buildPath(reqUrl),
      headers,
    }, (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res); // SSE 流式直通，不缓冲
      upRes.on('error', () => { stat.errors++; });
    });

    up.on('error', (e) => {
      stat.errors++;
      log('上游错误：' + e.message);
      if (!res.headersSent) sendJson(res, 502, { error: { message: 'upstream unreachable: ' + e.message } });
      else res.end();
    });

    // 上游卡住时别让请求永久挂着
    up.setTimeout(120000, () => {
      up.destroy(new Error('上游 120s 无响应'));
    });

    up.end(raw);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`监听 http://127.0.0.1:${PORT}  ->  ${UPSTREAM.origin}  注入模式: ${INJECT_MODE}`);
  log(`规则源 ${cfg.rulesFile}`);
  try {
    const main = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    if (main.proxy && main.proxy.upstreamKey) {
      log('⚠ config.json 里写了 upstreamKey，这个文件会进仓库，建议挪到 config.local.json');
    }
  } catch { /* 忽略 */ }
  console.log('');
  console.log('Trae 里这样填：');
  console.log(`  Base URL : http://127.0.0.1:${PORT}/v1`);
  console.log('  API Key  : 随便填（代理会用 config.json 里的 upstreamKey 覆盖）');
  console.log('  模型名   : 上游的真实模型名');
  console.log('');
});

process.on('SIGINT', () => {
  log(`退出。注入 ${stat.injected} / 请求 ${stat.requests} / 跳过 ${stat.skipped}`);
  process.exit(0);
});
