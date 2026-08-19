#!/usr/bin/env node
/**
 * verify-mobile.mjs — dsh-mobile v3 CDP 验收脚本（设计文档 §3.1）
 *
 * 连接 headless Chrome CDP，按矩阵 M1-M5 / B1 / B2 / D1 逐个视口验证：
 *  - 角色解析（data-dshmob-role）与 html[data-dshmob="on"] 激活
 *  - 无全局横向溢出
 *  - 汉堡可见 / 抽屉开合
 *  - 详情抽屉 CSS 契约（默认隐藏 → body class 打开变 fixed sheet）
 *  - 桌面（B2/D1）零命中、kill switch（?dshMobileOff=1）
 *  - hash 类名失效后的语义兜底重解析、结构破坏后的安全降级
 *
 * 用法：node verify-mobile.mjs [--url http://127.0.0.1:3080/] [--port 9223]
 * 依赖：系统 Chrome（--headless=new）、Node ≥ 22（自带全局 WebSocket）。
 * 注意：不要用 dump-dom 等待页面结束——DSH 的 SSE/WS 会使其长期不退出（§3.1）。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const TARGET_URL = argVal("--url", "http://127.0.0.1:3080/");
const CDP_PORT = Number(argVal("--port", "9223"));
const ARTIFACTS = path.join(__dirname, "artifacts", `verify-${new Date().toISOString().replace(/[:.]/g, "-")}`);

const CHROME_CANDIDATES = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) { console.error("未找到 Chrome，请安装或指定路径"); process.exit(1); }

/* ---------- 极简 CDP 客户端 ---------- */
class Cdp {
	constructor(ws) {
		this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
		ws.onmessage = (ev) => {
			const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
			if (msg.id !== undefined) {
				const p = this.pending.get(msg.id);
				if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
				return;
			}
			for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
		};
	}
	static async connect(url) {
		const ws = new WebSocket(url);
		await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error(`WS 连接失败: ${url}`)); });
		return new Cdp(ws);
	}
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
	on(method, fn) {
		if (!this.listeners.has(method)) this.listeners.set(method, []);
		this.listeners.get(method).push(fn);
	}
	close() { try { this.ws.close(); } catch {} }
}

/* ---------- 页面会话 ---------- */
class Page {
	constructor(cdp) {
		this.cdp = cdp;
		this.consoleErrors = [];
		cdp.on("Runtime.consoleAPICalled", (p) => {
			if (p.type === "error") this.consoleErrors.push(p.args.map((a) => a.value ?? a.description ?? "").join(" "));
		});
		cdp.on("Runtime.exceptionThrown", (p) => {
			this.consoleErrors.push((p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "exception").slice(0, 300));
		});
	}
	async init() {
		await this.cdp.send("Page.enable");
		await this.cdp.send("Runtime.enable");
	}
	async eval(expression, awaitPromise = true) {
		const r = await this.cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
		if (r.exceptionDetails) throw new Error("页面内异常: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
		return r.result.value;
	}
	async addInitScript(source) {
		await this.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source });
	}
	/** 轮询等待表达式为真，返回最终值。 */
	async waitFor(expression, timeoutMs = 30000, intervalMs = 500) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			try {
				const v = await this.eval(expression);
				if (v) return v;
			} catch {}
			await sleep(intervalMs);
		}
		throw new Error(`等待超时(${timeoutMs}ms): ${expression}`);
	}
	async setViewport(width, height, mobile) {
		await this.cdp.send("Emulation.setDeviceMetricsOverride", {
			width, height, deviceScaleFactor: mobile ? 2 : 1, mobile,
			screenWidth: width, screenHeight: height,
		});
		await this.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
	}
	async navigate(url) {
		await this.cdp.send("Page.navigate", { url });
		// 等 document + 插件 boot（DSH 首屏较重，放宽超时）
		await this.waitFor("window.__DSH_MOBILE__ !== undefined", 60000, 1000);
	}
	/** 等移动端激活（角色解析完成 + 健康检查轮询激活），返回 diagnose。 */
	async waitActive(timeoutMs = 45000) {
		await this.waitFor('document.documentElement.dataset.dshmob === "on"', timeoutMs, 1000);
		return this.eval("window.__DSH_MOBILE__.diagnose()");
	}
	/** 等 app 外壳挂载（桌面用例用：frame 出现即可）。 */
	async waitFrame(timeoutMs = 45000) {
		await this.waitFor('document.querySelector(".pI_x6G_frame") !== null', timeoutMs, 1000);
	}
	async screenshot(name) {
		fs.mkdirSync(ARTIFACTS, { recursive: true });
		const r = await this.cdp.send("Page.captureScreenshot", { format: "png" });
		fs.writeFileSync(path.join(ARTIFACTS, `${name}.png`), Buffer.from(r.data, "base64"));
	}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

/* ---------- 启动 Chrome ---------- */
const userDataDir = path.join(os.tmpdir(), `dsh-mobile-cdp-${CDP_PORT}`);
fs.rmSync(userDataDir, { recursive: true, force: true });
const chrome = spawn(chromePath, [
	"--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
	"--no-first-run", "--no-default-browser-check", "--disable-gpu", "--touch-events=enabled", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill(); } catch {} });

async function newPage() {
	// Chrome ≥111：/json/new 用 PUT
	const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?url=${encodeURIComponent("about:blank")}`, { method: "PUT" });
	const info = await res.json();
	const cdp = await Cdp.connect(info.webSocketDebuggerUrl);
	const page = new Page(cdp);
	await page.init();
	page.targetId = info.id;
	return page;
}
async function closePage(page) {
	page.cdp.close();
	// 关 tab 释放资源：DSH 每个 tab 都持有 SSE/WS，堆积会拖垮后续用例
	try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${page.targetId}`); } catch {}
}

async function waitChromeReady() {
	for (let i = 0; i < 40; i += 1) {
		try {
			const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
			if (r.ok) return;
		} catch {}
		await sleep(500);
	}
	throw new Error("Chrome CDP 未就绪");
}

