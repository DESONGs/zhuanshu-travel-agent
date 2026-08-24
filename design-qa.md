# Travel Agent Agent-assisted Trip Workspace 设计 QA

## 比较目标与证据

- Source visual truth：`/Users/chenge/.codex/generated_images/019ff53b-3cb5-73e2-93de-a9a7b49dfb2c/exec-9f581ce0-80bd-4267-8b0a-7a8f4bb2e3bb.png`，1487×1058。它是已确认 Quiet Map Canvas 方向的视觉基准。
- Supporting interaction reference：`/private/tmp/trek-trip-planner.png`，2505×1959。只用于候选池、地图底座和按天计划的空间关系，不复制品牌、页签或代码。
- Rendered desktop implementation：`/private/tmp/travel-agent-map-workspace-qa/04-desktop-trip-finalstate.jpg`，1280×720，CSS viewport 1280×720，device scale factor 1。
- Rendered mobile implementation：`/private/tmp/travel-agent-map-workspace-qa/05-mobile-trip.jpg` 与 `06-mobile-today.jpg`，390×844，device scale factor 1。
- Candidate drawer：`/private/tmp/travel-agent-map-workspace-qa/08-mobile-candidate-drawer.jpg`，390×844。
- Full-view comparison：`/private/tmp/travel-agent-map-workspace-qa/09-desktop-comparison.png`，2308×720。Source 等比缩放至 1012×720，与 1280×720 implementation 横向并排；没有裁切 implementation。
- State：上海四日旅行已有住宿与游玩地点，但时间、餐饮、城际交通、城市路线和外宾住宿资格仍不完整；因此 implementation 有意显示“路线骨架”而非虚构 Day Timeline。

## 主要交互与运行验证

- 桌面：永久 Session 栏已移除；`我的行程` 打开 Trips drawer；Agent Rail 保留可折叠与键盘可调宽度。
- 准备信息：默认压成一条“出发前还差 N 项”；展开后仍可执行“我已准备 / 需要帮助 / 官方入口 / 登录保存”。
- 已确认路线：地点列表和 sticky map 并排，共享地图焦点；当前没有可靠时间，因此明确显示路线骨架。
- 待确认候选：新住宿候选不会覆盖已确认路线，只显示候选提示条；打开后进入独立 Candidate Pool drawer。
- 移动端：390×844 下保持 Chat / Trip / Map 三入口；Trip 首屏先显示准备摘要、Today 入口、路线骨架和地图；Map 显示 Today。
- Trips drawer、Readiness 展开、Candidate Pool 打开/关闭、Chat/Trip/Map 切换均完成真实浏览器点击。
- 浏览器 console `error` 为 0。
- 地图由静态 import 改为 lazy chunk；首屏 JS 从约 573KB 降为 412.56KB，地图 chunk 161.69KB，构建不再出现 500KB chunk warning。

## Required fidelity surfaces

### Fonts and typography

- 结果：通过。
- UI 继续使用现有 Noto Sans SC/system sans；目的地、路线骨架、准备摘要和地点标题建立清楚的 32/21/15/11px 层级。
- 没有把工程状态或内部 Schema 暴露为界面文案。
- Source 中有伪精确的日期时间轴；implementation 因合同未成立而使用“路线骨架”，属于正确的产品约束差异。

### Spacing and layout rhythm

- 结果：通过。
- 桌面从永久 Session + Chat + Canvas 改为 Chat + Workspace；右侧工作区获得稳定宽度。
- Readiness 从多卡片改为 64px 摘要；Supporting tools 移到路线/地图之后，1280×720 下 map 从首屏外上移至 y≈450。
- 地点列表与地图采用 56/44 双列；1180px 以下地图置顶，900px 以下进入移动结构。
- 卡片取消宽软阴影和多层嵌套；地点列表改为同一表面上的连续行。

### Colors and visual tokens

- 结果：通过。
- 珊瑚色只用于主动作、候选更新与地点；绿色只用于已核验/选中；琥珀色用于准备和风险。
- 主工作区使用真实中性白/灰，不使用 AI 紫、玻璃拟态或装饰渐变。
- Candidate drawer 使用暗色半透明 backdrop，但内容表面保持白色，状态清楚。

### Image quality and asset fidelity

- 结果：通过。
- 地点使用 Provider 返回的真实照片；没有用通用上海风景图替代缺失地点图。
- 地图使用现有 Leaflet/OSM 开发底图和真实坐标；生产导航边界继续明确为高德。
- 功能图标继续使用项目既有 Phosphor icon system，没有新增手工 SVG、CSS 插画或 emoji 占位。

### Copy and content

- 结果：通过。
- 新增“候选池、路线骨架、已确认保持不变、出发前还差 N 项”等用户状态语言。
- Pending proposal 不再替换 confirmed plan；文案明确只有用户选择后才替换。
- 城市路线、餐饮、外宾资格和房态仍保持待核验，没有被视觉升级隐藏。

## Comparison history

### Pass 1

- [P1] 准备卡、下一步、预算/天气和四域状态叠加后，1280×720 的地图在 y≈598 才出现，旅行主体仍被系统模块推到首屏底部。
- [P1] Pending proposal 会替换整个已确认方案视图，用户看不到原路线，容易误以为 Agent 已经改动旅行。
- [P2] 移动 Trips drawer 受旧全局 `.conversation-picker { display:none }` 影响，只显示空白抽屉与关闭按钮。
- [P2] Leaflet 静态进入主 bundle，首屏 JS 约 573KB，并触发 Vite 大 chunk warning。

### Fix

