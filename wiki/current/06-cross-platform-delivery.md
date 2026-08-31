# 跨端交付、数据与登录

## 一个内核，六个入口

| 入口 | 工程 | 共享能力 | 当前可验证边界 |
| --- | --- | --- | --- |
| Web / PWA | React + Vite | HTTP API、旅行状态、路线详情、分层地图、离线 shell | 已构建，可本地真实交互；高德 JS 薄渲染器与 Leaflet/静态图降级均已接线，但高德 JS 仍需独立 Web Key 与浏览器 live smoke。 |
| iOS | Capacitor | 同一 Web bundle 与 HTTPS API | 工程已生成并可 copy；本机缺完整 Xcode/CocoaPods 时不声称已编译。 |
| Android | Capacitor | 同一 Web bundle 与 HTTPS API | 工程已生成并完成 asset copy；签名与 SDK 构建由发布环境完成。 |
| 微信小程序 | 官方原生小程序工程 | HTTP API、`wx.login` 授权码交换、当天原生地图与路线试排 | 当天 marker/polyline、下一段、方式切换和失败保留已进入真实页面代码；真实 AppID、域名白名单、开发工具与真机 smoke 仍需发布主体完成。 |
| 支付宝小程序 | 官方原生小程序工程 | HTTP API、`my.getAuthCode` 授权码交换、当天原生地图与路线试排 | 当天 marker/polyline、下一段、方式切换和失败保留已进入真实页面代码；真实 AppID、RSA2、开发工具与真机 smoke 仍需发布主体完成。 |
| MCP | Node stdio | `TravelService` 业务合同 | 可本地调用，不维护第二份状态。 |

桌面与大屏折叠屏使用响应式 Web；不维护与 Web 竞争的独立桌面业务代码。

## 已锁定技术方案

第一阶段采用 **React Web Core + PWA + 现有 Capacitor iOS/Android + 轻量微信/支付宝原生小程序**。技术调研见 [TREK 技术栈与全平台方案](../research/archive/2026-08-20-trek-technical-stack-and-cross-platform-options.md)。

实施边界：

1. Web Core 是视觉、交互和客户端状态的主实现；桌面浏览器、PWA、折叠屏和 Capacitor 共享该实现。
2. iOS/Android 保持 Capacitor 7，本轮不顺带升级；原生能力通过受控 Plugin 接入。
3. 微信/支付宝继续作为轻量 Chat / Today / Map / 分享与履约入口，不复制桌面工作台。
4. 小程序增长为多页面完整规划器后才重新评估 Taro；桌面出现商店、自动更新、托盘或文件关联需求后才评估 Tauri 2。
5. 当前不引入 Flutter、React Native、Electron、Tauri 或 Taro 依赖。
6. “全平台复用”优先共享合同、API Client、View Model、i18n、设计 Token 和验收场景，不强迫所有平台共享同一 DOM。

## 数据与同步

生产运行设置 `DATABASE_URL`，由 `PostgresTripRepository` 将每个 `trip-control-state-v1` 以 JSONB snapshot 持久化，并在 `storage_version` 条件更新中拒绝并发覆盖。`trip_states` 的迁移由 `npm run db:migrate` 执行。

未设置数据库时，`TripStore` 将单趟旅行写入权限为 0600 的原子 JSON 文件。这只是一种本地开发和合同验证模式；它不被描述为跨设备同步或生产存储。

## 登录与会话

Web 首次价值不要求登录。`POST /api/auth/guest-session` 签发随机 Guest 身份，复用同一 Conversation、TripState 和成员权限；临时访问默认 7 天。用户登录后，服务端把该 Guest 的旅行与对话转移到账号，旧 Guest 不再有访问权。当前已经验证访问阻断和本地开发登录后的无损合并；生产 OAuth 合并仍必须用真实平台回调复核。过期 Guest 的物理数据清理任务尚未实现，不能把访问过期等同于数据已经删除。

旅行对话支持软删除与恢复：普通列表隐藏 `deletedAt` 非空的 Conversation，“最近删除”仍可读取并恢复。删除 Conversation 不删除关联 TripState、确认选择或路线；前端必须在删除前明确说明这一边界。生产后续可增加自动清理周期，但不能把软删除表述为物理删除。

需要保存、跨端、分享或行中恢复时，Web 以 Google 为海外主入口，另提供微信扫码、支付宝扫码和 Apple 登录。`/api/auth/providers` 只返回各渠道是否可用；`/api/auth/:provider/start` 生成带短期签名 state 的官方授权地址，回调校验 OAuth state、OIDC 身份令牌或支付宝 RSA2 响应签名后，才签发本站会话。微信和支付宝小程序继续使用 `/api/auth/platform-exchange`，并向平台交换一次性授权码。

