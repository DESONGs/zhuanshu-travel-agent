# 2026-08-15 中国旅行库存与 Agent Provider 调研

## 结论

当前最简单且完整的落地组合是：高德负责地点与地图；飞猪 FlyAI 负责酒店、航班、火车和景点的商业库存发现与飞猪跳转；途牛官方 MCP 作为申请 Key 后的第二来源。12306 未发现面向普通第三方应用的公开官方查询/MCP，不能用社区抓取项目冒充官方授权。携程商旅 MCP 与华住会 B2B API 适合企业合同接入，不作为当前 C 端默认入口。

| 来源 | 官方能力 | 账号/授权 | 本项目决定 |
| --- | --- | --- | --- |
| 飞猪 FlyAI | 酒店、航班、火车、POI 搜索与飞猪详情跳转 | 当前已配置正式 FlyAI Key | 已接入只读受限 Worker并通过真实 smoke；不开放下单或任意 CLI。 |
| 途牛 MCP | 火车、酒店、航班、门票等 MCP；另有 OAuth 2.1 能力端点 | 当前已配置个人 API Key | 固定端点客户端已接入；酒店、火车、航班各返回 6 条真实结果。 |
| 铁路 12306 | 官方网站/App 提供旅客查询与购票 | 未发现公开通用开发者 API/MCP | 不抓取、不代登录；铁路搜索先用飞猪/途牛，购买由用户跳转官方或授权渠道。 |
| 携程商旅 | 企业旅行场景 MCP，覆盖酒店、机票、火车等推荐与查询 | 企业申请、签约和产品开通 | 企业版候选；未获得合同和凭据前不接线。 |
| 华住会 B2B | 酒店列表/详情、房价库存、可订检查、订单与取消回调 | 商务申请 client ID、secret、会员卡、AES key 与生产出口 IP 白名单 | 酒店直连候选；不是公开 C 端 MCP，当前不接交易面。 |
| 同程等传统开放平台 | 供应商/分销类传统 API 为主 | 商务或供应链协议 | 本轮未发现可直接用于 C 端 Agent 的公开官方 MCP，不做未经证实的接入声明。 |

## 飞猪 FlyAI 实测与安全结论

- 官方文档：[概览](https://flyai.open.fliggy.com/docs/overview)、[快速开始](https://flyai.open.fliggy.com/docs/quickstart)、[合作伙伴](https://flyai.open.fliggy.com/docs/partner)。
- 官方 Skill 仓库固定 SHA：[`alibaba-flyai/flyai-skill@54277b2`](https://github.com/alibaba-flyai/flyai-skill/tree/54277b27b68e53741954c08541faedba1d45cc7b)。
- npm 固定为 `@fly-ai/flyai-cli@1.0.16`，MIT；安装使用 `--ignore-scripts`。生产依赖审计未发现已知漏洞，但这不等于整个开发依赖树无风险。
- 无账号、临时 HOME 的只读 smoke 已真实返回广州至大理的火车与航班、大理酒店和景点，并提供飞猪详情深链。美食关键词召回了旅行套餐，不满足餐饮检索质量，因此禁用 FlyAI 食物搜索。
- 发布包为混淆后的 CLI bundle，会在 HOME 写设备 ID 并发送粗粒度设备信息；因此不能作为普通 Pi Extension 载入，也不能继承主进程环境。项目只允许 `search-hotel`、`search-flight`、`search-train`、`search-poi`，使用专用 HOME、无 Shell、无任意命令、无下单动作。
- `FLYAI_API_KEY` 只通过受限子进程环境传入；不执行 `flyai config set`，避免写用户 Home。

## 途牛官方 MCP

官方入口与能力文档：

- [MCP 平台概览](https://open.tuniu.com/mcp/docs/)
- [OAuth/MCP 接入](https://open.tuniu.com/mcp/docs/guide/mcp-auth.html)
- [火车 MCP](https://open.tuniu.com/mcp/docs/apidoc/mcp/trainMCP.html)
- [酒店 MCP](https://open.tuniu.com/mcp/docs/apidoc/mcp/hotelMCP.html)
- [调用限额](https://open.tuniu.com/mcp/docs/guide/ratelimit.html)

API Key 路线使用固定端点 `https://openapi.tuniu.cn/mcp/train`、`/hotel`、`/flight`、`/ticket`。项目不允许通过 ENV 改成任意 URL，只读取 `TUNIU_API_KEY`。当前只读工具白名单覆盖火车最低价/详情、酒店搜索/详情、航班最低价/舱位/预订所需信息以及最低门票查询；所有订购、取消和未知工具在网络请求前拒绝。Key 与 smoke 状态同时满足后，酒店、火车和航班搜索会进入组合 Provider 并归一为同一旅行提案；门票目前只保留底层只读工具，不在缺少真实返回验收时提前进入用户方案。

途牛文档当前说明账号最多创建 2 个 API Key，限制为共享的 5 RPM、50 RPD，适合作为低频核验和第二来源，不适合高并发主检索。CLI 的 `postinstall` 会写入多个用户 Home 下的 Agent Skills，因此本项目没有安装官方 CLI，而是实现固定端点、最小工具面的客户端。

## 12306 与社区 MCP

官方 [中国铁路 12306](https://www.12306.cn/) 未公开面向普通第三方应用的通用查询/购票 API 或 MCP。社区项目 [`Joooook/12306-mcp@ff6439d`](https://github.com/Joooook/12306-mcp/tree/ff6439da6f63d7d72181abea4568abd69878c600) 为 MIT 代码，但 README 标明仅用于学习，且实现直接调用 12306 站点接口并处理 Cookie。许可证只解决代码版权，不代表数据、账号或生产调用授权，因此不合入。

## 企业候选

- 携程商旅官方已发布 [AI MCP 能力说明](https://ct.ctrip.com/thinktanks/235566117077549)，并提供 [企业申请入口](https://openapi.ctripbiz.com/)。它适合差旅企业版，需申请后才能获得实际端点、client credentials 与商务权限。
- 华住会 [开放平台文档](https://docs.huazhu.com/) 与 [B2B API 目录](https://docs.huazhu.com/b2b/api/directory/) 提供真实酒店库存和订单接口；[接入流程](https://docs.huazhu.com/b2b/api/h5/process/)要求商务申请，[环境说明](https://docs.huazhu.com/b2b/api/h5/environment/)包含生产出口 IP 白名单。它是酒店直连合同，不是让普通用户填 Key 的公开 MCP。

## 配置与验收

服务器只读取以下新增变量：

```dotenv
TRAVEL_AGENT_FLYAI_ENABLED=true
FLYAI_API_KEY=
TRAVEL_AGENT_FLYAI_SMOKE_STATUS=passed_read_only_isolated

TRAVEL_AGENT_TUNIU_ENABLED=true
TUNIU_API_KEY=
TRAVEL_AGENT_TUNIU_SMOKE_STATUS=passed_read_only_isolated
```

执行 `npm run smoke:inventory`。FlyAI 开发 smoke 通过后可用于本地只读研究；生产必须填写 Key。途牛拿到 Key 后先启用并运行 smoke，只有结果为 `passed_read_only_isolated` 才把状态写回配置。任何 Provider 结果都只是候选和跳转，不得自动购买、退改或收集旅客证件。