- 将 PlanNextStep 和 planning context 移到路线/地图之后；Readiness 继续保持顶端摘要。
- 有已确认地点时继续展示路线骨架；pending proposal 仅显示更新提示条，并通过 Candidate Pool drawer 比较。
- 显式恢复 `.history-drawer .conversation-picker { display:flex }`。
- 使用 `React.lazy + Suspense` 按需加载 `trip-map-explorer.jsx`。
- 移动 domain coverage 隐藏滚动条但保留触控横向滚动。

### Pass 2

- 1280×720 桌面 map 上移至 y≈450，旅行地点和地图在一个视口内可见。
- 已确认路线在 pending proposal 存在时保持可见；候选池 drawer 真实打开并显示三家酒店、来源、价格、未知项和地图。
- 390×844 移动 Trip/Today 无横向溢出，Trips drawer 和准备清单可操作。
- 最终构建拆成 412.56KB 主 chunk + 161.69KB map chunk，无大 chunk warning。
- 未发现新的 P0/P1/P2。

## Follow-up polish

- P3：当前浏览器验收桌面证据为 1280×720；仍需在 Windows 125%/150% 缩放和宽折叠屏上目测字体与 sticky map。
- P3：Production map 仍需要高德账户恢复及合规互动底图；本轮只证明工作台布局和开发底图。
- P3：Today Offline Pack、Capacitor 真机原生能力和微信/支付宝真机地图属于后续技术里程碑，不是本轮视觉完成证据。

final result: passed

## 2026-08-24 原生多模态 Agent turn

- 桌面与 390×844 移动视口均完成“选择图片 → 本地预览 → 补充自然语言 → 图文一起发送 → Agent 回答”的真实浏览器操作；图片可移除，移除后发送按钮和普通隐私提示正确恢复。
- 会话只保留“包含一张临时旅行图片 · 原图未保存”，持久化记录中没有 Base64 图片数据；输入区明确提示不要上传证件、支付信息或联系方式。
- Kimi K2.6 与 DeepSeek V4 Flash Vision Exp 均真实识别项目公开图标中的定位针、路线和终点图形。
- DeepSeek Vision 的真实旅行黄金路径使用公开水岸氛围图与自然语言请求，在同一轮完成图片理解、`save_trip_understanding`、`research_trip_options`，建立上海 3 天旅行并在方案区返回 3 个游玩、3 个住宿候选和地图；吃、行继续诚实显示待研究。
- `npm run smoke:models` 在当前 DeepSeek Key 下返回 `deepseek: passed_live_smoke` 与 `visionAgent: passed_live_smoke`；测试图片为 1×1 透明 PNG，不包含用户数据。
- `npm run check`：118 项测试通过，TypeScript、Web production build、微信/支付宝原生小程序合同全部通过。

残余边界：DeepSeek Vision 仍是实验模型；当前 Web 入口完成，微信/支付宝原生图片选择与真机上传尚未验收；服务端统一图片旋转、缩放和格式归一仍未实现，因此当前继续限制为单张不超过 3MB 的 JPEG、PNG 或 WebP。

## 2026-08-24 前端人体工学保留式重设计

Design Read：面向国内与入境自由行者的产品级旅行工作台，保持安静、可信、地图优先。`DESIGN_VARIANCE 5 / MOTION_INTENSITY 3 / VISUAL_DENSITY 5`。沿用 React、native CSS 与 Phosphor，不新增 UI 框架或动效依赖。

- 首次使用：Chat 侧只负责表达需求，Trip 侧用真实旅行图片说明地图、取舍和确认结果，移除左右两套重复 onboarding、大号 Serif 标题、四格功能卡和玻璃面板。
- 生成反馈：提交后 Trip 侧显示与最终地图和候选列表同构的骨架，不再停留在静态产品介绍；骨架只使用 opacity 状态动画，并支持 `prefers-reduced-motion`。
- 字体与可读性：移除 Google Fonts 网络请求和 DM Serif，改用系统 Sans；关键路线、证据、设施、价格与操作信息保持至少 11px，正文保持 13-15px。
- 输入人体工学：输入框增加可见 label 和键盘提示；移动端图片、链接、语音和发送控件扩大到约 42px，导航及关键补充动作提高到约 44px；图片预览和敏感信息提示保持完整。
- 地图方案：保留地图主视图和单一“比较候选”动作；重复打开同一候选池的决策卡改为只读取舍摘要，减少重复 CTA。
- 候选抽屉：移动端压缩标题、来源和筛选区域，候选地图高度降为 220px，第一张真实候选进入首屏；固定确认栏保持可见，未完成选择时不会误提交。
- 登录入口：桌面登录弹层改为居中工作面，关闭按钮与内容处于同一视觉边界；390x844 下使用完整可滚动授权面板。Google、微信、支付宝在没有平台凭据时显示“待开放”，本地开发身份明确标注且不冒充第三方账号。
- 响应式：真实浏览器复核 1280px、1024px 与 390x844；无页面横向溢出，移动 Chat / Trip / Map、图片预览、候选切换和跨域选择均可操作。
- 运行证据：新标签页 console error 为 0；`npm run check` 通过 118 项测试、TypeScript、Web production build 和微信/支付宝小程序合同。正文、次要文字与 placeholder 对比度分别为 17.61:1、6.38:1、5.26:1，主要按钮白字与深珊瑚背景为 4.80:1。主 JS 保持约 412.16KB，地图继续懒加载；主 CSS gzip 约 23.74KB，且移除了外部字体请求。

仍需设备验收：Windows 125%/150% 缩放、宽折叠屏、iOS/Android Capacitor 真机和微信/支付宝真机。当前设计明确锁定高对比浅色主题；如果新增深色主题，必须连同地图瓦片、地点图片与全端安全区域单独验收。
