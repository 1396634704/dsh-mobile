#!/usr/bin/env node
/**
 * dsh-mobile 命令行卸载脚本（Node，跨平台）。
 *
 * 用法：
 *   node uninstall.mjs                     # 卸载默认位置（~/.dsh 的 web profile）
 *   node uninstall.mjs <DSH_HOME> <profile>
 *
 * 行为：从 cordis.patch.yml 移除插件登记（行级删除 id+name 条目并清理
 * 孤立的 - insert: 壳），删除 node_modules/dsh-mobile 目录。重启 dsh web 后
 * 彻底生效（boot graph 变更需重启）。
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dshHome = process.argv[2] ?? process.env.DSH_HOME ?? join(homedir(), ".dsh");
const profile = process.argv[3] ?? "web";
if (!/^[A-Za-z0-9_-]+$/.test(profile)) {
  console.error(`非法 profile 名：${profile}`);
  process.exit(1);
}

const profileDir = join(dshHome, "profiles", profile);
const patchPath = join(profileDir, "cordis.patch.yml");
const pluginDir = join(profileDir, "node_modules", "dsh-mobile");

// 1. 移除 cordis.patch.yml 中的登记条目。
let patchRemoved = false;
if (existsSync(patchPath)) {
  const lines = readFileSync(patchPath, "utf8").split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*- id: dsh-mobile\s*$/.test(lines[i])) {
      i += 1; // 跳过紧随的 name 行
      patchRemoved = true;
      continue;
    }
    kept.push(lines[i]);
  }
  // 清理孤立的顶层 "- insert:" 壳
  const cleaned = [];
  for (let i = 0; i < kept.length; i += 1) {
    const line = kept[i];
    if (/^- insert:\s*$/.test(line)) {
      let j = i + 1;
      while (j < kept.length && kept[j].trim() === "") j += 1;
      const next = kept[j];
      if (next === undefined || /^- /.test(next)) continue;
    }
    cleaned.push(line);
  }
  writeFileSync(patchPath, cleaned.join("\n"), "utf8");
}

// 2. 删除插件目录（symlink 安装时只删链接）。
let dirRemoved = false;
if (existsSync(pluginDir)) {
  rmSync(pluginDir, { recursive: true, force: true });
  dirRemoved = true;
}

console.log(`已卸载 dsh-mobile：${patchRemoved ? "登记已移除；" : "未找到登记；"}${dirRemoved ? "文件已删除。" : "无文件可删。"}`);
console.log("重启 dsh web 并刷新浏览器后彻底生效。");
