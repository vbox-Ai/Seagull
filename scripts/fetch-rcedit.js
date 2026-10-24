#!/usr/bin/env node
"use strict";
/*
  下载 winCodeSign 里的 rcedit-x64.exe 到 electron-builder 缓存，
  供 after-pack.js 写 exe 图标与版本信息用。

  为什么单独一个脚本：electron-builder 只在签名时才解压 winCodeSign，
  target="dir" 不签名就不下载它，于是 after-pack 找不到 rcedit 只能跳过。
  本脚本在 CI 构建前跑一次，把 rcedit 预置到缓存，图标就能写进 exe。

  用法: node scripts/fetch-rcedit.js
*/
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");

const VER = "2.6.0";
const MIRRORS = [
  `https://npmmirror.com/mirrors/electron-builder-binaries/winCodeSign-${VER}/winCodeSign-${VER}.7z`,
  `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-${VER}/winCodeSign-${VER}.7z`,
];

function cacheRoot() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(base, "electron-builder", "Cache", "winCodeSign", `winCodeSign-${VER}`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { timeout: 300000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(dest)));
      out.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("download timeout")));
  });
}

function findSevenZip() {
  const cands = [
    path.join(__dirname, "..", "node_modules", "7zip-bin", "win", "x64", "7za.exe"),
    path.join(__dirname, "..", "node_modules", "7zip-bin", "win", "ia32", "7za.exe"),
    "7za",
    "7z",
  ];
  for (const c of cands) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  // 裸命令名交给 execFileSync 在 PATH 里找
  return "7za";
}

async function main() {
  const root = cacheRoot();
  const rcedit = path.join(root, "rcedit-x64.exe");
  if (fs.existsSync(rcedit)) {
    console.log(`[fetch-rcedit] 已缓存: ${rcedit}`);
    return;
  }
  fs.mkdirSync(root, { recursive: true });
  const archive = path.join(root, `winCodeSign-${VER}.7z`);
  let lastErr = null;
  for (const url of MIRRORS) {
    try {
      console.log(`[fetch-rcedit] 下载 ${url}`);
      await download(url, archive);
      if (fs.existsSync(archive) && fs.statSync(archive).size > 0) break;
    } catch (e) {
      lastErr = e;
      console.log(`[fetch-rcedit] 下载失败: ${e.message}`);
    }
  }
  if (!fs.existsSync(archive)) throw lastErr || new Error("winCodeSign 下载失败");

  const sevenZip = findSevenZip();
  console.log(`[fetch-rcedit] 解压 ${archive}`);
  try {
    execFileSync(sevenZip, ["x", "-y", archive, "-o" + root], { stdio: "inherit" });
  } catch (e) {
    throw new Error(`7z 解压失败: ${e.message}`);
  }
  if (!fs.existsSync(rcedit)) throw new Error("解压后仍找不到 rcedit-x64.exe");
  console.log(`[fetch-rcedit] 就绪: ${rcedit}`);
}

main().catch((e) => {
  console.error("[fetch-rcedit] 失败:", e && e.message);
  process.exit(1);
});
