# Travel Agent V1

Travel Agent V1 是面向国内与入境自由行用户的完整旅行 Agent。它在一份共享的旅行状态上协调吃、住、行、玩四条任务链，并将社交发现、地图、官方事实和交易路径区分处理。

当前代码已经打通自然语言对话、旅行理解的增量保存、一次四域联动研究、待确认候选、持久化状态，以及 Web/PWA、原生壳、微信和支付宝小程序入口。Web 与小程序都从对话开始，不要求用户先添加行程；地点资料可用时，方案区展示候选照片、地图分布、来源与选择动作。

这不等于所有外部数据已可用：DeepSeek、Kimi、飞猪 FlyAI 与途牛官方 MCP 已使用当前服务端凭据完成真实只读 smoke；飞猪和途牛可返回酒店、航班和火车，飞猪另返回景点及详情跳转。高德 Key 有效且曾返回真实 POI、地点照片、地址和坐标，但 0.455 QPS 的 v3/v5/天气诊断矩阵全部在参数校验前返回 `10044`。用户确认控制台额度正常，因此当前按高德账号网关阻断处理，而不是误报为 QPS 或已证实的额度耗尽。天气已贯穿共享状态、候选评估、局部重排和前端；本地可用 Open-Meteo 非商业回退，生产需高德完整 smoke 或付费天气 Key。小红书 Skill 已模块化，但真实 Worker、专用账号和扫码 smoke 尚未完成。

先阅读 [Wiki 索引](./wiki/README.md)，开发 Agent 再阅读 [AGENTS.md](./AGENTS.md) 与 [agent.md](./agent.md)。

模块化 Travel Agent Plugin 位于 [`plugins/travel-agent/`](./plugins/travel-agent/)。它是 22 个语义 Skills 的唯一来源；Pi package 直接装载该目录，不再维护第二份 Skill 副本。小红书相关 Skill 已完成，但真实搜索仍要求后续配置独立只读 Worker 和专用账号。

## 本地检查

```bash
npm install --ignore-scripts --cache /private/tmp/travel-agent-npm-cache
npm run check
npm run miniapp:weapp
npm run miniapp:alipay
```

## 本地 Web 与 API

```bash
TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH=true \
TRAVEL_AGENT_DATA_DIR=/private/tmp/travel-agent-data \
PORT=8797 npm run api

npm run web:dev -- --port 5173
```

开发会话只在显式开启的非生产环境可用。生产使用 `DATABASE_URL`、精确的 `TRAVEL_AGENT_CORS_ORIGINS` 和真实的授权 code exchange；没有这些配置时，接口明确返回 `auth_provider_not_configured`，不会创建模拟账户。对话 Agent 需要在服务器环境配置 `TRAVEL_AGENT_MODEL_PROVIDER`、`TRAVEL_AGENT_MODEL` 及对应密钥；缺少时界面保留用户需求并明确显示 `agent_unavailable`，不会生成虚构推荐。

默认父 Agent 使用 DeepSeek V4 Flash。用户可在每段对话中切换到 DeepSeek V4 Pro 或 Kimi K3；选择会持久化并显示在回答时间旁。Pi sub-agent 默认使用 Kimi K2.6，Kimi K2.6 同时处理用户授权的图片理解。账号配置、Provider 状态及官方来源见 [模型路由、账号接入与数据能力](./wiki/current/08-provider-accounts-and-routing.md)。

需要申请或更换 Key 时，按 [账号与 API 配置说明](./wiki/current/09-account-configuration-guide.md) 操作；它区分了“填 ENV 即可生效”和“仍需开发/商务授权”的能力。

高德地点研究、地点照片和静态地图需要服务端 `AMAP_API_KEY`；只有在该 Key 开启数字签名时才同时填写 `AMAP_API_SECRET`。开发环境配置后即可人工验证；生产环境只有下面的真实 smoke 通过后才启用：

```bash
npm run smoke:amap
# 通过后在服务端环境设置：
# TRAVEL_AGENT_AMAP_SMOKE_STATUS=passed_live_smoke

# 天气本地非商业 smoke；生产需付费 Open-Meteo Key 或通过高德完整 smoke
npm run smoke:weather

# 飞猪库存与途牛 MCP（途牛未配置时会明确报告 blocked）
npm run smoke:inventory
```

## 原生工程

```bash
npm run web:build
npx cap copy ios
npx cap copy android
```

`ios/` 和 `android/` 是 Capacitor 工程。iOS 构建需要完整 Xcode 与 CocoaPods；Android 构建需要 Android Studio、SDK 与签名配置。原生构建通过 `VITE_TRAVEL_API_BASE_URL` 指向受控的 HTTPS API，不能使用桌面开发代理。

微信和支付宝原生工程分别位于 `apps/miniapp/wechat/`、`apps/miniapp/alipay/`，可直接由对应开发者工具导入。上述 `miniapp:*` 命令校验文件、原生语法与空 AppID 边界；发布前由授权主体填入真实 AppID、HTTPS request domain 和服务端授权密钥。

## 启动 MCP

```bash
TRAVEL_AGENT_DATA_DIR=/absolute/path/to/data npm run mcp
```

如果不设置 `TRAVEL_AGENT_DATA_DIR`，旅行状态写入工作区的 `runtime-data/trips/`。stdio MCP 暴露 `create_trip`、`update_trip_scope`、读取视图、研究、提案接受/拒绝、预订跳转、异常和反馈等业务工具；未通过安全门的外部研究会明确返回不可用，不会生成静态候选冒充真实结果。

`runtime-runs/`、Cookie、供应方密钥、证件和支付数据均不得提交。

Pi `0.84.1` 要求 Node `>=22.19.0`。当前已在 Node `26.7.0` 下完成 package 发现、类型检查、真实 stdio MCP 进程和持久化黄金路径验证。

## 许可证

本项目原创代码采用 [PolyForm Noncommercial License 1.0.0](./LICENSE) 发布：允许符合许可证定义的非商业使用、修改和分发；任何预期商业应用均需获得著作权人的单独书面授权。由于包含商业用途限制，它属于 source-available 许可证，不是 OSI 认证的开源许可证。

第三方组件继续适用各自许可证，不受本项目许可证替代或收紧；归属与来源见 [NOTICE](./NOTICE) 及第三方审计记录。
