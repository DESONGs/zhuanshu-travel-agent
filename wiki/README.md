# Travel Agent V2 Wiki

这里是 Travel Agent 的唯一当前规范。V2 首先服务入境中国的自由行与半自由行游客，从“生成攻略”升级为“出发前准备、行中执行与变化恢复”；国内 AI 重度用户作为第二增长曲线。吃、住、行、玩仍全部覆盖，并继续以共享决策状态和受控证据链组织，而不是四个孤立功能或 Workflow。

`current/01-product.md` 已成为 V2 产品真相源；其余当前规范正在按产品、界面/跨端、Agent、Skills/Provider、Runtime 的顺序增量同步。在同步完成前，旧文档中的“登录后开始”“国内与入境同优先”“首屏四域候选”等表述若与 V2 PRD 冲突，以 V2 PRD 为准；这不代表相应代码已经实现。

## 阅读顺序

1. [产品定义与用户体验](./current/01-product.md)
2. [Agent、上下文与决策架构](./current/02-agent-architecture.md)
3. [Skills、数据、Provider 与 MCP](./current/03-skills-providers-and-mcp.md)
4. [Pi Runtime 迁移与开发计划](./current/04-runtime-and-development.md)
5. [安全、第三方与上线边界](./current/05-security-and-third-party.md)
6. [跨端交付、数据与登录](./current/06-cross-platform-delivery.md)
7. [界面与路线执行信息](./current/07-route-experience.md)
8. [模型路由、账号接入与数据能力](./current/08-provider-accounts-and-routing.md)
9. [部署与配置指南](./current/09-account-configuration-guide.md)
10. [V2 升级实施决策与影响记录](./current/10-v2-implementation-decisions.md)

本轮偏移原因与修复证据见 [2026-08-14 全链路用户路径审计](./research/2026-08-14-full-user-path-audit.md)。
最新旅行者实测见 [2026-08-15 真实旅行者可用性审计](./research/2026-08-15-traveler-usability-audit.md)。
中国铁路、飞猪、途牛及企业库存来源见 [2026-08-15 中国旅行库存与 Agent Provider 调研](./research/2026-08-15-china-travel-inventory-provider-research.md)。
高德个人账号的实际配额异常、千用户容量/成本和天气落地见 [2026-08-16 高德配额、千用户成本与天气联动调研](./research/2026-08-16-amap-quota-cost-and-weather-integration.md)。
高德完整数据能力、POI v3/v5 字段差异、服务分类、IP 诊断与 Travel Agent 采用顺序见 [2026-08-16 高德数据能力全景与 Travel Agent 采用报告](./research/2026-08-16-amap-data-capability-landscape.md)。
高德路线能力、旅行者黄金路径、代码偏移、Mobility Gate 与对抗验收见 [2026-08-16 高德城市移动与产品代码审计](./research/2026-08-16-amap-city-mobility-product-and-code-audit.md)。

入境游客规模、客源与停留、海外信息收集习惯、中国境内执行摩擦、竞争和商业情景见 [2026-08-20 入境中国市场验证与产品闭环基准](./research/2026-08-20-inbound-china-market-validation.md)。
在此研究基础上重写的下一迭代定位、用户分层、完整旅程、跨端分工、商业闭环和验收标准见 [2026-08-20 下一迭代产品方向 Brainstorm V2](./research/2026-08-20-next-iteration-product-brainstorm-v2.md)。[Brainstorm V1](./research/2026-08-20-next-iteration-product-brainstorm.md) 仅保留为历史版本。
TREK 的地图工作台、候选/日程状态、协作、PWA、MCP 与许可边界，以及它对当前 Travel Agent 界面与合同的采用判断见 [2026-08-20 TREK 旅行工作台深度调研](./research/2026-08-20-trek-workbench-product-research.md)。
TREK 的 React/Vite PWA、NestJS/SQLite/WebSocket、Dexie/Workbox 离线实现，以及当前 Travel Agent 在 Capacitor、小程序、PWA、Tauri/Taro/Flutter 之间的全平台技术选项见 [2026-08-20 TREK 技术栈与全平台方案](./research/2026-08-20-trek-technical-stack-and-cross-platform-options.md)。

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

- **产品目标：** V2 PRD 已锁定入境优先、免登录首次价值、出发准备、地图主路线、可信执行、移动端 Today、局部恢复和到访结果闭环。研究方向不再只是 Brainstorm，但代码仍处于从 V1 基础向 V2 迁移的阶段。
- **可复用实现：** 已有共享旅行状态、持久化 Chat-first 对话、完整历史下的增量理解、一次四域联动研究、待确认候选、HTTP/MCP、Web/PWA、原生壳和小程序入口。高德 Adapter 已覆盖地点/照片/天气/静态地图与城市路线合同；用户确认地点后由 Runtime Mobility Gate 自动比较步行、公交地铁和打车，并把路线写入 QA、地图与前端。真实高德账号仍受 `10044` 阻断时，路线保持 unavailable。飞猪 FlyAI 已通过受限只读 smoke，并为酒店、航班、火车和景点补充商业库存及飞猪跳转。
- **本轮已落地的 V2 纵向路径：** 免登录 Guest Trip、登录后旅行/对话合并、旅行级准备状态、图片导入、地图优先的第一份结果、移动端 Today、变化恢复入口和核心中英界面均已进入真实代码与浏览器路径。自主决策、影响与可逆性见[实施记录](./current/10-v2-implementation-decisions.md)。
- **仍未关闭的 V2 结果：** 地点英文别名与 Provider 文本双语归一、安全分享链接读取器、执行事件持久化、合作入口归因、Guest 过期物理清理、真实四平台 OAuth、真实多端设备验收，以及高德账号门控解除后的餐饮/路线完整黄金路径。不能因核心界面已本地化而声称“完整英文产品”已经验收。
- 父 Agent 默认使用 DeepSeek V4 Flash，用户可按对话切换 V4 Pro 或 Kimi K3；Pi sub-agent 默认使用 Kimi K2.6。三种父模型与 Kimi K2.6 图片理解均已通过无敏感真实调用，V4 Flash 另通过两轮工具调用黄金路径。
- 当前凭据下，DeepSeek、Kimi、飞猪和途牛已通过真实 smoke；途牛酒店、火车和航班三类各返回 6 条。高德 Key 有效且曾返回真实 POI 与照片，但 0.455 QPS 的 v3/v5/天气诊断矩阵全部在参数校验前返回 `10044`。用户确认控制台额度正常，因此状态保持 `credential_valid_account_gate_10044`：这是平台账号网关阻断，不是已证实的额度耗尽或 QPS。天气已贯穿共享状态、联合候选、局部重排和前端；开发环境使用具名署名的 Open-Meteo 非商业回退，生产仍需高德完整 smoke 或付费天气 Key。小红书组合 Skill/只读合同已完成，真实 Worker 与账号仍未接通。
- 不在 V2 核心交付：内容 Feed、创作者激励、商家自助入驻、广告竞价、统一收单、自动退改签、自动购买、完整 B 端后台或六端完全同版。
