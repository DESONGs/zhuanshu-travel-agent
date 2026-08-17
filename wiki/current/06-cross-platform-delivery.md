# 跨端交付、数据与登录

## 一个内核，六个入口

| 入口 | 工程 | 共享能力 | 当前可验证边界 |
| --- | --- | --- | --- |
| Web / PWA | React + Vite | HTTP API、旅行状态、路线详情、离线 shell | 已构建，可本地真实交互。 |
| iOS | Capacitor | 同一 Web bundle 与 HTTPS API | 工程已生成并可 copy；本机缺完整 Xcode/CocoaPods 时不声称已编译。 |
| Android | Capacitor | 同一 Web bundle 与 HTTPS API | 工程已生成并完成 asset copy；签名与 SDK 构建由发布环境完成。 |
| 微信小程序 | 官方原生小程序工程 | HTTP API、`wx.login` 授权码交换、旅行读取 | 客户端与服务端交换已实现；真实 AppID、域名白名单和账号 smoke 仍需发布主体完成。 |
| 支付宝小程序 | 官方原生小程序工程 | HTTP API、`my.getAuthCode` 授权码交换、旅行读取 | 客户端与 RSA2 服务端交换/验签已实现；真实 AppID、密钥和账号 smoke 仍需发布主体完成。 |
| MCP | Node stdio | `TravelService` 业务合同 | 可本地调用，不维护第二份状态。 |

桌面与大屏折叠屏使用响应式 Web；不维护与 Web 竞争的独立桌面业务代码。

## 数据与同步

生产运行设置 `DATABASE_URL`，由 `PostgresTripRepository` 将每个 `trip-control-state-v1` 以 JSONB snapshot 持久化，并在 `storage_version` 条件更新中拒绝并发覆盖。`trip_states` 的迁移由 `npm run db:migrate` 执行。

未设置数据库时，`TripStore` 将单趟旅行写入权限为 0600 的原子 JSON 文件。这只是一种本地开发和合同验证模式；它不被描述为跨设备同步或生产存储。

## 登录与会话

Web 首用入口以 Google 为主，另提供微信扫码、支付宝扫码和 Apple 登录。`/api/auth/providers` 只返回各渠道是否可用；`/api/auth/:provider/start` 生成带短期签名 state 的官方授权地址，回调校验 OAuth state、OIDC 身份令牌或支付宝 RSA2 响应签名后，才签发本站会话。微信和支付宝小程序继续使用 `/api/auth/platform-exchange`，但现在会真正向平台交换一次性授权码。

生产会话由 `TRAVEL_AGENT_SESSION_SECRET` 签名，Web 只保存在 `HttpOnly`、`SameSite=Lax` cookie 中；原生和小程序通过 `Authorization` header 使用同一受控会话。Token、平台 access token 和 `session_key` 不进入 Agent、Prompt、日志或旅行状态。注销会清除 Cookie 并在当前服务实例撤销会话；轮换会话密钥会使全部现有会话失效。

本地仍可显式设置 `TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH=true` 创建开发会话，以验证业务交互。它只显示为“本地开发”，在生产环境无效，也不再伪装成邮箱或第三方登录。

## 配置边界

- `VITE_TRAVEL_API_BASE_URL`：Capacitor bundle 的受控 HTTPS API；Web/PWA 留空则使用同源 `/api`。
- 小程序 `app.js` 的 `apiBaseUrl`：已配置到小程序后台 request domain 的 HTTPS API；由授权发布主体在提交前写入环境化配置。
- `TRAVEL_AGENT_CORS_ORIGINS`：逗号分隔的精确生产 origin；本地开发模式仅放行 `localhost` / `127.0.0.1`。
- `DATABASE_URL`：生产 PostgreSQL，不进入 Web bundle、Prompt、日志或 artifact。
- `TRAVEL_AGENT_PUBLIC_ORIGIN`：生产站点唯一 HTTPS Origin；四个平台的回调地址均从这里生成。
- `TRAVEL_AGENT_SESSION_SECRET`、`TRAVEL_AGENT_AUTH_STATE_SECRET`：两个独立的随机服务端密钥，至少 32 字符。

平台侧 AppID 为空时只能完成工程构建，不能提审或上线；不得填入演示 AppID 冒充可发布配置。