/* ---------- 断言工具 ---------- */
function record(name, ok, detail) {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const assertTrue = (name, cond, detail = "") => record(name, Boolean(cond), detail);

/* ---------- 移动端通用断言 ---------- */
async function mobileCase(id, width, height, extraAssertions = []) {
	const page = await newPage();
	await page.setViewport(width, height, true);
	await page.navigate(TARGET_URL);
	// 等健康检查激活（角色解析 + html[data-dshmob=on]），而非固定睡眠
	const diag = await page.waitActive();
	await page.screenshot(id);
	assertTrue(`${id} 插件激活 (data-dshmob=on)`, diag.enabled === true, JSON.stringify({ enabled: diag.enabled }));
	assertTrue(`${id} 关键角色齐全`, ["frame", "sidebar", "center", "composer"].every((k) => diag.roles[k]), JSON.stringify(Object.keys(diag.roles)));
	assertTrue(`${id} 无横向溢出`, diag.horizontalOverflow <= 1, `overflow=${diag.horizontalOverflow}px`);
	assertTrue(`${id} 汉堡可见`, await page.eval(`(() => { const b = document.querySelector(".dsh-mob-burger"); if (!b) return false; const s = getComputedStyle(b); const r = b.getBoundingClientRect(); return s.display !== "none" && r.width >= 44 && r.height >= 44; })()`));
	assertTrue(`${id} 详情默认隐藏`, await page.eval(`(() => { const d = document.querySelector('[data-dshmob-role="details"]'); return d === null || getComputedStyle(d).display === "none"; })()`));
	assertTrue(`${id} 桌面遮罩/元素隐藏`, await page.eval(`getComputedStyle(document.querySelector(".dsh-mob-mask")).display === "none"`));
	// 详情抽屉 CSS 契约：body class 打开后 details 变 fixed sheet
	assertTrue(`${id} 详情抽屉契约`, await page.eval(`(() => {
		const d = document.querySelector('[data-dshmob-role="details"]');
		if (!d) return true;
		document.body.classList.add("dsh-mob-details-open");
		const on = getComputedStyle(d);
		const ok = on.display !== "none" && on.position === "fixed" && parseInt(on.zIndex, 10) >= 100;
		document.body.classList.remove("dsh-mob-details-open");
		return ok;
	})()`));
	// 抽屉开合（20 次无残留状态）
	assertTrue(`${id} 抽屉开合 20 次`, await page.eval(`(() => {
		const burger = document.querySelector(".dsh-mob-burger");
		if (!burger) return false;
		let ok = true;
		for (let i = 0; i < 20; i += 1) {
			burger.click();
			ok = ok && document.body.classList.contains("dsh-mob-open");
			burger.click();
			ok = ok && !document.body.classList.contains("dsh-mob-open");
		}
		return ok && (document.documentElement.dataset.dshmobTopOverlay || "none") === "none";
	})()`));
	// 浮层栈无冲突
	assertTrue(`${id} 浮层无重叠冲突`, diag.overlapFailures === 0, `conflicts=${diag.overlapFailures}`);
	// 控制台错误（排除网络类与已知噪声）
	const realErrors = page.consoleErrors.filter((e) => !/net::|Failed to fetch|WebSocket|SSE|EventSource/i.test(e));
	assertTrue(`${id} 无插件相关控制台错误`, !realErrors.some((e) => /dsh-mobile|TypeError|ReferenceError/.test(e)), realErrors.slice(0, 2).join(" | ").slice(0, 200));
	for (const fn of extraAssertions) {
		try { const r = await fn(page, id); if (r !== undefined && r !== true) assertTrue(`${id} ${r.name || "附加项"}`, false, String(r)); }
		catch (e) { assertTrue(`${id} 附加项`, false, String(e.message || e).slice(0, 200)); }
	}
	await closePage(page);
}

/* ---------- 桌面用例 ---------- */
async function desktopCase(id, width, height) {
	const page = await newPage();
	await page.setViewport(width, height, false);
	await page.navigate(TARGET_URL);
	await page.waitFrame();
	await page.screenshot(id);
	assertTrue(`${id} 桌面未激活`, await page.eval('document.documentElement.dataset.dshmob !== "on"'));
	assertTrue(`${id} 汉堡隐藏`, await page.eval('getComputedStyle(document.querySelector(".dsh-mob-burger")).display === "none"'));
	assertTrue(`${id} 遮罩隐藏`, await page.eval('getComputedStyle(document.querySelector(".dsh-mob-mask")).display === "none"'));
	assertTrue(`${id} frame 未被移动样式改写`, await page.eval(`(() => {
		const f = document.querySelector(".pI_x6G_frame");
		if (!f) return true; // 未挂载也视为零影响
		const s = getComputedStyle(f);
		return s.gridTemplateColumns !== "minmax(0px, 1fr)";
	})()`));
	await closePage(page);
}

/* ---------- 特殊用例：kill switch / hash 失效兜底 / 安全降级 ---------- */
async function killSwitchCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(`${TARGET_URL}?dshMobileOff=1`);
	await page.screenshot("K1-kill-switch");
	assertTrue("K1 kill-switch 不激活", await page.eval('document.documentElement.dataset.dshmob !== "on" && window.__DSH_MOBILE__.diagnose().killed === true'));
	await closePage(page);
}

async function fallbackCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	// K2A：改名 pI_x6G_*（同步注入等价 CSS，模拟真实升级：类名变、配套样式还在）+ 清 role 标记
	// → 缓存重打标记/健康检查重新解析恢复，插件保持激活。
	await page.eval(`(() => {
		const style = document.createElement("style");
		style.textContent = ".pI_x6G_frame-renamed{display:grid;grid-template-columns:minmax(0,1fr);width:100%;height:100dvh}.pI_x6G_sidebarCol-renamed,.pI_x6G_centerCol-renamed,.pI_x6G_detailsCol-renamed{display:block}";
		document.head.appendChild(style);
		const rename = (el) => { for (const c of Array.from(el.classList)) { if (/^pI_x6G_/.test(c)) { el.classList.remove(c); el.classList.add(c + "-renamed"); } } };
		document.querySelectorAll(".pI_x6G_frame, .pI_x6G_sidebarCol, .pI_x6G_centerCol, .pI_x6G_detailsCol").forEach(rename);
		document.querySelectorAll("[data-dshmob-role]").forEach((el) => el.removeAttribute("data-dshmob-role"));
		const tmp = document.createElement("i");
		document.body.appendChild(tmp);
		window.setTimeout(() => tmp.remove(), 50);
		return true;
	})()`);
	await page.waitFor('document.querySelector(\'[data-dshmob-role="frame"]\') !== null', 15000, 500);
	const diag2 = await page.eval("window.__DSH_MOBILE__.diagnose()");
	await page.screenshot("K2-fallback-recovery");
	assertTrue("K2 类名失效→兜底恢复角色+保持激活", diag2.enabled === true && ["frame", "sidebar", "center", "composer"].every((k) => diag2.roles[k]), JSON.stringify(Object.keys(diag2.roles)));
	// K2B：全新加载下插件从启动起就面对改名后的 DOM（init script 持续改名）→ 结构兜底必须解析
	await closePage(page);
	const page2 = await newPage();
	await page2.setViewport(390, 844, true);
	await page2.addInitScript(`(() => {
		const style = document.createElement("style");
		style.textContent = ".pI_x6G_frame-renamed{display:grid;grid-template-columns:minmax(0,1fr);width:100%;height:100dvh}.pI_x6G_sidebarCol-renamed,.pI_x6G_centerCol-renamed,.pI_x6G_detailsCol-renamed{display:block}";
		document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
		const rename = () => {
			document.querySelectorAll(".pI_x6G_frame,.pI_x6G_sidebarCol,.pI_x6G_centerCol,.pI_x6G_detailsCol").forEach((el) => {
				for (const c of Array.from(el.classList)) {
					if (/^pI_x6G_/.test(c) && !c.endsWith("-renamed")) { el.classList.remove(c); el.classList.add(c + "-renamed"); }
				}
			});
		};
		// attributes + childList 都要观察：React 重渲染会换新节点（新节点带着原始类名）；
		// documentElement 在本脚本运行时可能还没创建，用 rAF 等到就绪再挂 observer
		const mo = new MutationObserver(rename);
		const tryObserve = () => {
			if (document.documentElement === null) { requestAnimationFrame(tryObserve); return; }
			mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
		};
		tryObserve();
	})()`);
	await page2.navigate(TARGET_URL);
	const diag3 = await page2.waitActive(60000);
	const renamedOnly = await page2.eval('document.querySelector(".pI_x6G_frame") === null && document.querySelector(".pI_x6G_frame-renamed") !== null');
	await page2.screenshot("K2-fresh-fallback");
	assertTrue("K2B 全新加载下语义兜底激活", diag3.enabled === true && ["frame", "sidebar", "center", "composer"].every((k) => diag3.roles[k]) && renamedOnly === true, JSON.stringify({ renamedOnly, roles: Object.keys(diag3.roles) }));
	// K3：结构破坏（frame 变 flex）→ 安全降级：撤样式 + 提示条 + 绝不隐藏主列
	await page2.eval(`(() => {
		window.__degraded = false;
		window.addEventListener("dsh-mobile:degraded", () => { window.__degraded = true; });
		const frame = document.querySelector(".pI_x6G_frame-renamed");
		frame.style.display = "flex";
		document.querySelectorAll("[data-dshmob-role]").forEach((el) => el.removeAttribute("data-dshmob-role"));
		const tmp = document.createElement("i");
		document.body.appendChild(tmp);
		window.setTimeout(() => tmp.remove(), 50);
	})()`);
	await page2.waitFor("window.__degraded === true", 20000, 1000);
	const degraded = await page2.eval(`(() => ({
		enabled: window.__DSH_MOBILE__.diagnose().enabled,
		bar: document.querySelector(".dsh-mob-degraded-bar") !== null,
		centerVisible: (() => { const c = document.querySelector(".pI_x6G_centerCol-renamed"); return c !== null && getComputedStyle(c).display !== "none"; })(),
	}))()`);
	await page2.screenshot("K3-degraded");
	assertTrue("K3 安全降级：撤样式+提示条+不隐藏主列", degraded.enabled === false && degraded.bar === true && degraded.centerVisible === true, JSON.stringify(degraded));
	await closePage(page2);
}

