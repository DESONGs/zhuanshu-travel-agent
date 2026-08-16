# Travel Agent V1 Wiki

这里是 Travel Agent V1 的唯一当前规范。它定义一个面向 C 端、面向多种目的地和情景的完整旅行 Agent：吃、住、行、玩全部覆盖，但以共享决策状态和受控证据链组织，而不是四个孤立功能或 Workflow。

## 阅读顺序

1. [产品定义与用户体验](./current/01-product.md)
2. [Agent、上下文与决策架构](./current/02-agent-architecture.md)
3. [Skills、数据、Provider 与 MCP](./current/03-skills-providers-and-mcp.md)
4. [Pi Runtime 迁移与开发计划](./current/04-runtime-and-development.md)
5. [安全、第三方与上线边界](./current/05-security-and-third-party.md)
6. [跨端交付、数据与登录](./current/06-cross-platform-delivery.md)
7. [界面与路线执行信息](./current/07-route-experience.md)
8. [模型路由、账号接入与数据能力](./current/08-provider-accounts-and-routing.md)
9. [账号与 API 配置说明](./current/09-account-configuration-guide.md)

本轮偏移原因与修复证据见 [2026-08-14 全链路用户路径审计](./research/2026-08-14-full-user-path-audit.md)。
最新旅行者实测见 [2026-08-15 真实旅行者可用性审计](./research/2026-08-15-traveler-usability-audit.md)。
中国铁路、飞猪、途牛及企业库存来源见 [2026-08-15 中国旅行库存与 Agent Provider 调研](./research/2026-08-15-china-travel-inventory-provider-research.md)。
高德个人账号的实际配额异常、千用户容量/成本和天气落地见 [2026-08-16 高德配额、千用户成本与天气联动调研](./research/2026-08-16-amap-quota-cost-and-weather-integration.md)。
高德完整数据能力、POI v3/v5 字段差异、服务分类、IP 诊断与 Travel Agent 采用顺序见 [2026-08-16 高德数据能力全景与 Travel Agent 采用报告](./research/2026-08-16-amap-data-capability-landscape.md)。
高德路线能力、旅行者黄金路径、代码偏移、Mobility Gate 与对抗验收见 [2026-08-16 高德城市移动与产品代码审计](./research/2026-08-16-amap-city-mobility-product-and-code-audit.md)。

高德 Web/JS API 申请边界、逐人旅行关怀调研、真实产品审查与工程落地见 [2026-08-16 高德能力申请与逐人旅行关怀](./research/2026-08-16-amap-entitlements-and-traveler-care.md)。
可装载的 Travel Agent Skills 统一维护在 `plugins/travel-agent/skills/`；Pi package 只引用该目录，不另存副本。

## 真相源优先级

| 优先级 | 来源 | 用途 |
| --- | --- | --- |
| 1 | 后续用户确认与本 Wiki 的当前规范 | 当前范围、架构、产品决策和验收标准。 |
| 2 | `agent.md`、`.pi/SYSTEM.md`、`travel-agent-pi-package/runtime/` | 父 Agent 行为与可执行 Runtime 合同。 |
| 3 | `wiki/research/` | 研究结论、固定版本、许可与采纳/延期理由。 |
| 4 | 本地私有 `rwa-docs/` | 不可改写且不随公开仓库分发的会议原始证据。公开副本以本 Wiki 的追溯记录为准；会议中较早的单地区、少量 Skill、四个 Workflow 讨论已被后续决策覆盖。 |

## 当前状态

- 已实现并通过合同测试：共享旅行状态、持久化 Chat-first 对话、完整历史下的增量理解、一次四域联动研究、待确认候选、HTTP/MCP、Web/PWA、原生壳和聊天优先的小程序入口。高德 Adapter 已覆盖地点/照片/天气/静态地图与城市路线合同；用户确认地点后由 Runtime Mobility Gate 自动比较步行、公交地铁和打车，并把路线写入 QA、地图与前端。真实高德账号仍受 `10044` 阻断时，路线保持 unavailable。飞猪 FlyAI 已通过受限只读 smoke，并为酒店、航班、火车和景点补充商业库存及飞猪跳转。
- 父 Agent 默认使用 DeepSeek V4 Flash，用户可按对话切换 V4 Pro 或 Kimi K3；Pi sub-agent 默认使用 Kimi K2.6。三种父模型与 Kimi K2.6 图片理解均已通过无敏感真实调用，V4 Flash 另通过两轮工具调用黄金路径。
- 当前凭据下，DeepSeek、Kimi、飞猪和途牛已通过真实 smoke；途牛酒店、火车和航班三类各返回 6 条。高德 Key 有效且曾返回真实 POI 与照片，但 0.455 QPS 的 v3/v5/天气诊断矩阵全部在参数校验前返回 `10044`。用户确认控制台额度正常，因此状态保持 `credential_valid_account_gate_10044`：这是平台账号网关阻断，不是已证实的额度耗尽或 QPS。天气已贯穿共享状态、联合候选、局部重排和前端；开发环境使用具名署名的 Open-Meteo 非商业回退，生产仍需高德完整 smoke 或付费天气 Key。小红书组合 Skill/只读合同已完成，真实 Worker 与账号仍未接通。
- 不在 V1：内容 Feed、创作者激励、商家自助入驻、广告竞价、佣金结算、统一收单、自动退改签或自动购买。
