'use strict';
// probe-model-endpoint.js —— 方案 B 的前置探测
//
// 目的：搞清楚模型请求到底从哪个进程/目标发出。
//   · 命中且 target.type === 'page'  → Fetch 拦截可行，方案 B 成立
//   · 全程无命中                    → 请求走主进程（Node 侧），方案 B 作废，回退方案 A
//
// 用法：
//   node probe-model-endpoint.js            # 默认听 30 秒
//   set PROBE_MS=60000 && node probe-model-endpoint.js
// 然后在 Trae 里随便发一句话。
const { connect, listTargets } = require('./cdp-client');
const { loadConfig } = require('./rules-core');

const cfg = loadConfig();
const ENDPOINT = cfg.cdp.endpoint;
const DURATION = Number(process.env.PROBE_MS || 30000);
const REGEX = new RegExp(cfg.cdp.matchRegex, 'i');

const hits = [];

function short(u) {
  return u.length > 130 ? u.slice(0, 130) + '…' : u;
}

(async () => {
  let targets = [];
  try {
    targets = await listTargets(ENDPOINT);
  } catch (e) {
    const code = (e.cause && e.cause.code) || e.code || '';
    console.error('连不上 CDP：' + (code || e.message));
    if (/ECONNREFUSED/i.test(code)) {
      console.error('  → Trae 没在运行，或调试端口没生效。');
      console.error('  → 已确认 argv.json 里写了 remote-debugging-port: 9222，改完必须完全退出 Trae 再启动。');
      console.error('  → 判断方法：浏览器打开 http://127.0.0.1:9222/json/version 能看到 JSON 就是通了。');
    }
    process.exit(1);
  }

  const usable = targets.filter((t) => t.webSocketDebuggerUrl);
  console.log(`共 ${usable.length} 个调试目标：`);
  usable.forEach((t) => console.log(`  - ${t.type.padEnd(10)} ${short(t.url)}`));
  console.log('');
  console.log(`开始监听 ${DURATION / 1000}s，请在 Trae 里发一条消息…`);
  console.log('');

  const clients = [];
  for (const t of usable) {
    try {
      const c = await connect(t.webSocketDebuggerUrl);
      clients.push(c);
      await c.send('Network.enable');

      c.on('Network.requestWillBeSent', async (p) => {
        const url = p.request && p.request.url ? p.request.url : '';
        if (!REGEX.test(url)) return;

        let bodyLen = 0;
        let hasSystem = '-';
        try {
          const r = await c.send('Network.getRequestPostData', { requestId: p.requestId });
          const data = r.postData || '';
          bodyLen = data.length;
          if (data) {
            const j = JSON.parse(data);
            hasSystem = Array.isArray(j.messages) && j.messages[0] && j.messages[0].role === 'system'
              ? 'yes' : 'no';
          }
        } catch { /* 有些目标不支持取 body */ }

        const rec = { type: t.type, method: p.request.method, url, bodyLen, hasSystem };
        hits.push(rec);
        console.log(`[命中] ${rec.type} ${rec.method} body=${rec.bodyLen}B system=${rec.hasSystem}`);
        console.log(`        ${short(url)}`);
      });

      c.on('Network.loadingFailed', () => { /* 忽略 */ });
    } catch (e) {
      console.log(`  ! 附加失败 ${t.type}: ${e.message}`);
    }
  }

  setTimeout(() => {
    console.log('');
    console.log('================ 判定 ================');
    if (hits.length === 0) {
      console.log('结论：没有抓到任何模型请求。');
      console.log('  → 说明请求由 Electron 主进程发出，CDP Fetch 拦不到。');
      console.log('  → 方案 B 不成立，请直接走方案 A（trae-rule-proxy.js）。');
    } else {
      const pageHits = hits.filter((h) => h.type === 'page' || h.type === 'webview' || h.type === 'iframe');
      if (pageHits.length) {
        console.log('结论：命中渲染层请求，方案 B 可行。');
        console.log('  → 接着跑：node cdp-inject-rules.js');
        console.log(`  → 目标 URL 模式：${pageHits[0].url.split('?')[0]}`);
      } else {
        console.log('结论：只命中非渲染层目标，方案 B 不可靠，建议走方案 A。');
      }
    }
    clients.forEach((c) => c.close());
    process.exit(0);
  }, DURATION);
})();
