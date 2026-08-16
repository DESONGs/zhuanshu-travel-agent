# 跨端交付、数据与登录

## 一个内核，六个入口

| 入口 | 工程 | 共享能力 | 当前可验证边界 |
| --- | --- | --- | --- |
| Web / PWA | React + Vite | HTTP API、旅行状态、路线详情、离线 shell | 已构建，可本地真实交互。 |
| iOS | Capacitor | 同一 Web bundle 与 HTTPS API | 工程已生成并可 copy；本机缺完整 Xcode/CocoaPods 时不声称已编译。 |
| Android | Capacitor | 同一 Web bundle 与 HTTPS API | 工程已生成并完成 asset copy；签名与 SDK 构建由发布环境完成。 |
| 微信小程序 | 官方原生小程序工程 | HTTP API、授权码交换、旅行读取 | `miniapp:weapp` 校验后可由微信开发者工具直接导入；真实 AppID、域名白名单和服务端密钥未提供。 |
| 支付宝小程序 | 官方原生小程序工程 | HTTP API、授权码交换、旅行读取 | `miniapp:alipay` 校验后可由支付宝小程序开发者工具直接导入；真实 AppID、域名白名单和服务端密钥未提供。 |
| MCP | Node stdio | `TravelService` 业务合同 | 可本地调用，不维护第二份状态。 |

桌面与大屏折叠屏使用响应式 Web；不维护与 Web 竞争的独立桌面业务代码。

## 数据与同步

生产运行设置 `DATABASE_URL`，由 `PostgresTripRepository` 将每个 `trip-control-state-v1` 以 JSONB snapshot 持久化，并在 `storage_version` 条件更新中拒绝并发覆盖。`trip_states` 的迁移由 `npm run db:migrate` 执行。

未设置数据库时，`TripStore` 将单趟旅行写入权限为 0600 的原子 JSON 文件。这只是一种本地开发和合同验证模式；它不被描述为跨设备同步或生产存储。

## 登录与会话

首用入口提供微信、支付宝、Apple 与邮箱方式。生产代码必须校验渠道 callback 或 authorization code，并将 identity 与会话存储在受控身份系统中；当前仓库没有任何渠道 AppID、签名密钥、邮件发送凭据或 callback 域名，故生产 endpoint 返回 `auth_provider_not_configured`。

本地可显式设置 `TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH=true` 创建短期开发会话，以验证完整的业务交互。该开关在生产环境无效。Web 使用 `HttpOnly` cookie；原生和小程序通过 `Authorization` header 使用受控会话，不把 token 传入 Agent、Prompt 或旅行状态。

## 配置边界

- `VITE_TRAVEL_API_BASE_URL`：Capacitor bundle 的受控 HTTPS API；Web/PWA 留空则使用同源 `/api`。
- 小程序 `app.js` 的 `apiBaseUrl`：已配置到小程序后台 request domain 的 HTTPS API；由授权发布主体在提交前写入环境化配置。
- `TRAVEL_AGENT_CORS_ORIGINS`：逗号分隔的精确生产 origin；本地开发模式仅放行 `localhost` / `127.0.0.1`。
- `DATABASE_URL`：生产 PostgreSQL，不进入 Web bundle、Prompt、日志或 artifact。

平台侧 AppID 为空时只能完成工程构建，不能提审或上线；不得填入演示 AppID 冒充可发布配置。
