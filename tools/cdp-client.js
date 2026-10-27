'use strict';
// cdp-client.js —— 极简 CDP 客户端，Node 22 自带 WebSocket，无需装 ws
function connect(url) {
  const hasGlobal = typeof WebSocket !== 'undefined';
  return new Promise((resolve, reject) => {
    let ws;
    if (hasGlobal) {
      ws = new WebSocket(url);
    } else {
      const WS = require('ws');
      ws = new WS(url);
    }

    const pending = new Map();
    const handlers = new Map();
    let seq = 0;

    function handleMessage(raw) {
      let msg;
      try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message));
        else p.res(msg.result);
        return;
      }
      if (msg.method && handlers.has(msg.method)) {
        for (const cb of handlers.get(msg.method)) {
          try { cb(msg.params); } catch { /* 单个回调失败不影响其它 */ }
        }
      }
    }

    // 连接断开时把挂起的调用全部释放，避免 Promise 永久悬空
    function handleClose() {
      for (const p of pending.values()) {
        try { p.rej(new Error('CDP 连接已关闭')); } catch { /* ignore */ }
      }
      pending.clear();
      if (handlers.has('__closed')) {
        for (const cb of handlers.get('__closed')) {
          try { cb(); } catch { /* ignore */ }
        }
      }
    }

    const api = {
      send(method, params) {
        const id = ++seq;
        return new Promise((res, rej) => {
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      },
      on(event, cb) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(cb);
      },
      close() { try { ws.close(); } catch { /* ignore */ } },
    };

    if (hasGlobal) {
      ws.addEventListener('open', () => resolve(api));
      ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')));
      ws.addEventListener('message', (e) => handleMessage(e.data));
      ws.addEventListener('close', handleClose);
    } else {
      ws.on('open', () => resolve(api));
      ws.on('error', reject);
      ws.on('message', (d) => handleMessage(d));
      ws.on('close', handleClose);
    }
  });
}

async function listTargets(endpoint) {
  const r = await fetch(endpoint.replace(/\/+$/, '') + '/json/list');
  return r.json();
}

module.exports = { connect, listTargets };
