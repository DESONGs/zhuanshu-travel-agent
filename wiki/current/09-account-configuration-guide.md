# 账号、模型与 API 配置说明

这份说明只列出当前代码真正能读取的配置，并把“已有代码”“需要账号”“仍需开发”分开。密钥只放在项目根目录被 Git 忽略且权限为 `0600` 的 `env_travel.local`，不要放进聊天、截图、`VITE_*` 或小程序源码。

## 现在先填这三组

```dotenv
# 文字推理与旅行工具调用
TRAVEL_AGENT_MODEL_PROVIDER=deepseek
TRAVEL_AGENT_MODEL=deepseek-v4-flash
DEEPSEEK_API_KEY=
TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS=not_run

# Kimi 中国区：platform.kimi.com 的 Key 对应 https://api.moonshot.cn/v1
TRAVEL_AGENT_VISION_PROVIDER=moonshotai-cn
TRAVEL_AGENT_VISION_MODEL=kimi-k2.6
MOONSHOT_API_KEY=
TRAVEL_AGENT_KIMI_SMOKE_STATUS=not_run

# 高德 Web 服务
AMAP_API_KEY=
# 只有你在控制台为这个 Key 开启“数字签名”时才填；否则保持空白
AMAP_API_SECRET=
TRAVEL_AGENT_AMAP_SMOKE_STATUS=not_run

# 天气回退：无 Key 只允许本地非商业评估；生产必须购买 Open-Meteo 计划
TRAVEL_AGENT_OPEN_METEO_ENABLED=true
OPEN_METEO_API_KEY=
```

项目只维护标准字段 `MOONSHOT_API_KEY`。旧会议项目的 `PI_*`、飞书、ASR、阿里云语音和文档 Worker 字段已从实际配置与加载白名单中删除。

## 1. Kimi：旧 Key 能不能继续用

