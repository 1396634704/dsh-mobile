#!/usr/bin/env node
// capture-real.mjs — 拍摄真实会话的关键位置截图，供 codex 视觉审查
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CDP_PORT = Number(process.env.CDP_PORT || "9884");
const ARTIFACTS = path.join(__dirname, "artifacts", `shots-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(ARTIFACTS, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(os.tmpdir(), `dsh-shots-${CDP_PORT}`)}`, "--no-first-run", "--disable-gpu", "--touch-events=enabled", "about:blank"], { stdio: "ignore" });
class Cdp {
	constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id !== undefined) { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } } }; }
	static async connect(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); return new Cdp(ws); }
	send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
}
async function newPage() {
	const info = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?url=${encodeURIComponent("about:blank")}`, { method: "PUT" })).json();
	const cdp = await Cdp.connect(info.webSocketDebuggerUrl);
	await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
	return { cdp, targetId: info.id };
}
async function closePage(p) { p.cdp.ws.close(); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${p.targetId}`); } catch {} }
async function evalJs(cdp, expression) {
	const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) return { EXC: (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300) };
	return r.result.value;
}
async function waitFor(cdp, expr, timeoutMs = 60000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) { try { const v = await evalJs(cdp, expr); if (v) return v; } catch {} await sleep(1000); }
	throw new Error("等待超时: " + expr);
}
async function shot(cdp, name) { const r = await cdp.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(ARTIFACTS, `${name}.png`), Buffer.from(r.data, "base64")); console.log("截图:", name); }

async function openSession(cdp, title) {
	await evalJs(cdp, 'document.querySelector(".dsh-mob-burger")?.click()');
	await sleep(800);
	let ok = await evalJs(cdp, `(() => { const r = Array.from(document.querySelectorAll(".YDXeBa_sessionRow, [class*=sessionRow i]")).find((x) => (x.textContent||"").includes(${JSON.stringify(title)})); if (!r) return false; r.click(); return true; })()`);
	if (!ok) {
		await evalJs(cdp, `(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => /展开其余/.test(x.textContent||"")); b?.click(); })()`);
		await sleep(1200);
		ok = await evalJs(cdp, `(() => { const r = Array.from(document.querySelectorAll(".YDXeBa_sessionRow, [class*=sessionRow i]")).find((x) => (x.textContent||"").includes(${JSON.stringify(title)})); if (!r) return false; r.click(); return true; })()`);
	}
	await sleep(3500);
	await evalJs(cdp, 'document.querySelector(".dsh-mob-burger")?.click()');
	await sleep(1000);
	return Boolean(ok);
}
async function scrollColumn(cdp, frac) {
	await evalJs(cdp, `(() => { for (const s of ['.wSkVaW_scrollBody', '.Md3f7G_scroll', '.Md3f7G_root']) { const el = document.querySelector(s); if (!el || el.scrollHeight <= el.clientHeight) continue; el.scrollTop = (el.scrollHeight - el.clientHeight) * ${frac}; } })()`);
	await sleep(1000);
}

try {
	for (let i = 0; i < 40; i += 1) { try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break; } catch {} await sleep(500); }
	const p = await newPage();
	await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await p.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p.cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
	await waitFor(p.cdp, 'document.documentElement.dataset.dshmob === "on"');
	console.log("会话打开:", await openSession(p.cdp, "账户余额入口"));
	// 顶部（会话最早处）
	await scrollColumn(p.cdp, 0);
	await shot(p.cdp, "01-top");
	await scrollColumn(p.cdp, 0.33);
	await shot(p.cdp, "02-mid1");
	await scrollColumn(p.cdp, 0.66);
	await shot(p.cdp, "03-mid2");
	await scrollColumn(p.cdp, 1);
	await shot(p.cdp, "04-bottom");
	// 抽屉 + 设置 + 详情
	await evalJs(p.cdp, 'document.querySelector(".dsh-mob-burger")?.click()');
	await sleep(600);
	await shot(p.cdp, "05-drawer");
	await evalJs(p.cdp, `window.setTimeout(() => { const b = document.querySelector('.VOzbGW_trigger'); b?.click(); }, 0)`);
	await sleep(1200);
	await shot(p.cdp, "06-settings");
	await evalJs(p.cdp, 'document.querySelector(".VOzbGW_panel .VOzbGW_close")?.click()');
	await sleep(500);
	await evalJs(p.cdp, 'document.querySelector(".dsh-mob-burger")?.click()');
	await sleep(400);
	await closePage(p);
	// 320 视口关键位
	const p2 = await newPage();
	await p2.cdp.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true, screenWidth: 320, screenHeight: 568 });
	await p2.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p2.cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
	await waitFor(p2.cdp, 'document.documentElement.dataset.dshmob === "on"');
	await openSession(p2.cdp, "账户余额入口");
	await scrollColumn(p2.cdp, 0.5);
	await shot(p2.cdp, "07-320-mid");
	await scrollColumn(p2.cdp, 1);
	await shot(p2.cdp, "08-320-bottom");
	await closePage(p2);
} catch (e) { console.error("中断:", e); } finally { chrome.kill(); }
console.log(`目录: ${ARTIFACTS}`);