/* ---------- K4：键盘弹出模拟（视口高度收缩）——"键盘顶飞输入框"修复的几何验收 ---------- */
async function keyboardSimCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	// 模拟键盘弹出：可视高度 844→520。桌面 headless 下 visualViewport 与 layout viewport 同缩，
	// 走 window.resize + vv resize 路径，验证"frame 高度联动 + composer 贴底在可视区内"。
	await page.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 520, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 520 });
	await sleep(800);
	const kbd = await page.eval(`(() => {
		const f = document.querySelector('[data-dshmob-role="frame"]');
		const comp = document.querySelector('[data-dshmob-role="composer"]');
		if (!f || !comp) return { ok: false };
		const fr = f.getBoundingClientRect();
		const cr = comp.getBoundingClientRect();
		const card = comp.querySelector(".uV2eYG_card"), cardRect = card?.getBoundingClientRect();
		return { ok: true, frameH: Math.round(fr.height), frameBottom: Math.round(fr.bottom), compTop: Math.round(cr.top), compBottom: Math.round(cr.bottom), innerH: window.innerHeight, compVisible: cr.bottom <= window.innerHeight + 1 && cr.top >= 0 && cr.width > 0 && cr.height > 0, internalFits: !card || (cardRect.top >= cr.top - 1 && cardRect.bottom <= cr.bottom + 1 && card.scrollWidth <= card.clientWidth + 1), scrollTop: document.documentElement.scrollTop };
	})()`);
	await page.screenshot("K4-keyboard-open");
	assertTrue("K4 键盘弹出：frame 高度联动可视高度", kbd.ok === true && kbd.frameH <= 521 && kbd.frameBottom <= 521, JSON.stringify(kbd));
	assertTrue("K4 键盘弹出：composer 完整在可视区内（不被顶飞）", kbd.compVisible === true, JSON.stringify(kbd));
	assertTrue("K4 键盘弹出：composer 内部卡片未挤出或横溢", kbd.internalFits === true, JSON.stringify(kbd));
	assertTrue("K4 键盘弹出：文档滚动归零", kbd.scrollTop === 0, JSON.stringify(kbd));
	// 收起键盘
	await page.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await sleep(800);
	const restored = await page.eval(`(() => {
		const f = document.querySelector('[data-dshmob-role="frame"]');
		const comp = document.querySelector('[data-dshmob-role="composer"]');
		if (!f || !comp) return { ok: false };
		const fr = f.getBoundingClientRect();
		const cr = comp.getBoundingClientRect();
		return { ok: true, frameH: Math.round(fr.height), compVisible: cr.bottom <= window.innerHeight + 1 && cr.top >= 0, topVar: document.documentElement.style.getPropertyValue("--dshmob-vv-top") };
	})()`);
	assertTrue("K4 键盘收起：frame 恢复全高、composer 回位、top 变量归零", restored.ok === true && restored.frameH >= 843 && restored.compVisible === true && (restored.topVar === "" || restored.topVar === "0px"), JSON.stringify(restored));
	await closePage(page);
}

/* ---------- K5：切后台再切回——视口强制重同步（"输入框被顶到很上面"修复的验收） ---------- */
// iOS Safari 冻结期会丢弃 visualViewport resize/scroll 事件，切回前台后事件也可能不再派发，
// --dshmob-vv-* 停留在旧值会让 frame 整体错位（输入框被顶到屏幕上部）。
// 修复契约：visibilitychange→visible / pageshow 时按当前真实视口立即重同步 + 400ms 二次校准。
async function bgResumeCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	// 键盘弹出态（可视高度 520）
	await page.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 520, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 520 });
	await sleep(800);
	// 模拟"冻结期事件全部丢失"的残留：变量停留在与当前视口不一致的旧值（844/0）
	await page.eval(`(() => {
		document.body.style.setProperty("--dshmob-vv-height", "844px");
		document.body.style.setProperty("--dshmob-vv-top", "0px");
		document.body.style.setProperty("--dshmob-vv-bottom", "0px");
		return true;
	})()`);
	// 模拟切后台（hidden）再切回（visible），期间只有 visibilitychange，无任何 resize/scroll 事件
	await page.eval(`(() => {
		window.__dshmobHidden = true;
		Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__dshmobHidden });
		document.dispatchEvent(new Event("visibilitychange"));
		window.__dshmobHidden = false;
		document.dispatchEvent(new Event("visibilitychange"));
		return true;
	})()`);
	await sleep(700); // 覆盖 400ms 二次校准
	const resumed = await page.eval(`(() => {
		const f = document.querySelector('[data-dshmob-role="frame"]');
		const comp = document.querySelector('[data-dshmob-role="composer"]');
		if (!f || !comp) return { ok: false };
		const fr = f.getBoundingClientRect(), cr = comp.getBoundingClientRect();
		const cs = getComputedStyle(document.body);
		return { ok: true, varH: cs.getPropertyValue("--dshmob-vv-height").trim(), varTop: cs.getPropertyValue("--dshmob-vv-top").trim(), frameH: Math.round(fr.height), frameBottom: Math.round(fr.bottom), compVisible: cr.bottom <= window.innerHeight + 1 && cr.top >= 0 && cr.width > 0 && cr.height > 0, scrollTop: document.documentElement.scrollTop };
	})()`);
	await page.screenshot("K5-bg-resume-keyboard");
	assertTrue("K5 后台恢复：变量按当前真实视口重同步", resumed.ok === true && resumed.varH === "520px" && resumed.varTop === "0px", JSON.stringify(resumed));
	assertTrue("K5 后台恢复：frame 高度与 composer 位置正确", resumed.ok === true && resumed.frameH <= 521 && resumed.frameBottom <= 521 && resumed.compVisible === true, JSON.stringify(resumed));
	assertTrue("K5 后台恢复：文档滚动归零", resumed.scrollTop === 0, JSON.stringify(resumed));
	// 收起键盘（真实 resize 路径仍正常）
	await page.cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
	await sleep(800);
	const closed = await page.eval(`(() => {
		const f = document.querySelector('[data-dshmob-role="frame"]');
		const comp = document.querySelector('[data-dshmob-role="composer"]');
		if (!f || !comp) return { ok: false };
		const fr = f.getBoundingClientRect(), cr = comp.getBoundingClientRect();
		return { ok: true, frameH: Math.round(fr.height), compVisible: cr.bottom <= window.innerHeight + 1 && cr.top >= 0 };
	})()`);
	assertTrue("K5 键盘收起：frame 恢复全高、composer 回位", closed.ok === true && closed.frameH >= 843 && closed.compVisible === true, JSON.stringify(closed));
	await closePage(page);
}

/* ---------- M5：844px 横屏 = 断点外桌面边界（设计 §0：覆盖 320-768px） ---------- */
async function touchLandscapeBoundaryCase(id, width, height) {
	const page = await newPage();
	await page.setViewport(width, height, true);
	await page.navigate(TARGET_URL);
	await page.waitFrame();
	await page.screenshot(id);
	const overflow = await page.eval("document.documentElement.scrollWidth - window.innerWidth");
	assertTrue(`${id} 844px 桌面边界未激活（断点 768px，设计行为）`, await page.eval('document.documentElement.dataset.dshmob !== "on"'));
	assertTrue(`${id} 移动元素隐藏`, await page.eval('getComputedStyle(document.querySelector(".dsh-mob-burger")).display === "none"'));
	assertTrue(`${id} 无横向溢出`, overflow <= 1, `overflow=${overflow}px`);
	await closePage(page);
}

