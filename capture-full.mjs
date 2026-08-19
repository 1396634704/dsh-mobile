#!/usr/bin/env node
// capture-full.mjs — 全量截图采集：真实会话全段 + 全浮层 + 深色 + 视口矩阵 + 键盘态 + 空态
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CDP_PORT = Number(process.env.CDP_PORT || "9890");
const ARTIFACTS = path.join(__dirname, "artifacts", `full-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(ARTIFACTS, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(os.tmpdir(), `dsh-full-${CDP_PORT}`)}`, "--no-first-run", "--disable-gpu", "--touch-events=enabled", "about:blank"], { stdio: "ignore" });
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
	// ===== A. 真实富内容会话（账户余额入口：46 工具卡） =====
	const p = await newPage();
	await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await p.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p.cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
	await waitFor(p.cdp, 'document.documentElement.dataset.dshmob === "on"');
	console.log("会话打开:", await openSession(p.cdp, "账户余额入口"));
	await scrollColumn(p.cdp, 0); await shot(p.cdp, "01-top");
	await scrollColumn(p.cdp, 0.2); await shot(p.cdp, "02-early");
	await scrollColumn(p.cdp, 0.5); await shot(p.cdp, "03-tools");
	await scrollColumn(p.cdp, 0.8); await shot(p.cdp, "04-late");
	await scrollColumn(p.cdp, 1); await shot(p.cdp, "05-bottom");
	// 浮层全开
	await evalJs(p.cdp, 'document.querySelector(".dsh-mob-burger")?.click()'); await sleep(700); await shot(p.cdp, "06-drawer");
	await evalJs(p.cdp, 'document.querySelector(".dsh-mob-burger")?.click()'); await sleep(600);
	await evalJs(p.cdp, `window.setTimeout(() => { const t = document.querySelector(".Sh0Q9G_trigger, ._7KE1Ra_trigger"); t?.click(); }, 0)`); await sleep(1200); await shot(p.cdp, "07-model-menu");
	await evalJs(p.cdp, 'document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))'); await sleep(400);
	await evalJs(p.cdp, `window.setTimeout(() => { const b = Array.from(document.querySelectorAll("button[aria-label]")).find(x => /命令|Commands|Slash/.test(x.getAttribute("aria-label"))); b?.click(); }, 0)`); await sleep(1200); await shot(p.cdp, "08-command-menu");
	await evalJs(p.cdp, 'document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))'); await sleep(400);
	// 详情抽屉（注入打开）
	const detailsOk = await evalJs(p.cdp, `(() => { const frame = document.querySelector('[data-dshmob-role="frame"]'), root = document.querySelector('[data-dshmob-role="details-root"], .ydkMvW_root'), center = document.querySelector('[data-dshmob-role="center"]'); if (!frame || !root || !center) return false; const t = document.createElement('button'); t.dataset.dshmobAction='inspect'; t.textContent='Inspect'; center.appendChild(t); const s = document.createElement('div'); s.className='ydkMvW_section'; s.textContent='P2 detail'; root.appendChild(s); const had = frame.hasAttribute('data-details-collapsed'); window.__hadCol=had; frame.removeAttribute('data-details-collapsed'); setTimeout(()=>t.click(),0); return true; })()`);
	if (detailsOk) { await sleep(1200); await shot(p.cdp, "09-details"); await evalJs(p.cdp, '(() => { const f=document.querySelector("[data-dshmob-role=frame]"); if (window.__hadCol) f.setAttribute("data-details-collapsed",""); })()'); await sleep(400); }
	// 余额面板
	await evalJs(p.cdp, 'document.querySelector(".dsb_badge")?.click()'); await sleep(800); await shot(p.cdp, "10-balance");
	await evalJs(p.cdp, 'document.querySelector(".dsb_panel [aria-label*=关闭], .dsb_panel .dsb_close")?.click()'); await sleep(400);
	// 设置面板
	await evalJs(p.cdp, 'document.querySelector(".dsh-mob-burger")?.click()'); await sleep(700);
	await evalJs(p.cdp, `window.setTimeout(() => { document.querySelector('.VOzbGW_trigger')?.click(); }, 0)`); await sleep(1200); await shot(p.cdp, "11-settings");
	await evalJs(p.cdp, 'document.querySelector(".VOzbGW_close")?.click()'); await sleep(500);
	await evalJs(p.cdp, 'document.querySelector(".dsh-mob-burger")?.click()'); await sleep(400);
	// 键盘模拟态
	await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 520, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 520 });
	await sleep(900); await shot(p.cdp, "12-keyboard");
	await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await sleep(600);
	await closePage(p);

	// ===== B. 对话型会话（泰国服务器下单问题：45 turns 用户消息多） =====
	const p2 = await newPage();
	await p2.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await p2.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p2.cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
	await waitFor(p2.cdp, 'document.documentElement.dataset.dshmob === "on"');
	console.log("会话2打开:", await openSession(p2.cdp, "泰国服务器下单"));
	await scrollColumn(p2.cdp, 0.4); await shot(p2.cdp, "13-conv-mid");
	await scrollColumn(p2.cdp, 0.9); await shot(p2.cdp, "14-conv-bottom");
	await closePage(p2);

	// ===== C. 深色模式（真实会话） =====
	const p3 = await newPage();
	await p3.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await p3.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p3.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
	await p3.cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
	await waitFor(p3.cdp, 'document.documentElement.dataset.dshmob === "on"');
	await openSession(p3.cdp, "账户余额入口");
	await scrollColumn(p3.cdp, 0.6); await shot(p3.cdp, "15-dark-mid");
	await scrollColumn(p3.cdp, 1); await shot(p3.cdp, "16-dark-bottom");
	await evalJs(p3.cdp, 'document.querySelector(".dsh-mob-burger")?.click()'); await sleep(700); await shot(p3.cdp, "17-dark-drawer");
	await closePage(p3);

	// ===== D. 视口矩阵（真实会话中段） =====
	for (const [w, h, tag] of [[320, 568, "18-320"], [430, 932, "19-430"], [667, 375, "20-landscape"]]) {
		const px = await newPage();
		await px.cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenWidth: w, screenHeight: h });
		await px.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
		await px.cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
		await waitFor(px.cdp, 'document.documentElement.dataset.dshmob === "on"');
		await openSession(px.cdp, "账户余额入口");
		await scrollColumn(px.cdp, 0.5);
		await shot(px.cdp, tag);
		await closePage(px);
	}

	// ===== E. 空会话 hero 态 =====
	const p5 = await newPage();
	await p5.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await p5.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p5.cdp.send("Page.navigate", { url: "http://127.0.0.1:3080/" });
	await waitFor(p5.cdp, 'document.documentElement.dataset.dshmob === "on"');
	await evalJs(p5.cdp, 'document.querySelector(".dsh-mob-burger")?.click()'); await sleep(800);
	await evalJs(p5.cdp, `(() => { const r = Array.from(document.querySelectorAll(".YDXeBa_sessionRow")).find((x)=>/新会话/.test(x.textContent||"")); r?.click(); })()`);
	await sleep(2500);
	await evalJs(p5.cdp, 'document.querySelector(".dsh-mob-burger")?.click()'); await sleep(800);
	await shot(p5.cdp, "21-hero");
	await closePage(p5);
} catch (e) { console.error("中断:", e); } finally { chrome.kill(); }
console.log(`目录: ${ARTIFACTS}`);
