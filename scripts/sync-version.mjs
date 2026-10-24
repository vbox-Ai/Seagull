#!/usr/bin/env node
/*
  版本单一真源同步：package.json → variant.json。
  CI 在 `npm version patch` 之后调用本脚本，让软件内展示版本与安装包版本一致。
*/
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const variantPath = join(root, "variant.json");
const variant = JSON.parse(readFileSync(variantPath, "utf8"));
variant.version = pkg.version;
writeFileSync(variantPath, JSON.stringify(variant, null, 2) + "\n", "utf8");
console.log(`[sync-version] variant.json.version -> ${pkg.version}`);
