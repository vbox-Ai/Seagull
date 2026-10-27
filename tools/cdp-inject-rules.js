'use strict';
// cdp-inject-rules.js —— 方案 B：CDP 传输层改写（不改文件、不改配置）
//
// 前提：先跑 probe-model-endpoint.js，确认命中目标类型是 page / webview。
// 原理：Fetch 域在请求发出前暂停，把规则原文塞进 system 位，再放行。
//
// 用法：
//   node cdp-inject-rules.js           # 实际注入
//   node cdp-inject-rules.js --dry     # 只看不写，用于确认抓包正常
//   set CDP_ALL=1 && node cdp-inject-rules.js   # 拦截全部请求（pattern 匹配不住时用）
const { connect, listTargets } = require('./cdp-client');
const { loadConfig, RuleSource, elevate } = require('./rules-core');

const cfg = loadConfig();
const ENDPOINT = cfg.cdp.endpoint;
const REGEX = new RegExp(cfg.cdp.matchRegex, 'i');
const MARK = cfg.marker;
const DRY = process.argv.includes('--dry');
const ALL = process.env.CDP_ALL === '1';

const rules = new RuleSource(cfg.rulesFile);
rules.onLoad = (n, h) => console.log(`[rules] 已加载 ${n} 字符 sha=${h}`);
rules.onError = (e) => console.error('[rules] 读取失败：', e.message);
rules.read();

const stat = { paused: 0, injected: 0, skipped: 0, passthrough: 0, failed: 0, targets: 0 };
const attached = new Set();

function short(u) { return u.length > 110 ? u.slice(0, 110) + '…' : u; }

async function attach(t) {
  if (attached.has(t.id)) return;
  attached.add(t.id);
  try {
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Network.enable');

    const patterns = ALL ? [{ urlPattern: '*', requestStage: 'Request' }]
      : cfg.cdp.urlPatterns.map((p) => ({ urlPattern: p, requestStage: 'Request' }));
    await c.send('Fetch.enable', { patterns });
    stat.targets++;

    c.on('Fetch.requestPaused', async (p) => {
      stat.paused++;
      const { requestId, request } = p;
      const url = (request && request.url) || '';
      const continuePlain = () => c.send('Fetch.continueRequest', { requestId }).catch(() => { stat.failed++; });
      const continueWith = (postData) => c.send('Fetch.continueRequest', {
        requestId,
        postData: Buffer.from(postData, 'utf8').toString('base64'),
      }).catch(() => { stat.failed++; });

      if (!REGEX.test(url)) return continuePlain();
      if (/[?&]norules=1/.test(url)) { stat.skipped++; return continuePlain(); }

      let postData = (request && request.postData) || '';
      if (!postData && request && request.postDataEntries) {
        try { postData = Buffer.from(request.postDataEntries[0].bytes, 'base64').toString('utf8'); } catch { /* ignore */ }
      }

      let body;
      try { body = JSON.parse(postData); } catch {
        stat.passthrough++;
        return continuePlain();
      }

      const out = elevate(body, rules.read(), MARK);
      if (out.kind === 'skip' || out.kind === 'none' || out.kind === 'empty') {
        stat.skipped++;
        return continuePlain();
      }

      const next = JSON.stringify(out.body);
      stat.injected++;
      console.log(`[注入] kind=${out.kind} ${postData.length}B -> ${next.length}B  ${short(url)}`);
      if (DRY) return continuePlain();
      return continueWith(next);
    });

    c.on('Fetch.authRequired', (p) => c.send('Fetch.continueWithAuth', {
      requestId: p.requestId, authChallengeResponse: { response: 'CancelAuth' },
    }).catch(() => {}));

    // 窗口刷新/关闭后连接会断，从已附加集合里摘掉，下轮扫描自动重挂
    c.on('__closed', () => {
      attached.delete(t.id);
      console.log(`[detach] ${t.type} ${short(t.url)}`);
    });

    console.log(`[attach] ${t.type} ${short(t.url)}`);
  } catch (e) {
    console.error(`[attach] 失败 ${t.type} ${short(t.url)} — ${e.message}`);
  }
}

async function scan() {
  try {
    const targets = (await listTargets(ENDPOINT)).filter((t) =>
      t.webSocketDebuggerUrl && ['page', 'webview', 'iframe', 'other'].includes(t.type));
    for (const t of targets) await attach(t);
  } catch (e) {
    console.error('扫描目标失败：' + e.message);
  }
}

(async () => {
  console.log(`CDP ${ENDPOINT}  模式：${DRY ? '试运行（不写入）' : '实际注入'}  拦截范围：${ALL ? '全部' : cfg.cdp.urlPatterns.join(', ')}`);
  await scan();
  const timer = setInterval(scan, 3000); // 新开的对话窗口后挂上来

  setTimeout(() => {
    if (stat.paused === 0) {
      console.log('');
      console.log('⚠ 30 秒内一个请求都没暂停到，说明 pattern 不匹配或请求不走渲染层。');
      console.log('  → 先跑 probe-model-endpoint.js 定位，再决定是否用 set CDP_ALL=1 重试。');
    }
  }, 30000);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('');
    console.log(`退出。目标 ${stat.targets} / 暂停 ${stat.paused} / 注入 ${stat.injected} / 跳过 ${stat.skipped} / 失败 ${stat.failed}`);
    process.exit(0);
  });
})();
