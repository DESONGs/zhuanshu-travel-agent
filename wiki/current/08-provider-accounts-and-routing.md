# 模型路由、账号接入与数据能力

## 已配置的模型角色

| 任务 | 首选模型 | 何时调用 | 当前证据 |
| --- | --- | --- | --- |
| 意图理解、追问、约束推理、取舍解释、受限工具调用 | 默认 DeepSeek `deepseek-v4-flash`；用户可切 `deepseek-v4-pro` 或 Kimi `kimi-k3` | 用户按对话选择父 Agent 模型，选择持久化并从下一轮生效 | V4 Flash 完成两轮工具调用黄金路径；V4 Pro 与 K3 分别完成真实旅行草案创建。 |
| 有界子任务与内容提炼 | Kimi `kimi-k2.6` | Pi sub-agent 没有显式覆盖模型时 | `.pi/settings.json` 的 `subagents.defaultModel` 已固定为 `moonshotai-cn/kimi-k2.6`。 |
| 用户主动上传图片的旅行信息理解 | Kimi 中国区 `kimi-k2.6`（可切 `kimi-k3`） | 只在图片确实能补充地点、菜单、标识、排队、季节或风险 Claim 时 | 中国区旧 Key 已在 `.cn` 端点完成认证与真实图片 smoke；Web/小程序仍没有图片上传入口。 |
| POI、照片、地址、评分/参考消费、静态地图与地图唤端 | 高德 Web 服务 2.0；必要时降级官方基础 POI / Static Map / URI API | 一次四域检索返回地点资料，模型只解释 | Key 有效且曾返回真实 POI 与照片；低于 0.455 QPS 的 v3/v5/天气矩阵均在参数校验前返回 `10044`。用户确认额度正常，当前保持账号网关阻断状态，不能误报为 QPS 或已证实的额度耗尽。 |
| 旅行日期天气 | 高德天气；开发环境回退 Open-Meteo | 最终候选成立前核验，跨吃住行玩约束方案 | 代码已接入共享状态、候选评估、局部重排和前端；Open-Meteo 免费端点仅用于非商业开发，生产需高德完整 smoke 或付费 Key。 |
| 城市路线与非实时设施参考 | 高德路径规划 2.0 + Static Map paths + URI API；POI `navi/indoor` | 用户确认地点后由 Runtime 强制核验 | 代码已贯穿 Runtime、QA、地图和前端，保留入口/出口/室内图与 `walk_type` 直梯、扶梯、阶梯、斜坡；全部标记非实时。高德账号 `10044` 未解除前保持 blocked，恢复后需完整 route smoke。 |
| 实时到站与设施运行状态 | 授权实时公交、地铁或设施来源 | 选定公共交通方案后下钻 | 尚未接线；计划路线、地图设施记录、首末班、实时到站和当前运行状态必须分别表达。 |
| 小红书/抖音发现 | Travel Agent Plugin 中的组合/获取/消化/去同源 Skills；独立只读 social Worker | search/read/share-url 三个能力 | Skills 与安全合同已完成；待专用账号、固定 SHA Worker 审计和隔离 smoke。 |
| 铁路、航班、酒店与景点库存 | 飞猪 FlyAI；途牛官方 MCP 为第二来源 | 一次联动研究中的商业库存候选、价格提示与供应方跳转 | 两者均已用当前 Key 完成真实只读 smoke；途牛酒店、火车、航班各返回 6 条，飞猪景点/酒店/交通各返回 6 条。 |

DeepSeek V4 Flash 与 Pro 均支持 1M 上下文、思考模式和工具调用；Flash 速度与成本更适合作为默认，Pro 用于更复杂的联合取舍。Kimi K3 是第三个父 Agent 选项，Kimi K2.6 负责子任务和视觉理解。函数参数仍由 Runtime 的 TypeBox schema 和 `TravelService` 重新验证，不信任模型输出。任何模型都不替代事实 Provider；多模态结果只能是待审查 Claim，不能直接写旅行状态。

## 密钥和隐私边界

- 服务启动时只加载项目根目录被忽略的 `env_travel.local` 中的白名单键，并以 `0600` 权限要求保护该文件；不合规权限会拒绝启动。
- Kimi 只接受官方环境变量 `MOONSHOT_API_KEY`；旧会议项目的别名、飞书、ASR 和文档 Worker 配置不会被 Travel Agent 配置加载器读取。
- `/api/provider-status` 只返回 `blocked`、`credential_configured_pending_smoke`、`passed_live_smoke` 等状态，绝不返回 key、端点 token 或账号信息。
- Kimi 图片接口只接受用户上传的 JPEG、PNG、WebP（最多 4 张）；不上传社交平台原媒体、不落盘图片、不分析身份证/支付/手机号。返回文本仍需 Parent Agent 核验后才能成为 Claim。

## 需人工完成的账号配置

按实际申请顺序、ENV 字段和 smoke 操作请直接阅读 [账号与 API 配置说明](./09-account-configuration-guide.md)。

