#!/usr/bin/env node
/**
 * audit-real-session.mjs — 真实会话页面（有消息/工具卡）的视觉摆放审计
 * 量化：消息间距分布、左右对齐、工具卡与消息宽度关系、元信息行间距、首尾间距、横溢
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = "http://127.0.0.1:3080/";
const CDP_PORT = Number(process.env.CDP_PORT || "9880");
const SESSION_ID = process.env.SESSION_ID || "session-a302a-063d-4cfa-b281-3a512ed1f0ed";
const SESSION_TITLE = process.env.SESSION_TITLE || "账户余额入口";
const ARTIFACTS = path.join(__dirname, "artifacts", `real-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(ARTIFACTS, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(os.tmpdir(), `dsh-real-${CDP_PORT}`)}`, "--no-first-run", "--disable-gpu", "--touch-events=enabled", "about:blank"], { stdio: "ignore" });

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
	if (r.exceptionDetails) return { EXC: (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400) };
	return r.result.value;
}
async function waitFor(cdp, expr, timeoutMs = 60000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) { try { const v = await evalJs(cdp, expr); if (v) return v; } catch {} await sleep(1000); }
	throw new Error("等待超时: " + expr);
}
async function shot(cdp, name) { const r = await cdp.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(ARTIFACTS, `${name}.png`), Buffer.from(r.data, "base64")); }

/* 打开指定会话：开抽屉 → 搜标题 → 点击会话行（目标折叠时先展开其余会话） */
async function openSession(cdp, title) {
	await evalJs(cdp, 'document.querySelector(".dsh-mob-burger")?.click()');
	await sleep(800);
	let row = await evalJs(cdp, `(() => {
		const rows = Array.from(document.querySelectorAll(".YDXeBa_sessionRow, [class*=sessionRow i]"));
		const target = rows.find((r) => (r.textContent || "").includes(${JSON.stringify(title)}));
		if (!target) return false;
		target.click();
		return true;
	})()`);
	if (!row) {
		// 目标可能被折叠：点"展开其余"再找
		await evalJs(cdp, `(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => /展开其余|更多会话|Show more/i.test(x.textContent || "")); if (b) b.click(); return b !== undefined; })()`);
		await sleep(1200);
		row = await evalJs(cdp, `(() => {
			const rows = Array.from(document.querySelectorAll(".YDXeBa_sessionRow, [class*=sessionRow i]"));
			const target = rows.find((r) => (r.textContent || "").includes(${JSON.stringify(title)}));
			if (!target) return false;
			target.click();
			return true;
		})()`);
	}
	if (!row) {
		await evalJs(cdp, 'document.querySelector(".dsh-mob-burger")?.click()');
		return false;
	}
	await sleep(3000);
	await evalJs(cdp, 'document.querySelector(".dsh-mob-burger")?.click()');
	await sleep(1000);
	return true;
}

/* 核心视觉审计：消息流项（.Md3f7G_column 直接子级）密集几何统计 */
const GEOM_SCRIPT = `(() => {
	const column = document.querySelector('.Md3f7G_column');
	if (!column) return { error: "no-column" };
	const v = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return null; return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
	const kids = Array.from(column.children).filter((el) => v(el) !== null);
	const rects = kids.map(v);
	const cr = v(column);
	// 相邻间距
	const gaps = [];
	for (let i = 1; i < rects.length; i += 1) gaps.push(rects[i].t - rects[i - 1].b);
	const stat = (arr) => arr.length === 0 ? null : { n: arr.length, min: Math.min(...arr), max: Math.max(...arr), avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), spread: Math.max(...arr) - Math.min(...arr) };
	// 分类：用户消息 / 助手消息 / 工具卡 / 分隔 / 其他
	const kinds = kids.map((el, i) => {
		const cls = String(el.className);
		if (el.querySelector('.gdEzaW_userStack')) return 'user';
		if (el.querySelector('.o3BgMG_root, .CY-8Ka_card, [data-tool]')) return 'tool';
		if (cls.includes('older') || cls.includes('separator')) return 'sep';
		if (el.querySelector('.Sxvs8a_root, [class*=message i], .QWLzlG_root')) return 'bot';
		return 'other';
	});
	const byKind = {};
	for (let i = 0; i < kinds.length; i += 1) { (byKind[kinds[i]] ||= []).push(rects[i]); }
	const kindStat = {};
	for (const [k, rs] of Object.entries(byKind)) kindStat[k] = { count: rs.length, width: stat(rs.map((r) => r.w)), height: stat(rs.map((r) => r.h)), left: stat(rs.map((r) => r.l)), right: stat(rs.map((r) => r.r)) };
	// 宽度与列宽的偏差（谁比内容区窄很多 = 视觉不对齐）
	const contentW = cr.w;
	const narrow = rects.map((r, i) => ({ i, kind: kinds[i], w: r.w, delta: contentW - r.w })).filter((x) => x.delta > 24).slice(0, 15);
	// 异常大间距（>60px）与负间距（重叠）
	const bigGaps = gaps.map((g, i) => ({ i, g })).filter((x) => x.g > 60).slice(0, 15);
	const overlaps = gaps.map((g, i) => ({ i, g })).filter((x) => x.g < 0).slice(0, 10);
	// 用户气泡右缘 vs 助手/工具左缘
	const userRight = stat((byKind.user || []).map((r) => r.r));
	const botLeft = stat((byKind.bot || []).map((r) => r.l));
	const toolLeft = stat((byKind.tool || []).map((r) => r.l));
	return {
		column: cr, count: rects.length, kinds: kindStat,
		gaps: stat(gaps), bigGaps, overlaps,
		userRight, botLeft, toolLeft, narrow,
		firstTop: rects.length ? rects[0].t - cr.t : null,
		overflowX: document.documentElement.scrollWidth - innerWidth,
		metaHeights: stat(Array.from(column.querySelectorAll('.p-xYUq_actions')).map(v).filter(Boolean).map((r) => r.h)),
	};
})()`;

try {
	for (let i = 0; i < 40; i += 1) { try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break; } catch {} await sleep(500); }
	const p = await newPage();
	await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await p.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p.cdp.send("Page.navigate", { url: TARGET_URL });
	await waitFor(p.cdp, 'document.documentElement.dataset.dshmob === "on"');
	const opened = await openSession(p.cdp, SESSION_TITLE);
	console.log("会话打开:", opened);
	await sleep(2000);
	const geom = await evalJs(p.cdp, GEOM_SCRIPT);
	console.log("390 几何审计:", JSON.stringify(geom, null, 1));
	await shot(p.cdp, "real-390");
	await closePage(p);

	// 320 视口同样审计
	const p2 = await newPage();
	await p2.cdp.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 2, mobile: true, screenWidth: 320, screenHeight: 568 });
	await p2.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p2.cdp.send("Page.navigate", { url: TARGET_URL });
	await waitFor(p2.cdp, 'document.documentElement.dataset.dshmob === "on"');
	const opened2 = await openSession(p2.cdp, SESSION_TITLE);
	console.log("320 会话打开:", opened2);
	await sleep(2000);
	const geom2 = await evalJs(p2.cdp, GEOM_SCRIPT);
	console.log("320 几何审计:", JSON.stringify(geom2, null, 1));
	await shot(p2.cdp, "real-320");
	await closePage(p2);
} catch (e) { console.error("审计中断:", e); } finally { chrome.kill(); }
console.log(`\n截图目录: ${ARTIFACTS}`);
