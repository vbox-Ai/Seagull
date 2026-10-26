#!/usr/bin/env node
/*
  变体构建脚本。

  用法：
    node scripts/build.mjs free     # 免费版：六个目标 × 各自全部版本
    node scripts/build.mjs pro      # 付费版：六个目标 × 只提供 V5

  两个变体共用同一份源码，靠写入 variant.json 区分：
  主进程读它决定窗口/托盘标题，渲染层读它决定版本表与品牌名。
  产物分别落到 ../dist-desktop 与 ../dist-desktop-pro，互不覆盖；
  appId / 应用名 / 图标都不同，因此两个版本可以并存安装。

  注意：变体配置写成 JSON 文件再交给 electron-builder，不走命令行参数——
  Windows 下中文经 cmd.exe 传参会损坏。
*/
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
// 独立项目：不带参数时直接读 variant.json，本文件夹只产出自己那个变体
const variant = process.argv[2] ||
  JSON.parse(readFileSync(join(appDir, "variant.json"), "utf8")).variant;

/** 界面展示版本号：单一真源为 package.json（由 sync-version.mjs 同步到 variant.json）。 */
const DISPLAY_VERSION = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).version;

const VARIANTS = {
  free: {
    appName: "海鸥V8·破甲版",
    appId: "com.seagull.v8",
    output: "release",
    icon: "build/icon.png",
    artifact: "海鸥V8·破甲版-安装版-${version}.${ext}",
  },
  pro: {
    appName: "海鸥V8·破甲版 Pro",
    appId: "com.seagull.v8.pro",
    output: "release",
    icon: "build/icon-pro.png",
    artifact: "海鸥V8·破甲版Pro-安装版-${version}.${ext}",
  },
};

const cfg = VARIANTS[variant];
if (!cfg) {
  console.error("用法: node scripts/build.mjs <free|pro>");
  process.exit(1);
}

// 输出目录可被环境变量覆盖：旧的 release\win-unpacked 偶尔会被残留进程/杀软占住，
// 删不掉也改不了名，electron-builder 在 EnsureEmptyDir 阶段直接失败。
// 这时换个目录继续打包，比等占用释放现实。用法：SG_OUTPUT=release3 npm run dist
if (process.env.SG_OUTPUT) {
  cfg.output = process.env.SG_OUTPUT;
  console.log(`[build] 输出目录覆盖为 ${cfg.output}`);
}

// 1) 写变体标记（主进程与渲染层都读这个文件）
writeFileSync(
  join(appDir, "variant.json"),
  JSON.stringify({ variant, appName: cfg.appName, version: DISPLAY_VERSION }, null, 2) + "\n",
  "utf8",
);
console.log(`[build] 变体 = ${variant}（${cfg.appName}）`);

// Windows 下走 cmd.exe，带空格的参数必须自己加引号，否则会被拆成多个参数
// （项目文件夹名里可能带空格，比如「海鸥V8·破甲版 Pro」）
const quote = (a) => (/\s/.test(a) ? `"${a}"` : a);
const run = (args) =>
  execFileSync("npx", args.map(quote), {
    cwd: appDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

// 2) 构建渲染层
run(["vite", "build"]);

// 3) 生成 .ico（rcedit 只认 ico；afterPack 钩子会用它写进 exe）
const png = join(appDir, cfg.icon);
const ico = png.replace(/\.png$/, ".ico");
try {
  execFileSync("python", [join(appDir, "scripts", "make-ico.py"), png, ico], {
    cwd: appDir,
    stdio: "inherit",
  });
} catch (e) {
  console.error("[build] 生成 ico 失败，exe 图标将保持不变:", String(e && e.message));
}

// 3) 由 package.json 的 build 段派生本变体的完整配置
const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
const base = pkg.build || {};
const buildCfg = {
  ...base,
  appId: cfg.appId,
  productName: cfg.appName,
  // 不在这里统设 artifactName：那会把 nsis / portable 两个目标压成同一个
  // 文件名互相覆盖。各自的命名写在 package.json 的 nsis / portable 段里。
  directories: { ...(base.directories || {}), output: cfg.output },
  // 打完应用目录、生成安装器之前跑：用 rcedit 写 exe 图标与版本信息
  afterPack: "scripts/after-pack.js",
  // 本次打包只出便携版 zip：只生成 win-unpacked 应用目录（target "dir"），
  // 不出 NSIS 安装器，也不出每次启动要自解压的 portable exe。
  win: { ...(base.win || {}), icon: cfg.icon, target: ["dir"] },
  nsis: {
    ...(base.nsis || {}),
    shortcutName: cfg.appName,
    uninstallDisplayName: cfg.appName,
    artifactName: cfg.artifact,
  },
};
const cfgFile = join(appDir, `.electron-builder.${variant}.json`);
writeFileSync(cfgFile, JSON.stringify(buildCfg, null, 2) + "\n", "utf8");

try {
  run(["electron-builder", "--win", "--publish", "never", "--config", cfgFile]);
} finally {
  rmSync(cfgFile, { force: true });
}

// 4) 便携版 zip：把解压好的应用目录直接压成 zip。
// 为什么要这个：electron-builder 的 "portable" 目标每次启动都要把 ~110MB 自解压到临时
// 目录（还要被杀软扫一遍），实测开窗要 2 分钟；而解压好的目录直接跑只要 2 秒。
// zip 内不带顶层目录，用户解压到哪就能在哪双击运行。
try {
  const pkgVer = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).version;
  const zipName = `${cfg.appName}-便携版-${pkgVer}.zip`;
  const zipPath = join(appDir, cfg.output, zipName);
  rmSync(zipPath, { force: true });
  execFileSync(
    "python",
    [
      "-c",
      `import zipfile,os,sys
src,out=sys.argv[1],sys.argv[2]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for root,dirs,files in os.walk(src):
        for f in files:
            p=os.path.join(root,f)
            z.write(p,os.path.relpath(p,src))`,
      join(appDir, cfg.output, "win-unpacked"),
      zipPath,
    ],
    { stdio: "inherit" },
  );
  console.log(`[build] 便携版 zip: ${zipName}（解压即用，启动约 2 秒）`);
} catch (e) {
  console.error("[build] 生成便携版 zip 失败（不影响安装包）:", String(e && e.message));
}

console.log(`[build] 完成，产物目录 ${cfg.output}`);
