#!/usr/bin/env node
// dsh-mobile 模型分组构建脚本：把 model-groups.json 合并进 client.js 的数据段。
// 用法：node build-model-groups.mjs
// 修改 model-groups.json（厂商/中转站/路由分组）后运行本脚本，然后刷新浏览器即可生效；
// 全程不需要重启 dsh web。
import { readFileSync, writeFileSync, copyFileSync, statSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(here, "model-groups.json");
const clientPath = join(here, "client.js");

const BEGIN = "/* ==== dshmob-model-groups-data:begin ==== */";
const END = "/* ==== dshmob-model-groups-data:end ==== */";

const groups = JSON.parse(readFileSync(jsonPath, "utf8"));
// 精简：只保留 UI 需要的字段（version/fallbackVendor/groups[].vendor/relays[].relay/domain/routes[].id）。
const slim = {
  version: groups.version,
  fallbackVendor: groups.fallbackVendor ?? "其他",
  groups: (groups.groups ?? []).map((group) => ({
    vendor: group.vendor,
    relays: (group.relays ?? []).map((relay) => ({
      relay: relay.relay,
      domain: relay.domain ?? null,
      routes: (relay.routes ?? []).map((route) => ({ id: route.id })),
    })),
  })),
};

const source = readFileSync(clientPath, "utf8");
const beginAt = source.indexOf(BEGIN);
const endAt = source.indexOf(END);
if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
  console.error("build-model-groups: client.js 中缺少数据段标记，请先安装匹配版本的 dsh-mobile 插件。");
  process.exit(1);
}
const generated = `${BEGIN}\nconst MODEL_GROUPS_DATA = ${JSON.stringify(slim)};\n${END}`;
const rebuilt = source.slice(0, beginAt) + generated + source.slice(endAt + END.length);
if (rebuilt === source) {
  console.log("build-model-groups: 数据段无变化，跳过写入。");
  process.exit(0);
}

// 先写入临时文件并语法检查，再替换原文件，避免异常时留下损坏的 client.js。
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 15);
const backup = `${clientPath}.bak-model-groups-${stamp}`;
const mode = statSync(clientPath).mode;
const tmp = join(here, `.client.js.mg-${process.pid}.tmp.js`);
writeFileSync(tmp, rebuilt, { mode });
const { spawnSync } = await import("node:child_process");
const check = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
if (check.status !== 0) {
  unlinkSync(tmp);
  console.error("build-model-groups: 生成内容语法检查失败，未修改 client.js。");
  console.error(check.stderr);
  process.exit(1);
}

// 备份后原子写入
copyFileSync(clientPath, backup);
renameSync(tmp, clientPath);
console.log(`build-model-groups: 已合并 ${slim.groups.length} 个厂商分组 → client.js`);
console.log(`build-model-groups: 备份 ${backup}`);
