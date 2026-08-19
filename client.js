window.__ModuleLoader__.load({
	id: "dsh-mobile",
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		/* ==================== 常量与功能开关 ==================== */
		const MOBILE_QUERY = "(max-width: 768px)";
		const VERSION = "3.3.0";
		const RUNTIME_KEY = "__dshMobileRuntimeV3";
		// 模块级开关（设计文档 4.5）：出问题时先关对应 flag 刷新，不必回退整个插件。
		const FEATURES = Object.freeze({ roleResolver: true, detailsSheet: true, overlaySheets: true, viewportKeyboard: true, touchTargets: true, conversationDensity: true, clipboardShim: true, gestureArbitration: true, diagnostics: true });
		const STOP_LABELS = ["停止生成", "Stop generating", "停止"];
		const CLOSE_DETAILS_LABELS = ["关闭详情", "Close details"];
		const BURGER_POS_KEY = "dsh-mobile:burgerPos:v2";
		const DISABLED_KEY = "dsh-mobile:disabled";
		const STATUS_COOLDOWN_MS = 10000;
		const BURGER_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13"/></svg>';
		const X_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l10 10M14 4L4 14"/></svg>';
		/* ==================== 样式 ==================== */
		// 全部规则限定在 ≤768px + 角色校验通过（html[data-dshmob="on"]）双作用域内，桌面（>768px）零命中；只消费 DSH 的 --dsw-alias-*/--dsw-specific-*/--dsw-shadow-* 变量。
		const CSS = [
			"@media (max-width: 768px){",
			// 插件 token 定义在 body 上（DSH 的 --dsw-alias-* 变量定义在 body，html 上解析为空，曾致遮罩/边框全透明）
			"html[data-dshmob=\"on\"] body{--dshmob-vv-height:100dvh;--dshmob-vv-top:0px;--dshmob-vv-bottom:0px;--dshmob-touch:44px;--dshmob-surface:var(--dsw-alias-bg-base);--dshmob-surface-raised:var(--dsw-alias-bg-layer-2);--dshmob-border:var(--dsw-alias-border-l2);--dshmob-mask:var(--dsw-alias-bg-layer-2);--dshmob-mask:color-mix(in srgb,var(--dsw-alias-label-primary) 36%,transparent)}",
			// 三栏锁单栏：0px/1fr/0px 写法会让聊天区顶到 0px 列宽度归零，必须单列 1fr
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"frame\"]{grid-template-columns:minmax(0,1fr) !important;position:relative;top:var(--dshmob-vv-top);width:100%;height:var(--dshmob-vv-height) !important;min-width:0;overflow:hidden}",
			"html[data-dshmob=\"on\"] :is(button,[role=button],[role=menuitem],[role=option]){touch-action:manipulation;-webkit-tap-highlight-color:transparent}", "html[data-dshmob=\"on\"] :is(input,textarea,[contenteditable=true]){font-size:max(16px,1em)}",
			// 侧栏 off-canvas 抽屉：left 位移动画（祖先带 transform 会让内部 fixed 退化，禁 transform）
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"sidebar\"]{position:fixed !important;left:-105%;top:0;bottom:0;width:min(calc(100vw - 64px),320px) !important;max-width:320px;transition:left .18s ease;z-index:80 !important;box-shadow:var(--dsw-shadow-lv3)}", "html[data-dshmob=\"on\"] body.dsh-mob-open [data-dshmob-role=\"sidebar\"]{left:0}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"sidebar\"] :is([role=button],[class*=item i],[class*=row i],.qDHVXG_sessionOverflowButton,.hHd-Xa_brand){min-height:44px}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"sidebar\"] .hHd-Xa_root{width:100%}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"sidebar\"] :is(.hHd-Xa_iconButton,.hHd-Xa_toggle,.hHd-Xa_newSession,.qDHVXG_iconButton,.qDHVXG_searchButton,.VOzbGW_trigger,.YDXeBa_iconButton){box-sizing:border-box;min-width:var(--dshmob-touch);min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] :is(.pXSMma_workspace,.cubgiG_seat){min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] .qDHVXG_searchSlot:not(.qDHVXG_searchSlotExpanded) .qDHVXG_searchInput{display:none}",
			// 详情面板：手机默认隐藏（修复 Inspect 空操作），body class 打开时变底部详情抽屉
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"details\"],html[data-dshmob=\"on\"] .pI_x6G_handle{display:none !important}", "html[data-dshmob=\"on\"] body.dsh-mob-details-open [data-dshmob-role=\"details\"]{display:block !important;position:fixed !important;z-index:110;inset:max(8px,calc(var(--dshmob-vv-top) + env(safe-area-inset-top,0px))) max(8px,env(safe-area-inset-right,0px)) max(8px,calc(var(--dshmob-vv-bottom) + env(safe-area-inset-bottom,0px))) max(8px,env(safe-area-inset-left,0px));width:auto !important;min-width:0;border:1px solid var(--dshmob-border);border-radius:16px;background:var(--dshmob-surface);box-shadow:var(--dsw-shadow-lv3);overflow:hidden}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"details-root\"]{height:100%;border-left:0}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"details\"] :is(.ydkMvW_close,button[aria-label=\"关闭详情\"],button[aria-label=\"Close details\"]){box-sizing:border-box;flex:none;min-width:var(--dshmob-touch);width:var(--dshmob-touch);min-height:var(--dshmob-touch);height:var(--dshmob-touch)}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"details-root\"] .ydkMvW_header{box-sizing:border-box;min-height:52px;padding:4px 8px 4px 12px;gap:8px;align-items:center}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"details-root\"] .ydkMvW_body{box-sizing:border-box;padding:8px 12px 12px}",
			".dsh-mob-details-mask{display:none}", "html[data-dshmob=\"on\"] .dsh-mob-details-mask{position:fixed;z-index:105;inset:0;background:var(--dshmob-mask)}", "html[data-dshmob=\"on\"] .dsh-mob-details-mask.dsh-mob-details-mask-show{display:block}",
			// 汉堡按钮（44×44，可拖动，位置存 localStorage）
			".dsh-mob-burger{display:none}", "html[data-dshmob=\"on\"] .dsh-mob-burger{display:flex;position:fixed;z-index:95;left:8px;top:calc(var(--dshmob-vv-top) + 8px + env(safe-area-inset-top,0px));width:44px;height:44px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);cursor:grab;align-items:center;justify-content:center;box-shadow:var(--dsw-shadow-lv2);opacity:.78;transition:opacity .15s ease;touch-action:none}",
			"html[data-dshmob=\"on\"] .dsh-mob-burger:active{opacity:1;cursor:grabbing}", "html[data-dshmob=\"on\"] .dsh-mob-burger svg{display:block;pointer-events:none}",
			"html[data-dshmob=\"on\"] body.dsh-mob-open .dsh-mob-burger:not(.dsh-mob-dragged){left:calc(min(calc(100vw - 64px),320px) + 8px);opacity:1}",
			// 抽屉遮罩 + 滚动锁
			".dsh-mob-mask{display:none}", "html[data-dshmob=\"on\"] .dsh-mob-mask{position:fixed;inset:0;z-index:75;background:var(--dshmob-mask);touch-action:none}", "html[data-dshmob=\"on\"] body.dsh-mob-open .dsh-mob-mask{display:block}",
			"html[data-dshmob=\"on\"] body.dsh-mob-open{overflow:hidden}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"center\"]{padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-bottom:env(safe-area-inset-bottom,0px) !important}",
			"html[data-dshmob=\"on\"] .dsb_panel{bottom:auto !important;top:calc(var(--dshmob-vv-top) + 12px + env(safe-area-inset-top,0px)) !important;left:12px !important;right:12px !important;width:auto !important;max-height:min(70vh,calc(var(--dshmob-vv-height) - 24px));overflow-y:auto}",
			".dsh-mob-toast{display:none}", "html[data-dshmob=\"on\"] .dsh-mob-toast{display:block;position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:calc(50% + 24px);transform:translateX(-50%) translateY(-8px);z-index:140;max-width:calc(100vw - 76px);box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:8px 16px;font-size:13px;line-height:18px;overflow-wrap:anywhere;text-align:center;box-shadow:var(--dsw-shadow-lv2);opacity:0;transition:opacity .25s ease,transform .25s ease;pointer-events:none}", "html[data-dshmob=\"on\"] .dsh-mob-toast.dsh-mob-toast-show{opacity:1;transform:translateX(-50%) translateY(0)}",
			"html[data-dshmob=\"on\"] .dsh-mob-toast.dsh-mob-toast-bottom{top:auto;left:50%;max-width:calc(100vw - 24px);bottom:var(--dshmob-toast-bottom,calc(96px + env(safe-area-inset-bottom,0px)));transform:translateX(-50%) translateY(8px)}", "html[data-dshmob=\"on\"] .dsh-mob-toast.dsh-mob-toast-bottom.dsh-mob-toast-show{transform:translateX(-50%) translateY(0)}",
			".dsh-mob-degraded-bar{display:block;position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:200;box-sizing:border-box;max-width:calc(100vw - 24px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 14px;font-size:13px;line-height:18px;box-shadow:var(--dsw-shadow-lv3);pointer-events:none}",
			// —— 消息列表 / 工具行 / 内容排版（§2.5）——
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation\"]{--dsh-composer-side-clearance:8px;--dsh-chat-content-width:100%}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"message-list\"]{min-width:0;padding-inline:max(10px,env(safe-area-inset-left,0px)) max(10px,env(safe-area-inset-right,0px))}", "html[data-dshmob=\"on\"] .Md3f7G_column{gap:12px}", "html[data-dshmob=\"on\"] .Sxvs8a_root{font-size:15px;line-height:25px}", "html[data-dshmob=\"on\"] .Sxvs8a_body{gap:12px}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"message-list\"]>*{min-width:0;max-width:100%}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"message-list\"] :is(pre,table,img,video,canvas,svg,[data-dshmob-scroll-x]){box-sizing:border-box;max-width:100%}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"message-list\"] img{height:auto !important}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"message-list\"] :is(p,li,dd,a,code){min-width:0;overflow-wrap:anywhere;word-break:break-word}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"message-list\"] table{display:block;overflow-x:auto !important}",
			"html[data-dshmob=\"on\"] [data-dshmob-scroll-x]{box-sizing:border-box;max-width:100%;overflow-x:auto !important;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"tool-row\"]{box-sizing:border-box;min-width:0;max-width:100%}", "html[data-dshmob=\"on\"] .QWLzlG_thinkBody{border-left:1px solid var(--dsw-alias-border-l2);margin-left:7px;padding:5px 0 5px 12px;font-size:14px;line-height:22px}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"tool-row\"] [data-dshmob-action=\"inspect\"]{min-height:var(--dshmob-touch);opacity:1;padding-inline:12px}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"message-actions\"]{min-height:var(--dshmob-touch);flex-wrap:wrap;gap:2px 4px}", "html[data-dshmob=\"on\"] .Sxvs8a_actions{margin-top:8px}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"message-actions\"] button{width:var(--dshmob-touch);height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] .Md3f7G_toBottom{width:var(--dshmob-touch);height:var(--dshmob-touch);margin-top:calc(-1 * var(--dshmob-touch))}", "html[data-dshmob=\"on\"] .gdEzaW_userStack{max-width:min(92%,560px)}", "html[data-dshmob=\"on\"] .gdEzaW_bubble{border-radius:16px;padding:8px 12px;font-size:15px;line-height:22px}",
			"html[data-dshmob=\"on\"] :is(.o3BgMG_ioSection,.CY-8Ka_ioSection){min-width:0;grid-template-columns:minmax(36px,max-content) minmax(0,1fr);padding-inline:10px}", "html[data-dshmob=\"on\"] :is(.o3BgMG_ioSection,.CY-8Ka_ioSection)>*{min-width:0;overflow-wrap:anywhere}", "html[data-dshmob=\"on\"] :is(.DBuyfa_runHeader,.DBuyfa_phaseHeader,.DBuyfa_memberButton,.CY-8Ka_root,.QWLzlG_row,.o3BgMG_row,.Md3f7G_older button){min-width:0;min-height:var(--dshmob-touch);height:auto;overflow-wrap:anywhere}",
			"html[data-dshmob=\"on\"] .p-xYUq_actions{flex-wrap:wrap;height:auto !important;min-height:44px;column-gap:2px;row-gap:3px}", "html[data-dshmob=\"on\"] .p-xYUq_timeStart,html[data-dshmob=\"on\"] .p-xYUq_timeEnd{white-space:normal !important;padding-inline:6px;font-size:12px;line-height:18px}",
			"html[data-dshmob=\"on\"] .p-xYUq_runTimeDot{margin:0 2px}",
			// —— 输入区 / 键盘（§2.6）——
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"]{padding-inline:max(8px,env(safe-area-inset-left,0px)) max(8px,env(safe-area-inset-right,0px));padding-bottom:max(8px,env(safe-area-inset-bottom,0px))}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_card{gap:6px;border-radius:16px;padding-top:8px}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_input::placeholder{color:var(--dsw-alias-label-tertiary)}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_row{flex-wrap:nowrap;gap:4px;padding-inline:8px;min-width:0}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] :is(.uV2eYG_tools,.uV2eYG_modes,.uV2eYG_trailing){min-width:0;gap:4px;overflow:visible}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_tools{flex:none}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_modes{flex:none}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_trailing{flex:1 1 auto;min-width:0;justify-content:flex-end}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] :is(.uV2eYG_add,.uV2eYG_primary,.uV2eYG_select,.Sh0Q9G_trigger,._7KE1Ra_trigger,.cubgiG_seat,.JObwrW_trigger){box-sizing:border-box;min-width:var(--dshmob-touch);min-height:var(--dshmob-touch);height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_primary{flex:none}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_row :is(.uV2eYG_select,.Sh0Q9G_trigger,._7KE1Ra_trigger,.cubgiG_seat,.JObwrW_trigger){max-width:min(38vw,136px) !important;overflow:hidden;text-overflow:ellipsis}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"composer-seat\"]{--dsh-composer-text-max-height:min(34dvh,240px)}",
			"html[data-dshmob=\"on\"][data-dshmob-keyboard] [data-dshmob-role=\"composer-seat\"]{--dsh-composer-text-max-height:min(26dvh,180px)}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"attachments\"]{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-inline:contain}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"attachments\"] > *{flex:0 0 auto;max-width:min(72vw,280px)}", "@media (orientation: landscape){html[data-dshmob=\"on\"] [data-dshmob-role=\"composer-seat\"]{--dsh-composer-text-max-height:min(24dvh,112px)}}",
			"@media (max-width:360px){html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_row{flex-wrap:wrap;row-gap:4px}html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_tools{flex:1 1 100%;overflow:visible}html[data-dshmob=\"on\"] [data-dshmob-role=\"composer\"] .uV2eYG_trailing{flex:1 1 100%;justify-content:flex-end;overflow:visible}}",
			"html[data-dshmob=\"on\"] .pXSMma_root{padding-inline:max(12px,env(safe-area-inset-left,0px)) max(12px,env(safe-area-inset-right,0px))}", "html[data-dshmob=\"on\"] .pXSMma_stack{gap:10px}", "html[data-dshmob=\"on\"] .pXSMma_headline{grid-template-columns:30px minmax(0,auto) auto;column-gap:8px;font-size:24px;line-height:30px}", "html[data-dshmob=\"on\"] .pXSMma_fishHitbox svg{width:30px;height:30px}", "html[data-dshmob=\"on\"] .pXSMma_workspaceRow{flex-wrap:wrap;gap:4px 8px;padding-left:4px}", "html[data-dshmob=\"on\"] .pXSMma_workspace{min-width:0;min-height:var(--dshmob-touch);padding-inline:8px}", "html[data-dshmob=\"on\"] .wSkVaW_composerHero{gap:6px;padding-bottom:max(10px,env(safe-area-inset-bottom,0px))}", "html[data-dshmob=\"on\"] .wSkVaW_scrollBody:has(.uV2eYG_hero){justify-content:flex-end}",
			"@media (max-width:360px){html[data-dshmob=\"on\"] .pXSMma_headline{grid-template-columns:26px minmax(0,auto) auto;column-gap:6px;font-size:21px;line-height:26px}html[data-dshmob=\"on\"] .pXSMma_fishHitbox svg{width:26px;height:26px}html[data-dshmob=\"on\"] .pXSMma_previewBadge{margin-left:0;padding-inline:6px;font-size:11px}}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"]{padding:max(8px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) 0 max(60px,calc(env(safe-area-inset-left,0px) + 60px))}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"]{display:flex;flex-direction:row;align-items:center;flex-wrap:nowrap}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"] .wSkVaW_titleRow{flex:1;min-width:0}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"] :is(.wSkVaW_headerUtilities,.QsffPG_trigger,.nL4_yW_sessionLogButton){display:none !important}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"] .wSkVaW_crumbCurrent{flex:1;min-width:0;max-width:none}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-tabs\"]{margin:0 0 0 8px;max-width:46%}", "html[data-dshmob=\"on\"][data-dshmob-burger=\"free\"] [data-dshmob-role=\"conversation-header\"]{padding-left:max(12px,calc(env(safe-area-inset-left,0px) + 12px))}", "html[data-dshmob=\"on\"][data-dshmob-burger=\"free\"] [data-dshmob-role=\"conversation-tabs\"]{margin-left:8px}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"] [data-dshmob-role=\"breadcrumbs\"]{min-width:0;overflow:hidden}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"] [data-dshmob-role=\"breadcrumbs\"] > :not(:last-child){display:none}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-header\"] :is(button,[role=button]){min-width:var(--dshmob-touch);min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-tabs\"]{gap:20px;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none;scroll-snap-type:x proximity}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"conversation-tabs\"] > button{flex:0 0 auto;min-height:var(--dshmob-touch);scroll-snap-align:start}",
			"html[data-dshmob=\"on\"] .VOzbGW_panel{position:relative;flex-direction:column !important;width:calc(100vw - 24px);max-width:100%;border-radius:16px}", "html[data-dshmob=\"on\"] .VOzbGW_panel{height:min(800px,100vh - 48px);height:min(800px,100dvh - 48px)}",
			"html[data-dshmob=\"on\"] .VOzbGW_nav{box-sizing:border-box;flex:0 0 auto;width:calc(100% - 56px) !important;flex-direction:row !important;align-items:center;gap:4px;margin-right:56px;padding:8px 0 0 8px !important;overflow-x:auto}", "html[data-dshmob=\"on\"] .VOzbGW_navTitle,html[data-dshmob=\"on\"] .VOzbGW_navIcon{display:none}",
			"html[data-dshmob=\"on\"] .VOzbGW_navList{flex-direction:row !important;gap:4px}", "html[data-dshmob=\"on\"] .VOzbGW_navCell{box-sizing:border-box;flex:none;min-height:var(--dshmob-touch);height:var(--dshmob-touch);padding:8px 12px !important;border-radius:8px}",
			"html[data-dshmob=\"on\"] .VOzbGW_options{padding:0 16px 16px !important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}", "html[data-dshmob=\"on\"] .VOzbGW_content{flex:1 1 auto;min-height:0 !important}",
			"html[data-dshmob=\"on\"] .VOzbGW_header{height:48px;padding:2px 56px 2px 12px;align-items:center}", "html[data-dshmob=\"on\"] .VOzbGW_close{position:absolute !important;top:8px;right:8px;z-index:1;width:44px;height:44px;border:none;background:transparent;border-radius:999px}",
			"html[data-dshmob=\"on\"] .VOzbGW_close:active{background:var(--dsw-alias-interactive-bg-hover)}", "html[data-dshmob=\"on\"] .VOzbGW_actions button{min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] :is(._5QVD0a_row,.oY77xG_row){gap:10px;padding:12px 0}", "html[data-dshmob=\"on\"] :is(._5QVD0a_rowText,.oY77xG_rowText){padding-right:8px}", "html[data-dshmob=\"on\"] :is(._5QVD0a_selector,.oY77xG_selector){min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] ._8HJdBW_group{gap:8px;padding:12px 0}", "html[data-dshmob=\"on\"] ._8HJdBW_cubeRow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}", "html[data-dshmob=\"on\"] ._8HJdBW_themeCube{min-width:0;min-height:72px;border-radius:8px;flex:none;padding:10px 4px}", "html[data-dshmob=\"on\"] .VOzbGW_options > *{animation:dshmob-fade .18s ease}",
			"@keyframes dshmob-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
			"html[data-dshmob=\"on\"] .YDXeBa_rowActions{display:inline-flex}", "html[data-dshmob=\"on\"] .YDXeBa_sessionRow .YDXeBa_time{display:none}",
			"html[data-dshmob=\"on\"] .YDXeBa_projectRow .YDXeBa_chevron{display:inline-flex}", "html[data-dshmob=\"on\"] .YDXeBa_projectRow .YDXeBa_folder{display:none}",
			// —— 浮层定位（2026-08-16 用户拍板）：菜单/选择器/弹窗恢复 DSH 原生锚点定位（贴底 sheet 被否掉："所有弹窗都压到最下面了"），只保留防超高滚动与 44px 触控；目录选择器大表单保留底部 sheet
			"html[data-dshmob=\"on\"] [data-dshmob-overlay=\"modal\"]{box-sizing:border-box;max-width:calc(100vw - 16px);max-height:min(88dvh,calc(var(--dshmob-vv-height) - 16px));overflow:auto}", "html[data-dshmob=\"on\"] [data-dshmob-overlay=\"modal\"] :is(button,[role=button]){min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] [data-dshmob-overlay=\"modal\"] :is(input,textarea,select){min-height:var(--dshmob-touch);font-size:16px}",
			"html[data-dshmob=\"on\"] [data-dshmob-overlay=\"directory\"]{box-sizing:border-box;position:fixed !important;z-index:130;inset:auto max(8px,env(safe-area-inset-right,0px)) max(8px,calc(var(--dshmob-vv-bottom) + env(safe-area-inset-bottom,0px))) max(8px,env(safe-area-inset-left,0px));width:auto !important;max-width:none !important;max-height:min(88dvh,calc(var(--dshmob-vv-height) - 16px));border-radius:16px;overflow:hidden}", "html[data-dshmob=\"on\"] [data-dshmob-overlay=\"directory\"] :is(button,[role=button]){min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] [data-dshmob-overlay=\"directory\"] :is(input,textarea,select){min-height:var(--dshmob-touch);font-size:16px}",
			"html[data-dshmob=\"on\"] :is([data-dshmob-overlay=\"menu\"],[data-dshmob-overlay=\"picker\"]){box-sizing:border-box;max-height:min(58dvh,calc(var(--dshmob-vv-height) - 24px)) !important;overflow-y:auto}", "html[data-dshmob=\"on\"] :is([data-dshmob-overlay=\"menu\"],[data-dshmob-overlay=\"picker\"]) :is([role=menuitem],[role=option]){box-sizing:border-box;min-height:var(--dshmob-touch)}",
			"html[data-dshmob=\"on\"] [data-dshmob-overlay=\"submenu\"]{position:static !important;width:100% !important;max-height:none !important;margin-block:4px}", "html[data-dshmob=\"on\"] [data-dshmob-overlay=\"popover\"]{box-sizing:border-box;max-width:calc(100vw - 16px);max-height:min(50dvh,320px);overflow-y:auto}",
			// 模型分组菜单：桌面为 absolute 锚点弹层；移动端 composer 内 absolute 会被 scrollBody/centerCol/frame 的 overflow 裁剪
			// （列表展开即"跑到屏幕外"），故改 fixed 视口定位：底部贴在 composer 上方（--dshmob-toast-bottom 同语义变量，
			// 减 vv-top 补偿 iOS 键盘时 fixed 基于 layout viewport 的偏移），水平居中，高度随可视高度收缩。
			"html[data-dshmob=\"on\"] .dshmob-ms-menu{position:fixed !important;left:50% !important;right:auto !important;top:auto !important;transform:translateX(-50%) !important;bottom:calc(var(--dshmob-toast-bottom,96px) - var(--dshmob-vv-top,0px) + env(safe-area-inset-bottom,0px)) !important;width:min(calc(100vw - 24px),420px) !important;min-width:0 !important;max-width:none !important;max-height:min(400px,calc(var(--dshmob-vv-height,100vh) - 190px)) !important;z-index:60}",
			"html[data-dshmob=\"on\"] [data-dshmob-overlay=\"directory\"]{height:min(88dvh,calc(var(--dshmob-vv-height) - 16px)) !important;padding:0 !important}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"directory-columns\"]{gap:8px;scroll-snap-type:x mandatory;overflow-x:auto;overscroll-behavior-inline:contain}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"directory-column\"]{flex:0 0 calc(100vw - 48px);min-width:0;scroll-snap-align:end}", "html[data-dshmob=\"on\"] [data-dshmob-role=\"directory-row\"]{min-height:var(--dshmob-touch);height:auto;padding:8px}",
			"html[data-dshmob=\"on\"] [data-dshmob-role=\"directory-footer\"]{position:sticky;bottom:0;flex-wrap:wrap;padding:10px 12px max(10px,env(safe-area-inset-bottom,0px));background:var(--dshmob-surface-raised)}",
			"html[data-dshmob=\"on\"] :is([data-approval-key],[data-dshmob-role=\"user-question\"]){max-height:min(62dvh,calc(var(--dshmob-vv-height) - 96px));margin-bottom:8px}", "html[data-dshmob=\"on\"] :is([data-approval-key],[data-dshmob-role=\"user-question\"]) :is(button,[role=option]){min-height:var(--dshmob-touch)}",
			"html[data-dshmob=\"on\"] :is(.bqrRRG_actionRow,.LVzXQa_footer,.Mbwy4a_footer){position:sticky;bottom:0;flex-wrap:wrap;background:var(--dsw-specific-input-major)}", "html[data-dshmob=\"on\"] .bqrRRG_actionRow > button{flex:1 1 120px}",
			"html[data-dshmob=\"on\"] :is(.Mbwy4a_iconButton,._7yHdaG_action,._7yHdaG_header){min-width:var(--dshmob-touch);min-height:var(--dshmob-touch);height:auto}",
			"html[data-dshmob=\"on\"] :is(.qSYn7G_cards,.rtSEdW_cards,.YyYd_a_cards){grid-template-columns:minmax(0,1fr)}", "html[data-dshmob=\"on\"] :is(.qSYn7G_cardContent,.YyYd_a_header,.rtSEdW_cardMain){min-width:0;min-height:var(--dshmob-touch)}",
			"html[data-dshmob=\"on\"] :is(.rtSEdW_iconButton,.YyYd_a_discard,.YyYd_a_save,.qSYn7G_failure button){min-width:var(--dshmob-touch);min-height:var(--dshmob-touch)}", "html[data-dshmob=\"on\"] .YyYd_a_footer{position:sticky;bottom:0;flex-wrap:wrap;background:var(--dshmob-surface-raised)}",
			"html[data-dshmob=\"on\"] .qSYn7G_details{grid-template-columns:minmax(64px,auto) minmax(0,1fr)}", "html[data-dshmob=\"on\"] :is(.qSYn7G_cards,.rtSEdW_cards,.YyYd_a_cards) :is([class*=path i],[class*=value i],[class*=error i],[class*=failure i],code){min-width:0;overflow-wrap:anywhere;word-break:break-word}", "html[data-dshmob=\"on\"] :is(.qSYn7G_cards,.rtSEdW_cards,.YyYd_a_cards) input[type=search]{font-size:16px}",
			"@media (prefers-reduced-motion: reduce){html[data-dshmob=\"on\"] *,html[data-dshmob=\"on\"] *::before,html[data-dshmob=\"on\"] *::after{scroll-behavior:auto !important;animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}}", "}",
			"@media (max-width: 768px) and (hover: none),(max-width: 768px) and (pointer: coarse){", "html[data-dshmob=\"on\"] :is([role=tooltip],span[data-side],[data-dshmob-hovercard]){display:none !important}",
			"html[data-dshmob=\"on\"] [data-tip]::after{display:none !important;content:none !important}", "html[data-dshmob=\"on\"] [data-dshmob-hover-action]{opacity:1;visibility:visible;pointer-events:auto}",
			"}",
			"@media (min-width: 769px){", ".dsh-mob-burger,.dsh-mob-mask,.dsh-mob-toast,.dsh-mob-details-mask,.dsh-mob-degraded-bar{display:none !important}",
			"}"		].join("");
		const TAG_ID = "dsh-mobile/mobile.css";
		/* ==================== 基础工具 ==================== */
		function isElement(v) { return typeof Element !== "undefined" && v instanceof Element; }
		function isMobile() { return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches; }
		function isMobileActive() { return document.documentElement.dataset.dshmob === "on"; }
		function visible(el) { if (!isElement(el) || !el.isConnected) return false; const rect = el.getBoundingClientRect(), style = getComputedStyle(el); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; }
		// 幂等标记器（§5.2）：值未变化时不写属性，避免自激 mutation
		function setMarker(el, name, value = "") { if (!isElement(el)) return false; const attr = `data-dshmob-${name}`; if (el.getAttribute(attr) === value) return false; el.setAttribute(attr, value); return true; }
		function markRole(el, role) { setMarker(el, "role", role); }
		function queryVisible(root, selector) { if (root === null || typeof root.querySelectorAll !== "function") return []; const nodes = Array.from(root.querySelectorAll(selector)); if (isElement(root) && root.matches(selector)) nodes.unshift(root); return nodes.filter(visible); }
		function rafBatch(fn) {
			let raf = 0; let latestArgs = [];
			return (...args) => { latestArgs = args; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; fn(...latestArgs); }); };
		}
		function canScrollY(el) { if (!isElement(el)) return false; return /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1; }
		function intersects(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
		function hashedClasses(el) { return isElement(el) ? Array.from(el.classList).filter((name) => /^[A-Za-z0-9_-]{5,}_(frame|panel|root|row|body|header)$/.test(name)) : []; }
		function nodeSummary(el) { if (!isElement(el)) return null; const rect = el.getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), roles: el.getAttribute("role"), classes: hashedClasses(el), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } }; }
		// 触控目标审计（§5.5）；正文内联链接已登记 data-dshmob-allow-small 豁免
		function auditTouchTargets() {
			if (!isMobileActive()) return [];
			const selector = ["button", "a[href]", "[role=button]", "[role=menuitem]", "[role=option]", "input", "select", "textarea"].join(",");
			return queryVisible(document, selector).flatMap((el) => {
				if (el.closest("[data-dshmob-allow-small=true]")) return [];
				const rect = el.getBoundingClientRect();
				return rect.width >= 44 && rect.height >= 44 ? [] : [{ el, width: rect.width, height: rect.height }];
			});
		}
		// 重叠检测（§5.6）：遮罩覆盖属设计行为；汉堡压主浮层/主浮层压 composer 为失败
		function auditOverlayConflicts() {
			if (!isMobileActive()) return [];
			const nodes = queryVisible(document, ".dsh-mob-burger,.dsb_panel,[data-dshmob-overlay],[data-dshmob-role=details],[data-dshmob-role=composer]");
			const conflicts = [];
			for (let i = 0; i < nodes.length; i += 1) {
				for (let j = i + 1; j < nodes.length; j += 1) if (!nodes[i].contains(nodes[j]) && !nodes[j].contains(nodes[i]) && intersects(nodes[i].getBoundingClientRect(), nodes[j].getBoundingClientRect())) conflicts.push([nodes[i], nodes[j]]);
			}
			return conflicts;
		}
		// 局域网 HTTP（非安全上下文）剪贴板兜底（§2.15）
		function legacyCopy(text) {
			const el = document.createElement("textarea");
			el.value = text; el.readOnly = true;
			el.style.position = "fixed"; el.style.inset = "-9999px auto auto -9999px";
			document.body.appendChild(el); el.select();
			try { return document.execCommand("copy"); } finally { el.remove(); }
		}
		function installClipboardShim(rt) {
			if (!FEATURES.clipboardShim || typeof navigator === "undefined" || window.isSecureContext) return;
			const original = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null;
			const writeText = async (text) => {
				let copied = false; if (original !== null) { try { await original(text); copied = true; } catch {} }
				if (!copied && !legacyCopy(String(text))) throw new Error("copy failed");
				showStatusToast(rt, "copy", "已复制");
			};
			try {
				Object.defineProperty(navigator, "clipboard", { configurable: true, value: { ...(navigator.clipboard || {}), writeText } });
			} catch (error) { console.warn("dsh-mobile: clipboard shim unavailable", error); }
		}
		/* ==================== 运行时容器（可释放，防重复加载叠加行为） ==================== */
		function createRuntime() {
			const prev = window[RUNTIME_KEY];
			if (prev && typeof prev.dispose === "function") prev.dispose();
			const abort = new AbortController();
			const cleanups = [];
			const rt = {
				abort, cleanups,
					metrics: { observerRuns: 0, fullScans: 0, toastAnnouncements: 0, longTasks: 0 },
					state: { burger: null, mask: null, detailsMask: null, toast: null, toastTimer: null, toastSeen: new Map(), drawerReturn: null, detailsReturn: null, selectedTab: null, degradedBar: null, suppressInputFocusUntil: 0, lastWasGenerating: false, burgerDragging: false, degradedNotified: false, capabilityNotified: false, killed: false, bootAt: 0, detailsRetryUntil: 0, directoryRows: new WeakMap(), directoryDragging: null, overlayOffsets: new Map() },
				dispose() {
					abort.abort();
					for (const cleanup of cleanups.splice(0)) { try { cleanup(); } catch {} }
					deactivateMobile(rt); if (rt.state.toastTimer !== null) window.clearTimeout(rt.state.toastTimer); for (const el of [rt.state.burger, rt.state.mask, rt.state.detailsMask, rt.state.toast, rt.state.degradedBar]) if (isElement(el)) el.remove();
					delete window[RUNTIME_KEY];
					if (window.__DSH_MOBILE__ !== undefined) delete window.__DSH_MOBILE__;
				},
			};
			window[RUNTIME_KEY] = rt;
			return rt;
		}
		/* ==================== 角色解析（§2.2）：hash 快路径 + 结构校验 + 语义兜底 ==================== */
		// 初始为全键空壳（undefined 键会让 ensureRoles 的 .isConnected 判断抛 TypeError）
		let roleCache = { frame: null, sidebar: null, center: null, details: null, conversation: null, messageList: null, composer: null, composerSeat: null, detailsRoot: null, header: null, breadcrumbs: null, tabs: null, attachments: null };
		function hasComposerTextarea(el) { const t = el.querySelector("textarea"); return t !== null && visible(t); }
		function validateFrame(el) {
			if (!isElement(el) || getComputedStyle(el).display !== "grid") return false;
			return Array.from(el.children).filter(isElement).length >= 3 && Array.from(el.children).some(hasComposerTextarea);
		}
		function findFrame() {
			const fast = document.querySelector(".pI_x6G_frame");
			if (validateFrame(fast)) return fast;
			// 语义兜底 1：锚点向上爬（shell-overlay / 正文 textarea / body 首元素；DSH 嵌套可达 20+ 层）
			for (const anchor of [document.querySelector("[data-shell-overlay]"), document.querySelector("textarea"), document.body ? document.body.firstElementChild : null]) {
				let node = anchor;
				for (let depth = 0; isElement(node) && depth < 32; depth += 1) {
					if (validateFrame(node)) return node;
					node = node.parentElement;
				}
			}
			// 语义兜底 2：全量扫描 grid 容器（仅角色失效时触发，代价可接受）
			for (const el of document.querySelectorAll("div")) if (validateFrame(el)) return el;
			return null;
		}
		function validateSidebar(el) {
			if (!isElement(el) || el.querySelector("textarea") !== null) return false;
			return el.querySelector(".hHd-Xa_root,.hHd-Xa_toggle,.qDHVXG_searchButton,.qDHVXG_sessionOverflowButton,.YDXeBa_projectRow,[class*=sessionList i]") !== null;
		}
		function validateCenter(el) {
			if (!isElement(el) || !hasComposerTextarea(el)) return false;
			return el.querySelector(".wSkVaW_root") !== null || el.querySelector(".Md3f7G_scroll") !== null;
		}
		function validateDetails(el) {
			if (!isElement(el)) return false;
			if (el.querySelector(".ydkMvW_root") !== null) return true;
			return Array.from(el.querySelectorAll("button")).some((b) => CLOSE_DETAILS_LABELS.includes(b.getAttribute("aria-label")));
		}
		function validateConversation(el) {
			if (!isElement(el) || !hasComposerTextarea(el)) return false;
			if (el.getBoundingClientRect().height < window.innerHeight * 0.5) return false;
			return el.querySelector(".wSkVaW_header,.wSkVaW_tabs,.wSkVaW_scrollBody,.Md3f7G_scroll") !== null;
		}
		function validateComposer(el) {
			if (!isElement(el) || el.querySelectorAll("textarea").length !== 1) return false;
			if (el.querySelector(".Md3f7G_scroll,.wSkVaW_scrollBody") !== null) return false;
			return el.querySelector("button") !== null;
		}
		// 从 textarea 向上找第一个通过校验的祖先（语义兜底）
		function climbFromTextarea(center, validate) {
			const ta = center.querySelector("textarea");
			let node = ta === null ? null : ta.parentElement;
			while (isElement(node) && center.contains(node) && node !== center) {
				if (validate(node)) return node;
				node = node.parentElement;
			}
			return null;
		}
		function resolveAllRoles() {
			const out = { frame: null, sidebar: null, center: null, details: null, conversation: null, messageList: null, composer: null, composerSeat: null, detailsRoot: null, header: null, breadcrumbs: null, tabs: null, attachments: null };
			const frame = findFrame();
			if (frame === null) return out;
			out.frame = frame;
			const kids = Array.from(frame.children).filter(isElement);
			// 顺序只参与兜底候选，不单独决定角色（§2.2.2）
			const fastSidebar = frame.querySelector(".pI_x6G_sidebarCol");
			out.sidebar = validateSidebar(fastSidebar) ? fastSidebar : (kids.find(validateSidebar) || null);
			const fastCenter = frame.querySelector(".pI_x6G_centerCol");
			out.center = validateCenter(fastCenter) ? fastCenter : (kids.find((c) => c !== out.sidebar && validateCenter(c)) || null);
			const fastDetails = frame.querySelector(".pI_x6G_detailsCol");
			out.details = validateDetails(fastDetails) ? fastDetails : (kids.find((c) => c !== out.sidebar && c !== out.center && validateDetails(c)) || null);
			if (out.center !== null) {
				const fastConv = out.center.querySelector(".wSkVaW_root");
				out.conversation = validateConversation(fastConv) ? fastConv : climbFromTextarea(out.center, validateConversation);
				out.messageList = (() => {
					if (out.conversation === null) return null;
					const fast = out.conversation.querySelector(".Md3f7G_scroll") || out.conversation.querySelector(".wSkVaW_scrollBody");
					if (fast !== null && /(auto|scroll)/.test(getComputedStyle(fast).overflowY) && fast.scrollHeight >= fast.clientHeight) return fast;
					for (const el of out.conversation.querySelectorAll("*")) if (el.querySelector("textarea") === null && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight >= el.clientHeight) return el;
					return null;
				})();
				const fastComposer = out.center.querySelector(".uV2eYG_root");
				out.composer = validateComposer(fastComposer) ? fastComposer : climbFromTextarea(out.center, validateComposer);
				out.composerSeat = (() => {
					if (out.composer === null) return null;
					const fast = out.composer.querySelector(".wSkVaW_composerSeat");
					if (fast !== null && fast.querySelector("textarea") !== null) return fast;
					const ta = out.composer.querySelector("textarea");
					let node = ta === null ? null : ta.parentElement;
					while (isElement(node) && node !== out.composer && node.parentElement !== out.composer) node = node.parentElement;
					return isElement(node) && node !== out.composer ? node : null;
				})();
				out.header = out.conversation === null ? null : out.conversation.querySelector(".wSkVaW_header");
				out.breadcrumbs = out.conversation === null ? null : out.conversation.querySelector(".wSkVaW_crumbs");
				out.tabs = out.conversation === null ? null : out.conversation.querySelector(".wSkVaW_tabs");
				out.attachments = out.composer === null ? null : out.composer.querySelector(".uV2eYG_attachments");
			}
			out.detailsRoot = out.details === null ? null : out.details.querySelector(".ydkMvW_root");
			return out;
		}
		function ensureRoles(force) {
			// 关键角色断开或 frame 不再通过结构校验（类名改名/结构变化）→ 重新解析
			const detailsRoot = roleCache.detailsRoot || null; // 初始 {} 时 detailsRoot 为 undefined，先归一化
			const dynamicStale = (detailsRoot === null && document.querySelector(".ydkMvW_root") !== null) || (detailsRoot !== null && !detailsRoot.isConnected);
			const keyOk = !force && !dynamicStale && ["frame", "sidebar", "center", "composer"].every((k) => roleCache[k] !== null && roleCache[k].isConnected);
			if (!keyOk || (roleCache.frame !== null && !validateFrame(roleCache.frame))) {
				roleCache = resolveAllRoles();
				// 侧栏稳定 id（汉堡 aria-controls 用）
				if (roleCache.sidebar !== null && roleCache.sidebar.id === "") roleCache.sidebar.id = "dsh-mobile-sidebar";
			}
			// 每次批量都对缓存角色幂等重打标记：React 替换节点/属性丢失时自动恢复（§4.2）
			for (const [key, el] of Object.entries(roleCache)) if (isElement(el) && el.isConnected) { markRole(el, key === "header" ? "conversation-header" : key === "tabs" ? "conversation-tabs" : key); if (key === "tabs" || key === "attachments") setMarker(el, "scroll-x"); }
			return roleCache;
		}
		function missingKeyRoles() { return ["frame", "sidebar", "center", "composer"].filter((k) => roleCache[k] === null); }
		/* ==================== 统一 MutationObserver 与 RAF 增强调度（§2.3） ==================== */
		function createScheduler(rt) {
			const dirty = new Set();
			let scheduled = false;
			const flush = () => {
				scheduled = false;
				const roots = Array.from(dirty);
				dirty.clear();
				rt.metrics.observerRuns += 1;
				for (const root of roots) enhanceSubtree(rt, root);
				onBatchComplete(rt);
			};
			const scheduleEnhance = (node) => {
				if (!isElement(node) || node.closest("[data-dshmob-plugindom]")) return; // 插件自己的 DOM 不参与
				dirty.add(node);
				if (scheduled) return;
				scheduled = true;
				requestAnimationFrame(flush);
			};
			const observer = new MutationObserver((records) => {
				for (const record of records) {
					if (record.type === "childList") { for (const node of record.addedNodes) scheduleEnhance(node); }
					else scheduleEnhance(record.target);
				}
			});
			observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open", "aria-expanded", "aria-selected", "aria-current", "data-state", "data-details-collapsed", "aria-label"] });
			return { scheduleEnhance, flush, observer };
		}
		function markInspectButton(btn) { setMarker(btn, "action", "inspect"); if (btn.getAttribute("aria-label") === null) btn.setAttribute("aria-label", "查看工具详情"); setMarker(btn, "hover-action", ""); }
		// 消息/工具区标记（§2.5.1）：React 重渲染替换节点后由统一 observer 重新标记
		function markConversationParts(rt, root) {
			const within = (selector) => [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
			for (const el of within(".o3BgMG_root[data-tool], .CY-8Ka_card")) markRole(el, "tool-row");
			for (const btn of within(".o3BgMG_inspectButton, .CY-8Ka_inspectButton")) markInspectButton(btn);
			// 语义兜底：文本严格等于 Inspect/查看详情 的按钮（§2.2.1 白名单）
			for (const btn of within("button")) {
				const txt = (btn.textContent || "").trim();
				if (txt === "Inspect" || txt === "查看详情") markInspectButton(btn);
			}
			for (const el of within(".p-xYUq_actions")) markRole(el, "message-actions");
			for (const el of within(".LVzXQa_card, .Mbwy4a_card")) markRole(el, "user-question");
			for (const el of within("pre, table, [data-json-tree], [data-diff], [data-terminal], img, canvas")) setMarker(el, "scroll-x");
			// 被隐藏 Tooltip 的 anchor：data-tip 复制为 aria-label（§2.13）
			for (const el of root.querySelectorAll("[data-tip]")) {
				if (el.getAttribute("aria-label") === null) {
					const tip = el.getAttribute("data-tip");
					if (tip !== null && tip.trim() !== "") el.setAttribute("aria-label", tip.trim());
				}
			}
			if (roleCache.messageList !== null && roleCache.messageList.contains(root)) {
				// 尺寸检测：消息区内溢出的内容块（限定直接子层，控制成本）
				for (const el of root.querySelectorAll(":scope > div, :scope > section, :scope > article")) if (el.scrollWidth > el.clientWidth + 1) setMarker(el, "scroll-x");
				// 消息正文内联链接豁免 44px 触控审计
				for (const a of root.querySelectorAll("a[href]")) setMarker(a, "allow-small", "true");
			}
		}
		// 选中页签变化或被裁切时，只调整页签容器自身，不触发页面平滑滚动。
		function syncSelectedTab(rt) {
			const tabs = roleCache.tabs;
			if (!isElement(tabs)) return;
			const selected = Array.from(tabs.querySelectorAll('[role=tab][aria-selected=true],button[aria-selected=true],[aria-current=page],[data-state=active]')).pop();
			if (!isElement(selected)) return;
			const tr = tabs.getBoundingClientRect(), sr = selected.getBoundingClientRect(); if (rt.state.selectedTab === selected && sr.left >= tr.left && sr.right <= tr.right) return;
			rt.state.selectedTab = selected;
			tabs.scrollLeft += sr.left < tr.left ? sr.left - tr.left : sr.right > tr.right ? sr.right - tr.right : 0;
		}		function enhanceSubtree(rt, root) {
			if (!isElement(root) || root.closest("[data-dshmob-plugindom]")) return;
				if (!isMobileActive()) { if (!isMobile()) return; ensureRoles(false); if (missingKeyRoles().length === 0) activateMobile(rt); if (!isMobileActive()) return; }
				ensureRoles(false);
				if (root.matches(".dsb_badge")) setMarker(root, "allow-small", "true"); for (const el of root.querySelectorAll(".dsb_badge")) setMarker(el, "allow-small", "true");
			if (FEATURES.conversationDensity || FEATURES.touchTargets) markConversationParts(rt, root);
			// 浮层分类：先分具体类型，再落通用 modal（§2.9.1 顺序）
			if (FEATURES.overlaySheets) { if (root.matches('[role="dialog"],[role="menu"],[role="listbox"],.VOzbGW_panel')) classifyOverlay(rt, root); for (const el of root.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"],.VOzbGW_panel')) classifyOverlay(rt, el); }
			if (root.matches('[role="tooltip"],[data-hovercard],[data-hover-card]')) setMarker(root, "hovercard", ""); for (const el of root.querySelectorAll('[role="tooltip"],[data-hovercard],[data-hover-card]')) setMarker(el, "hovercard", "");
		}
		function looksLikeSettings(el) {
			// 结构兜底：≥3 个横向并排按钮 + 可滚动内容区（2 按钮确认框不命中，防误分类）
			const btns = Array.from(el.querySelectorAll("button")).filter(visible);
			if (btns.length < 3) return false;
			let horizontal = 0;
			for (let i = 0; i < btns.length - 1; i += 1) {
				const a = btns[i].getBoundingClientRect(), b = btns[i + 1].getBoundingClientRect();
				if (Math.abs(a.top - b.top) < 8 && b.left > a.left) horizontal += 1;
			}
			return horizontal >= 2 && Array.from(el.querySelectorAll("*")).some(canScrollY);
		}
		function looksLikeDirectory(el) {
			const cols = Array.from(el.children).filter((c) => isElement(c) && getComputedStyle(c).display === "flex" && (/(auto|scroll)/.test(getComputedStyle(c).overflowX) || c.scrollWidth > c.clientWidth + 1));
			return cols.length >= 1 && el.querySelectorAll("button").length >= 2;
		}
		function setOverlayKind(el, kind) { setMarker(el, "overlay", kind); return kind; }
		function markDirectoryParts(el) {
			const row = el.querySelector(".ZuhsRW_millerRow");
			if (row !== null) {
				markRole(row, "directory-columns"); setMarker(row, "scroll-x");
				for (const col of Array.from(row.children).filter(isElement)) markRole(col, "directory-column");
				for (const r of row.querySelectorAll("button, [role=listitem]")) markRole(r, "directory-row");
			}
			const kids = Array.from(el.children).filter(isElement);
			const footer = kids[kids.length - 1];
			if (isElement(footer) && footer.querySelector("button") !== null) markRole(footer, "directory-footer");
		}
		function syncDirectoryColumns(rt) { for (const row of document.querySelectorAll('[data-dshmob-role="directory-columns"]')) { let state = rt.state.directoryRows.get(row); if (state === undefined) { state = { count: 0 }; rt.state.directoryRows.set(row, state); } const count = row.children.length; if (count <= state.count || rt.state.directoryDragging === row) continue; state.count = count; row.style.scrollSnapType = "none"; row.dataset.dshmobSnapOff = "1"; row.scrollLeft = row.scrollWidth; } }
		function mountDirectorySync(rt) {
			document.addEventListener("pointerdown", (event) => { const t = event.target; const row = isElement(t) ? t.closest('[data-dshmob-role="directory-columns"]') : null; rt.state.directoryDragging = row; if (row !== null && row.dataset.dshmobSnapOff === "1") { row.style.scrollSnapType = ""; delete row.dataset.dshmobSnapOff; } }, { capture: true, signal: rt.abort.signal });
			document.addEventListener("pointerup", () => { rt.state.directoryDragging = null; syncDirectoryColumns(rt); }, { capture: true, signal: rt.abort.signal }); document.addEventListener("pointercancel", () => { rt.state.directoryDragging = null; syncDirectoryColumns(rt); }, { capture: true, signal: rt.abort.signal });
		}
		function classifyOverlay(rt, el) {
			if (el.closest("[data-dshmob-plugindom]")) return null;
			if (el.hasAttribute("data-dshmob-overlay")) return el.getAttribute("data-dshmob-overlay");
			const role = el.getAttribute("role");
			// 1) 设置面板（快路径 .VOzbGW_panel 或结构兜底）
			if (el.classList.contains("VOzbGW_panel") || (role === "dialog" && looksLikeSettings(el))) return setOverlayKind(el, "settings");
			// 2) lightbox：模态对话框内的大图
			if (role === "dialog" && el.getAttribute("aria-modal") === "true") {
				const img = el.querySelector("img");
				if (img !== null && Math.max(img.getBoundingClientRect().width, img.getBoundingClientRect().height) > Math.min(window.innerWidth, window.innerHeight) * 0.5) return setOverlayKind(el, "lightbox");
			}
			// 3) 目录选择器（快路径 .ZuhsRW_dialog 或结构兜底）
			if (el.classList.contains("ZuhsRW_dialog") || (role === "dialog" && looksLikeDirectory(el))) {
				setOverlayKind(el, "directory");
				markDirectoryParts(el);
				return "directory";
			}
			// 4) 通用 modal
			if (role === "dialog" && el.getAttribute("aria-modal") === "true") return setOverlayKind(el, "modal");
			// 5) listbox
			if (role === "listbox") return setOverlayKind(el, "picker");
			// 6) menu / submenu：仅顶层菜单固定为 action sheet（§4.3）
			if (role === "menu") {
				const parent = el.parentElement;
				if (parent !== null && (parent.closest('[role="menu"]') !== null || parent.closest("[data-dshmob-overlay]") !== null)) return setOverlayKind(el, "submenu");
				return setOverlayKind(el, "menu");
			}
			// 7) popover（非模态 dialog，如上下文占用面板）
			if (role === "dialog") return setOverlayKind(el, "popover");
			return null;
		}
		/* ==================== 浮层栈（§2.14）：同时只允许一个主浮层 ==================== */
		function findVisiblePrimaryModal() {
			const order = ["modal", "lightbox", "settings", "directory"];
			const overlays = queryVisible(document, "[data-dshmob-overlay]");
			for (const kind of order) {
				const el = overlays.find((n) => n.getAttribute("data-dshmob-overlay") === kind);
				if (el !== undefined) return el;
			}
			return null;
		}
		function findVisibleTransientOverlay() { const overlays = queryVisible(document, '[data-dshmob-overlay="menu"],[data-dshmob-overlay="picker"],[data-dshmob-overlay="popover"]'); return overlays.at(-1) || null; }
			function isBalancePanelVisible() { const p = document.querySelector(".dsb_panel"); return p !== null && visible(p); }
			function setBurgerSuppressed(rt, on) { if (rt.state.burger !== null) rt.state.burger.style.display = on ? "none" : ""; }
			function updateCenterInert(rt, on) { const c = roleCache.center; if (isElement(c) && c.inert !== on) c.inert = on; }
			function syncToastClearance() { const comp = roleCache.composer; if (!isElement(comp)) return; const r = comp.getBoundingClientRect(); document.body.style.setProperty("--dshmob-toast-bottom", `${Math.max(96, Math.ceil(window.innerHeight - r.top + 8))}px`); }
		function closeOpenMenus() { if (findVisibleTransientOverlay() === null) return; try { document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true })); } catch {} }
		// 锚点浮层不感知 visualViewport/safe-area，用 margin 修正且不覆盖 Radix transform。
		let safeCache = null;
		function readSafeInsets() { const signature = `${window.innerWidth}x${window.innerHeight}`; if (safeCache !== null && safeCache.signature === signature) return safeCache; let probe = document.getElementById("dshmob-safe-probe"); if (probe === null) { probe = document.createElement("div"); probe.id = "dshmob-safe-probe"; probe.dataset.dshmobPlugindom = "1"; probe.style.cssText = "position:fixed;inset:0;pointer-events:none;visibility:hidden;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)"; document.body.appendChild(probe); } const s = getComputedStyle(probe); safeCache = { signature, top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 }; return safeCache; }
		function clampOverlayToViewport(rt, el) { const saved = rt.state.overlayOffsets.get(el) || { marginLeft: el.style.marginLeft, marginTop: el.style.marginTop }; el.style.marginLeft = saved.marginLeft; el.style.marginTop = saved.marginTop; const insets = readSafeInsets(), vv = window.visualViewport, left = (vv ? vv.offsetLeft : 0) + insets.left + 8, top = (vv ? vv.offsetTop : 0) + insets.top + 8, right = (vv ? vv.offsetLeft + vv.width : window.innerWidth) - insets.right - 8, bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - insets.bottom - 8, r = el.getBoundingClientRect(), dx = r.left < left ? left - r.left : r.right > right ? right - r.right : 0, dy = r.top < top ? top - r.top : r.bottom > bottom ? bottom - r.bottom : 0; if (dx !== 0) el.style.marginLeft = `calc(${saved.marginLeft || "0px"} + ${dx}px)`; if (dy !== 0) el.style.marginTop = `calc(${saved.marginTop || "0px"} + ${dy}px)`; rt.state.overlayOffsets.set(el, saved); }
		function clampOpenOverlaysToSafeArea(rt) { for (const el of rt.state.overlayOffsets.keys()) if (!el.isConnected) rt.state.overlayOffsets.delete(el); for (const el of queryVisible(document, '[data-dshmob-overlay="menu"],[data-dshmob-overlay="picker"],[data-dshmob-overlay="popover"]')) clampOverlayToViewport(rt, el); }
		function restoreOverlayOffsets(rt) { for (const [el, saved] of rt.state.overlayOffsets) if (isElement(el)) { el.style.marginLeft = saved.marginLeft; el.style.marginTop = saved.marginTop; } rt.state.overlayOffsets.clear(); }
			function syncOverlayStack(rt) {
				if (!isMobileActive()) return;
				syncToastClearance();
			const modal = findVisiblePrimaryModal();
			const transient = findVisibleTransientOverlay();
			const detailsOpen = document.body.classList.contains("dsh-mob-details-open");
			const balanceVisible = isBalancePanelVisible();
			const drawerOpen = document.body.classList.contains("dsh-mob-open");
			const top = modal !== null ? modal.getAttribute("data-dshmob-overlay") : detailsOpen ? "details" : balanceVisible ? "balance" : transient !== null ? transient.getAttribute("data-dshmob-overlay") : drawerOpen ? "sidebar" : "none";
				if ((document.documentElement.dataset.dshmobTopOverlay || "none") !== top) document.documentElement.dataset.dshmobTopOverlay = top; if (rt.state.toast !== null) rt.state.toast.classList.toggle("dsh-mob-toast-bottom", ["modal", "lightbox", "settings", "directory", "details", "balance", "sidebar"].includes(top));
			// 主 modal 出现：关侧栏与详情（modal 优先于详情）
			if (modal !== null) { if (drawerOpen) closeDrawer(rt); if (detailsOpen) closeDetailsSheet(rt); }
			setBurgerSuppressed(rt, modal !== null || detailsOpen || balanceVisible);
			updateCenterInert(rt, drawerOpen || detailsOpen || (modal !== null && roleCache.center !== null && !roleCache.center.contains(modal)));
		}
		/* ==================== 侧栏抽屉 / 汉堡 / 手势 ==================== */
		function blurActiveInput() {
			const el = document.activeElement;
			if (el === null || typeof el.blur !== "function") return;
			if (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable) el.blur();
		}
		function restoreFocus(rt, preferred) {
			window.setTimeout(() => {
				const target = isElement(preferred) && preferred.isConnected && visible(preferred) ? preferred : rt.state.burger; if (isElement(target) && target.isConnected && visible(target)) target.focus({ preventScroll: true });
			}, 0);
		}
		function sidebarCollapsed() { const root = document.querySelector(".hHd-Xa_root"); return root === null ? true : root.classList.contains("hHd-Xa_collapsed"); }
		function clickDshToggle() { const btn = document.querySelector(".hHd-Xa_toggle"); if (btn === null) return false; btn.click(); return true; }
		function setBurgerIcon(rt) {
			if (rt.state.burger === null) return;
			const open = document.body.classList.contains("dsh-mob-open");
			rt.state.burger.innerHTML = open ? X_SVG : BURGER_SVG;
			rt.state.burger.setAttribute("aria-label", open ? "关闭侧栏" : "打开侧栏");
			rt.state.burger.setAttribute("aria-expanded", open ? "true" : "false"); if (isElement(roleCache.sidebar)) rt.state.burger.setAttribute("aria-controls", roleCache.sidebar.id);
		}
		function openDrawer(rt) {
			if (!isMobileActive() || findVisiblePrimaryModal() !== null) return;
			rt.state.drawerReturn = isElement(document.activeElement) && document.activeElement !== document.body ? document.activeElement : rt.state.burger;
			blurActiveInput(); // 用户拍板：展开侧栏自动收键盘
			document.body.classList.add("dsh-mob-open");
			if (sidebarCollapsed()) window.setTimeout(() => { if (document.body.classList.contains("dsh-mob-open") && sidebarCollapsed()) clickDshToggle(); }, 0);
				setBurgerIcon(rt);
				syncOverlayStack(rt);
			}
		// 关闭抽屉：DSH toggle 延迟到下一事件循环，避免 React 重渲染挤掉会话切换合成事件（v2 教训）
		function closeDrawer(rt) {
			document.body.classList.remove("dsh-mob-open");
			if (!sidebarCollapsed()) window.setTimeout(() => { if (!document.body.classList.contains("dsh-mob-open") && !sidebarCollapsed()) clickDshToggle(); }, 0);
			setBurgerIcon(rt);
			syncOverlayStack(rt);
			restoreFocus(rt, rt.state.drawerReturn); rt.state.drawerReturn = null;
		}
			function mountSidebarAutoClose(rt) {
				document.addEventListener("click", (event) => {
					if (!isMobileActive() || !document.body.classList.contains("dsh-mob-open")) return;
					const t = event.target;
					if (!isElement(t) || typeof t.closest !== "function") return;
					// 侧栏节点会被 React 替换，使用事件委托避免监听随旧节点失效。
					if (t.closest('[data-dshmob-role="sidebar"]') === null && t.closest(".VOzbGW_trigger") === null) return;
					if (t.closest("input,textarea,[contenteditable],.hHd-Xa_toggle")) return;
					if (t.closest(".VOzbGW_trigger")) { window.setTimeout(() => { closeDrawer(rt); requestAnimationFrame(() => syncOverlayStack(rt)); }, 0); return; }
				// 抽屉内浏览操作不关抽屉（v2.1/v2.2 教训：弹菜单按钮被误判关抽屉）
				if (t.closest(".qDHVXG_sessionOverflowButton,.qDHVXG_searchButton,[class*=overflow i],[aria-haspopup],.YDXeBa_iconButton,.YDXeBa_projectRow")) return;
				rt.state.suppressInputFocusUntil = Date.now() + 500;
				window.setTimeout(() => closeDrawer(rt), 0);
			}, { signal: rt.abort.signal });
		}
		function mountBurgerDrag(rt, button) {
			let startX = 0, startY = 0, origX = 0, origY = 0, moved = false, pointerId = null;
			const applyPos = (x, y) => { button.style.left = `${x}px`; button.style.top = `${y}px`; }; const syncDockMode = () => { const r = button.getBoundingClientRect(), docked = r.left < 72 && r.top < 72; document.documentElement.dataset.dshmobBurger = docked ? "docked" : "free"; return docked; };
			const dockButton = () => { button.style.removeProperty("left"); button.style.removeProperty("top"); button.classList.remove("dsh-mob-dragged"); document.documentElement.dataset.dshmobBurger = "docked"; };
			const restoreSaved = () => {
				try {
					const saved = JSON.parse(window.localStorage.getItem(BURGER_POS_KEY) || "null");
					if (saved !== null && typeof saved.px === "number" && typeof saved.py === "number") {
						const bw = button.offsetWidth || 44, bh = button.offsetHeight || 44;
						applyPos(Math.min(Math.max(saved.px / 100 * window.innerWidth - bw / 2, 4), window.innerWidth - bw - 4), Math.min(Math.max(saved.py / 100 * window.innerHeight - bh / 2, 4), window.innerHeight - bh - 4));
						button.classList.add("dsh-mob-dragged");
						if (syncDockMode()) dockButton();
					}
				} catch {}
			};
			document.documentElement.dataset.dshmobBurger = "docked"; restoreSaved();
			const onDown = (e) => {
				if (e.pointerType === "mouse" && e.button !== 0) return;
				moved = false; pointerId = e.pointerId; startX = e.clientX; startY = e.clientY;
				const r = button.getBoundingClientRect();
				origX = r.left; origY = r.top;
				try { button.setPointerCapture(e.pointerId); } catch {}
			};
			const onMove = (e) => {
				if (pointerId === null) return;
				const dx = e.clientX - startX, dy = e.clientY - startY;
				if (!moved && Math.hypot(dx, dy) < 6) return;
				moved = true;
				button.classList.add("dsh-mob-dragged");
				const bw = button.offsetWidth, bh = button.offsetHeight;
				const vw = window.innerWidth, vh = window.innerHeight;
				applyPos(Math.min(Math.max(origX + dx, 4), vw - bw - 4), Math.min(Math.max(origY + dy, 4), vh - bh - 4)); syncDockMode();
			};			const onEnd = () => {
				if (pointerId === null) return;
				pointerId = null;
				if (!moved) return;
				if (syncDockMode()) dockButton(); const r = button.getBoundingClientRect();
				try { window.localStorage.setItem(BURGER_POS_KEY, JSON.stringify({ px: Math.round((r.left + r.width / 2) / window.innerWidth * 100), py: Math.round((r.top + r.height / 2) / window.innerHeight * 100) })); } catch {}
				rt.state.burgerDragging = true; // 拖动后的 click 被吞掉
				window.setTimeout(() => { rt.state.burgerDragging = false; }, 80);
			};
			button.addEventListener("pointerdown", onDown, { signal: rt.abort.signal });
			button.addEventListener("pointermove", onMove, { signal: rt.abort.signal });
			button.addEventListener("pointerup", onEnd, { signal: rt.abort.signal });
			button.addEventListener("pointercancel", onEnd, { signal: rt.abort.signal });
			window.addEventListener("resize", () => { if (button.classList.contains("dsh-mob-dragged")) restoreSaved(); }, { signal: rt.abort.signal });
		}
		function mountDrawerChrome(rt) {
			const mask = document.createElement("div");
			mask.className = "dsh-mob-mask"; mask.dataset.dshmobPlugindom = "1";
			mask.addEventListener("click", () => closeDrawer(rt), { signal: rt.abort.signal });
			document.body.appendChild(mask);
			rt.state.mask = mask;
			const burger = document.createElement("button");
			burger.type = "button";
			burger.className = "dsh-mob-burger"; burger.dataset.dshmobPlugindom = "1"; rt.state.burger = burger;
			setBurgerIcon(rt);
			burger.addEventListener("click", () => {
				if (rt.state.burgerDragging) return;
				if (document.body.classList.contains("dsh-mob-open")) closeDrawer(rt);
				else openDrawer(rt);
			}, { signal: rt.abort.signal });
			document.body.appendChild(burger);
			mountBurgerDrag(rt, burger);
			mountSidebarAutoClose(rt);
		}
		// 左边缘右滑手势（§2.16）：idle→tracking→claimed；仅 claimed 后 preventDefault
			function mountEdgeSwipeGesture(rt) {
				if (!FEATURES.gestureArbitration) return;
				let tracking = false, claimed = false, startX = 0, startY = 0;
				const inHorizontalScroller = (target) => { let node = target; while (isElement(node) && node !== document.body) { const s = getComputedStyle(node); if ((node.hasAttribute("data-dshmob-scroll-x") || /(auto|scroll)/.test(s.overflowX)) && node.scrollWidth > node.clientWidth + 1) return true; node = node.parentElement; } return false; };
			const blocked = () => !isMobileActive() || document.body.classList.contains("dsh-mob-open") || document.body.classList.contains("dsh-mob-details-open") || (document.documentElement.dataset.dshmobTopOverlay || "none") !== "none";
			const onStart = (e) => {
				if (blocked()) { tracking = false; claimed = false; return; }
				const t = e.changedTouches[0];
				if (t === undefined || t.clientX < 12 || t.clientX > 28) return; // 避开 iOS 系统返回热区
				const target = e.target;
					if (isElement(target) && (target.closest("button,input,textarea,select,a,[contenteditable],[data-dshmob-overlay]") !== null || inHorizontalScroller(target))) return;
				tracking = true; claimed = false; startX = t.clientX; startY = t.clientY;
			};
			const onMove = (e) => {
				if (!tracking) return;
				const t = e.changedTouches[0];
				if (t === undefined) return;
				const dx = t.clientX - startX, dy = t.clientY - startY;
				if (!claimed && dx > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
					claimed = true; tracking = false;
					e.preventDefault();
					openDrawer(rt);
				}
			};
			const onEnd = () => { tracking = false; claimed = false; };
			document.addEventListener("touchstart", onStart, { passive: true, signal: rt.abort.signal });
			document.addEventListener("touchmove", onMove, { passive: false, signal: rt.abort.signal });
			document.addEventListener("touchend", onEnd, { passive: true, signal: rt.abort.signal });
			document.addEventListener("touchcancel", onEnd, { passive: true, signal: rt.abort.signal });
		}
		/* ==================== 详情抽屉（§2.8，P0 功能修复：Inspect 不再是空操作） ==================== */
		function detailsHasContent() {
			const root = roleCache.detailsRoot;
			if (!isElement(root)) return false;
			if (root.querySelector(".ydkMvW_section") !== null) return true;
			if (root.querySelector(".ydkMvW_empty") !== null) return false;
			const body = root.querySelector(".ydkMvW_body");
			return body !== null && (body.textContent || "").trim().length > 4;
		}
		function openDetailsSheet(rt) {
			if (!FEATURES.detailsSheet || !isMobileActive()) return;
			closeOpenMenus();
			document.body.classList.add("dsh-mob-details-open");
			if (document.body.classList.contains("dsh-mob-open")) closeDrawer(rt);
			if (rt.state.detailsMask !== null) rt.state.detailsMask.classList.add("dsh-mob-details-mask-show");
			syncOverlayStack(rt);
		}
		function closeDetailsSheet(rt) {
			document.body.classList.remove("dsh-mob-details-open");
			rt.state.detailsRetryUntil = 0;
			if (rt.state.detailsMask !== null) rt.state.detailsMask.classList.remove("dsh-mob-details-mask-show");
			syncOverlayStack(rt);
			restoreFocus(rt, rt.state.detailsReturn); rt.state.detailsReturn = null;
		}
		function clickNativeDetailsClose() {
			const root = roleCache.detailsRoot;
			if (!isElement(root)) return false;
			const btn = Array.from(root.querySelectorAll("button")).find((b) => CLOSE_DETAILS_LABELS.includes(b.getAttribute("aria-label")));
			if (btn === undefined) return false;
			btn.click();
			return true;
		}
		// React 状态驱动：frame[data-details-collapsed] 是权威来源，避免与点击时序竞争（§4.2）
		function syncDetailsState(rt) {
			if (!FEATURES.detailsSheet || !isMobileActive() || roleCache.frame === null) return;
			const collapsed = roleCache.frame.hasAttribute("data-details-collapsed");
			if (collapsed) { if (document.body.classList.contains("dsh-mob-details-open")) closeDetailsSheet(rt); return; }
			if (document.body.classList.contains("dsh-mob-details-open")) return;
			if (detailsHasContent()) openDetailsSheet(rt);
			else if (rt.state.detailsRetryUntil === 0) rt.state.detailsRetryUntil = Date.now() + 500; // 超时未出内容则取消（不弹空抽屉）
		}
		function mountDetailsChrome(rt) {
			if (!FEATURES.detailsSheet) return;
			const mask = document.createElement("div");
			mask.className = "dsh-mob-details-mask"; mask.dataset.dshmobPlugindom = "1";
			// 点击 mask：先让当前事件结束，再程序化点击原生关闭按钮（保持 React 状态同步）
			mask.addEventListener("click", () => {
				window.setTimeout(() => { if (!clickNativeDetailsClose()) closeDetailsSheet(rt); }, 0);
			}, { signal: rt.abort.signal });
			document.body.appendChild(mask);
			rt.state.detailsMask = mask;
			// 原生关闭按钮：捕获阶段先撤 class，React 的收合继续执行
			document.addEventListener("click", (event) => {
				if (!isMobileActive()) return;
				const t = event.target;
				if (!isElement(t) || typeof t.closest !== "function") return;
				const inspect = t.closest('[data-dshmob-action="inspect"]');
				if (inspect !== null) { rt.state.detailsReturn = inspect; return; }
				const root = roleCache.detailsRoot;
				if (!isElement(root) || !root.contains(t)) return;
				const btn = t.closest("button");
				if (btn !== null && CLOSE_DETAILS_LABELS.includes(btn.getAttribute("aria-label"))) closeDetailsSheet(rt);
			}, { capture: true, signal: rt.abort.signal });
		}
		function mountEscapeHandler(rt) {
			document.addEventListener("keydown", (event) => {
				if (!isMobileActive() || event.key !== "Escape") return;
				const top = document.documentElement.dataset.dshmobTopOverlay || "none";
				if (top === "menu" || top === "picker" || top === "popover") return; // 原生菜单自己处理
				if (document.body.classList.contains("dsh-mob-details-open")) window.setTimeout(() => { if (!clickNativeDetailsClose()) closeDetailsSheet(rt); }, 0);
				else if (document.body.classList.contains("dsh-mob-open")) closeDrawer(rt);
			}, { signal: rt.abort.signal });
		}
		/* ==================== 视口 / 键盘 / 滚动锚定（§2.6） ==================== */
		function syncVisualViewport(rt) {
			if (!FEATURES.viewportKeyboard || !isMobileActive()) return;
			const vv = window.visualViewport;
			const height = vv ? vv.height : window.innerHeight;
			const top = vv ? vv.offsetTop : 0;
			const keyboard = window.innerHeight - height > 120;
			const root = document.documentElement;
			if (root.scrollTop !== 0) root.scrollTop = 0;
			// 变量写到 body：token 定义在 body 上，html 内联会被 body 规则定义覆盖（就近继承）
			const holder = document.body; holder.style.setProperty("--dshmob-vv-height", `${Math.round(height)}px`);
			holder.style.setProperty("--dshmob-vv-top", `${Math.round(top)}px`); holder.style.setProperty("--dshmob-vv-bottom", `${Math.max(0, Math.round(window.innerHeight - height - top))}px`);
			if (root.hasAttribute("data-dshmob-keyboard") !== keyboard) root.toggleAttribute("data-dshmob-keyboard", keyboard);
			clampOpenOverlaysToSafeArea(rt);
		}
		let anchor = null;
		let anchorRestoreTimer = null;
		function captureScrollAnchor() {
			if (!isMobileActive() || document.body.classList.contains("dsh-mob-open") || document.body.classList.contains("dsh-mob-details-open")) { anchor = null; return; }
			const sc = roleCache.messageList;
			if (!isElement(sc)) { anchor = null; return; }
			const rect = sc.getBoundingClientRect();
			const first = Array.from(sc.children).map((el) => ({ el, top: el.getBoundingClientRect().top - rect.top })).find((x) => x.top >= -8) || null;
			anchor = { sc, pinned: sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 48, first: first === null ? null : { el: first.el, delta: first.top } };
		}
		function restoreScrollAnchor() {
			if (anchor === null || !isElement(anchor.sc) || !anchor.sc.isConnected) { anchor = null; return; }
			const sc = anchor.sc;
			if (anchor.pinned) sc.scrollTop = sc.scrollHeight;
			else if (anchor.first !== null && anchor.first.el.isConnected) sc.scrollTop += anchor.first.el.getBoundingClientRect().top - sc.getBoundingClientRect().top - anchor.first.delta;
			anchor = null;
		}
		function scheduleAnchorRestore() {
			if (anchorRestoreTimer !== null) window.clearTimeout(anchorRestoreTimer);
			anchorRestoreTimer = window.setTimeout(() => { anchorRestoreTimer = null; restoreScrollAnchor(); }, 150);
		}
		function mountViewportSync(rt) {
			if (!FEATURES.viewportKeyboard) return;
			const onVv = () => { if (anchor === null) captureScrollAnchor(); scheduleAnchorRestore(); syncVisualViewport(rt); };
			const batched = rafBatch(onVv);
			const vv = window.visualViewport;
			if (vv !== undefined && vv !== null) {
				vv.addEventListener("resize", batched, { signal: rt.abort.signal });
				vv.addEventListener("scroll", batched, { signal: rt.abort.signal });
			}
			window.addEventListener("resize", batched, { signal: rt.abort.signal });
			window.addEventListener("orientationchange", batched, { signal: rt.abort.signal });
			// 用户正在拖动消息区时不补偿
			document.addEventListener("pointerdown", (event) => {
				if (anchor !== null && isElement(event.target) && roleCache.messageList !== null && roleCache.messageList.contains(event.target)) anchor = null;
			}, { capture: true, signal: rt.abort.signal });
			// 切后台：iOS 冻结期会丢弃 visualViewport/window 事件，且冻结期间键盘/地址栏状态已变，
			// 旧锚点与待执行的补偿全部过期——切出即作废；恢复后由 mountHealthCheck 的 resyncViewport 按当前视口重同步。
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) { anchor = null; if (anchorRestoreTimer !== null) { window.clearTimeout(anchorRestoreTimer); anchorRestoreTimer = null; } }
			}, { signal: rt.abort.signal });
			syncVisualViewport(rt);
		}
		/* ==================== 停止按钮去重 / 生成结束提示（迁入统一调度，§2.3） ==================== */
		// v4 规则：停止按钮若不是其容器内最后一个 button 就隐藏（主按钮恒为最后一个）。
		// 不依赖数量/图标/出现顺序——单方块出现时它后面还有主按钮，同样命中；无闪现无误杀。
		function isLastButtonInContainer(b) {
			let node = b;
			for (let up = 0; up < 4; up += 1) {
				const parent = node.parentElement;
				if (parent === null) return true;
				const btns = Array.from(parent.querySelectorAll("button"));
				if (btns.length > 1) return btns[btns.length - 1] === b;
				node = parent;
			}
			return true;
		}
		function composerHasStopButton() {
			const comp = roleCache.composer;
			if (!isElement(comp)) return false;
			return Array.from(comp.querySelectorAll("button[aria-label]")).some((b) => STOP_LABELS.includes(b.getAttribute("aria-label")));
		}
		function pruneRedundantStopButton(rt) {
			if (!isMobileActive()) return;
			const comp = roleCache.composer;
			if (!isElement(comp)) return;
			for (const b of comp.querySelectorAll("button[aria-label]")) {
				if (STOP_LABELS.includes(b.getAttribute("aria-label")) && !isLastButtonInContainer(b)) b.style.display = "none";
			}
		}
		function watchGenerationEnd(rt) {
			if (!isMobileActive()) return;
			const generating = composerHasStopButton();
			if (rt.state.lastWasGenerating && !generating) showStatusToast(rt, "complete", "回复完成");
			rt.state.lastWasGenerating = generating;
		}
		// 插件状态通道：单例 toast，按 type+message 在 10 秒窗口内去重。
		function showStatusToast(rt, type, message, highRisk = false) {
			if (!isMobileActive()) return false;
			const text = String(message || "").trim(), kind = String(type || "status").trim(); if (text === "") return false;
			const now = Date.now(), key = `${kind}\u0000${text}`;
			for (const [oldKey, at] of rt.state.toastSeen) if (now - at >= STATUS_COOLDOWN_MS) rt.state.toastSeen.delete(oldKey);
			if (rt.state.toastSeen.has(key)) return false; rt.state.toastSeen.set(key, now);
			let el = rt.state.toast;
			if (el === null || !el.isConnected) {
				el = document.createElement("div"); el.className = "dsh-mob-toast"; el.dataset.dshmobPlugindom = "1"; document.body.appendChild(el); rt.state.toast = el;
			}
			el.setAttribute("role", highRisk ? "alert" : "status"); el.setAttribute("aria-live", highRisk ? "assertive" : "polite");
			const top = document.documentElement.dataset.dshmobTopOverlay || "none";
				syncToastClearance(); el.classList.toggle("dsh-mob-toast-bottom", ["modal", "lightbox", "settings", "directory", "details", "balance", "sidebar"].includes(top));
			el.dataset.dshmobStatus = kind; el.textContent = text; el.classList.add("dsh-mob-toast-show");
			rt.metrics.toastAnnouncements += 1;
			if (rt.state.toastTimer !== null) window.clearTimeout(rt.state.toastTimer); rt.state.toastTimer = window.setTimeout(() => el.classList.remove("dsh-mob-toast-show"), 2500);
			return true;
		}
		function mountStatusChannel(rt) {
			window.addEventListener("dsh-mobile:status", (event) => {
				const detail = event instanceof CustomEvent && event.detail && typeof event.detail === "object" ? event.detail : {}; showStatusToast(rt, detail.type, detail.message, detail.priority === "high");
			}, { signal: rt.abort.signal }); window.addEventListener("offline", () => showStatusToast(rt, "error", "网络连接已断开"), { signal: rt.abort.signal }); window.addEventListener("online", () => showStatusToast(rt, "reconnect", "网络连接已恢复"), { signal: rt.abort.signal });
		}
		function mountLongTaskCounter(rt) {
			if (typeof PerformanceObserver !== "function") return; try { const observer = new PerformanceObserver((list) => { rt.metrics.longTasks += list.getEntries().filter((entry) => entry.duration >= 50).length; }); observer.observe({ type: "longtask", buffered: true }); rt.cleanups.push(() => observer.disconnect()); } catch {}
		}
		function warnLegacyCapabilities(rt) { if (rt.state.capabilityNotified) return; const colorMix = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", "color-mix(in srgb, red 50%, blue)"); if (colorMix && window.visualViewport) return; rt.state.capabilityNotified = true; console.info("dsh-mobile: 浏览器能力有限，已使用兼容布局", { colorMix, visualViewport: Boolean(window.visualViewport) }); }
		/* ==================== 焦点抑制 / 杂项 ==================== */		function mountFocusSuppressors(rt) {
			document.addEventListener("focusin", (event) => {
				if (!isMobileActive() || Date.now() >= rt.state.suppressInputFocusUntil) return;
				const t = event.target;
				if (isElement(t) && t.matches("textarea,input,[contenteditable]")) t.blur();
			}, { capture: true, signal: rt.abort.signal });
			document.addEventListener("click", (event) => {
				if (!isMobileActive()) return;
				const t = event.target;
				if (!isElement(t) || typeof t.closest !== "function") return;
				const btn = t.closest("button[aria-label]");
				if (btn !== null && STOP_LABELS.includes(btn.getAttribute("aria-label"))) rt.state.suppressInputFocusUntil = Date.now() + 500;
			}, { capture: true, signal: rt.abort.signal });
		}		// 滚动时汉堡变淡（只处理消息滚动容器，避免全页 scroll 遍历）
		function mountBurgerScrollFade(rt) {
			let timer = null;
			document.addEventListener("scroll", (event) => {
				if (!isMobileActive()) return;
				const t = event.target;
				if (!isElement(t) || !t.matches('[data-dshmob-role="message-list"]')) return;
				if (Math.abs(t.scrollTop - (t.__dshmobScrollTop || 0)) < 4) return;
				t.__dshmobScrollTop = t.scrollTop;
				if (rt.state.burger === null) return;
				rt.state.burger.style.opacity = "0.35";
				if (timer !== null) window.clearTimeout(timer);
				timer = window.setTimeout(() => { if (rt.state.burger !== null) rt.state.burger.style.opacity = ""; }, 800);
			}, { capture: true, passive: true, signal: rt.abort.signal });
		}
		// 残留 HoverCard：卡片外 pointerdown 时隐藏（§2.13）
		function mountHovercardDismiss(rt) {
			document.addEventListener("pointerdown", (event) => {
				if (!isMobileActive()) return;
				const t = event.target;
				if (!isElement(t)) return;
				for (const card of document.querySelectorAll("[data-dshmob-hovercard]")) if (!card.contains(t)) card.style.display = "none";
			}, { capture: true, signal: rt.abort.signal });
		}
		function mountOnboardingDismiss(rt) {
			const tryDismiss = () => {
				if (!isMobileActive()) return false;
				const cont = Array.from(document.querySelectorAll("button")).find((b) => /^(继续|继续使用|开始使用|下一步|知道了)$/.test((b.textContent || "").trim()));
				if (cont === undefined) return false;
				const r = cont.getBoundingClientRect();
				if (r.width === 0 || r.height === 0) return false;
				window.setTimeout(() => cont.click(), 0);
				return true;
			};
			if (tryDismiss()) return;
			let tries = 0;
			const timer = window.setInterval(() => { if (tryDismiss() || ++tries > 40) window.clearInterval(timer); }, 500);
			rt.cleanups.push(() => window.clearInterval(timer));
		}
		/* ==================== 降级提示 / 健康检查 / 激活与停用 ==================== */
		function showDegradedBar(rt) {
			if (rt.state.degradedBar !== null) return;
			const el = document.createElement("div");
			el.className = "dsh-mob-degraded-bar"; el.dataset.dshmobPlugindom = "1"; el.setAttribute("role", "status");
			el.textContent = "移动适配检测到界面结构变化，已安全降级";
			document.body.appendChild(el); rt.state.degradedBar = el;
			window.setTimeout(() => { el.remove(); rt.state.degradedBar = null; }, 6000);
		}
		function reportDegraded(rt, missing) {
			if (rt.state.degradedNotified) return;
			rt.state.degradedNotified = true;
			console.error("dsh-mobile: 关键角色缺失，已安全降级", { missing, url: window.location.href, candidates: nodeSummary(document.body) });
			try { window.dispatchEvent(new CustomEvent("dsh-mobile:degraded", { detail: { missing } })); } catch {}
			showDegradedBar(rt);
		}
		function setMobileEnabled(on) { if (on) document.documentElement.dataset.dshmob = "on"; else delete document.documentElement.dataset.dshmob; }
		function activateMobile(rt) {
			if (rt.state.killed || isMobileActive() || missingKeyRoles().length > 0) return;
			setMobileEnabled(true);
			setBurgerSuppressed(rt, false);
			syncVisualViewport(rt);
			syncDetailsState(rt);
			syncOverlayStack(rt);
			warnLegacyCapabilities(rt);
		}
		// 退出移动断点（§4.6）：清空全部 dsh-mob-* 状态，桌面零残留
		function deactivateMobile(rt) {
			document.body.classList.remove("dsh-mob-open", "dsh-mob-details-open");
			setMobileEnabled(false);
			document.documentElement.removeAttribute("data-dshmob-keyboard"); document.documentElement.removeAttribute("data-dshmob-top-overlay"); document.documentElement.removeAttribute("data-dshmob-burger");
			document.body.style.removeProperty("--dshmob-vv-height"); document.body.style.removeProperty("--dshmob-vv-top"); document.body.style.removeProperty("--dshmob-vv-bottom"); document.body.style.removeProperty("--dshmob-toast-bottom"); anchor = null; if (anchorRestoreTimer !== null) { window.clearTimeout(anchorRestoreTimer); anchorRestoreTimer = null; }
			updateCenterInert(rt, false); restoreOverlayOffsets(rt);
			if (rt.state.burger !== null) rt.state.burger.style.display = "";
			if (rt.state.detailsMask !== null) rt.state.detailsMask.classList.remove("dsh-mob-details-mask-show");
		}
		function onBatchComplete(rt) {
			ensureRoles(false);
			if (!isMobileActive()) {
				// 未激活但移动断点 + 角色齐 → 立即激活（frame 挂载批次即生效，不等健康轮询）
				if (isMobile() && missingKeyRoles().length === 0) activateMobile(rt);
				return;
			}
			const missing = missingKeyRoles();
			if (missing.length > 0) {
				if (Date.now() > rt.state.bootAt + 2000) { if (isMobileActive()) deactivateMobile(rt); reportDegraded(rt, missing); } // 与健康检查路径一致：先撤样式再提示
			} else {
				for (const el of queryVisible(document, '[data-dshmob-overlay="directory"]')) markDirectoryParts(el); syncDirectoryColumns(rt);
				syncDetailsState(rt);
				syncOverlayStack(rt);
				syncSelectedTab(rt);
					clampOpenOverlaysToSafeArea(rt);
				pruneRedundantStopButton(rt);
				watchGenerationEnd(rt);
			}
		}
		function mountHealthCheck(rt) {
			let timer = null;
			const tick = () => {
				if (!isMobile()) return;
				ensureRoles(true);
				if (missingKeyRoles().length > 0) {
					if (Date.now() > rt.state.bootAt + 2000) { if (isMobileActive()) deactivateMobile(rt); reportDegraded(rt, missingKeyRoles()); } // 关键角色失效：先撤样式，安全降级
					return;
				}
				if (!isMobileActive()) activateMobile(rt);
				else { syncVisualViewport(rt); rt.metrics.fullScans += 1; onBatchComplete(rt); } // 轮询兜底：最长 5 秒内自愈任何视口同步遗漏
			};
			const startTimer = () => { if (timer === null) timer = window.setInterval(tick, 5000); };
			const stopTimer = () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
			// 从后台/bfcache 恢复时强制重同步视口（修复"切后台再切回输入框被顶到很上面"）：
			// iOS Safari 冻结期会丢弃 visualViewport resize/scroll 事件，切回后的键盘/地址栏过渡也可能
			// 不再派发事件——--dshmob-vv-* 若停留在旧值，frame 会整体错位（输入框被顶到屏幕上部）。
			// 恢复瞬间 vv 可能仍在过渡，故立即同步 + 400ms 后二次校准；5 秒健康轮询里的同步兜底极端场景。
			const resyncViewport = () => {
				if (!isMobile() || !isMobileActive() || !FEATURES.viewportKeyboard) return;
				syncVisualViewport(rt);
				window.setTimeout(() => { if (!rt.state.killed && isMobileActive()) syncVisualViewport(rt); }, 400);
			};
			document.addEventListener("visibilitychange", () => { document.hidden ? stopTimer() : (resyncViewport(), tick(), startTimer()); }, { signal: rt.abort.signal });
			window.addEventListener("pageshow", resyncViewport, { signal: rt.abort.signal });
			startTimer();
			rt.cleanups.push(stopTimer);
		}
		/* ==================== 诊断接口（§5.8）：严禁返回消息正文/路径/凭据 ==================== */
		function makeDiagnosticsApi(rt) {
			const diagnose = () => ({
				mobile: isMobile(), enabled: isMobileActive(), killed: rt.state.killed,
				roles: Object.fromEntries(Object.entries(roleCache).filter(([, v]) => isElement(v)).map(([k, v]) => [k, nodeSummary(v)])), overlays: queryVisible(document, "[data-dshmob-overlay]").map(nodeSummary),
				touchFailures: auditTouchTargets().length, overlapFailures: auditOverlayConflicts().length, horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth, topOverlay: document.documentElement.dataset.dshmobTopOverlay || "none",
				observerRuns: rt.metrics.observerRuns, fullScans: rt.metrics.fullScans, toastAnnouncements: rt.metrics.toastAnnouncements, longTasks: rt.metrics.longTasks, toastCooldownMs: STATUS_COOLDOWN_MS,
			});
			return {
				version: VERSION, diagnose,
				dumpDiagnostics() { return JSON.stringify(diagnose()); },
				notify(type, message, options = {}) { return showStatusToast(rt, type, message, options.priority === "high"); },
				dispose() { rt.dispose(); },
			};
		}
		/* ==================== 初始化 ==================== */
		function injectCss() {
			if (typeof document === "undefined" || document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mobile"; tag.dataset.pluginCss = TAG_ID; tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		function isKilled() { try { return window.localStorage.getItem(DISABLED_KEY) === "1" || new URL(window.location.href).searchParams.get("dshMobileOff") === "1"; } catch { return false; } }
		function whenBodyReady(callback) {
			if (document.body !== null) { callback(); return; }
			const loop = () => { if (document.body !== null) callback(); else requestAnimationFrame(loop); };
			requestAnimationFrame(loop);
		}
		function start(rt) {
			rt.state.bootAt = Date.now();
			ensureRoles(true);
			whenBodyReady(() => {
				const scheduler = createScheduler(rt);
				rt.cleanups.push(() => scheduler.observer.disconnect());
				[mountDetailsChrome, mountDrawerChrome, mountEdgeSwipeGesture, mountDirectorySync, mountViewportSync, mountFocusSuppressors, mountBurgerScrollFade, mountEscapeHandler, mountStatusChannel, mountLongTaskCounter, mountHovercardDismiss, mountOnboardingDismiss, mountHealthCheck].forEach((fn) => fn(rt));
				installClipboardShim(rt);
				const mq = window.matchMedia(MOBILE_QUERY);
				const onChange = (event) => { if (event.matches) { ensureRoles(true); activateMobile(rt); } else deactivateMobile(rt); };
				if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
				else mq.addListener(onChange);
				rt.cleanups.push(() => { if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onChange); else mq.removeListener(onChange); });
				scheduler.scheduleEnhance(document.body);
				if (isMobile() && missingKeyRoles().length === 0) activateMobile(rt); // 首帧增强 + 角色已就绪立即激活
			});
		}/* ==================== 模型选择器三级分组（厂商 → 中转站 → 模型） ==================== */
		// 分组数据段由 build-model-groups.mjs 生成（model-groups.json → MODEL_GROUPS_DATA）。
		/* ==== dshmob-model-groups-data:begin ==== */
const MODEL_GROUPS_DATA = {"version":1,"fallbackVendor":"其他","groups":[{"vendor":"Claude","relays":[{"relay":"Micu","domain":"www.micuapi.ai","routes":[{"id":"ccs-claude-micu-d8f392093d"}]},{"relay":"My Claude #1","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-my-claude-ed1f5dc52d"}]},{"relay":"My Claude #2","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-my-claude-3f9e5ad789"}]},{"relay":"My Claude #3","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-my-claude-e4c409d573"}]},{"relay":"My Claude #4","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-my-claude-bfe1456f0f"}]},{"relay":"My Claude #5","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-my-claude-cc76973ddd"}]},{"relay":"micuop5","domain":"www.micuapi.ai","routes":[{"id":"ccs-claude-micuop5-b460a557ec"}]},{"relay":"op5","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-op5-31dbf913e2"}]},{"relay":"最贵op5","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-op5-709ee00a1a"}]}]},{"vendor":"Claude Desktop","relays":[{"relay":"c","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-desktop-c-b456bc562e"}]},{"relay":"gugu","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-desktop-gugu-1cfba570be"}]},{"relay":"micuop5","domain":"www.micuapi.ai","routes":[{"id":"ccs-claude-desktop-micuop5-e351d58d28"}]},{"relay":"op5","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-desktop-op5-56cfbcf59f"}]},{"relay":"满血最贵","domain":"api.ggniao.com","routes":[{"id":"ccs-claude-desktop-provider-d300e369f4"}]}]},{"vendor":"Codex","relays":[{"relay":"78code","domain":"www.78code.cc/v1","routes":[{"id":"ccs-codex-78code-110a073623"}]},{"relay":"Micu","domain":"www.micuapi.ai/v1","routes":[{"id":"ccs-codex-micu-ea9aa069b4"}]},{"relay":"Micu copy","domain":"api-slb.micuapi.ai/v1","routes":[{"id":"ccs-codex-micu-copy-cba2e922e1"}]},{"relay":"My Codex copy","domain":"api.ggniao.com/v1","routes":[{"id":"ccs-codex-my-codex-copy-2579fde3ad"}]},{"relay":"grok4.6","domain":"www.micuapi.ai/v1","routes":[{"id":"ccs-codex-grok4.6-a44be38201"}]},{"relay":"pro1","domain":"api.ggniao.com/v1","routes":[{"id":"ccs-codex-pro1-b6c5e835bf"}]},{"relay":"pro2","domain":"api.ggniao.com/v1","routes":[{"id":"ccs-codex-pro2-c840979fc1"}]},{"relay":"xx","domain":"api.ggniao.com/v1","routes":[{"id":"ccs-codex-xx-9c2616dcbd"}]},{"relay":"备用","domain":"api.ggniao.com/v1","routes":[{"id":"ccs-codex-provider-317a0c8d96"}]},{"relay":"牛逼拼车王","domain":"ai.nbcodex.com","routes":[{"id":"ccs-codex-provider-d140cb430f"}]},{"relay":"福利组","domain":"api.ggniao.com/v1","routes":[{"id":"ccs-codex-provider-5f803e8345"}]}]},{"vendor":"Grok Build","relays":[{"relay":"grok micu","domain":"www.micuapi.ai/v1","routes":[{"id":"ccs-grokbuild-grok-micu-80229a5dc8"}]}]},{"vendor":"Hermes","relays":[{"relay":"1","domain":"api.ggniao.com/v1","routes":[{"id":"ccs-hermes-1-f6eeff2e9d"}]},{"relay":"grok45","domain":"api-slb.micuapi.ai/v1","routes":[{"id":"ccs-hermes-grok45-40778e5d90"}]},{"relay":"micuapi","domain":"api-slb.micuapi.ai/v1","routes":[{"id":"ccs-hermes-micuapi-6dc5843f40"}]}]},{"vendor":"OpenClaw","relays":[{"relay":"DeepSeek V4 Pro","domain":"api.deepseek.com","routes":[{"id":"ccs-openclaw-deepseek-v4-pro-a86ab826a8"}]}]}]};
/* ==== dshmob-model-groups-data:end ==== */
		const THINK_PREF_KEY = "dsh:think-default-expanded";
		// route id → 分组元数据（查表，避免每次渲染都遍历分组树）
		// 分组数据运行时 store：初始来自构建期内嵌数据；热更新轮询到新数据后原地替换并通知订阅者。
		function buildRouteIndex(data) {
			const index = {};
			for (const group of data.groups) {
				for (const relay of group.relays) {
					for (const route of relay.routes) {
						index[route.id] = { vendor: group.vendor, relay: relay.relay, domain: relay.domain };
					}
				}
			}
			return index;
		}
		const modelGroupsStore = {
			data: MODEL_GROUPS_DATA,
			routeIndex: buildRouteIndex(MODEL_GROUPS_DATA),
			listeners: new Set()
		};
		function setModelGroupsData(data) {
			modelGroupsStore.data = data;
			modelGroupsStore.routeIndex = buildRouteIndex(data);
			for (const listener of modelGroupsStore.listeners) listener();
		}
		// 热更新：每 5 秒拉取本插件 client.js 并提取分组数据段；数据变化时无需刷新页面。
		function startModelGroupsHotReload(ctx) {
			const tick = async () => {
				try {
					const response = await fetch("/plugins/dsh-mobile/client.js?hot=" + Date.now(), { cache: "no-store" });
					if (!response.ok) return;
					const text = await response.text();
					const match = text.match(/\/\* ==== dshmob-model-groups-data:begin ==== \*\/\s*const MODEL_GROUPS_DATA = (\{[\s\S]*?\});\s*\/\* ==== dshmob-model-groups-data:end ==== \*\//);
					if (match === null) return;
					const data = JSON.parse(match[1]);
					if (JSON.stringify(data) === JSON.stringify(modelGroupsStore.data)) return;
					setModelGroupsData(data);
					console.info("dsh-mobile: 模型分组配置热更新（" + data.groups.length + " 个厂商）");
				} catch (_) {}
			};
			ctx.effect(() => {
				tick();
				const timer = setInterval(tick, 5000);
				return () => clearInterval(timer);
			});
		}
		function readThinkPref() {
			try { return localStorage.getItem(THINK_PREF_KEY) !== "0"; } catch (_) { return true; }
		}
		// 内联 SVG 图标（不依赖 primitives 组件形状，样式随 currentColor）
		function MsChevronDown(props) {
			return react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true, className: props.className },
				react.createElement("path", { d: "M4.5 5.5l2.5 2.5 2.5-2.5", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" }));
		}
		function MsChevronRight() {
			return react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true },
				react.createElement("path", { d: "M5.5 4.5l2.5 2.5-2.5 2.5", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" }));
		}
		function MsCheckIcon() {
			return react.createElement("svg", { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true },
				react.createElement("path", { d: "M3.2 8.6l3 3L12.8 4.8", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }));
		}
		// 把扁平的 provider 组聚合成「厂商 → 中转站 → 模型」；配置外的路由归入 fallbackVendor 兜底。
		function buildVendorTree(groups) {
			const tree = [];
			const vendorIndex = new Map();
			for (const group of groups) {
				const meta = modelGroupsStore.routeIndex[group.id];
				let vendorName;
				let relayName;
				if (meta) {
					vendorName = meta.vendor;
					relayName = meta.relay === null || meta.relay === void 0 ? null : meta.domain ? meta.relay + " · " + meta.domain : meta.relay;
				} else {
					vendorName = modelGroupsStore.data.fallbackVendor;
					relayName = group.name;
				}
				let node = vendorIndex.get(vendorName);
				if (node === void 0) {
					node = { vendor: vendorName, count: 0, relays: [] };
					vendorIndex.set(vendorName, node);
					tree.push(node);
				}
				node.count += group.models.length;
				const key = relayName === null ? "" : relayName;
				let bucket = node.relays.find((entry) => entry.key === key);
				if (bucket === void 0) {
					bucket = { key, relay: relayName, groups: [] };
					node.relays.push(bucket);
				}
				bucket.groups.push(group);
			}
			return tree;
		}
		// composer 模型 seat 的接管组件：完全自渲染（触发器 + 根菜单 + 模型/推理等级面板）。
		function GroupedModelSelect(props) {
			const { locked, available, sessionId, api } = props;
			const [open, setOpen] = react.useState(false);
			const [pane, setPane] = react.useState("root");
			const [busy, setBusy] = react.useState(false);
			const [collapsed, setCollapsed] = react.useState({});
			const [dir, setDir] = react.useState({ status: "idle", groups: [], failures: [], current: null, error: null });
			const rootRef = react.useRef(null);
			const triggerRef = react.useRef(null);

			const load = react.useCallback(() => {
				if (sessionId === void 0) return;
				setDir((prev) => ({ ...prev, status: "loading", error: null }));
				api.sessions.models({ sessionId }).then((res) => {
					// callUnary 返回 { rpcId, result: { ok, value } } 信封，value 才是业务数据
					const value = res && res.result && res.result.ok ? res.result.value : null;
					if (value === null) throw new Error(res && res.result && res.result.error ? res.result.error.message : "模型列表加载失败");
					setDir({ status: "ready", groups: value.groups ?? [], failures: value.failures ?? [], current: value.current ?? null, error: null });
				}).catch((error) => {
					setDir((prev) => ({ ...prev, status: "error", error: String(error && error.message ? error.message : error) }));
				});
			}, [sessionId, api]);

			react.useEffect(() => {
				if (!open) return;
				const onDoc = (event) => {
					if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", onDoc);
				return () => document.removeEventListener("mousedown", onDoc);
			}, [open]);

			const choices = react.useMemo(() => dir.groups.flatMap((group) => group.models.map((model) => ({ group, model }))), [dir.groups]);
			const current = dir.current;
			const currentChoice = choices.find((choice) => choice.group.id === current?.provider && choice.model.id === current.model) ?? null;
			const reasoning = currentChoice?.model.reasoning;
			const effort = current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effort === void 0 ? "Default" : (reasoning.efforts ?? []).find((level) => level.id === effort)?.name ?? effort;
			const modelLabel = currentChoice?.model.name ?? "选择模型";
			const [groupsTick, setGroupsTick] = react.useState(0);
			react.useEffect(() => {
				const listener = () => setGroupsTick((value) => value + 1);
				modelGroupsStore.listeners.add(listener);
				return () => modelGroupsStore.listeners.delete(listener);
			}, []);
			const vendorTree = react.useMemo(() => buildVendorTree(dir.groups), [dir.groups, groupsTick]);

			const show = () => {
				setPane("root");
				setOpen(true);
				load();
			};
			const close = (restore) => {
				setOpen(false);
				setPane("root");
				if (restore) queueMicrotask(() => triggerRef.current?.focus());
			};
			const choose = (group, model) => {
				if (busy) return;
				setBusy(true);
				api.sessions.selectModel({ sessionId, provider: group.id, model: model.id }).then((res) => {
					const value = res && res.result && res.result.ok ? res.result.value : null;
					setBusy(false);
					if (value === null) { setDir((prev) => ({ ...prev, error: res?.result?.error?.message ?? "选择模型失败" })); return; }
					setDir((prev) => ({ ...prev, current: value.selected ?? { provider: group.id, model: model.id } }));
					close(true);
				}).catch((error) => {
					setBusy(false);
					setDir((prev) => ({ ...prev, error: String(error && error.message ? error.message : error) }));
				});
			};
			const chooseEffort = (level) => {
				if (busy || current === null) return;
				if (effort === level) {
					close(true);
					return;
				}
				const selection = { sessionId, provider: current.provider, model: current.model };
				if (level !== void 0) selection.reasoningEffort = level;
				setBusy(true);
				api.sessions.selectModel(selection).then((res) => {
					const value = res && res.result && res.result.ok ? res.result.value : null;
					setBusy(false);
					if (value === null) { setDir((prev) => ({ ...prev, error: res?.result?.error?.message ?? "选择推理等级失败" })); return; }
					setDir((prev) => ({ ...prev, current: value.selected ?? selection }));
					close(true);
				}).catch((error) => {
					setBusy(false);
					setDir((prev) => ({ ...prev, error: String(error && error.message ? error.message : error) }));
				});
			};
			const onKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane !== "root") setPane("root");
					else close(true);
				}
			};
			const effortChoices = reasoning === void 0 ? [] : [
				...(reasoning.defaultEffort === void 0 ? [{ key: "provider-default", effort: void 0, label: "Default" }] : []),
				...(reasoning.efforts ?? []).map((level) => ({ key: "effort:" + level.id, effort: level.id, label: level.name, description: level.description }))
			];

			if (!available) {
				return react.createElement("button", { type: "button", className: "dshmob-ms-trigger", disabled: true },
					react.createElement("span", { className: "dshmob-ms-label" }, modelLabel));
			}

			const triggerLabel = effortLabel === void 0 ? modelLabel : modelLabel + " · " + effortLabel;
			const menu = open ? react.createElement("div", { className: "dshmob-ms-menu", role: "menu", children: [
				pane === "root" ? react.createElement(react.Fragment, null,
					react.createElement("button", { type: "button", className: "dshmob-ms-cell", onClick: () => setPane("model"), children: [
						react.createElement("span", { className: "dshmob-ms-cell-label" }, "模型"),
						react.createElement("span", { className: "dshmob-ms-cell-value" }, modelLabel),
						MsChevronRight()
					] }),
					reasoning !== void 0 ? react.createElement("button", { type: "button", className: "dshmob-ms-cell", onClick: () => setPane("effort"), children: [
						react.createElement("span", { className: "dshmob-ms-cell-label" }, "推理等级"),
						react.createElement("span", { className: "dshmob-ms-cell-value" }, effortLabel),
						MsChevronRight()
					] }) : null
				) : null,
				pane === "model" ? react.createElement(react.Fragment, null,
					dir.status === "loading" ? react.createElement("div", { className: "dshmob-ms-status" }, "正在刷新模型列表…") : null,
					dir.error !== null ? react.createElement("div", { className: "dshmob-ms-error" }, dir.error) : null,
					dir.failures.map((failure) => react.createElement("div", { key: failure.id, className: "dshmob-ms-warning" }, failure.name + " 加载失败：" + failure.message)),
					react.createElement("div", { className: "dshmob-ms-groups" },
						vendorTree.map((vendor) => {
							const isCollapsed = collapsed[vendor.vendor] === true;
							return react.createElement("div", { key: vendor.vendor, className: "dshmob-ms-sect" },
								react.createElement("button", { type: "button", className: "dshmob-ms-vendor", "aria-expanded": !isCollapsed, onClick: () => setCollapsed((prev) => ({ ...prev, [vendor.vendor]: !isCollapsed })), children: [
									react.createElement("span", null, vendor.vendor),
									react.createElement("span", { className: "dshmob-ms-count" }, String(vendor.count)),
									react.createElement("span", { className: isCollapsed ? "dshmob-ms-vchev dshmob-ms-vchev-collapsed" : "dshmob-ms-vchev" }, MsChevronDown({}))
								] }),
								!isCollapsed ? vendor.relays.map((bucket) => react.createElement(react.Fragment, { key: bucket.key },
									bucket.relay !== null ? react.createElement("div", { className: "dshmob-ms-relay" }, bucket.relay) : null,
									bucket.groups.map((group) => group.models.map((model) => {
										const selected = current?.provider === group.id && current.model === model.id;
										return react.createElement("button", { key: group.id + "/" + model.id, type: "button", role: "menuitemradio", "aria-checked": selected, className: "dshmob-ms-option", title: model.name, disabled: busy, onClick: () => choose(group, model), children: [
											react.createElement("span", { className: "dshmob-ms-ocopy" },
												react.createElement("span", { className: "dshmob-ms-mname" }, model.name),
												model.description !== void 0 ? react.createElement("span", { className: "dshmob-ms-mdesc" }, model.description) : null),
											react.createElement("span", { className: "dshmob-ms-check" }, selected ? MsCheckIcon() : null)
										] });
									}))
								)) : null
							);
						})),
					dir.status === "ready" && choices.length === 0 ? react.createElement("div", { className: "dshmob-ms-empty" }, "没有可用的模型。") : null
				) : null,
				pane === "effort" ? react.createElement(react.Fragment, null,
					effortChoices.length === 0 ? react.createElement("div", { className: "dshmob-ms-empty" }, "当前模型未提供推理等级。") :
					effortChoices.map((level) => react.createElement("button", { key: level.key, type: "button", role: "menuitemradio", "aria-checked": effort === level.effort, className: "dshmob-ms-option", disabled: busy, onClick: () => chooseEffort(level.effort), children: [
						react.createElement("span", { className: "dshmob-ms-ocopy" },
							react.createElement("span", { className: "dshmob-ms-mname" }, level.label),
							level.description !== void 0 ? react.createElement("span", { className: "dshmob-ms-mdesc" }, level.description) : null),
						react.createElement("span", { className: "dshmob-ms-check" }, effort === level.effort ? MsCheckIcon() : null)
					] }))
				) : null
			] }) : null;

			return react.createElement("div", { ref: rootRef, className: "dshmob-ms-root", onKeyDown },
				react.createElement("button", { ref: triggerRef, type: "button", className: "dshmob-ms-trigger", title: triggerLabel, disabled: locked, "aria-haspopup": "menu", "aria-expanded": open, onClick: () => {
					if (open) close();
					else show();
				}, children: [
					react.createElement("span", { className: "dshmob-ms-label" }, modelLabel),
					effortLabel !== void 0 ? react.createElement("span", { className: "dshmob-ms-effort" }, effortLabel) : null,
					react.createElement("span", { className: open ? "dshmob-ms-chevron dshmob-ms-chevron-open" : "dshmob-ms-chevron" }, MsChevronDown({}))
				] }),
				menu
			);
		}
		// 模型菜单样式（复用 DSH 主题 token，类名独立前缀 dshmob-ms*）
		function injectModelGroupsCss() {
			if (document.querySelector("style[data-dshmob-modelgroups]")) return;
			const css = [
				".dshmob-ms-root{min-width:0;position:relative}",
				".dshmob-ms-trigger{min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}",
				".dshmob-ms-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
				".dshmob-ms-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}",
				".dshmob-ms-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
				".dshmob-ms-effort{color:var(--dsw-alias-label-caption);flex:none}",
				".dshmob-ms-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s;display:inline-flex}",
				".dshmob-ms-chevron-open{transform:rotate(180deg)}",
				".dshmob-ms-menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:max-content;min-width:min(260px,100vw - 32px);max-width:min(440px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}",
				".dshmob-ms-status,.dshmob-ms-empty{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}",
				".dshmob-ms-error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;padding:7px 8px;font-size:12px;line-height:18px}",
				".dshmob-ms-warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label);border-radius:8px;padding:7px 8px;font-size:12px;line-height:18px}",
				".dshmob-ms-groups{min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-x:contain}",
				".dshmob-ms-sect{margin-top:4px;min-width:0}",
				".dshmob-ms-vendor{box-sizing:border-box;width:100%;border:none;text-align:left;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);border-radius:8px;cursor:pointer;align-items:center;gap:6px;padding:5px 8px 3px;font-size:12px;font-weight:500;line-height:18px;display:flex;position:sticky;top:0;z-index:1}",
				".dshmob-ms-vendor:hover{background:var(--dsw-alias-interactive-bg-hover)}",
				".dshmob-ms-count{color:var(--dsw-alias-label-caption);font-weight:400;margin-left:auto;flex:none}",
				".dshmob-ms-vchev{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s;display:inline-flex}",
				".dshmob-ms-vchev-collapsed{transform:rotate(-90deg)}",
				".dshmob-ms-relay{color:var(--dsw-alias-label-tertiary);padding:4px 8px 0;font-size:12px;font-weight:400;line-height:18px;min-width:0;overflow-wrap:anywhere}",
				".dshmob-ms-option{box-sizing:border-box;width:100%;min-width:0;min-height:38px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:10px;outline:none;align-items:center;gap:8px;padding:6px 8px;display:flex}",
				".dshmob-ms-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
				".dshmob-ms-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}",
				".dshmob-ms-ocopy{flex-direction:column;flex:1;min-width:0;display:flex}",
				".dshmob-ms-mname{text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:20px;overflow:hidden}",
				".dshmob-ms-mdesc{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}",
				".dshmob-ms-check{color:var(--dsw-alias-label-primary);flex:0 0 18px;place-items:center;display:grid}",
				".dshmob-ms-cell{box-sizing:border-box;width:100%;min-width:240px;height:40px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:10px;align-items:center;gap:8px;padding:0 10px;font-size:14px;line-height:22px;display:flex}",
				".dshmob-ms-cell:hover{background:var(--dsw-alias-interactive-bg-hover)}",
				".dshmob-ms-cell-label{white-space:nowrap;flex:none}",
				".dshmob-ms-cell-value{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;overflow:hidden}",
				".dshmob-ms-cell-chevron{color:var(--dsw-alias-label-tertiary);flex:none}"
			].join("");
			const tag = document.createElement("style");
			tag.dataset.dshmobModelgroups = "1";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		/* ==================== Think 默认展开设置 ==================== */
		// 设置 → 通用 里的一行偏好：写入 localStorage，供 ReasoningRow 补丁读取。
		function ThinkDefaultSettingRow() {
			const [on, setOn] = react.useState(readThinkPref);
			const toggle = () => {
				setOn((value) => {
					const next = !value;
					try { localStorage.setItem(THINK_PREF_KEY, next ? "1" : "0"); } catch (_) {}
					return next;
				});
			};
			return react.createElement("div", { className: "dshmob-setrow" },
				react.createElement("div", { className: "dshmob-setcopy" },
					react.createElement("div", { className: "dshmob-setlabel" }, "思考过程默认展开"),
					react.createElement("div", { className: "dshmob-setdesc" }, "新消息的 Think 块默认展开（开）或收起（关）；单条消息仍可点击标题切换。")
				),
				react.createElement("button", { type: "button", role: "switch", "aria-checked": on, "aria-label": "思考过程默认展开", className: on ? "dshmob-switch dshmob-switch-on" : "dshmob-switch", onClick: toggle })
			);
		}
		function injectThinkSettingCss() {
			if (document.querySelector("style[data-dshmob-thinksetting]")) return;
			const css = [
				".dshmob-setrow{align-items:center;gap:12px;padding:12px 16px;display:flex;border-bottom:1px solid var(--dsw-alias-border-l2)}",
				".dshmob-setcopy{flex-direction:column;gap:2px;flex:1;min-width:0;display:flex}",
				".dshmob-setlabel{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}",
				".dshmob-setdesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
				".dshmob-switch{box-sizing:border-box;width:36px;height:20px;border-radius:999px;border:none;cursor:pointer;background:var(--dsw-alias-interactive-bg-hover);position:relative;flex:none;padding:0;transition:background .15s}",
				".dshmob-switch-on{background:var(--dsw-alias-state-success-primary)}",
				".dshmob-switch::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .15s}",
				".dshmob-switch-on::after{transform:translateX(16px)}"
			].join("");
			const tag = document.createElement("style");
			tag.dataset.dshmobThinksetting = "1";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		// 注册：composer 模型 seat（single seat 的动态注册条目会胜出内置 ModelSelect）+ 设置页通用行。
		function mountModelGroupSelect(ctx) {
			const slots = ctx.get("slots");
			const connection = ctx.get("connection");
			if (slots === void 0 || connection === void 0 || connection.api === void 0) {
				console.warn("dsh-mobile: 模型分组选择器跳过（slots/connection 服务不可用）");
				return;
			}
			const api = connection.api;
			slots.inject("conversation.input.model", () => slots.register({
				name: "conversation.input.model",
				priority: -1, // 内置 ModelSelect 注册在 priority 0；single slot 按 priority 升序取最低者渲染，-1 稳定覆盖且同档位唯一
				inject: (sessionId) => {
					if (sessionId === void 0) return { available: false, sessionId: void 0, api };
					return { available: true, sessionId, api };
				}
			}, GroupedModelSelect));
		}
		function mountThinkSetting(ctx) {
			const slots = ctx.get("slots");
			if (slots === void 0) return;
			slots.inject("settings.general.item", () => slots.register({
				name: "settings.general.item",
				id: "dshmob-think-default",
				order: 60
			}, ThinkDefaultSettingRow));
		}
		function mountModelGroupsExtras(ctx) {
			if (typeof document === "undefined") return;
			injectModelGroupsCss();
			injectThinkSettingCss();
			// 每个模块独立隔离：模型分组注册失败绝不能拖垮 Think 设置等其余模块
			// （历史事故：conversation.input.model 与内置注册同 priority 冲突抛异常，导致 Think 行从未注册）
			try { mountModelGroupSelect(ctx); } catch (error) { console.error("dsh-mobile: 模型分组选择器初始化失败", error); }
			try { mountThinkSetting(ctx); } catch (error) { console.error("dsh-mobile: Think 设置初始化失败", error); }
			startModelGroupsHotReload(ctx);
		}

		/* ==================== 插件主体 ==================== */
		const inject = [];
		// 入口：注入样式并启动。任何失败只记日志不抛出——UI 插件故障不应拖垮 GUI boot。
		function apply(ctx) {
			try {
				if (typeof document === "undefined") return;
				const rt = createRuntime();
				if (isKilled()) {
					// 停用模式也暴露诊断 API（killed=true），便于排查"为什么没有适配"
					console.info("dsh-mobile: 已停用（localStorage \"" + DISABLED_KEY + "\"=1 或 URL ?dshMobileOff=1），跳过注入");
					rt.state.killed = true;
					window.__DSH_MOBILE__ = makeDiagnosticsApi(rt);
					return;
				}
				window.__DSH_MOBILE__ = makeDiagnosticsApi(rt);
				injectCss(); start(rt);
			} catch (error) {
				console.error("dsh-mobile: 初始化失败", error);
			}
		// 新增：模型分组选择器 + Think 设置（独立捕获，失败不影响既有移动端适配）
		try {
			mountModelGroupsExtras(ctx);
		} catch (error) {
			console.error("dsh-mobile: 模型分组/Think 设置初始化失败", error);
		}
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