/* ---------- P1A：深色媒体、主题 token 与 toast 去重 ---------- */
async function p1DarkCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	await page.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
	const dedupe = await page.eval(`(() => {
		const before = window.__DSH_MOBILE__.diagnose().toastAnnouncements;
		const first = window.__DSH_MOBILE__.notify("copy", "P1 深色状态");
		const duplicate = window.__DSH_MOBILE__.notify("copy", "P1 深色状态");
		const otherType = window.__DSH_MOBILE__.notify("reconnect", "P1 深色状态");
		const burger = document.querySelector(".dsh-mob-burger");
		burger.click();
		return { first, duplicate, otherType, before, after: window.__DSH_MOBILE__.diagnose().toastAnnouncements, cooldown: window.__DSH_MOBILE__.diagnose().toastCooldownMs, toastNodes: document.querySelectorAll(".dsh-mob-toast").length };
	})()`);
	await sleep(300);
	const visual = await page.eval(`(() => {
		const color = (el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, fg: s.color, display: s.display, opacity: s.opacity }; };
		const rgba = (value) => { const m = value.match(/[\\d.]+/g); return m ? m.map(Number) : []; };
		const opaque = (value) => { const v = rgba(value); return value !== "transparent" && (v.length < 4 || v[3] > 0); };
		const alpha = (value) => { const v = rgba(value); return v.length < 4 ? 1 : v[3]; };
		const luminance = (value) => { const rgb = rgba(value).slice(0, 3).map((n) => { const c = n / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; };
		const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
		const burger = document.querySelector(".dsh-mob-burger"), mask = document.querySelector(".dsh-mob-mask"), toast = document.querySelector(".dsh-mob-toast"), details = document.querySelector('[data-dshmob-role="details"]');
		const bs = color(burger), ms = color(mask), ts = color(toast), bodyBg = getComputedStyle(document.body).backgroundColor;
		burger.click();
		document.body.classList.add("dsh-mob-details-open");
		const ds = details ? color(details) : null;
		document.body.classList.remove("dsh-mob-details-open");
		return { media: matchMedia("(prefers-color-scheme: dark)").matches, burger: bs, mask: ms, toast: ts, details: ds, bodyBg,
			// 遮罩是设计上的半透明层（color-mix 36%），只要求 alpha>0；details 列 390 页可能未渲染，存在才校验
			surfaces: opaque(bs.bg) && opaque(bs.fg) && alpha(ms.bg) > 0 && opaque(ms.fg) && opaque(ts.bg) && opaque(ts.fg) && (ds === null || (opaque(ds.bg) && opaque(ds.fg))),
			burgerDistinct: bs.bg !== bodyBg, burgerContrast: contrast(bs.fg, bs.bg), toastContrast: contrast(ts.fg, ts.bg) };
	})()`);
	await page.screenshot("P1A-dark-media");
	assertTrue("P1A 深色媒体已生效", visual.media === true, JSON.stringify(visual));
	assertTrue("P1A 插件元素背景与文字非透明", visual.surfaces === true, JSON.stringify(visual));
	assertTrue("P1A 汉堡与页面背景有区分", visual.burgerDistinct === true, JSON.stringify(visual));
	assertTrue("P1A 汉堡/Toast 对比度达标", visual.burgerContrast >= 3 && visual.toastContrast >= 4.5, JSON.stringify(visual));
	assertTrue("P1A Toast 按 type+message 去重且保持单例", dedupe.first === true && dedupe.duplicate === false && dedupe.otherType === true && dedupe.after - dedupe.before === 2 && dedupe.cooldown === 10000 && dedupe.toastNodes === 1, JSON.stringify(dedupe));
	await page.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
	await closePage(page);
}

/* ---------- P1B：reduced-motion 覆盖插件动画 ---------- */
async function p1ReducedMotionCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	await page.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
	await page.eval('window.__DSH_MOBILE__.notify("status", "P1 动效测试")');
	const motion = await page.eval(`(() => {
		const ms = (value) => Math.max(...value.split(",").map((part) => { const s = part.trim(); return s.endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000; }));
		const toast = getComputedStyle(document.querySelector(".dsh-mob-toast"));
		const sidebar = getComputedStyle(document.querySelector('[data-dshmob-role="sidebar"]'));
		return { media: matchMedia("(prefers-reduced-motion: reduce)").matches, toastMs: ms(toast.transitionDuration), sidebarMs: ms(sidebar.transitionDuration), scroll: toast.scrollBehavior };
	})()`);
	assertTrue("P1B reduced-motion 媒体已生效", motion.media === true, JSON.stringify(motion));
	assertTrue("P1B 插件 transition 降至 0.01ms", motion.toastMs <= .02 && motion.sidebarMs <= .02, JSON.stringify(motion));
	assertTrue("P1B 平滑滚动已关闭", motion.scroll === "auto", JSON.stringify(motion));
	await page.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
	await closePage(page);
}

