'use strict';
// capture-payload.js —— 红队取证：抓一次真实的模型请求体
//
// 目的：回答"规则到底被放在哪一层"。只看结构，不改任何东西。
//
// 用法：
//   node capture-payload.js            # 等一个请求，抓到就退出
//   set CAPTURE_MS=120000 && node capture-payload.js
// 然后在 Trae 里发一句「你好」，脚本会落盘 tools/logs/payload-*.json
const fs = require('fs');
const path = require('path');
const { connect, listTargets } = require('./cdp-client');
const { loadConfig } = require('./rules-core');

const cfg = loadConfig();
const ENDPOINT = cfg.cdp.endpoint;
const REGEX = new RegExp(cfg.cdp.matchRegex, 'i');
const WAIT = Number(process.env.CAPTURE_MS || 90000);
const MARK = cfg.marker;
const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

function charLen(c) {
  if (c == null) return 0;
  if (typeof c === 'string') return c.length;
  try { return JSON.stringify(c).length; } catch { return 0; }
}

function countTags(text) {
  const map = new Map();
  const re = /<\/?([a-zA-Z_][a-zA-Z0-9_-]{1,30})[ >]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].toLowerCase();
    map.set(t, (map.get(t) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
}

function summarize(body, raw) {
  const s = { topLevelKeys: Object.keys(body), model: body.model || body.modelName || '-' };

  if (Array.isArray(body.messages)) {
    s.shape = 'openai-messages';
    s.messageCount = body.messages.length;
    s.messages = body.messages.map((m, i) => ({
      i,
      role: m.role || '-',
      chars: charLen(m.content),
      hasRulesMarker: JSON.stringify(m.content || '').includes(MARK),
      head: typeof m.content === 'string' ? m.content.slice(0, 120).replace(/\s+/g, ' ') : '(non-string)',
    }));
  } else if (body.system != null || Array.isArray(body.messages)) {
    s.shape = 'anthropic';
  }

  if (body.system != null) {
    s.system = {
      type: Array.isArray(body.system) ? 'array' : typeof body.system,
      chars: charLen(body.system),
      hasRulesMarker: JSON.stringify(body.system).includes(MARK),
      head: (typeof body.system === 'string' ? body.system : JSON.stringify(body.system)).slice(0, 300).replace(/\s+/g, ' '),
    };
  }

  s.rawChars = raw.length;
  s.tagFrequency = countTags(raw);
  s.containsRulesMarker = raw.includes(MARK);
  s.mentionsUserRules = /user_rules|custom_rules|rules\s*[:=]/i.test(raw);
  return s;
}

(async () => {
  let targets;
  try {
    targets = await listTargets(ENDPOINT);
  } catch (e) {
    console.error('连不上 CDP：' + ((e.cause && e.cause.code) || e.message));
    console.error('Trae 必须正在运行，且 9222 端口已生效。');
    process.exit(1);
  }

  const usable = targets.filter((t) => t.webSocketDebuggerUrl && ['page', 'webview', 'iframe'].includes(t.type));
  console.log(`附加 ${usable.length} 个目标，等待模型请求（最多 ${WAIT / 1000}s）…`);
  console.log('现在去 Trae 里发一句话。');

  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    console.log('');
    console.log('超时：没抓到模型请求。可能请求由主进程发出，CDP 看不到。');
    process.exit(2);
  }, WAIT);

  for (const t of usable) {
    let c;
    try {
      c = await connect(t.webSocketDebuggerUrl);
      await c.send('Network.enable');
    } catch { continue; }

    c.on('Network.requestWillBeSent', async (p) => {
      if (done) return;
      const url = (p.request && p.request.url) || '';
      if (!REGEX.test(url)) return;

      let raw = '';
      try {
        const r = await c.send('Network.getRequestPostData', { requestId: p.requestId });
        raw = r.postData || '';
      } catch { /* 取不到就靠 Fetch 兜底 */ }

      if (!raw) {
        console.log('这个目标不暴露请求体（可能由主进程发出）：' + url.slice(0, 90));
        return;
      }

      done = true;
      clearTimeout(timer);

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(LOG_DIR, `payload-${stamp}.json`);
      fs.writeFileSync(file, raw, 'utf8');

      let body = null;
      try { body = JSON.parse(raw); } catch { /* 可能是 SSE 或非 JSON */ }

      console.log('');
      console.log('================ 抓到请求 ================');
      console.log('URL      : ' + url.slice(0, 120));
      console.log('原始落盘 : ' + file + '  (' + raw.length + ' 字符)');
      if (!body) {
        console.log('不是 JSON，只落盘不解析。');
        process.exit(0);
      }

      const s = summarize(body, raw);
      console.log('结构     : ' + s.shape + '  模型: ' + s.model);
      console.log('含破甲标记: ' + s.containsRulesMarker);
      console.log('提及 rules: ' + s.mentionsUserRules);
      console.log('');
      if (s.system) {
        console.log(`[system] 类型=${s.system.type} 字符=${s.system.chars} 含标记=${s.system.hasRulesMarker}`);
        console.log('         ' + s.system.head);
        console.log('');
      }
      if (s.messages) {
        console.log('消息序列（前 8 条）：');
        s.messages.slice(0, 8).forEach((m) => {
          console.log(`  #${m.i} ${String(m.role).padEnd(10)} ${String(m.chars).padStart(7)} 字符  规则=${m.hasRulesMarker ? 'Y' : 'n'}  ${m.head.slice(0, 60)}`);
        });
        console.log('');
      }
      console.log('请求体里的标签频次（看 Trae 用什么包裹规则）：');
      s.tagFrequency.forEach(([tag, n]) => console.log(`  <${tag}>  ×${n}`));
      console.log('');
      console.log('判定要点：');
      console.log('  1) 规则在 system 位 → 有机会生效；在 user/context 位 → 只会被当资料');
      console.log('  2) system 里同时写着别人格（如 "You are Claude"）→ 身份冲突，规则必输');
      console.log('  3) 规则被 <rules>/<context> 之类标签包裹 → 服务端已标注为不可信内容');
      process.exit(0);
    });
  }
})();
