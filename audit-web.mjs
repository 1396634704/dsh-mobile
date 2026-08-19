#!/usr/bin/env node
/**
 * audit-web.mjs — DSH Web GUI（桌面 + 手机）体验审计脚本
 * 产出：可量化的问题清单（横溢、触控目标、hover 依赖、字号、浮层链、滚动能力、控制台错误）+ 截图
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = process.env.AUDIT_URL || "http://127.0.0.1:3080/";
const CDP_PORT = Number(process.env.CDP_PORT || "9666");
const ARTIFACTS = path.join(__dirname, "artifacts", `audit-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(ARTIFACTS, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(os.tmpdir(), `dsh-audit-${CDP_PORT}`)}`, "--no-first-run", "--disable-gpu", "--touch-events=enabled", "about:blank"], { stdio: "ignore" });

class Cdp {
	constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id !== undefined) { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } } else if (m.method === "Runtime.exceptionThrown") { this.errors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "").slice(0, 200)); } }; }
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
async function shot(cdp, name) { const r = await cdp.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(ARTIFACTS, `${name}.png`), Buffer.from(r.data, "base64")); }

const report = { desktop: {}, mobile: {} };

/* ================= 桌面端审计（插件零影响范围，只记录 DSH 原生状态） ================= */
async function auditDesktop() {
	const p = await newPage();
	await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
	await p.cdp.send("Page.navigate", { url: TARGET_URL });
	await waitFor(p.cdp, 'document.querySelector(".pI_x6G_frame") !== null');
	await sleep(2000);
	report.desktop = await evalJs(p.cdp, `(() => ({
		overflow: document.documentElement.scrollWidth - innerWidth,
		frameColumns: (() => { const f = document.querySelector(".pI_x6G_frame"); return f ? getComputedStyle(f).gridTemplateColumns : null; })(),
		sidebarVisible: (() => { const s = document.querySelector(".pI_x6G_sidebarCol"); if (!s) return null; const r = s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
		detailsVisible: (() => { const d = document.querySelector(".pI_x6G_detailsCol"); if (!d) return null; const r = d.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
		composerRect: (() => { const c = document.querySelector(".uV2eYG_root"); if (!c) return null; const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(),
		smallText: Array.from(document.querySelectorAll("body *")).filter((el) => { const s = getComputedStyle(el); return s.display !== "none" && parseFloat(s.fontSize) < 12 && (el.textContent || "").trim() !== ""; }).length,
		domNodes: document.querySelectorAll("*").length,
	}))()`);
	report.desktop.consoleErrors = p.cdp.errors.slice(0, 10);
	await shot(p.cdp, "A1-desktop-1280");
	await closePage(p);
}

/* ================= 手机端审计 ================= */
async function auditMobile() {
	const p = await newPage();
	await p.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await p.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	await p.cdp.send("Page.navigate", { url: TARGET_URL });
	await waitFor(p.cdp, 'document.documentElement.dataset.dshmob === "on"');
	await sleep(1500);
	const base = await evalJs(p.cdp, `(() => {
		const small = Array.from(document.querySelectorAll("button,[role=button],[role=menuitem],[role=option],a[href],input,select,textarea")).filter((el) => {
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return false;
			if (el.closest("[data-dshmob-allow-small=true]")) return false;
			return r.width < 44 || r.height < 44;
		}).map((el) => ({ tag: el.tagName, aria: (el.getAttribute("aria-label") || "").slice(0, 20), cls: String(el.className).slice(0, 30), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
		const tiny = Array.from(document.querySelectorAll("body *")).filter((el) => { const s = getComputedStyle(el); return s.display !== "none" && parseFloat(s.fontSize) < 12 && (el.textContent || "").trim() !== ""; }).slice(0, 20).map((el) => ({ cls: String(el.className).slice(0, 40), size: getComputedStyle(el).fontSize }));
		return { diag: window.__DSH_MOBILE__.diagnose(), smallTargets: small.slice(0, 40), smallCount: small.length, tinyText: tiny };
	})()`);
	report.mobile.base = base;
	await shot(p.cdp, "B1-mobile-base");
	// 抽屉开 → 截图 + 状态
	await evalJs(p.cdp, 'document.querySelector(".dsh-mob-burger").click()');
	await sleep(400);
	await shot(p.cdp, "B2-drawer-open");
	const drawer = await evalJs(p.cdp, `(() => { const s = document.querySelector('[data-dshmob-role="sidebar"]'); const r = s ? s.getBoundingClientRect() : null; return { sidebar: r ? [Math.round(r.left), Math.round(r.width)] : null, inert: document.querySelector('[data-dshmob-role="center"]')?.inert, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
	report.mobile.drawer = drawer;
	// 尝试打开设置面板（侧栏里的设置入口）
	const settings = await evalJs(p.cdp, `(() => {
		const btn = Array.from(document.querySelectorAll("button")).find((b) => /设置|Settings/.test(b.getAttribute("aria-label") || "") || (b.textContent || "").trim() === "设置");
		if (!btn) return { opened: false };
		btn.click(); return { opened: true };
	})()`);
	await sleep(800);
	const settingsPanel = await evalJs(p.cdp, `(() => {
		const panel = document.querySelector(".VOzbGW_panel");
		if (!panel) return { present: false };
		const r = panel.getBoundingClientRect();
		const options = panel.querySelector(".VOzbGW_options");
		return { present: true, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], optionsScrollable: options ? options.scrollHeight > options.clientHeight + 1 : null, overflow: document.documentElement.scrollWidth - innerWidth };
	})()`);
	report.mobile.settings = { entryFound: settings.opened, ...settingsPanel };
	await shot(p.cdp, "B3-settings");
	await closePage(p);
}

try {
	for (let i = 0; i < 40; i += 1) { try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break; } catch {} await sleep(500); }
	await auditDesktop();
	await auditMobile();
} catch (e) { console.error("审计中断:", e); } finally { chrome.kill(); }
console.log(JSON.stringify(report, null, 2));
console.log(`\n截图与报告目录: ${ARTIFACTS}`);
