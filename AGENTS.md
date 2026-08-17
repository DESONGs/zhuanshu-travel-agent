# Travel Agent V1 开发约定

## 先读什么

1. `wiki/README.md`：当前规范与事实优先级。
2. `agent.md` 与 `.pi/SYSTEM.md`：父 Agent 的行为、状态与提交边界。
3. `plugins/travel-agent/skills/` 与 `travel-agent-pi-package/runtime/`：模块化 Skills、可执行合同和 Provider 状态。
4. 本地私有 `rwa-docs/`：不可改写的会议原始证据；它不覆盖后续用户决策，也不随公开仓库分发。公开副本以 `wiki/` 的追溯记录为准。

## 不可破坏的产品边界

- V1 面向 C 端，国内游客与入境游客均可完成吃、住、行、玩；目的地只能作为测试场景，不能成为产品范围限制。
- 吃、住、行、玩是同一 `Trip Control State` 上的相互影响任务链，禁止拆成四个彼此隔离的 Workflow 或四份状态。
- Skill 只返回 Evidence、`needs_context` 或 `TripPatchProposal`。只有 `Travel Parent Agent` 能以 revision、read set、write contract、锁定项和新鲜度检查后提交变更。
- 身份证件、支付、手机号、Cookie、Token 与浏览器 profile 不得进入 Prompt、日志、metrics、artifact 或父 Agent 状态。
- 任何购买、自动退改、社交发布/评论/点赞/收藏/关注/私信/删除均不在 V1 能力内。预订只准备跳转与确认记录，并要求用户确认。

## 第三方与安全

- 新 Provider 必须先记录固定 SHA、许可、维护状态、依赖与写面，生成 `third-party-audit-v1`；AGPL、非商业或无明确许可仓库不可合入。
- 安装依赖使用 lockfile 和 `--ignore-scripts`；先在无凭据、非 root、临时 Home、受限网络、只读文件系统环境静态检查与 smoke。
- 小红书和抖音仅可由独立受限 Worker 处理三项只读操作：`search_social_content`、`read_social_content`、`resolve_social_share_url`。Pi 主进程不得持有 Cookie，也不得向 Worker 传递任意 URL、Shell 或浏览器 eval。
- Provider fixture 只验证合同；只有明确标记为真实隔离 smoke 的证据才可声称已接线。

## 验证命令

```bash
npm test
npm run typecheck
npm run check
npm run miniapp:weapp
npm run miniapp:alipay
npx cap copy ios
npx cap copy android
```

当前开发机必须使用 Node `>=22.19.0`；较低版本可以阅读或做非 Pi 的纯 Runtime 检查，但不能作为 Pi 可加载的完成证据。

## 跨端与运行环境

- `src/http/`、`src/persistence/` 和 `src/api/TravelService` 是 Web、原生、小程序与 MCP 共用的服务边界；不得为客户端复制行程提交规则。
- 生产设置 `DATABASE_URL` 以启用 PostgreSQL。未设置时的原子 JSON repository 只用于本地开发与合同验证。
- Web 开发代理到 `http://127.0.0.1:8797`；原生使用 `VITE_TRAVEL_API_BASE_URL`，两个原生小程序在各自 `app.js` 使用已登记的 HTTPS API。所有跨源请求都必须在 `TRAVEL_AGENT_CORS_ORIGINS` 逐项允许。
- Google、微信、支付宝和 Apple 的生产登录必须完成平台授权并通过真实回调后才可签发会话；Google 是 Web 主入口，微信/支付宝 Web 使用官方扫码授权页，小程序只交换平台一次性 code。本地称呼输入仅限显式开发模式，不能冒充生产邮箱登录。配置未完成时保持 `auth_provider_not_configured`，不得伪造成功登录。
