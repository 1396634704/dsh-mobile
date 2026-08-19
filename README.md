# dsh-mobile

DeepSeek Harness Web GUI 移动端适配插件（纯 client 面，v3.3）。让桌面优先的 DSH 界面在手机浏览器（≤768px 窄屏）上可用。实现依据：`docs/dsh-web-mobile-ux-design.md`（Codex 设计文档，2026-08-16）。

## 功能

- **运行时角色解析（v3 架构）**：hash 类名只作快速路径，JS 做结构校验 + 语义兜底，把 `frame/sidebar/center/details/composer/…` 等角色解析为稳定的 `data-dshmob-role` 标记，正式样式只消费标记；关键角色缺失时**安全降级**（撤样式 + 顶部提示条 + `dsh-mobile:degraded` 事件），绝不隐藏主聊天区。
- **右侧详情抽屉（P0 功能修复）**：手机默认隐藏详情列，点工具行 Inspect 后以底部抽屉显示（React `data-details-collapsed` 状态驱动），可滚动、可关闭、遮罩点击关闭——Inspect 不再是空操作。
- 三栏锁单栏；侧栏 off-canvas 抽屉（左边缘右滑 / 可拖动 ☰ 按钮 44×44）；开抽屉收键盘；切换会话不弹键盘；抽屉内浏览操作不误关。
- **v3.3 真机痛点**：超长模型名不再把发送按钮挤出屏幕（芯片上限 `min(38vw,136px)`，390/320 均锁发送键在视口内）；会话顶栏收成一行（约 53px，隐藏 Session log / 后台任务文案）；空态输入卡沉底；Think/工具行与侧栏三点为 44px。
- **统一浮层栈**：modal、lightbox、settings、directory、详情、余额和侧栏按优先级互斥；menu/listbox/popover 保留 DSH 原生锚点，并自动限制在 `visualViewport` 与 safe-area 内；审批卡、用户问题卡、目录选择器、插件管理和预设管理均做窄屏适配。
- **键盘与视口**：`visualViewport` 同步（`--dshmob-vv-*` 变量 + `data-dshmob-keyboard`），输入栏 44px 触控目标、可换行，输入框最大高度随键盘/横屏收缩；视口变化时滚动锚定（贴底继续贴底、读历史不跳底）；**切后台再切回时强制重同步视口**（iOS 冻结期会丢弃 visualViewport 事件，恢复时立即校准 + 400ms 二次校准 + 5 秒轮询兜底，修复输入框被顶到屏幕上部的问题）。
- **Tooltip 全路径关闭**（`[role=tooltip]`/`span[data-side]`/`[data-tip]::after`/残留 HoverCard）+ Inspect 按钮常显（不再依赖 hover）。
- **P1 窄屏内容**：长 URL/路径自动断行；代码块、20 列表格、终端、diff、JSON 只在内容块内横滚；附件横向滚动；插件/模型/Agent 预设卡片单列，搜索框不低于 16px，保存 footer 保持可达。
- **P1 导航与可访问性**：选中 tab 自动滚入可视区；拖动汉堡后 header 动态释放左侧留白；侧栏/详情关闭后焦点回到汉堡或 Inspect 触发按钮，Escape 按 menu → details → sidebar 的优先级关闭。
- 停止按钮去重（v4 位置规则，迁入统一 MutationObserver，无闪现无误杀）；插件通用状态 toast 支持 `type+message` 10 秒去重、主浮层位置避让与 `aria-live`，并反馈浏览器离线/恢复。可调用 `window.__DSH_MOBILE__.notify(type, message)`，或派发 `dsh-mobile:status` 事件；不接管 DSH 业务状态。
- 局域网 HTTP（非安全上下文）剪贴板兜底。
- 浅色/深色均复用 DSH `--dsw-*` token；`prefers-reduced-motion: reduce` 时插件动画与平滑滚动降至近零。
- 统一的 `MutationObserver` + RAF 批处理 + 5 秒低频健康检查（页面隐藏时暂停）；可 `dispose()` 的运行时，重复加载不叠加行为。
- **开关**：`localStorage["dsh-mobile:disabled"]="1"` 整体停用；URL `?dshMobileOff=1` 临时安全模式；`FEATURES` 对象可按模块关闭（刷新生效）。
- **诊断**：`window.__DSH_MOBILE__.diagnose()` 返回角色命中、浮层、触控失败数、重叠冲突、横向溢出、观察器计数（不含任何消息/路径/凭据正文）。

