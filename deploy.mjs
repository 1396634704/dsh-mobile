#!/usr/bin/env node
/**
 * deploy.mjs — dsh-mobile 插件一键「测试 + 部署」脚本
 *
 * 流程：
 *   1. 静态自检：语法检查、CSS 括号配平、client.js ≤1000 行、package.json 完整性
 *   2. 备份当前 client.js → client.js.bak-<时间戳>（保留最近 5 份）
 *   3. 部署检查：web profile 的 node_modules/dsh-mobile 若为 symlink 指向源目录则已实时
 *      生效；否则跑 install.sh 幂等拷贝 + cordis.patch.yml 登记校验
 *   4. 自动测试：跑 verify-mobile.mjs 完整 CDP 矩阵（M1-M5/B1/B2/D1/K1/K2/K2B/K3）
 *   5. 线上生效验证：curl 对比 3080 端口实际下发的 client.js 与本地文件一致
 *
 * 注意：本插件是纯 client 面静态挂载插件——文件改动刷新即生效，全程不重启 dsh web；
 *       只有"新增/移除 cordis.patch.yml 登记"才需要重启（本脚本不会新增登记时自动跳过）。
 *
 * 用法：
 *   node deploy.mjs                        # 全流程
 *   CASES=M2,K2K3 node deploy.mjs          # 只跑部分测试用例
 *   DSH_HOME=/x profile=foo node deploy.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const PROFILE = process.env.profile || "web";
const URL = process.env.DEPLOY_URL || "http://127.0.0.1:3080/";

const log = (msg) => console.log(`[deploy] ${msg}`);
const fail = (msg) => { console.error(`[deploy] ✗ ${msg}`); process.exit(1); };

/* ---------- 1. 静态自检 ---------- */
log("1/5 静态自检");
const clientPath = path.join(__dirname, "client.js");
const verifyPath = path.join(__dirname, "verify-mobile.mjs");
for (const f of [clientPath, verifyPath]) {
	if (!fs.existsSync(f)) fail(`缺失 ${f}`);
	const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
	if (r.status !== 0) fail(`语法检查失败 ${f}\n${r.stderr}`);
}
const clientSrc = fs.readFileSync(clientPath, "utf8");
const lines = clientSrc.split("\n").length;
if (lines > 1000) fail(`client.js ${lines} 行，超过 1000 行约定`);
// CSS 括号配平（提取 CSS 数组里的字符串并解码转义）
const cssStart = clientSrc.indexOf("const CSS = [");
const cssEnd = clientSrc.indexOf('].join("");', cssStart);
const cssBlock = clientSrc.slice(cssStart, cssEnd);
const cssText = [...cssBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("").replace(/\\"/g, '"');
if (cssText.split("{").length !== cssText.split("}").length) fail("CSS 花括号不配平");
// package.json 完整性（exports ./client 与 ./package.json 是 client-modules 扫描前提）
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
if (!pkg.exports || !pkg.exports["./client"] || !pkg.exports["./package.json"]) fail("package.json exports 不完整");
log(`  语法 OK，client.js ${lines} 行，CSS 配平，package.json 完整`);

/* ---------- 2. 备份 ---------- */
log("2/5 备份当前 client.js");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bakPath = path.join(__dirname, `client.js.bak-${stamp}`);
fs.copyFileSync(clientPath, bakPath);
const baks = fs.readdirSync(__dirname).filter((n) => /^client\.js\.bak-\d{4}-\d{2}-\d{2}T/.test(n)).sort();
while (baks.length > 5) fs.rmSync(path.join(__dirname, baks.shift()));
log(`  已备份 ${path.basename(bakPath)}（保留最近 5 份）`);

/* ---------- 3. 部署检查 ---------- */
log("3/5 部署检查");
const profileDir = path.join(DSH_HOME, "profiles", PROFILE);
const destDir = path.join(profileDir, "node_modules", "dsh-mobile");
const patchFile = path.join(profileDir, "cordis.patch.yml");
if (fs.existsSync(destDir) && fs.lstatSync(destDir).isSymbolicLink() && fs.realpathSync(destDir) === __dirname) {
	log(`  symlink 安装已指向源目录（${destDir}），文件改动实时生效，无需拷贝`);
} else {
	log(`  ${destDir} 非 symlink 指向源目录，执行 install.sh 幂等拷贝`);
	const r = spawnSync("bash", [path.join(__dirname, "install.sh"), DSH_HOME, PROFILE], { encoding: "utf8" });
	if (r.status !== 0) fail(`install.sh 失败\n${r.stdout}\n${r.stderr}`);
	log(`  ${r.stdout.trim().split("\n").join("\n  ")}`);
}
if (fs.existsSync(patchFile) && fs.readFileSync(patchFile, "utf8").includes("name: 'dsh-mobile'")) {
	log("  cordis.patch.yml 已登记（boot graph 无需变更，不重启 dsh web）");
} else {
	fail("cordis.patch.yml 未登记 dsh-mobile——先跑 install.sh，且本次登记变更需要重启 dsh web 后浏览器刷新");
}

/* ---------- 4. 自动测试 ---------- */
log("4/5 跑 verify-mobile.mjs 完整 CDP 矩阵（约 5-8 分钟）");
const testEnv = { ...process.env };
if (URL !== "http://127.0.0.1:3080/") testEnv.DEPLOY_URL = URL;
const test = spawnSync(process.execPath, [verifyPath, "--url", URL], { encoding: "utf8", env: testEnv, cwd: __dirname });
process.stdout.write(test.stdout);
process.stderr.write(test.stderr);
if (test.status !== 0) fail(`自动测试未通过（exit=${test.status}）`);

/* ---------- 5. 线上生效验证 ---------- */
log("5/5 线上 bundle 生效验证");
try {
	const served = await (await fetch(`${URL}plugins/dsh-mobile/client.js`)).text();
	const fingerprint = (s) => s.replace(/\s+/g, " ").slice(0, 200);
	const localHead = fingerprint(clientSrc);
	const servedHead = fingerprint(served);
	if (served.length === clientSrc.length && servedHead === localHead) {
		log(`  线上 bundle 与本地一致（${served.length} 字节），浏览器刷新即生效 ✅`);
	} else {
		fail(`线上 bundle 与本地不一致（本地 ${clientSrc.length}B vs 线上 ${served.length}B）——可能有缓存或拷贝链路问题`);
	}
} catch (e) {
	fail(`无法访问 ${URL}（dsh web 是否在运行？）: ${e.message}`);
}

log("部署完成 ✅ 手机浏览器刷新 http://<局域网IP>:3080 即可用上新版；桌面浏览器刷新无影响。");
