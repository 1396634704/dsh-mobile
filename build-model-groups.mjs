#!/usr/bin/env node
// dsh-mobile 模型分组构建脚本：把 model-groups.json 合并进 client.js 的数据段。
// 用法：node build-model-groups.mjs
// 修改 model-groups.json（厂商/中转站/路由分组）后运行本脚本，然后刷新浏览器即可生效；
// 全程不需要重启 dsh web。
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, renameSync } from "node:fs";
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
  console.error("build-model-groups: client.js 中缺少数据段标记，请先手工插入 begin/end 标记。");
  process.exit(1);
}
const generated = `${BEGIN}\nconst MODEL_GROUPS_DATA = ${JSON.stringify(slim)};\n${END}`;
const rebuilt = source.slice(0, beginAt) + generated + source.slice(endAt + END.length);
if (rebuilt === source) {
  console.log("build-model-groups: 数据段无变化，跳过写入。");
  process.exit(0);
}

// 备份后原子写入
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 15);
const backup = `${clientPath}.bak-model-groups-${stamp}`;
copyFileSync(clientPath, backup);
const mode = statSync(clientPath).mode;
const tmp = join(here, `.client.js.mg-${process.pid}.tmp`);
writeFileSync(tmp, rebuilt, { mode });
renameSync(tmp, clientPath);
// 语法自检（browser bundle 顶层 window 引用不影响 --check 的语法分析）
const { spawnSync } = await import("node:child_process");
const check = spawnSync(process.execPath, ["--check", clientPath], { encoding: "utf8" });
if (check.status !== 0) {
  console.error("build-model-groups: 语法检查失败，已中止（备份：%s）", backup);
  console.error(check.stderr);
  process.exit(1);
}
console.log(`build-model-groups: 已合并 ${slim.groups.length} 个厂商分组 → client.js`);
console.log(`build-model-groups: 备份 ${backup}`);
