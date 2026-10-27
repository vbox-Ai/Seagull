'use strict';
// selftest-proxy.js —— 方案 A 的自动化验收（不需要真上游、不花 token）
// 起一个假上游，验证代理是否真的把规则塞进了 system 位。
//
// 用法：node selftest-proxy.js
const http = require('http');

const MOCK_PORT = 8789;
const PROXY_PORT = 8790;
const MARK = 'HANSHUANG-INJECT';

let received = null;

const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received = { path: req.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, echo: received.path }));
  });
});

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port: PROXY_PORT, path, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length },
    }, (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => resolve({ code: res.statusCode, text: s }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

const cases = [];
function check(name, ok, detail) {
  cases.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  process.env.UPSTREAM = `http://127.0.0.1:${MOCK_PORT}`;
  process.env.PORT = String(PROXY_PORT);

  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));
  require('./trae-rule-proxy.js');

  await new Promise((r) => setTimeout(r, 900));

  // 用例 1：OpenAI 形态，无 system 消息
  await post('/v1/chat/completions', {
    model: 'test-model',
    messages: [{ role: 'user', content: 'hello' }],
  });
  const m1 = received.body.messages;
  check('OpenAI 形态插入 system 到首位', m1[0].role === 'system', `role=${m1[0].role}`);
  check('system 内含注入标记', (m1[0].content || '').includes(MARK), `len=${(m1[0].content || '').length}`);
  check('user 消息未被破坏', m1[1] && m1[1].content === 'hello', `content=${m1[1] && m1[1].content}`);

  // 用例 2：已有 system 消息，应合并不新增
  await post('/v1/chat/completions', {
    model: 'test-model',
    messages: [{ role: 'system', content: '原生系统提示' }, { role: 'user', content: 'hi' }],
  });
  const m2 = received.body.messages;
  check('已有 system 时合并而非新增', m2.length === 2, `messages=${m2.length}`);
  check('原生系统提示被保留在尾部', m2[0].content.trimEnd().endsWith('原生系统提示'), 'tail-ok');

  // 用例 3：Anthropic 形态（顶层 system 字符串）
  await post('/v1/messages', {
    model: 'test-model',
    system: '原生 system 字段',
    messages: [{ role: 'user', content: 'hi' }],
  });
  check('Anthropic 形态写顶层 system', typeof received.body.system === 'string', typeof received.body.system);
  check('Anthropic system 含标记且原生内容保留',
    received.body.system.includes(MARK) && received.body.system.includes('原生 system 字段'), 'ok');

  // 用例 4：norules=1 逃生舱
  await post('/v1/chat/completions?norules=1', {
    model: 'test-model',
    messages: [{ role: 'user', content: 'raw' }],
  });
  const m4 = received.body.messages;
  check('norules=1 不注入', m4.length === 1 && !JSON.stringify(m4).includes(MARK), `messages=${m4.length}`);

  // 用例 5：幂等（重复发送同一请求不应叠加）
  await post('/v1/chat/completions', {
    model: 'test-model',
    messages: [{ role: 'system', content: `${MARK} 已注入` }, { role: 'user', content: 'x' }],
  });
  const dup = received.body.messages[0].content;
  check('已注入的请求不重复叠加', dup.split(MARK).length - 1 === 1, `出现 ${dup.split(MARK).length - 1} 次`);

  const failed = cases.filter((c) => !c.ok).length;
  console.log('');
  console.log(`结果：${cases.length - failed}/${cases.length} 通过`);
  process.exit(failed ? 1 : 0);
})();
