'use strict';
// set-endpoint.js —— 破甲接入器（Trae）
//
// 把 Trae 里所有「自定义模型」(custom_openai_compatible) 的 base_url 改指向
// 本地升权网关，让请求穿过网关、规则坐上 system 位。改完即生效，重跑即覆盖。
//
// 原理：Trae 把模型配置存在 state.vscdb（SQLite，ItemTable 表）里，
//       key 形如 <prefix>:AI.agent.model.model_list_map，value 是 JSON，
//       每个分组(group)下是模型数组，自定义模型带 base_url 字段。
//
// 用法（需 Node 22+，自带 node:sqlite）：
//   node set-endpoint.js --status                    只看现状，不改
//   node set-endpoint.js                             改 base_url 指向默认网关
//   node set-endpoint.js --gateway http://127.0.0.1:8787/v1/chat/completions
//   node set-endpoint.js --provider-key custom_openai_compatible
//
// 只改「已有」的自定义模型。若一个都没有，打印在 Trae 里手动加模型的一步指引。
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_GATEWAY = 'http://127.0.0.1:8787/v1/chat/completions';

function args() {
  const a = { status: false, gateway: DEFAULT_GATEWAY, providerKey: 'custom_openai_compatible' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--status') a.status = true;
    else if (argv[i] === '--gateway' && argv[i + 1]) a.gateway = argv[++i];
    else if (argv[i] === '--provider-key' && argv[i + 1]) a.providerKey = argv[++i];
  }
  return a;
}

function vscdbPaths() {
  const home = os.homedir();
  const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return [
    path.join(appdata, 'Trae CN', 'User', 'globalStorage', 'state.vscdb'),
    path.join(appdata, 'Trae', 'User', 'globalStorage', 'state.vscdb'),
  ].filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

function loadSqlite() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return { DatabaseSync, ok: true };
  } catch (e) {
    return { err: e, ok: false };
  }
}

function isCustom(m, providerKey) {
  if (!m || typeof m !== 'object') return false;
  if (m.provider && String(m.provider).includes(providerKey)) return true;
  // 兜底：显式标了自定义 base_url 的也算
  if (m.is_custom_base_url === true && m.base_url) return true;
  return false;
}

function walkAndRewrite(value, providerKey, gateway, stats) {
  // value 可能是 JSON 字符串，也可能已被 parse
  let doc = value;
  if (typeof doc === 'string') {
    try { doc = JSON.parse(doc); } catch { stats.unparsed++; return value; }
  }
  if (!doc || typeof doc !== 'object') return value;
  for (const grp of Object.keys(doc)) {
    const list = doc[grp];
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!isCustom(m, providerKey)) continue;
      stats.found++;
      const old = m.base_url || '';
      if (old === gateway) { stats.already++; continue; }
      m.base_url = gateway;
      if (m.is_custom_base_url !== true) m.is_custom_base_url = true;
      stats.rewritten++;
    }
  }
  return JSON.stringify(doc);
}

function main() {
  const a = args();
  const sqlite = loadSqlite();
  if (!sqlite.ok) {
    console.error('[set-endpoint] 需要 Node 22+（node:sqlite）。当前 Node:', process.version);
    console.error('  报错:', sqlite.err && sqlite.err.message);
    process.exit(2);
  }

  const files = vscdbPaths();
  if (!files.length) {
    console.error('[set-endpoint] 没找到 Trae 的 state.vscdb。');
    console.error('  确认 Trae 已安装并至少启动过一次。');
    process.exit(1);
  }

  for (const file of files) {
    let db;
    try {
      db = new sqlite.DatabaseSync(file);
    } catch (e) {
      console.error(`[set-endpoint] 打开失败 ${file}: ${e.message}`);
      continue;
    }

    let rows;
    try {
      rows = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%model_list_map'").all();
    } catch (e) {
      console.error(`[set-endpoint] 查询失败 ${file}: ${e.message}`);
      db.close();
      continue;
    }

    const stats = { found: 0, rewritten: 0, already: 0, unparsed: 0 };
    const name = file.includes('Trae CN') ? 'Trae 国内版' : 'Trae 国际版';
    console.log(`\n== ${name} ==`);
    console.log(`  ${file}`);

    if (a.status) {
      let printed = 0;
      for (const r of rows) {
        let doc;
        try { doc = JSON.parse(r.value); } catch { continue; }
        if (!doc || typeof doc !== 'object') continue;
        for (const grp of Object.keys(doc)) {
          const list = doc[grp];
          if (!Array.isArray(list)) continue;
          for (const m of list) {
            if (!isCustom(m, a.providerKey)) continue;
            printed++;
            console.log(`  [${grp}] ${m.display_name || m.name || '(未命名)'}`);
            console.log(`      provider : ${m.provider}`);
            console.log(`      base_url : ${m.base_url || '(空)'}`);
          }
        }
      }
      if (!printed) console.log('  （没有自定义模型）');
      db.close();
      continue;
    }

    // 改前先落一份带时间戳的快照（只做安全拷贝，不做回滚流程）
    const bak = file + '.set-endpoint.bak.' + Date.now();
    try { fs.copyFileSync(file, bak); console.log(`  快照 -> ${path.basename(bak)}`); } catch { /* 拷贝失败仍继续 */ }

    let changed = false;
    const update = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
    for (const r of rows) {
      const before = r.value;
      const after = walkAndRewrite(before, a.providerKey, a.gateway, stats);
      if (after !== before) {
        update.run(after, r.key);
        changed = true;
      }
    }

    console.log(`  自定义模型命中 ${stats.found} 个`);
    console.log(`  base_url 改写  ${stats.rewritten} 个`);
    if (stats.already) console.log(`  已指向网关    ${stats.already} 个（跳过）`);
    if (stats.unparsed) console.log(`  无法解析      ${stats.unparsed} 个`);
    if (!stats.found) {
      console.log('\n  [提示] 没找到自定义模型。请先在 Trae 里手动加一个：');
      console.log('    设置 -> 模型 -> 添加自定义模型');
      console.log('    Base URL 填 : ' + a.gateway);
      console.log('    API Key 随便填（网关会用 config.local.json 的 upstreamKey 覆盖）');
      console.log('    加完再跑一次本脚本，即自动把 base_url 对齐网关。');
    }
    db.close();
    if (changed) console.log('  [完成] 重启 Trae 后，自定义模型即走升权网关。');
  }
}

main();