运行 `npm run auth:setup` 可生成本站会话/state 密钥并补齐本地 ENV 模板，`npm run auth:check` 会分别检查 Google Web、微信 Web、微信小程序、支付宝 Web、支付宝小程序与 Apple Web 的字段、回调、私钥文件权限和 live smoke。支付宝 Web 与小程序允许使用独立 AppID 和密钥；微信网站应用与小程序应绑定到相同开放平台主体，避免同一用户因缺少 UnionID 被拆成两个账号。平台控制台、生产部署和真实验收步骤统一见[部署与配置指南](./09-account-configuration-guide.md)。

生产会话由 `TRAVEL_AGENT_SESSION_SECRET` 签名，Web 只保存在 `HttpOnly`、`SameSite=Lax` cookie 中；原生和小程序通过 `Authorization` header 使用同一受控会话。Token、平台 access token 和 `session_key` 不进入 Agent、Prompt、日志或旅行状态。注销会清除 Cookie 并在当前服务实例撤销会话；轮换会话密钥会使全部现有会话失效。

本地仍可显式设置 `TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH=true` 创建开发会话，以验证业务交互。它只显示为“本地开发”，在生产环境无效，也不再伪装成邮箱或第三方登录。

## V2 端侧职责

- 桌面 Web：对话可折叠；Trip 工作区先显示四域当前选择，按当前焦点展开一组替代项，地图、时间轴与影响保持同屏。地图默认按 Day 展示，每一段路线与卡片共享焦点、方式、分钟和查询时影响；同一酒店多次到访保留多个序号。单地点完整详情按需展开；容器窄于约 900px 时才改单列。
- 移动 Web / 原生壳：固定 Chat / Trip / Map 三入口；确认地点后 Map 显示 Today、当前/下一步、准备缺口和变化恢复。地图使用双指缩放、单指拖动与可见缩放控件，仍共用 Web Core 的路线投影。
- 英文：根据浏览器语言自动选择，并提供中英切换。当前核心执行外壳已本地化；地点英文别名、地址转写和 Provider 长文本仍待统一归一。
- 小程序：复用上述服务状态并采用轻量 Today，只绘制当前 Day、当前方式和 active leg，并在地图下直接显示“下一段怎么走”；切换方式仍由服务端 Mobility Preview 核验，不复制桌面比较工作台。真实扫码授权、域名白名单、开发工具和真机回跳仍是发布门。

## 离线边界

当前 `manifest.webmanifest + public/sw.js` 只提供安装和 App Shell 缓存。V2 目标是 `Today Offline Pack`，不是完整离线工作台：

- `/api` 不进入共享 Service Worker Cache；
- 结构化离线数据按 userId 隔离；
- logout、Guest claim 和 identity switch 清理旧身份缓存；
- 只缓存当天执行资料、有限公开缩略图和有边界的地图切片；
- 保存核验时间、`freshUntil` 与离线状态；
- 不缓存证件、支付、Cookie、Token 或未遮盖预订号；
- V2 首版离线只读，现场变化先留在本机，联网后由用户确认提交，不立即引入完整离线写冲突系统。

## 配置边界

- `VITE_TRAVEL_API_BASE_URL`：Capacitor bundle 的受控 HTTPS API；Web/PWA 留空则使用同源 `/api`。
- 小程序 `app.js` 的 `apiBaseUrl`：已配置到小程序后台 request domain 的 HTTPS API；由授权发布主体在提交前写入环境化配置。
- `TRAVEL_AGENT_CORS_ORIGINS`：逗号分隔的精确生产 origin；本地开发模式仅放行 `localhost` / `127.0.0.1`。
- `DATABASE_URL`：生产 PostgreSQL，不进入 Web bundle、Prompt、日志或 artifact。
- `TRAVEL_AGENT_PUBLIC_ORIGIN`：生产站点唯一 HTTPS Origin；四个平台的回调地址均从这里生成。
- `TRAVEL_AGENT_SESSION_SECRET`、`TRAVEL_AGENT_AUTH_STATE_SECRET`：两个独立的随机服务端密钥，至少 32 字符。
- `AMAP_JS_API_KEY`：高德 Web 平台的浏览器可见 JS Key；不等同于服务端 `AMAP_API_KEY`。
- `AMAP_JS_SECURITY_CODE`：高德 JS 安全密钥，只由固定 `/_AMapService` 服务端代理使用，不进入浏览器响应。
- `TRAVEL_AGENT_AMAP_JS_RENDERER_ENABLED`：地图渲染器开关；关闭时保持 Leaflet/静态图降级，不改变路线事实。

平台侧 AppID 为空时只能完成工程构建，不能提审或上线；不得填入演示 AppID 冒充可发布配置。