## 安装

```bash
git clone https://github.com/1396634704/dsh-mobile.git
cd dsh-mobile
./install.sh                # 默认装到 ~/.dsh 的 web profile
./install.sh <DSH_HOME> <profile>   # 指定位置
```

安装后**首次**需重启 dsh web（boot graph 变更）；之后改 client.js 只需浏览器刷新。

## 验证与部署

```bash
node deploy.mjs              # 一键「测试 + 部署」：静态自检 → 备份 → 部署检查 → 完整 CDP 测试 → 线上 bundle 验证
node verify-mobile.mjs       # 完整 CDP 矩阵 + P1A-P1D
CASES=M2,M4,B2,D1,K4,P1A,P1B,P1C,P1D node verify-mobile.mjs   # P1 指定回归集
```

`deploy.mjs` 全流程：① 语法检查 + CSS 括号配平 + ≤1000 行约定 + package.json exports 完整性；② 备份当前 client.js（保留最近 5 份 `client.js.bak-<时间戳>`）；③ 部署检查——web profile 里 `node_modules/dsh-mobile` 是 symlink 指向源目录则改动已实时生效，否则自动跑 `install.sh` 幂等拷贝并校验 cordis.patch.yml 登记；④ 自动跑完整 CDP 矩阵；⑤ curl 对比 3080 端口实际下发的 bundle 与本地文件一致。**全程不重启 dsh web**（本插件是纯 client 面静态挂载，文件改动刷新即生效；只有新增/移除登记才需重启）。

脚本自动启动 headless Chrome（`--headless=new --touch-events=enabled`），除基线矩阵外，P1A-P1D 会验证深色媒体和对比度、reduced-motion、inert/ARIA/Escape/焦点恢复、长内容局部横滚、附件、设置卡片、tabs 自动跟随及 toast 去重。截图存 `artifacts/verify-<时间戳>/`。局域网 clipboard 的非安全上下文分支采用代码审查断言；loopback 在 Chromium 中属于安全上下文。

## 卸载

```bash
node uninstall.mjs                    # 默认位置
node uninstall.mjs <DSH_HOME> <profile>
```

## 工作原理与坑（重要）

- 插件通过 `cordis.patch.yml` 静态挂载（`- insert: - id: dsh-mobile`），**不在 DSH 设置页插件清单里**（清单只管理动态插件系统安装的包）。
- **所有移动样式限定在 `@media (max-width:768px)` + `html[data-dshmob="on"]` 双作用域内**：角色解析失败时整个样式层不生效（安全降级），桌面（>768px）零命中。
- hash 类名只作快速路径且必须通过结构校验；DSH 升级后类名变化由语义兜底接管，最坏情况是安全降级提示，不会静默坏布局。
- **侧栏抽屉禁用 transform**（用 `left` 位移 + transition）：祖先带 transform 会让内部 `position:fixed`（如余额面板 `.dsb_panel`）退化为相对该祖先定位，被推到屏幕外。
- 汉堡按钮位置按视口百分比存 localStorage（键 `dsh-mobile:burgerPos:v2`）。
- 点击委托中**程序化点击 React 组件必须延迟到下一事件循环**（`setTimeout(0)`），否则 React 重渲染会挤掉冒泡途中的合成事件。
- 详情抽屉由 React 的 `frame[data-details-collapsed]` 属性驱动（列入统一 observer 的 attributeFilter），避免与点击时序竞争。
- 客户端模块加载器不支持插件内多文件 `require`，client.js 保持单文件（≤1000 行）。

## 兼容性

- 断点：`@media (max-width: 768px)`；桌面（>768px）完全不受影响。
- 已知适用：DSH 0.1.0-rc.6（本仓库开发环境）；升级后观察降级提示条与 `__DSH_MOBILE__.diagnose()`。
