# TREK 技术栈审计与 Travel Agent 全平台方案选项

> 日期：2026-08-20
> 范围：核实 TREK 的客户端、桌面/移动形态、PWA、后端、数据库、实时协作、离线同步、地图和部署；对照当前 Travel Agent，给出技术方案选项。
> 上游固定版本：[`liketrek/TREK@e60427f813dc35f688d5d9169b79ac8c43974719`](https://github.com/liketrek/TREK/tree/e60427f813dc35f688d5d9169b79ac8c43974719)，`package.json` 版本为 `3.4.1`。
> 状态：技术调研已完成；用户已确认第一阶段采用方案 A：React Web Core + PWA + Capacitor + 轻量原生小程序。Tauri/Taro 继续作为条件触发的后续选项。

## Executive Summary

TREK 没有独立 Electron、Tauri、Flutter、React Native、Capacitor 或微信/支付宝小程序客户端。它的“桌面端”就是一套 React 19 + Vite + Tailwind 的响应式 Web/PWA，在 Windows、macOS、Linux 浏览器或安装后的 PWA 中运行。移动端也是同一 PWA，通过响应式页面、Bottom Nav、安全区和触控适配工作，不是原生 App。

TREK 后端是 Node.js 24 上的 NestJS 11，使用 Express Adapter 提供 REST、静态 Web、OAuth/MCP 和 WebSocket；数据存储是 `better-sqlite3`，启用 WAL。前后端通过独立 `shared` workspace 的 Zod Schema 共享合同。实时协作使用 `ws` 按 trip room 广播；PWA 离线使用 `vite-plugin-pwa`/Workbox、Dexie IndexedDB、按用户隔离数据库、Mutation Queue、幂等键、409 冲突分支和地图切片预下载。

TREK 的离线实现值得深入借鉴：Service Worker 明确不缓存带 HttpOnly Cookie 的 API 响应，避免共享设备跨用户泄漏；结构化旅行数据进入按用户命名的 IndexedDB，离线写入排队，恢复网络后以幂等键重放，冲突让用户选择 mine/theirs。它不是“加一个 manifest 就算 PWA”。

当前 Travel Agent 已经有 React/Vite Web、Capacitor iOS/Android 工程、微信/支付宝原生小程序工程、Pi/Node API、PostgreSQL、共享 TypeBox 合同和 MCP。全面切换 Flutter、Tauri Mobile 或 TREK 技术栈会浪费已有基础。最稳妥的候选方向是：

1. 继续以 React Web Core 为产品主界面；
2. 把当前仅缓存 App Shell 的 PWA 升级为安全的 `Today Offline Pack`；
3. iOS/Android 继续使用 Capacitor，补真实原生能力与设备 QA；
4. 微信/支付宝保持轻量原生，若功能扩展到多页面再评估独立 Taro 客户端；
5. macOS/Windows 首先使用 PWA，只有真实需要系统托盘、自动更新、文件协议或商店分发时再增加 Tauri 2 桌面壳；
6. 后端保留 Pi + Node/Express + PostgreSQL，不为框架一致性迁移 NestJS/SQLite。

## TREK 技术栈：已核实事实

### Monorepo 与合同

TREK 是 npm workspaces monorepo：

```text
root
├── client   React/Vite PWA
├── server   NestJS/Node API
└── shared   Zod API contracts + i18n
```

`shared` 使用 Zod 4，构建 ESM/CJS 和类型声明，是 client/server 的单一合同源。[根 package.json](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/package.json)、[shared package](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/shared/package.json)

这与 Travel Agent 使用 TypeBox Schema + `Static` 类型驱动 Runtime、HTTP、MCP 和 JSON Schema 的方向等价，不构成切换 Zod 的理由。

### 前端

| 层级 | TREK 实现 |
| --- | --- |
| UI | React 19.2、React Router 6 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 3.4 + 自定义 CSS |
| 状态 | Zustand 4，按领域 slices 拆分 |
| API | Axios + repo 层 |
| 合同 | Zod 4 + `@trek/shared` |
| 地图 | Leaflet/React-Leaflet、Mapbox GL、MapLibre GL、marker clustering |
| 图标/字体 | Lucide、Poppins、Geist Sans，字体同源打包 |
| 大列表 | `react-window` |
| PDF | `@react-pdf/renderer` |
| 测试 | Vitest、Testing Library、Playwright、截图回归 |

来源：[client/package.json](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/client/package.json)

### 桌面、移动和小程序形态

对固定提交做代码搜索后：

- 没有 Tauri 依赖或目录；
- 没有 Electron 依赖，`electron` 命中来自 `electronics` 打包分类等普通文本；
- 没有 React Native；
- 没有 Flutter，唯一命中是示例插件名称；
- 没有微信、支付宝或 mini-program 工程；
- `Capacitor` 只在商标说明中出现，不是运行依赖。

所以 TREK 的桌面和移动交付准确表述为 **响应式 Web + 可安装 PWA**，不是桌面原生框架或小程序方案。

### PWA 与离线

TREK 使用 `vite-plugin-pwa` 自动更新 Service Worker。Workbox 负责：

- 预缓存 JS、CSS、HTML、SVG、字体和图片；
- 缓存 Carto/OSM raster tiles；
- best-effort 缓存 Mapbox/OpenFreeMap vector resources；
- API 固定 `NetworkOnly`，避免 HttpOnly Session Cookie 下发生跨用户缓存泄漏；
- 上传内容只缓存公开 cover/avatar，不缓存所有用户文件。

结构化离线数据由 Dexie 管理，数据库按用户命名为 `trek-offline-u<userId>`。退出时删除当前用户数据库；写操作进入 Mutation Queue，携带：

- UUID / `X-Idempotency-Key`；
- 临时负 ID；
- `baseUpdatedAt` 乐观并发令牌；
- 409 后保存 server version；
- `pending / syncing / failed / conflict` 状态；
- mine/theirs 冲突恢复。

`Prepare for offline` 会等待旅行数据、文件和地图切片真正下载完才报告成功，而不是任务刚启动就显示完成。[Vite PWA 配置](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/client/vite.config.js)、[Offline DB](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/client/src/db/offlineDb.ts)

### 后端

| 层级 | TREK 实现 |
| --- | --- |
| Runtime | Node.js 24 |
| HTTP | NestJS 11 + Express Adapter |
| API | REST Controllers，Swagger 可选 |
| 实时 | `ws` WebSocket，按 trip room 分发 |
| 数据库 | `better-sqlite3`，WAL、外键、迁移 |
| Auth | JWT Cookie、OIDC、OAuth 2.1、Passkey/WebAuthn、TOTP |
| MCP | MCP SDK 1.29、OAuth 2.1、scope/permission 检查 |
| 调度 | `node-cron`，提醒、备份、同步和清理任务 |
| 文件/解析 | 本地 uploads、KDE KItinerary、PDF/XML/Image 处理 |

WebSocket 握手使用一次性 token，加入 trip room 前重新检查成员权限；消息有 payload 上限、origin 检查、心跳和速率限制。[server/package.json](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/server/package.json)、[WebSocket 实现](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/server/src/websocket.ts)

### 部署

TREK 使用多阶段 Docker：分别构建 shared、client 和 server，生产镜像只复制构建产物和运行资料。Compose 默认：

- read-only root filesystem；
- `no-new-privileges`；
- drop all capabilities，只补 CHOWN/SETUID/SETGID；
- `/tmp` 使用 noexec/nosuid tmpfs；
- 非 root Node 用户；
- 健康检查；
- 仅挂载 data 和 uploads。

另提供 Helm/Kubernetes、Unraid、Proxmox 和 PWA 安装说明。[Dockerfile](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/Dockerfile)、[docker-compose.yml](https://github.com/liketrek/TREK/blob/e60427f813dc35f688d5d9169b79ac8c43974719/docker-compose.yml)

## 当前 Travel Agent：真实技术状态

| 入口 | 已有实现 | 当前不足 |
| --- | --- | --- |
| Web | React 19.1 + Vite 7 + Leaflet | 主要 UI 仍集中在一个大型 JSX/CSS；地图和详情未拆包 |
| PWA | manifest + 手写 Service Worker，缓存 shell/static GET | 没有 per-user Trip Cache、Today Offline Pack、地图预下载、离线写队列或冲突 UI |
| iOS/Android | Capacitor 7.4 工程已生成 | 尚未证明相机、定位、分享、Deep Link、Push、Secure Storage 和真机性能 |
| macOS/Windows | 响应式 Web/PWA | 没有 Tauri/Electron 桌面安装包；也尚未证明需要 |
| 微信/支付宝 | 两份官方原生单页工程 | 当前是轻量对话/行程入口；真实 AppID、域名、平台登录和真机地图仍未关闭 |
| 后端 | Node >=22.19、Express 5、Pi Runtime、PostgreSQL/本地 JSON | 生产 Session/撤销、Agent 流式反馈、离线同步和多人实时协作仍待扩展 |
| 合同 | TypeBox + TypeScript core | 外围 HTTP/Provider/Web 仍有 JavaScript；但无需为了 TREK 切 Zod |

现有 PWA 不是“没有实现”，但只完成 App Shell：`public/sw.js` 排除 `/api/` 后缓存同源 GET，没有业务级离线数据和用户隔离。因此当前 Wiki 应准确称为 **PWA shell 已实现，旅行离线执行未实现**。

## 全平台候选方案

### 方案 A：React Web Core + PWA + Capacitor + 轻量小程序（推荐候选）

```text
React/Vite Web Core
├── Web / PWA / 大屏 / 折叠屏
├── Capacitor iOS
├── Capacitor Android
├── 可选 Tauri Desktop（后置）
└── 微信/支付宝轻量客户端（Native；必要时迁 Taro）
```

优点：最大化复用现有 UI、Leaflet、API Client、i18n 和测试；产品迭代仍以 Web 为单一视觉主线；最符合当前团队与代码事实。

限制：Capacitor/Tauri 均使用系统 WebView，必须分别验证 WebView2、WKWebView 和 Android WebView；小程序不能直接复用 DOM 组件。

### 方案 B：React Web Core + Tauri 2 统一桌面/移动壳 + Taro 小程序

Tauri 2 可复用 HTML/CSS/JS 前端，并支持 Windows、macOS、Linux、iOS、Android。[Tauri 2 官方说明](https://v2.tauri.app/)

优点：桌面安装、Updater、系统托盘、文件协议和原生 IPC 更完整；产物通常比 Electron 小。

限制：新增 Rust、平台工具链与 IPC 安全模型；移动端会与当前 Capacitor 重叠；仍不能生成微信/支付宝小程序。现在全量切换收益不足。

### 方案 C：Taro 统一微信/支付宝/H5/RN，Web 工作台单独维护

Taro 官方支持 React/Vue 到微信、支付宝、H5、React Native 等平台，但各端样式和 API 仍有约束。[Taro 官方文档](https://docs.taro.zone/docs/)

优点：当小程序扩展到多个页面、复杂 Today、分享与平台能力时，可减少微信/支付宝重复。

限制：现有 React DOM 工作台不能直接复制到 Taro Renderer；地图、拖拽、复杂布局和桌面工作台仍需单独实现。适合成为 `apps/miniapp`，不适合替代 Web Core。

### 方案 D：Flutter 全客户端重写 + 独立小程序

Flutter 可覆盖 iOS、Android、Web、Windows、macOS、Linux。[Flutter 官方 FAQ](https://docs.flutter.dev/resources/faq)

优点：移动/桌面渲染和动画一致，原生性能可控。

限制：需要 Dart 重写全部 React UI、地图交互、i18n 和测试；Flutter 不能直接输出微信/支付宝小程序；Web 内容语义、可访问性、首屏和现有 React 资产复用成本高。本阶段不推荐。

## 候选推荐：不锁定，但建议优先验证 A

### 客户端分层

建议把“全平台复用”定义为共享合同和任务模型，而不是强迫所有平台共享同一 DOM：

```text
packages/contracts        TypeBox Schema / DTO / JSON Schema
packages/client-core      API client、view models、i18n、状态选择器
packages/design-tokens    颜色、字号、间距、icon 语义
apps/web                  React/Vite/PWA 主工作台
apps/native               Capacitor iOS/Android 壳
apps/miniapp              微信/支付宝；复杂后再评估 Taro
apps/desktop              可选 Tauri 2，只消费 web dist
```

当前项目不必立即重组为 monorepo；只有第二个真实客户端开始复用 `client-core` 时再抽取。

### 地图

定义 `MapRendererPort`，共享地点、marker、polyline、focus 和 facility DTO：

- Web/PWA/Capacitor：生产中国优先高德 JSAPI/合规地图，Leaflet 只做开发或允许地区的 fallback；
- 微信/支付宝：使用平台原生 `<map>`，消费服务端归一坐标和折线；
- 不因 TREK 支持 Mapbox 3D 就引入 Mapbox/MapLibre，除非出现真实 3D/大图层需求。

### PWA 与离线

不复制 TREK 的全量离线工作区，先做隐私更小的 `Today Offline Pack`：

- Service Worker 继续对 `/api` 使用 NetworkOnly；
- IndexedDB 按 `userId` 隔离；Guest 与账号不可共用 DB；
- 只缓存已确认的当天地点、路线摘要、酒店地址、双语短句、公开图片缩略图和一个备选；
- 保存 `freshUntil`，过期后明显提示；
- 预订号默认遮盖；不缓存证件、支付、Cookie、Token；
- logout/claim/identity switch 清理旧用户缓存；
- 地图切片有明确区域、上限、TTL 和“准备离线包”进度；
- V1 不允许离线修改 TripState，避免先引入完整 Mutation Queue；只允许记录本地待同步的“已完成/现场变化”，恢复网络后由用户确认提交。

### iOS / Android

继续使用当前 Capacitor 7，不在 UI 重构时顺带升级。完成真实插件和设备门：

- Camera / Photo Picker；
- Geolocation；
- Push Notifications；
- Share / Deep Links；
- Secure Storage；
- Network state；
- iOS WKWebView、Android WebView 的地图、滚动、键盘、文件上传和后台恢复测试。

Capacitor 官方定位就是把现有 Web 项目放入 iOS/Android 原生容器，并通过插件访问 Native SDK。[Capacitor 官方文档](https://capacitorjs.com/docs)

### macOS / Windows

先用 Web/PWA 验证：

- 安装与启动；
- 大屏/缩放/窗口调整；
- 离线 Today；
- 通知和 Deep Link。

只有出现以下明确需求才引入 Tauri 2：

- Mac/Windows 商店或企业安装包；
- 自动更新；
- 系统托盘/全局快捷键；
- 本地文件关联；
- 更强的本地加密和离线资料管理。

如果采用 Tauri，Rust Core 只处理桌面能力和安全存储；Pi Runtime、Provider 和业务状态仍在服务端，避免产生第二套后端。

### 小程序

当前微信/支付宝工程保持原生轻量入口最简单。技术决策门：

- 如果只包含登录、Chat、Today、Map、分享和预订跳转：继续原生，两端共用协议和视觉 token；
- 如果增长为 5 个以上复杂页面、多人协作、候选抽屉和 Trip Kit：建立 Taro React 小程序包；
- 不使用 WebView 承载核心小程序，因为平台登录、地图、分享、审核和性能仍需要原生能力。

### 后端

不迁移 NestJS/SQLite：

- PostgreSQL 比 TREK 的单实例 SQLite 更适合云端多用户与 Provider 任务；
- Pi Parent Agent、Evidence、Patch 和确认边界是核心差异；
- Express 5 当前足够，框架迁移不产生用户价值；
- Agent 处理进度可先增加 SSE；
- 只有多人实时编辑被验证后再增加 WebSocket room；多实例时需 PostgreSQL/Redis 广播和版本检查，不能照搬内存 `Map<tripId, sockets>`。

## 需要用户最终确认的技术决策

1. **桌面端是否必须是独立安装包？** 如果浏览器/PWA 已满足，Tauri 可延期；如果必须进入 Mac/Windows 商店，则提前立项。
2. **小程序是轻量行中入口还是完整规划器？** 前者保留原生，后者才值得迁 Taro。
3. **离线只保证 Today 可读，还是允许完整编辑？** 完整离线编辑会引入 Mutation Queue、幂等、冲突合并和更大的隐私面。
4. **多人协作是否进入近期范围？** 只有真实多人同时编辑，才需要 WebSocket 与投票状态。

## 建议验证顺序

1. Web 重构为已确认的 Agent-assisted Trip Workspace；
2. 对主工作台做 route-level code splitting 和性能预算；
3. 将手写 PWA 升级为 Today Offline Pack；
4. 完成 iOS/Android Capacitor 真机黄金路径；
5. 完成微信/支付宝真实账号和 native map QA；
6. 用真实用户数据决定 Taro 和 Tauri，而不是同时启动两个新框架迁移。

## 证据限制

- TREK 技术结论基于固定提交源码和正式发布配置，没有运行其完整实例；
- GitHub 关键词搜索已排除桌面/移动框架的误命中，但不能证明仓库历史从未使用过这些框架；
- 本文不构成 TREK 安全审计，也不授权使用 AGPL 代码；
- Tauri、Taro、Flutter 和 Capacitor 能力来自当前官方文档，实际平台审核、插件和地图能力仍需 PoC；
- 最终技术选型需结合团队技能、发布渠道和真实设备验收，不以“支持平台数量”单独决定。