旧 Key 已在修正端点后验证可用，无需重建。你给出的 [Kimi 中国区快速开始](https://platform.kimi.com/docs/overview) 明确使用：

- 环境变量：`MOONSHOT_API_KEY`
- API 端点：`https://api.moonshot.cn/v1`
- Provider 配置：本项目对应 `moonshotai-cn`

此前项目使用的是国际区 `https://api.moonshot.ai/v1`，中国区 `.com` Key 打到国际区端点会认证失败。当前已在 `.cn` 端点确认 List Models 返回 200，且 `kimi-k2.6` 的真实图片 smoke 通过。以后只有 Key 被删除/过期或账户状态异常，才需要在 [Kimi API Keys](https://platform.kimi.com/console/api-keys) 重建 Key。

Kimi 图片理解模型通过 `TRAVEL_AGENT_VISION_MODEL` 选择：

| 模型 | 本项目建议 | 说明 |
| --- | --- | --- |
| `kimi-k2.6` | 默认 | 256K 上下文，支持文本、图片和视频，质量/成本更适合旅行图片理解。项目在短视觉提取时按官方参数关闭长思考，避免思考内容耗尽输出额度。 |
| `kimi-k3` | 高质量或超长上下文时使用 | 1M 上下文、视觉与更强推理，成本和延迟更高。 |
| `kimi-k2.7-code` / `-highspeed` | 不用于旅行默认路由 | 面向编程 Agent，虽然支持多模态，但不是旅行内容理解的优先选择。 |

底层 Pi 运行时已支持这些模型。旅行对话现在允许用户按对话选择父 Agent：默认 `deepseek-v4-flash`，复杂任务可切 `deepseek-v4-pro` 或 `kimi-k3`；选择会保存到对话，下一轮开始生效。Pi sub-agent 默认固定为 `moonshotai-cn/kimi-k2.6`。Web/小程序的图片上传入口目前尚未开发，所以 Kimi 连通后先证明后端可用，不能宣称普通用户已经能上传图片。

DeepSeek V4 官方模型 ID 只有 `deepseek-v4-flash` 和 `deepseek-v4-pro`。两者均支持 1M 上下文、思考模式与 Tool Calls；Flash 速度和成本更适合默认旅行规划，Pro 用于更复杂的联合取舍。参见 [DeepSeek V4 更新](https://api-docs.deepseek.com/updates/) 与 [模型和价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)。

若使用国际区 `platform.kimi.ai` 创建的 Key，才将 Provider 改为 `moonshotai`；两区 Key 与端点不能混用。

## 2. 高德：Key 与私钥怎么填

1. 登录 [高德开放平台控制台](https://console.amap.com/)，创建应用。
2. 添加 Key 时服务平台选择 **Web 服务**，不是 Web 端（JS API）、Android 或 iOS。官方步骤见 [创建 Web 服务 Key](https://lbs.amap.com/api/webservice/guide/create-project/get-key)。
3. 将 Key 填入 `AMAP_API_KEY=`。
4. 如果没有开启数字签名，`AMAP_API_SECRET=` 保持空白；Web 服务的 `sig` 是可选参数。
5. 如果开启了数字签名，在控制台“设置”中查看与 Key 配对的私钥并填入 `AMAP_API_SECRET=`。项目会按官方规则自动生成 `sig`；私钥不会进入前端或日志。规则见 [高德数字签名说明](https://developer.amap.com/faq/quota-key/key/41181/)。

当前代码已接入 [POI 搜索 2.0](https://developer.amap.com/api/webservice/guide/api-advanced/newpoisearch)（权益不足时降级官方基础 POI）、地点照片、地址与坐标、[路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)、带路线折线的[静态地图](https://lbs.amap.com/api/webservice/guide/api/staticmaps)、高德导航跳转和[天气查询](https://lbs.amap.com/api/webservice/guide/api/weatherinfo)。路径规划提供查询时的公交/地铁、步行和驾车估算，不等于实时公交到站或即时叫车供给。入口出口完整核验、电梯、卫生间、储物柜、充电宝、酒店房态与最终价格仍需独立授权来源；配置 Key 不会自动补齐这些能力。

同一个 **Web 服务** Key 可调用 POI 2.0、路径规划 2.0、天气、地理编码和静态地图，前提是账号权益与真实 smoke 均通过。POI 2.0 传 `show_fields=navi` 可返回部分大型 POI 的导航引导点、入口和出口坐标，但并不保证每个地点都有，也不证明入口无障碍。若要在网页显示可交互的动态地图，需在同一应用下另建服务平台为 **Web 端（JS API）** 的 Key，并使用配套 `securityJsCode`；它不能与服务端 `AMAP_API_KEY` 混用。动态地图申请仍从[应用管理](https://console.amap.com/dev/key/app)进入，官方说明见[JS API 准备](https://lbs.amap.com/api/javascript-api/guide/abc/prepare)。

新的 Web 服务 Key 已通过鉴权，并曾在真实 smoke 中返回上海餐饮、住宿和景点 POI、地址、坐标及地点照片。用户确认控制台额度正常后，`npm run diagnose:amap` 以最高 0.455 QPS 分别测试 v5 最小搜索、v5 扩展搜索、错误参数、v3 POI、地理编码和天气，全部在参数校验前返回 `10044 USER_DAILY_QUERY_OVER_LIMIT`。因此它不是 QPS、v5 参数或单接口问题，而是高德账号网关状态与控制台不一致。请向高德提交工单核查账号级状态；不要连续重试。完整证据见[配额、千用户成本与天气调研](../research/2026-08-16-amap-quota-cost-and-weather-integration.md)。只有 POI 四域、照片、天气、步行/公交/驾车路线和带折线静态地图同时通过后，才把 `TRAVEL_AGENT_AMAP_SMOKE_STATUS` 改为 `passed_live_smoke`。应用运行时在此之前不会反复调用受限账号；`diagnose:amap` 用于低速定位，`smoke:amap` 用于恢复后的完整验收。

## 3. 天气：高德与 Open-Meteo

天气已进入 Travel Agent 的共享状态、四域候选评估、局部重排和方案画布。高德完整 smoke 通过时优先使用高德天气；当前高德账号网关返回 `10044` 时，本地开发自动使用 Open-Meteo：

```dotenv
TRAVEL_AGENT_OPEN_METEO_ENABLED=true
# 本地非商业评估保持空白
OPEN_METEO_API_KEY=
```

Open-Meteo 免费端点仅允许非商业评估，不可直接用于产品生产。商业生产需在[价格页](https://open-meteo.com/en/pricing)购买计划，把 customer API Key 填入 `OPEN_METEO_API_KEY`；代码会切换到 `customer-api.open-meteo.com`，展示端保留 `Weather data by Open-Meteo.com (CC BY 4.0)`。行程超出 16 天预报窗口时，产品只记录待临近出发重新核验，不用当前天气替代。

## 4. 飞猪 FlyAI 与途牛官方 MCP

飞猪 FlyAI 已有可执行 Adapter。官方端点固定在审计过的 CLI 中，不需要自行填写 URL：

```dotenv
TRAVEL_AGENT_FLYAI_ENABLED=true
FLYAI_API_KEY=
TRAVEL_AGENT_FLYAI_SMOKE_STATUS=passed_read_only_isolated
```

在 [飞猪 FlyAI 控制台](https://flyai.open.fliggy.com/console) 申请生产 Key 后，只需填 `FLYAI_API_KEY`。当前 Key 已完成真实只读 smoke；允许酒店、航班、火车和景点搜索并展示飞猪详情跳转，不搜索美食、不代下单、不执行任意 FlyAI 命令。

途牛使用固定官方端点 `https://openapi.tuniu.cn/mcp/{train,hotel,flight,ticket}`，也不允许在 ENV 改成任意地址：

```dotenv
TRAVEL_AGENT_TUNIU_ENABLED=true
TUNIU_API_KEY=
TRAVEL_AGENT_TUNIU_SMOKE_STATUS=passed_read_only_isolated
```

到 [途牛 API Keys 控制台](https://open.tuniu.com/mcp/apikeys) 登录/注册并申请 API Key。当前 Key 已完成酒店、火车和航班真实查询；MCP 双层 `structuredContent/result` 响应也已归一。途牛当前文档限额为 5 RPM、50 RPD，适合作为第二来源与核验层。

12306 没有面向普通第三方应用公开的通用查询/购票 Key；本项目不会要求用户提供 12306 Cookie。铁路方案先由飞猪/途牛查询，最终购买仍跳转 12306 或授权平台。详细调研见 [中国旅行库存与 Agent Provider 调研](../research/2026-08-15-china-travel-inventory-provider-research.md)。

## 5. 配置后验证

```bash
chmod 600 env_travel.local
npm run smoke:models
npm run diagnose:amap
npm run smoke:amap
npm run smoke:weather
npm run smoke:inventory
```

模型输出应包含 `deepseek: passed_live_smoke`、`kimiVision: passed_live_smoke`，Kimi route 应为 `moonshotai-cn`。高德应返回 `passed_live_smoke`，且吃、住、行、玩各域、照片、静态地图和天气均有真实结果。`smoke:weather` 在没有付费 Key 时只会返回 `passed_noncommercial_development_smoke`，不得作为生产天气授权。通过后还需从真实聊天入口检查天气、候选、照片、地图、用户确认和失败恢复。

## 6. 暂缓平台：去哪注册、代码做到哪里

| 能力 | 注册/授权入口 | 当前代码事实 | 恢复开发时还要做什么 |
| --- | --- | --- | --- |
| 微信小程序登录 | [微信公众平台](https://mp.weixin.qq.com/)、[小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/) | 微信原生小程序壳已调用 `wx.login` 并把 code 发给 `/api/auth/platform-exchange`；服务端当前固定返回 `auth_provider_not_configured`。 | 创建小程序并取得 AppID/Secret，登记 HTTPS request 域名；服务端调用 `auth.code2Session`、校验一次性 code、保存 OpenID 映射并签发本站会话。不能把 `session_key` 下发前端。 |
| 支付宝小程序登录 | [支付宝开放平台](https://open.alipay.com/)、[my.getAuthCode](https://miniprogram.alipay.com/docs/miniprogram/mpdev/API_OpenAPI_getAuthCode) | 支付宝原生小程序壳已获取 `authCode` 并调用同一交换接口；服务端仍是未配置占位。 | 创建小程序应用，准备 AppID、应用私钥、公钥/证书和网关配置；服务端用授权码调用 token 接口、验签并签发本站会话。 |
| 飞书渠道（可选） | [飞书开放平台](https://open.feishu.cn/)、[机器人应用配置](https://open.feishu.cn/document/develop-an-echo-bot/faq?lang=zh-CN) | Travel Agent 没有飞书渠道 Adapter，也不再保留飞书 ENV 字段。 | 创建企业自建应用、开启机器人、最小化申请 `im.message.receive_v1` 和发送消息权限，配置事件或长连接，再把消息映射到现有 Conversation API。 |
| 携程商旅 MCP | [携程商旅开放平台](https://openapi.ctripbiz.com/)、[官方 MCP 说明](https://ct.ctrip.com/thinktanks/235566117077549) | 仅完成官方能力与申请路径调研，没有企业 credentials。 | 企业主体申请标准/高级/定制能力；拿到实际端点与凭据后新增独立只读 Provider。 |
| 华住会 B2B 酒店 | [华住会文档中心](https://docs.huazhu.com/)、[B2B API 目录](https://docs.huazhu.com/b2b/api/directory/) | 未接入；它是企业酒店直连 API，不是公开 MCP。 | 商务申请 client ID、secret、会员卡、AES key，登记生产出口 IP；先只接酒店/库存读取，订单仍需用户确认。 |

这些平台在账号、权限和真实服务端交换完成前，必须继续显示“尚未接通”，不能因为客户端目录、ENV 字段或占位接口存在就声称可用。