/* ---------- P1C：抽屉语义、Escape 优先级与焦点恢复 ---------- */
async function p1FocusEscapeCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	await page.eval(`(() => { const b = document.querySelector(".dsh-mob-burger"); b.focus(); b.click(); })()`);
	await page.waitFor('document.body.classList.contains("dsh-mob-open")');
	const opened = await page.eval(`(() => { const b = document.querySelector(".dsh-mob-burger"), c = document.querySelector('[data-dshmob-role="center"]'); return { inert: c.inert, expanded: b.getAttribute("aria-expanded"), controls: document.getElementById(b.getAttribute("aria-controls")) !== null }; })()`);
	await page.eval('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
	await sleep(100);
	const closed = await page.eval(`(() => { const b = document.querySelector(".dsh-mob-burger"), c = document.querySelector('[data-dshmob-role="center"]'); return { closed: !document.body.classList.contains("dsh-mob-open"), inert: c.inert, expanded: b.getAttribute("aria-expanded"), focus: document.activeElement === b }; })()`);
	assertTrue("P1C 侧栏打开时 inert/ARIA 完整", opened.inert === true && opened.expanded === "true" && opened.controls === true, JSON.stringify(opened));
	assertTrue("P1C Escape 关闭侧栏并恢复汉堡焦点", closed.closed === true && closed.inert === false && closed.expanded === "false" && closed.focus === true, JSON.stringify(closed));
	const detailSetup = await page.eval(`(() => {
		const frame = document.querySelector('[data-dshmob-role="frame"]'), root = document.querySelector('[data-dshmob-role="details-root"]'), center = document.querySelector('[data-dshmob-role="center"]');
		if (!frame || !root || !center) return { available: false };
		const trigger = document.createElement("button"); trigger.id = "dshmob-p1-inspect"; trigger.dataset.dshmobAction = "inspect"; trigger.textContent = "Inspect"; center.appendChild(trigger); trigger.focus(); trigger.click();
		const section = document.createElement("div"); section.className = "ydkMvW_section"; section.id = "dshmob-p1-section"; section.textContent = "P1 detail"; root.appendChild(section);
		window.__dshmobP1HadCollapsed = frame.hasAttribute("data-details-collapsed"); frame.removeAttribute("data-details-collapsed");
		return { available: true };
	})()`);
	if (detailSetup.available) {
		await page.waitFor('document.body.classList.contains("dsh-mob-details-open") && document.querySelector(\'[data-dshmob-role="center"]\').inert', 5000, 100);
		await page.eval('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
		await page.waitFor('!document.body.classList.contains("dsh-mob-details-open")', 5000, 100);
		await sleep(100);
		const detailClosed = await page.eval(`(() => { const frame = document.querySelector('[data-dshmob-role="frame"]'), trigger = document.getElementById("dshmob-p1-inspect"), section = document.getElementById("dshmob-p1-section"), center = document.querySelector('[data-dshmob-role="center"]'); const out = { inert: center.inert, focus: document.activeElement === trigger }; if (window.__dshmobP1HadCollapsed) frame.setAttribute("data-details-collapsed", ""); section.remove(); trigger.remove(); delete window.__dshmobP1HadCollapsed; return out; })()`);
		assertTrue("P1C Escape 关闭详情并恢复 Inspect 焦点", detailClosed.inert === false && detailClosed.focus === true, JSON.stringify(detailClosed));
	} else {
		await page.eval(`(() => { document.querySelector(".dsh-mob-burger").click(); document.body.classList.add("dsh-mob-details-open"); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); })()`);
		await sleep(100);
		const priority = await page.eval('({ detailsClosed: !document.body.classList.contains("dsh-mob-details-open"), sidebarKept: document.body.classList.contains("dsh-mob-open") })');
		assertTrue("P1C 详情缺失时 Escape 仍只关详情、不关侧栏", priority.detailsClosed && priority.sidebarKept, JSON.stringify(priority));
		await page.eval('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
	}
	const header = await page.eval(`(() => { const h = document.querySelector('[data-dshmob-role="conversation-header"]'); if (!h) return null; const root = document.documentElement, old = root.getAttribute("data-dshmob-burger"), docked = parseFloat(getComputedStyle(h).paddingLeft); root.dataset.dshmobBurger = "free"; const free = parseFloat(getComputedStyle(h).paddingLeft); if (old === null) root.removeAttribute("data-dshmob-burger"); else root.setAttribute("data-dshmob-burger", old); return { docked, free }; })()`);
	assertTrue("P1C 拖动汉堡后 header 动态释放留白", header === null || header.free < header.docked, JSON.stringify(header));
	await closePage(page);
}

/* ---------- P1D：长内容横滚边界与设置卡片（390 视口：320 空会话页无 message-list 角色） ---------- */
async function p1LongContentCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	await page.eval(`(() => {
		// 先查 message-list 再回退 conversation（逗号选择器会按文档序先命中祖先 conversation，必须分开查）
		const list = document.querySelector('[data-dshmob-role="message-list"]') || document.querySelector('[data-dshmob-role="conversation"]'); if (!list) return false;
		const style = document.createElement("style"); style.id = "dshmob-p1-style"; style.textContent = ".dshmob-p1-table td{min-width:88px;white-space:nowrap}.qSYn7G_cards{display:grid;grid-template-columns:1fr 1fr}.dshmob-p1-attachment{width:220px;height:20px}"; document.head.appendChild(style);
		const host = document.createElement("section"); host.id = "dshmob-p1-host";
		const link = document.createElement("a"); link.id = "dshmob-p1-url"; link.href = "#"; link.style.display = "block"; link.textContent = "https://example.test/" + "u".repeat(300); host.appendChild(link);
		const pre = document.createElement("pre"); pre.id = "dshmob-p1-pre"; pre.textContent = "/very/long/path/" + "x".repeat(300); host.appendChild(pre);
		const table = document.createElement("table"); table.id = "dshmob-p1-table"; table.className = "dshmob-p1-table"; const row = table.insertRow(); for (let i = 0; i < 20; i += 1) row.insertCell().textContent = "column-" + i; host.appendChild(table);
		const tool = document.createElement("div"); tool.id = "dshmob-p1-tool"; tool.className = "o3BgMG_root"; tool.dataset.tool = "test"; tool.innerHTML = '<button class="o3BgMG_inspectButton">Inspect</button>'; host.appendChild(tool);
		const actions = document.createElement("div"); actions.id = "dshmob-p1-actions"; actions.className = "p-xYUq_actions"; actions.innerHTML = '<button aria-label="复制">C</button><button aria-label="分支">B</button>'; host.appendChild(actions);
		const attachments = document.createElement("div"); attachments.id = "dshmob-p1-attachments"; attachments.dataset.dshmobRole = "attachments"; for (let i = 0; i < 3; i += 1) { const item = document.createElement("div"); item.className = "dshmob-p1-attachment"; item.textContent = "attachment-" + i; attachments.appendChild(item); } host.appendChild(attachments);
		const cards = document.createElement("div"); cards.id = "dshmob-p1-cards"; cards.className = "qSYn7G_cards"; cards.innerHTML = '<div class="qSYn7G_path">' + "p".repeat(300) + '</div><div>second</div><input type="search" value="search">'; host.appendChild(cards);
		const footer = document.createElement("div"); footer.id = "dshmob-p1-footer"; footer.className = "YyYd_a_footer"; footer.textContent = "save"; host.appendChild(footer); list.appendChild(host);
		window.__dshmobP1Target = list.getAttribute("data-dshmob-role");
		const tabs = document.querySelector('[data-dshmob-role="conversation-tabs"]'); window.__dshmobP1Tabs = [];
		if (tabs) for (let i = 0; i < 6; i += 1) { const b = document.createElement("button"); b.textContent = "P1-tab-" + i; b.style.flex = "0 0 120px"; if (i === 5) b.setAttribute("aria-selected", "true"); tabs.appendChild(b); window.__dshmobP1Tabs.push(b); }
		return true;
	})()`);
	await page.waitFor('document.getElementById("dshmob-p1-pre")?.hasAttribute("data-dshmob-scroll-x") && document.getElementById("dshmob-p1-table")?.hasAttribute("data-dshmob-scroll-x")', 5000, 100);
	await sleep(300);
	const layout = await page.eval(`(() => {
		const host = document.getElementById("dshmob-p1-host"), link = document.getElementById("dshmob-p1-url"), pre = document.getElementById("dshmob-p1-pre"), table = document.getElementById("dshmob-p1-table"), tool = document.getElementById("dshmob-p1-tool"), inspect = tool.querySelector("button"), actions = document.getElementById("dshmob-p1-actions"), attachments = document.getElementById("dshmob-p1-attachments"), cards = document.getElementById("dshmob-p1-cards"), footer = document.getElementById("dshmob-p1-footer"), tabs = document.querySelector('[data-dshmob-role="conversation-tabs"]'), selected = window.__dshmobP1Tabs.at(-1);
		const cr = cards.children[0].getBoundingClientRect(), nr = cards.children[1].getBoundingClientRect(), sr = selected?.getBoundingClientRect(), tr = tabs?.getBoundingClientRect();
		return { targetRole: window.__dshmobP1Target, globalOverflow: document.documentElement.scrollWidth - innerWidth, hostOverflow: host.scrollWidth - host.clientWidth, urlOverflow: link.scrollWidth - link.clientWidth,
			preMarked: pre.hasAttribute("data-dshmob-scroll-x"), preScroll: pre.scrollWidth > pre.clientWidth + 1, tableMarked: table.hasAttribute("data-dshmob-scroll-x"), tableScroll: table.scrollWidth > table.clientWidth + 1,
			inspect: { marked: inspect.dataset.dshmobAction === "inspect", opacity: parseFloat(getComputedStyle(inspect).opacity), height: inspect.getBoundingClientRect().height }, actions: { marked: actions.dataset.dshmobRole === "message-actions", sizes: Array.from(actions.querySelectorAll("button"), (b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height]) },
			attachmentsScroll: attachments.scrollWidth > attachments.clientWidth + 1, cardsSingle: nr.top > cr.top, searchFont: parseFloat(getComputedStyle(cards.querySelector("input")).fontSize), pathOverflow: cards.firstElementChild.scrollWidth - cards.firstElementChild.clientWidth, footerPosition: getComputedStyle(footer).position,
			tabs: !tabs || !selected ? null : { overflow: getComputedStyle(tabs).overflowX, scrollable: tabs.scrollWidth > tabs.clientWidth, scrolled: tabs.scrollLeft > 0, selectedVisible: sr.left >= tr.left - 1 && sr.right <= tr.right + 1 } };
	})()`);
	await page.screenshot("P1D-long-content");
	// 空会话（hero）态下 message-list 角色解析到隐藏视图（detached 不打标），注入会落到 conversation；
	// 真实消息内容只出现在 message-list 内（M 用例已覆盖真实页面零溢出），conversation 目标下豁免宿主级断言。
	const inList = layout.targetRole === "message-list";
	assertTrue("P1D 页面与注入宿主无全局横溢", layout.globalOverflow <= 1 && (inList ? (layout.hostOverflow <= 1 && layout.urlOverflow <= 1) : true), JSON.stringify(layout));
	assertTrue("P1D pre/table 获得标记且仅自身横滚", layout.preMarked && layout.preScroll && (inList ? (layout.tableMarked && layout.tableScroll) : layout.tableMarked), JSON.stringify(layout));
	assertTrue("P1D Inspect 常显且消息操作按钮可一次点中", layout.inspect.marked && layout.inspect.opacity > 0 && layout.inspect.height >= 44 && layout.actions.marked && layout.actions.sizes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify({ inspect: layout.inspect, actions: layout.actions }));
	assertTrue("P1D 附件列表可横向滚动", layout.attachmentsScroll === true, JSON.stringify(layout));
	assertTrue("P1D 设置卡片单列、长值换行、搜索框 16px、footer 可达", layout.cardsSingle && layout.pathOverflow <= 1 && layout.searchFont >= 16 && layout.footerPosition === "sticky", JSON.stringify(layout));
	assertTrue("P1D tabs 可横滚并自动显示选中项", layout.tabs === null || (layout.tabs.overflow === "auto" && layout.tabs.scrollable && layout.tabs.scrolled && layout.tabs.selectedVisible), JSON.stringify(layout.tabs));
	const source = fs.readFileSync(path.join(__dirname, "client.js"), "utf8");
	assertTrue("P1D 非安全上下文 clipboard shim 代码审查", /!FEATURES\.clipboardShim[^\n]+window\.isSecureContext/.test(source) && /showStatusToast\(rt, "copy", "已复制"\)/.test(source), "loopback 属安全上下文，按设计允许以静态审查覆盖");
	await page.eval(`(() => { document.getElementById("dshmob-p1-host")?.remove(); document.getElementById("dshmob-p1-style")?.remove(); for (const el of window.__dshmobP1Tabs || []) el.remove(); delete window.__dshmobP1Tabs; })()`);
	await closePage(page);
}

/* ---------- P2 共用：注入详情内容，走 React 权威折叠状态打开抽屉 ---------- */
async function openInjectedDetails(page, id) {
	// 若 details 列尚未渲染（页面未开过抽屉），先预热一次开合
	const probe = await page.eval('document.querySelector(\'[data-dshmob-role="details-root"], .ydkMvW_root\') !== null');
	if (!probe) {
		await page.eval('document.querySelector(".dsh-mob-burger")?.click()');
		await sleep(600);
		await page.eval('document.querySelector(".dsh-mob-burger")?.click()');
		await sleep(300);
	}
	const setup = await page.eval(`(() => {
		const frame = document.querySelector('[data-dshmob-role="frame"]'), root = document.querySelector('[data-dshmob-role="details-root"], .ydkMvW_root'), center = document.querySelector('[data-dshmob-role="center"]');
		if (!frame || !root || !center) return false;
		const trigger = document.createElement("button"); trigger.id = "${id}-inspect"; trigger.dataset.dshmobAction = "inspect"; trigger.textContent = "Inspect"; center.appendChild(trigger);
		const section = document.createElement("div"); section.className = "ydkMvW_section"; section.id = "${id}-section"; section.textContent = "P2 detail"; root.appendChild(section);
		window["__" + "${id}" + "Collapsed"] = frame.hasAttribute("data-details-collapsed"); frame.removeAttribute("data-details-collapsed"); window.setTimeout(() => trigger.click(), 0); return true;
	})()`);
	if (!setup) return false;
	await page.waitFor('document.body.classList.contains("dsh-mob-details-open")', 5000, 100);
	return true;
}
async function closeInjectedDetails(page, id) {
	await page.eval(`(() => { const frame = document.querySelector('[data-dshmob-role="frame"]'), close = document.querySelector('[data-dshmob-role="details"] button[aria-label="关闭详情"],[data-dshmob-role="details"] button[aria-label="Close details"]'); if (window["__" + "${id}" + "Collapsed"] && frame) frame.setAttribute("data-details-collapsed", ""); window.setTimeout(() => close?.click(), 0); document.getElementById("${id}-section")?.remove(); document.getElementById("${id}-inspect")?.remove(); delete window["__" + "${id}" + "Collapsed"]; })()`);
	await page.waitFor('!document.body.classList.contains("dsh-mob-details-open")', 5000, 100).catch(() => {});
}

/* ---------- P2A：诊断导出只含结构数据，长任务计数存在 ---------- */
async function p2DiagnosticsCase() {
	const page = await newPage(); await page.setViewport(390, 844, true); await page.navigate(TARGET_URL); await page.waitActive();
	const result = await page.eval(`(() => {
		const secretMessage = "P2_SECRET_MESSAGE_BODY", secretPath = "/Users/private/project/secret.txt", host = document.createElement("div"); host.textContent = secretMessage + secretPath; document.body.appendChild(host);
		const api = window.__DSH_MOBILE__, dump = api.dumpDiagnostics(), parsed = JSON.parse(dump); host.remove();
		return { type: typeof dump, valid: parsed && typeof parsed === "object", hasMessage: dump.includes(secretMessage), hasPath: dump.includes(secretPath), longTasks: parsed.longTasks, keys: Object.keys(parsed) };
	})()`);
	assertTrue("P2A dumpDiagnostics 返回可解析 JSON 且不含正文/路径", result.type === "string" && result.valid && !result.hasMessage && !result.hasPath, JSON.stringify(result));
	assertTrue("P2A 诊断包含长任务计数", Number.isInteger(result.longTasks) && result.longTasks >= 0, JSON.stringify({ longTasks: result.longTasks }));
	await closePage(page);
}

/* ---------- P2B：审计清单中的触控目标与余额胶囊豁免 ---------- */
async function p2TouchTargetsCase() {
	const page = await newPage(); await page.setViewport(390, 844, true); await page.navigate(TARGET_URL); await page.waitActive();
	const hero = await page.eval(`(() => { const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none"; }; return [".pXSMma_workspace", ".cubgiG_seat"].map((selector) => ({ selector, rects: Array.from(document.querySelectorAll(selector)).filter(visible).map((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }) })); })()`);
	await page.eval('document.querySelector(".dsh-mob-burger").click()'); await sleep(500);
	const rail = await page.eval(`(() => { const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none"; }; return [".hHd-Xa_toggle", ".hHd-Xa_newSession", ".qDHVXG_iconButton", ".qDHVXG_searchButton", ".VOzbGW_trigger"].map((selector) => ({ selector, rects: Array.from(document.querySelectorAll(selector)).filter(visible).map((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }) })); })()`);
	await page.eval('document.querySelector(".dsh-mob-burger").click()'); await sleep(100);
	const detailsAvailable = await openInjectedDetails(page, "dshmob-p2b");
	const details = detailsAvailable ? await page.eval(`(() => { const root = window.__DSH_MOBILE__.diagnose().roles.detailsRoot, btn = document.querySelector('[data-dshmob-role="details"] button[aria-label="关闭详情"],[data-dshmob-role="details"] button[aria-label="Close details"]'); if (!btn) return { root, rect: null }; const r = btn.getBoundingClientRect(); return { root, rect: [r.width, r.height] }; })()`) : { root: null, rect: null };
	const badgeAllowed = await page.eval('(() => { const badge = document.querySelector(".dsb_badge"); return badge === null || badge.closest("[data-dshmob-allow-small=true]") !== null; })()');
	// 空组=该形态下不可见（如 rail 触发器在抽屉展开时隐藏），豁免；可见实例必须 ≥44
	const allLarge = (groups) => groups.every((group) => group.rects.length === 0 || group.rects.every(([w, h]) => w >= 44 && h >= 44));
	assertTrue("P2B 侧栏 5 类图标按钮均至少 44×44", allLarge(rail), JSON.stringify(rail));
	assertTrue("P2B hero 工作区与 Agent seat 均至少 44px 高", allLarge(hero), JSON.stringify(hero));
	assertTrue("P2B 详情角色已标记且关闭按钮至少 44×44", detailsAvailable ? (details.root && details.rect && details.rect[0] >= 44 && details.rect[1] >= 44) : true, JSON.stringify({ details, detailsAvailable }));
	assertTrue("P2B 余额胶囊已登记小目标豁免", badgeAllowed);
	if (detailsAvailable) await closeInjectedDetails(page, "dshmob-p2b"); await closePage(page);
}

/* ---------- P2C：目录新增列出现后自动显示最新列 ---------- */
async function p2DirectoryScrollCase() {
	const page = await newPage(); await page.setViewport(390, 844, true); await page.navigate(TARGET_URL); await page.waitActive();
	await page.eval(`(() => {
		const dialog = document.createElement("div"); dialog.id = "dshmob-p2-directory"; dialog.className = "ZuhsRW_dialog"; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.style.cssText = "display:flex;flex-direction:column;background:var(--dsw-alias-bg-base)";
		const row = document.createElement("div"); row.className = "ZuhsRW_millerRow"; row.style.cssText = "display:flex;width:100%;overflow-x:auto";
		const addColumn = (label) => { const col = document.createElement("div"); col.style.minWidth = "140px"; const button = document.createElement("button"); button.textContent = label; col.appendChild(button); row.appendChild(col); return col; }; addColumn("P2-A"); addColumn("P2-B");
		const footer = document.createElement("div"); footer.innerHTML = "<button>取消</button><button>选择</button>"; dialog.append(row, footer); document.body.appendChild(dialog); window.__dshmobP2AddColumn = addColumn;
	})()`);
	await page.waitFor('document.querySelector("#dshmob-p2-directory")?.dataset.dshmobOverlay === "directory" && document.querySelector("#dshmob-p2-directory .ZuhsRW_millerRow")?.dataset.dshmobRole === "directory-columns"', 5000, 100); await sleep(200);
	const before = await page.eval('document.querySelector("#dshmob-p2-directory .ZuhsRW_millerRow").scrollLeft');
	await page.eval('window.__dshmobP2AddColumn("P2-C")');
	await page.waitFor(`document.querySelector("#dshmob-p2-directory .ZuhsRW_millerRow").scrollLeft > ${before + 4}`, 5000, 100);
	const result = await page.eval(`(() => { const row = document.querySelector("#dshmob-p2-directory .ZuhsRW_millerRow"), latest = row.lastElementChild, rr = row.getBoundingClientRect(), lr = latest.getBoundingClientRect(); return { marked: row.hasAttribute("data-dshmob-scroll-x"), before: ${before}, after: row.scrollLeft, max: row.scrollWidth - row.clientWidth, latestVisible: lr.right <= rr.right + 2 && lr.left >= rr.left - 2 }; })()`);
	assertTrue("P2C 目录列标记为横滚仲裁区", result.marked, JSON.stringify(result));
	assertTrue("P2C 新列出现后自动滚到最新列", result.after > result.before + 4 && result.latestVisible && Math.abs(result.max - result.after) <= 2, JSON.stringify(result));
	await page.eval('document.getElementById("dshmob-p2-directory")?.remove(); delete window.__dshmobP2AddColumn'); await closePage(page);
}

/* ---------- P2D 共用：量化汉堡/header 与详情内部摆放 ---------- */
async function measureHeaderAndDetails(page, id) {
	await page.eval(`(() => {
		const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; let header = Array.from(document.querySelectorAll('[data-dshmob-role="conversation-header"]')).find(visible); const conversation = document.querySelector('[data-dshmob-role="conversation"]');
		if (!header && conversation) { header = document.createElement("div"); header.id = "${id}-header"; header.dataset.dshmobRole = "conversation-header"; conversation.prepend(header); }
		let crumbs = header ? Array.from(header.querySelectorAll('[data-dshmob-role="breadcrumbs"]')).find(visible) : null; if (header && !crumbs) { crumbs = document.createElement("div"); crumbs.id = "${id}-crumbs"; crumbs.dataset.dshmobRole = "breadcrumbs"; crumbs.textContent = "P2 breadcrumb"; header.appendChild(crumbs); }
	})()`);
	const header = await page.eval(`(() => {
		const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, burger = document.querySelector(".dsh-mob-burger"), crumbs = document.getElementById("${id}-crumbs") || Array.from(document.querySelectorAll('[data-dshmob-role="breadcrumbs"]')).find(visible); if (!burger || !crumbs) return null;
		const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, br = burger.getBoundingClientRect(), cr = crumbs.getBoundingClientRect(), root = document.documentElement, oldMode = root.getAttribute("data-dshmob-burger"), oldLeft = burger.style.left, oldTop = burger.style.top;
		const dockedPadding = parseFloat(getComputedStyle(crumbs.closest('[data-dshmob-role="conversation-header"]')).paddingLeft); root.dataset.dshmobBurger = "free"; burger.style.left = "4px"; burger.style.top = (innerHeight - 48) + "px"; const freeBr = burger.getBoundingClientRect(), freeCr = crumbs.getBoundingClientRect(), freePadding = parseFloat(getComputedStyle(crumbs.closest('[data-dshmob-role="conversation-header"]')).paddingLeft), freeNoOverlap = !intersects(freeBr, freeCr);
		burger.style.left = oldLeft; burger.style.top = oldTop; if (oldMode === null) root.removeAttribute("data-dshmob-burger"); else root.setAttribute("data-dshmob-burger", oldMode);
		return { overlap: intersects(br, cr), gap: cr.left - br.right, dockedPadding, freePadding, freeNoOverlap };
	})()`);
	const detailsAvailable = await openInjectedDetails(page, id);
	const details = detailsAvailable ? await page.eval(`(() => {
		const sheet = document.querySelector('[data-dshmob-role="details"], .pI_x6G_detailsCol'), root = document.querySelector('[data-dshmob-role="details-root"], .ydkMvW_root'), close = sheet?.querySelector('button[aria-label="关闭详情"],button[aria-label="Close details"]'), body = root?.querySelector(".ydkMvW_body"); if (!sheet || !root || !close) return null;
		const sr = sheet.getBoundingClientRect(), cr = close.getBoundingClientRect(), title = close.parentElement?.getBoundingClientRect(), bs = body ? getComputedStyle(body) : null;
		return { inset: { left: sr.left, top: sr.top, right: innerWidth - sr.right, bottom: innerHeight - sr.bottom }, close: [cr.width, cr.height], titleHeight: title?.height || 0, bodyPadding: bs ? [bs.paddingTop, bs.paddingRight, bs.paddingBottom, bs.paddingLeft].map(parseFloat) : null };
	})()`) : null;
	return { header, details, detailsAvailable };
}
async function cleanupPlacementFixtures(page, id) { await closeInjectedDetails(page, id); await page.eval(`document.getElementById("${id}-crumbs")?.remove(); document.getElementById("${id}-header")?.remove()`); }

/* ---------- P2D：关键 UI 间距、对齐与层级摆放 ---------- */
async function p2PlacementCase() {
	const page = await newPage(); await page.setViewport(390, 844, true); await page.navigate(TARGET_URL); await page.waitActive();
	const core390 = await measureHeaderAndDetails(page, "dshmob-p2d-390");
	await page.eval('window.__DSH_MOBILE__.notify("details", "P2 placement")'); await sleep(100);
	const toast = await page.eval(`(() => { const toast = document.querySelector(".dsh-mob-toast"), composer = document.querySelector('[data-dshmob-role="composer"]'); if (!toast || !composer) return null; const tr = toast.getBoundingClientRect(), cr = composer.getBoundingClientRect(); return { bottomMode: toast.classList.contains("dsh-mob-toast-bottom"), gap: cr.top - tr.bottom, overlap: tr.bottom > cr.top && tr.top < cr.bottom }; })()`);
	const message = await page.eval(`(() => {
		const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; let list = Array.from(document.querySelectorAll('[data-dshmob-role="message-list"]')).find(visible), injected = false; if (!list) { const conversation = document.querySelector('[data-dshmob-role="conversation"]'); if (!conversation) return null; list = document.createElement("div"); list.id = "dshmob-p2d-message"; list.dataset.dshmobRole = "message-list"; list.textContent = "P2 message"; conversation.prepend(list); injected = true; }
		const s = getComputedStyle(list), composer = document.querySelector('[data-dshmob-role="composer"]'), card = composer?.querySelector(".uV2eYG_card"), row = composer?.querySelector(".uV2eYG_row"), cs = card ? getComputedStyle(card) : null, rs = row ? getComputedStyle(row) : null; return { left: parseFloat(s.paddingLeft), right: parseFloat(s.paddingRight), injected, cardRadius: cs ? parseFloat(cs.borderTopLeftRadius) : null, rowGap: rs ? parseFloat(rs.rowGap) : null };
	})()`);
	await page.screenshot("P2D-390-details"); await cleanupPlacementFixtures(page, "dshmob-p2d-390");
	await page.eval('document.querySelector(".dsh-mob-burger").click()'); await sleep(500);
	const settingsEntry = await page.eval(`new Promise((resolve) => { const button = document.querySelector(".VOzbGW_trigger"); if (!button) { resolve(false); return; } window.setTimeout(() => { button.click(); resolve(true); }, 0); })`);
	if (settingsEntry) await page.waitFor('(() => { const p = document.querySelector(".VOzbGW_panel"); return p && p.getBoundingClientRect().width > 0; })()', 5000, 100);
	const settings = settingsEntry ? await page.eval(`(() => { const panel = document.querySelector(".VOzbGW_panel"), nav = panel?.querySelector(".VOzbGW_nav"), content = panel?.querySelector(".VOzbGW_content"), close = panel?.querySelector(".VOzbGW_close"); if (!panel || !nav || !content || !close) return null; const p = panel.getBoundingClientRect(), n = nav.getBoundingClientRect(), c = content.getBoundingClientRect(), x = close.getBoundingClientRect(), intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; return { navContentOverlap: intersects(n, c), closeInside: x.left >= p.left && x.right <= p.right && x.top >= p.top && x.bottom <= p.bottom, closeRight: p.right - x.right, closeTop: x.top - p.top, closeSize: [x.width, x.height] }; })()`) : null;
	assertTrue("P2D 390 汉堡与面包屑间距至少 8px且 free 态不重叠", core390.header && !core390.header.overlap && core390.header.gap >= 8 && core390.header.freeNoOverlap && core390.header.freePadding < core390.header.dockedPadding, JSON.stringify(core390.header));
	assertTrue("P2D 390 底部 toast 与 composer 至少间隔 8px", toast && toast.bottomMode && !toast.overlap && toast.gap >= 8, JSON.stringify(toast));
	assertTrue("P2D 390 详情 inset/标题行/关闭按钮/内容 padding 合格", core390.details && Object.values(core390.details.inset).every((v) => v >= 7) && core390.details.titleHeight >= 44 && core390.details.close.every((v) => v >= 44) && core390.details.bodyPadding?.every((v) => v >= 8), JSON.stringify(core390.details));
	assertTrue("P2D 设置 nav/content 不重叠且关闭按钮位于右上角", settings && !settings.navContentOverlap && settings.closeInside && settings.closeRight <= 16 && settings.closeTop <= 20 && settings.closeSize.every((v) => v >= 44), JSON.stringify(settings));
	assertTrue("P2D 消息区左右 padding 对称且 composer 内部间距稳定", message && message.left >= 10 && message.left === message.right && (message.cardRadius === null || message.cardRadius >= 16) && (message.rowGap === null || message.rowGap >= 4), JSON.stringify(message));
	await page.eval('window.setTimeout(() => document.querySelector(".VOzbGW_panel .VOzbGW_close")?.click(), 0); document.getElementById("dshmob-p2d-message")?.remove()'); await closePage(page);

	const landscape = await newPage(); await landscape.setViewport(667, 375, true); await landscape.navigate(TARGET_URL); await landscape.waitActive(); const core667 = await measureHeaderAndDetails(landscape, "dshmob-p2d-667"); await landscape.screenshot("P2D-667-details");
	assertTrue("P2D 667 横屏汉堡与面包屑不重叠且间距至少 8px", core667.header && !core667.header.overlap && core667.header.gap >= 8, JSON.stringify(core667.header));
	assertTrue("P2D 667 横屏详情内部摆放合格", core667.details && Object.values(core667.details.inset).every((v) => v >= 7) && core667.details.titleHeight >= 44 && core667.details.close.every((v) => v >= 44) && core667.details.bodyPadding?.every((v) => v >= 8), JSON.stringify(core667.details));
	await cleanupPlacementFixtures(landscape, "dshmob-p2d-667"); await closePage(landscape);
}

/* ---------- P3：composer 浮层可见性（overflow:hidden 裁剪回归，2026-08-17） ---------- */
// 根因史：`.uV2eYG_tools/.uV2eYG_modes/.uV2eYG_trailing{overflow:hidden}` 会裁掉锚定在上方的
// 页内浮层（权限菜单/模型菜单/上下文用量面板）——rect 非零但 elementFromPoint 命不中，用户
// 症状"切换时弹不出来 / 上下文用量点不开"。修复=三容器恢复 overflow:visible；本用例锁定回归。
async function p3ComposerPopupsCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	await sleep(1200); // 等 composer 挂载
	const clickSel = (sel) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el === null) return false; const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false; el.click(); return true; })()`);
	const popupOk = (sel) => page.eval(`(() => { const p = document.querySelector(${JSON.stringify(sel)}); if (p === null) return false; const pr = p.getBoundingClientRect(); if (pr.width <= 0 || pr.height <= 0 || getComputedStyle(p).display === "none") return false; const cx = pr.left + pr.width / 2, cy = Math.min(Math.max(pr.top + pr.height / 2, 2), window.innerHeight - 2); const hit = document.elementFromPoint(cx, cy); return hit !== null && (hit === p || p.contains(hit)); })()`);
	const esc = () => page.eval(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
	// 1) 权限菜单（.uV2eYG_modes 内、锚定上方）
	const permTrigger = await clickSel(".Sh0Q9G_trigger");
	await sleep(650);
	assertTrue("P3 权限菜单弹出且可见（未被 overflow 裁剪）", permTrigger && await popupOk('[role="menu"]'), JSON.stringify({ permTrigger }));
	await esc(); await sleep(500);
	// 2) 模型菜单（.uV2eYG_trailing 内）
	const modelTrigger = await clickSel("._7KE1Ra_trigger");
	await sleep(650);
	assertTrue("P3 模型菜单弹出且可见", modelTrigger && await popupOk("._7KE1Ra_menu"), JSON.stringify({ modelTrigger }));
	await esc(); await sleep(500);
	// 3) 命令 picker
	const cmdTrigger = await clickSel(".uV2eYG_add");
	await sleep(650);
	assertTrue("P3 命令 picker 弹出且可见", cmdTrigger && await popupOk('[role="listbox"]'), JSON.stringify({ cmdTrigger }));
	await esc(); await sleep(500);
	// 4) 上下文用量面板（仅带 usage 的会话存在；最多试 4 个会话，都没有则跳过断言）
	let meter = { present: false };
	const meterNow = () => page.eval(`document.querySelector('button[aria-label^="上下文已用"]') !== null`);
	if (!(await meterNow())) {
		await page.eval(`document.querySelector(".dsh-mob-burger")?.click()`);
		await sleep(600);
		for (let i = 0; i < 4 && !(await meterNow()); i += 1) {
			await page.eval(`document.querySelectorAll(".YDXeBa_sessionRow")[${i}]?.click()`);
			await sleep(1300);
			if (!(await page.eval(`document.body.classList.contains("dsh-mob-open")`))) { await page.eval(`document.querySelector(".dsh-mob-burger")?.click()`); await sleep(600); }
		}
	}
	if (await meterNow()) {
		// 关抽屉再点（抽屉开着时 center 是 inert，点击无效）
		if (await page.eval(`document.body.classList.contains("dsh-mob-open")`)) { await page.eval(`document.querySelector(".dsh-mob-burger")?.click()`); await sleep(600); }
		meter = await page.eval(`(() => { const b = document.querySelector('button[aria-label^="上下文已用"]'); b.click(); return { present: true }; })()`);
		await sleep(650);
	}
	assertTrue("P3 上下文用量面板弹出且可见（无 usage 会话时跳过）", !meter.present || await popupOk(".JObwrW_panel"), JSON.stringify(meter));
	assertTrue("P3 上下文用量触发器 ≥44px 触控（存在时）", !meter.present || await page.eval(`(() => { const b = document.querySelector('button[aria-label^="上下文已用"]'); const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })()`));
	await closePage(page);
}

/* ---------- P4：发送按钮不得被超长模型名挤出视口（2026-08-17） ---------- */
async function p4SendVisibleCase() {
	const page = await newPage();
	await page.setViewport(390, 844, true);
	await page.navigate(TARGET_URL);
	await page.waitActive();
	await sleep(800);
	const measure = () => page.eval(`(() => {
		const send = document.querySelector(".uV2eYG_primary");
		const model = document.querySelector("._7KE1Ra_trigger");
		if (!send) return null;
		const sr = send.getBoundingClientRect(), mr = model ? model.getBoundingClientRect() : null;
		return {
			sendIn: sr.width > 0 && sr.left >= 0 && sr.right <= innerWidth + 1,
			send: { x: Math.round(sr.x), r: Math.round(sr.right), w: Math.round(sr.width), h: Math.round(sr.height) },
			model: mr && { x: Math.round(mr.x), w: Math.round(mr.width), h: Math.round(mr.height) },
			heroBottom: (() => { const c = document.querySelector(".uV2eYG_hero"); if (!c) return null; const r = c.getBoundingClientRect(); return innerHeight - r.bottom; })(),
		};
	})()`);
	const at390 = await measure();
	assertTrue("P4 390 发送按钮完整在视口内", Boolean(at390 && at390.sendIn && at390.send.h >= 44), JSON.stringify(at390));
	assertTrue("P4 390 模型芯片被截断而不撑破行", Boolean(at390 && at390.model && at390.model.w <= 160), JSON.stringify(at390));
	await page.setViewport(320, 568, true);
	await sleep(400);
	const at320 = await measure();
	assertTrue("P4 320 发送按钮完整在视口内", Boolean(at320 && at320.sendIn && at320.send.h >= 44), JSON.stringify(at320));
	await closePage(page);
}

/* ---------- 主流程 ---------- */
const ONLY = process.env.CASES ? process.env.CASES.split(",") : null;
async function run(name, fn) {
	if (ONLY !== null && !ONLY.includes(name)) return;
	await fn();
}
try {
	await waitChromeReady();
	await run("M1", () => mobileCase("M1", 320, 568));
	await run("M2", () => mobileCase("M2", 390, 844));
	await run("M3", () => mobileCase("M3", 430, 932));
	await run("M4", () => mobileCase("M4", 667, 375));
	await run("M5", () => touchLandscapeBoundaryCase("M5", 844, 390));
	await run("B1", () => mobileCase("B1", 768, 1024));
	await run("B2", () => desktopCase("B2", 769, 1024));
	await run("D1", () => desktopCase("D1", 1280, 800));
	await run("K1", () => killSwitchCase());
	await run("K2K3", () => fallbackCase());
	await run("K4", () => keyboardSimCase());
	await run("K5", () => bgResumeCase());
	await run("P1A", () => p1DarkCase());
	await run("P1B", () => p1ReducedMotionCase());
	await run("P1C", () => p1FocusEscapeCase());
	await run("P1D", () => p1LongContentCase());
	await run("P2A", () => p2DiagnosticsCase());
	await run("P2B", () => p2TouchTargetsCase());
	await run("P2C", () => p2DirectoryScrollCase());
	await run("P2D", () => p2PlacementCase());
	await run("P3", () => p3ComposerPopupsCase());
	await run("P4", () => p4SendVisibleCase());
} catch (e) {
	console.error("验证中断:", e);
	record("验收流程完整执行", false, String(e.message || e).slice(0, 300));
	process.exitCode = 1;
} finally {
	chrome.kill();
}

const failed = results.filter((r) => !r.ok);
console.log("\n========== 汇总 ==========");
console.log(`共 ${results.length} 项断言，通过 ${results.length - failed.length}，失败 ${failed.length}`);
console.log(`截图与结果目录: ${ARTIFACTS}`);
if (failed.length > 0 || results.length === 0) {
	console.log("失败项:");
	for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
	process.exitCode = 1;
} else {
	console.log("全部通过 ✅");
}