| 项目 | 需要你完成 | 完成后工程动作 | 官方来源 |
| --- | --- | --- | --- |
| Kimi 视觉 | `platform.kimi.com` 的旧 Key 继续放入 `MOONSHOT_API_KEY=`，并选择 `moonshotai-cn`；先不要重建 Key | 运行 `npm run smoke:models`；只有匹配 `.cn` 端点仍认证失败时才在同一平台重建 Key | [Kimi 中国区快速开始](https://platform.kimi.com/docs/overview) |
| 高德 | 完成个人认证并创建「Web 服务 API」Key，放入 `AMAP_API_KEY=`；只有控制台开启数字签名时才填写 `AMAP_API_SECRET=` | 先在配额管理确认基础搜索/LBS/天气的实际权益，再运行 `npm run smoke:amap`。POI、照片、静态地图和天气全部通过后才设置 `passed_live_smoke`；路线与设施另行验收 | [创建 Web 服务 Key](https://lbs.amap.com/api/webservice/guide/create-project/get-key)、[配额与价格](https://lbs.amap.com/pages/base_service_price)、[配额管理](https://console.amap.com/dev/flow/manage)、[静态地图](https://lbs.amap.com/api/webservice/guide/api/staticmaps) |
| Open-Meteo 天气回退 | 本地非商业开发无需 Key；商业生产需在 Open-Meteo 购买 customer API 计划并填写 `OPEN_METEO_API_KEY=` | `npm run smoke:weather` 只证明非商业开发链；生产必须使用 customer endpoint，且保留 CC BY 4.0 署名 | [价格与订阅](https://open-meteo.com/en/pricing)、[使用条款](https://open-meteo.com/en/terms)、[天气 API](https://open-meteo.com/en/docs) |
| 飞猪 FlyAI | 已完成：正式 Key 位于服务端 `FLYAI_API_KEY` | 已启用受限 Worker并通过景点、酒店、交通真实只读 smoke | [FlyAI 控制台](https://flyai.open.fliggy.com/console)、[快速开始](https://flyai.open.fliggy.com/docs/quickstart) |
| 途牛官方 MCP | 已完成：个人 Key 位于服务端 `TUNIU_API_KEY` | 已启用固定端点 Provider；酒店、火车、航班真实只读 smoke 均通过 | [途牛 API Keys](https://open.tuniu.com/mcp/apikeys)、[火车 MCP](https://open.tuniu.com/mcp/docs/apidoc/mcp/trainMCP.html) |
| Google 登录（Web 主入口） | 在 Google Cloud 创建 OAuth Web Client、配置同意屏幕与精确回调地址 | 代码已实现 OIDC code exchange、state/nonce 和 Google JWKS 验签；填入凭据后做真实 smoke | [Google Web Server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)、[OpenID Connect](https://developers.google.com/identity/openid-connect/reference) |
| 微信登录 | 微信开放平台创建网站应用；微信公众平台创建小程序，分别登记回调域名与 request domain | Web 官方扫码授权和小程序 `code2Session` 均已实现；待真实 AppID/Secret 与账号 smoke | [微信开放平台](https://open.weixin.qq.com/)、[微信小程序登录](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html) |
| 支付宝登录 | 创建网页/移动应用和小程序，配置 RSA2 密钥、授权回调及服务器域名 | Web 授权页、`alipay.system.oauth.token`、RSA2 响应验签和小程序交换均已实现；待真实账号 smoke | [支付宝网页/移动应用](https://open.alipay.com/module/webApp)、[小程序 my.getAuthCode](https://miniprogram.alipay.com/docs/miniprogram/mpdev/API_OpenAPI_getAuthCode) |
| Apple 登录 | Apple Developer 中启用主 App ID，创建 Services ID 与 Sign in with Apple Key，登记域名和 Return URL | code exchange、短期 client secret 和 Apple JWKS 验签已实现；待开发者账号与 HTTPS smoke | [Apple Web 配置](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)、[Token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens) |
| 飞书/Workplace 分发（可选） | 在飞书开放平台创建应用机器人、启用机器人能力、申请所需最小权限并配置事件回调 | 将 Travel Agent 对话作为一个受控渠道，不导入证件/支付或 Cookie | [飞书机器人概述](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/bot-v3/bot-overview) |
| 社交数据 | 指定授权主体、专用账号与合规范围；同意只读、遇 challenge 直接降级 | 按已有第三方安全门审计一个候选 Worker；不在 Pi 主进程加载 Cookie | 以各平台当期开发者条款和书面授权为准 |
| 携程商旅/华住会企业直连 | 由企业主体申请、签约并取得 client credentials、网络白名单等授权 | 新增独立企业 Provider；不复用普通用户 Cookie，也不打开自动交易 | [携程商旅开放平台](https://openapi.ctripbiz.com/)、[华住会开放平台](https://docs.huazhu.com/) |

## 当前状态与下一步

DeepSeek 与 Kimi 模型路由、飞猪和途牛库存均已完成无敏感真实调用；V4 Flash 还完成“首次描述 → 增量理解 → 四域联动研究 → 候选提案 → 用户选择提交”的两轮工具轨迹。高德 Key 已确认有效，但控制台只有少量成功调用时出现 `10044`；低速矩阵证明它不是 `10021` QPS 超限，也不是 POI 2.0 参数或单接口问题。用户确认额度正常，因此当前结论是高德账号网关状态与控制台不一致，需要平台工单核查，不能写成额度耗尽或“稍后重试”。天气控制链已实现，Open-Meteo 已通过带真实 16 天预报的 `passed_noncommercial_development_smoke`；生产仍保持授权门。

高德服务组、POI v3/v5 字段差异、IP 诊断、动态地图与路线采用顺序见[高德数据能力全景与 Travel Agent 采用报告](../research/2026-08-16-amap-data-capability-landscape.md)。城市移动的旅行者路径、代码审计、Mobility Gate 与对抗验收见[高德城市移动与产品代码审计](../research/2026-08-16-amap-city-mobility-product-and-code-audit.md)。

```bash
npm run smoke:models
npm run smoke:amap
npm run smoke:weather
npm run smoke:inventory
```

结果会只输出 Provider 状态和无敏感测试说明。Kimi 通过后，再做一次用户主动上传的非敏感旅行图片验收；此后才连接图片解析 UI。
