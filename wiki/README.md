# Travel Agent V2 Wiki

这里是 Travel Agent 的唯一当前规范。V2 首先服务入境中国的自由行与半自由行游客，从“生成攻略”升级为“出发前准备、行中执行与变化恢复”；国内 AI 重度用户作为第二增长曲线。吃、住、行、玩仍全部覆盖，并继续以共享决策状态和受控证据链组织，而不是四个孤立功能或 Workflow。

`current/01-product.md` 是当前 V2 产品定义；其余规范正在按产品、界面/跨端、Agent、Skills/Provider、Runtime 的顺序增量同步。同步完成前，旧文档中的“登录后开始”“国内与入境同优先”“首屏四域候选”等表述可能过时；文档之间冲突时以最新用户决策为准并同步修订，且文档更新不代表相应代码已实现。

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
11. [智能规划能力产品迭代文档](./current/11-intelligent-planning-iteration.md)
12. [Agent Runtime、Skills 与动态并行架构](./current/12-agent-runtime-and-parallelism-architecture.md)

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
2026-08-26 的同一上海家庭旅行实测、高德门控解除证据、Provider 融合缺陷和本轮验收基线见 [上海家庭旅行黄金路径与 Provider 融合缺陷审计](./research/2026-08-26-user-golden-path-provider-fusion-bug-audit.md)。
2026-08-27 的候选可见工作台、未提交试排、多日住宿回环路线、快捷替换以及桌面/390px 真实 QA 见 [可见旅行规划工作台与多点路线真实用户 QA](./research/2026-08-27-visible-planning-workbench-and-route-preview-qa.md)。
TREK、Airbnb Trips 与旅行规划产品的 UI 参考、采用/拒绝理由，以及 1855px、1440px、390px 的 Impeccable 实测见 [Travel Workbench UI/UX 优化记录](./research/2026-08-27-travel-workbench-ui-ux-reference-and-impeccable-pass.md)。
Beautiful UI、beUI、Rare UI、Transitions.dev 与 shadcn/ui 的组件、依赖、许可和实际视觉核验，以及基于第一性原理收敛的 V3 Spatial Decision Workspace 设计与迭代方案见 [2026-08-29 前端组件调研与第一性原理 V3 设计方案](./research/2026-08-29-ui-component-sources-and-first-principles-redesign.md)。

高德 Web/JS API 申请边界、逐人旅行关怀调研、真实产品审查与工程落地见 [2026-08-16 高德能力申请与逐人旅行关怀](./research/2026-08-16-amap-entitlements-and-traveler-care.md)。
可装载的 Travel Agent Skills 统一维护在 `plugins/travel-agent/skills/`；Pi package 只引用该目录，不另存副本。

## 资料说明

- 最新用户确认与 `wiki/current/`：当前范围、架构与产品决策的工作基准，随决策持续修订。
- `agent.md`、`.pi/SYSTEM.md`、`travel-agent-pi-package/runtime/`：父 Agent 行为与可执行 Runtime 合同。
- `wiki/research/`：研究结论、固定版本、许可与采纳/延期理由；会议中较早的单地区、少量 Skill、四个 Workflow 讨论已被后续决策覆盖。
- 本地私有 `rwa-docs/`：不可改写且不随公开仓库分发的会议原始证据。

## 当前状态

- **产品目标：** V2 PRD 已锁定入境优先、免登录首次价值、出发准备、地图主路线、可信执行、移动端 Today、局部恢复和到访结果闭环。研究方向不再只是 Brainstorm，但代码仍处于从 V1 基础向 V2 迁移的阶段。
- **可复用实现：** 已有共享旅行状态、持久化 Chat-first 对话、完整历史下的增量理解、一次四域联动研究、待确认候选、HTTP/MCP、Web/PWA、原生壳和小程序入口。高德 Adapter 已覆盖地点/照片/天气/静态地图与城市路线合同；用户确认地点后由 Runtime Mobility Gate 自动比较步行、公交地铁和打车，并把路线写入 QA、地图与前端。当前高德账号门控已经解除，地点、天气、路线和静态地图完成真实 smoke；飞猪和途牛继续补充酒店、航班、火车和景点商业库存。
- **本轮已落地的 V2 纵向路径：** 免登录 Guest Trip、登录后旅行/对话合并、旅行级准备状态、图片导入、候选可见的地图规划工作台、未提交多点路线试排、按日返回住宿、快捷替换、移动端 Today、变化恢复入口和核心中英界面均已进入真实代码与浏览器路径。自主决策、影响与可逆性见[实施记录](./current/10-v2-implementation-decisions.md)。
- **Computer Use 反证已修复并复测：** 新 Safari 自然会话现在支持“已购票 → user-confirmed arrival → 只确认住宿 → 机场接驳 → 询问推荐理由”。聊天、UI 与 TripState 一致；玩/吃继续 open 且候选可提交。上一版仅凭脚本得出的完成结论仍视为无效，本次通过结论只覆盖该真实路径；完整证据见[2026-08-26 QA 报告](./research/2026-08-26-user-golden-path-provider-fusion-bug-audit.md)。
- **可见规划与替换路径已复测：** 新自然语言会话先显示四域当前选择，再按用户点击展开一个领域的替代项；候选切换会在不修改 TripState 的前提下重算按日多点路线。桌面常见宽度保持“行程 + 地图”同屏，移动端使用 Trip 概览和独立 Map/Today；真实操作见[功能 QA](./research/2026-08-27-visible-planning-workbench-and-route-preview-qa.md)与[UI/UX 优化记录](./research/2026-08-27-travel-workbench-ui-ux-reference-and-impeccable-pass.md)。
- **2026-08-27 UI/UX 设计基准已进入真实前端：** 当前桌面是可调对话栏、环节决策列和地图画布；移动端与轻量小程序使用底部 Chat / Trip / Map。替代方案、当前/试排路线、时间/步行/费用/体力影响及确认动作在同一闭环中可见。1440×900、393×852、320px、1000px 和横屏浏览器验收以及 source/implementation 并排证据见根目录 `design-qa.md` 与 `design/2026-08-27-workspace-ui-ux-optimization/`。
- **Agentic Runtime 四个 Changeset 与 P0/P1 一致性加固已实施：** HTTP/MCP/Pi business runtime 已统一 Provider 工厂；四个组合 Skill 真实进入 Parent/Child context；Web 在一次 Provider 取数后通过 Dynamic Workflow library 运行最多三条不同语义 lane，Pi package 保留三个只读 `pi-subagents` child agent。required lane 覆盖、旧 run 丢弃、一次 Join/Proposal、模型 fallback ledger、OTA 空库存语义和 single-process 部署门使用同一运行对象；partial 不再冒充完整。fixture 全覆盖、最新 DeepSeek 3/3 lane 和 Kimi 2/2 lane 均通过；锁定 Pi 0.84.1 的普通只读 Child 也通过。目标全局 Pi 0.74.0 不兼容，多实例与跨实例 resume/steer 未支持，详见[动态并行架构](./current/12-agent-runtime-and-parallelism-architecture.md)。
- **2026-08-29 真实用户使用审计已记录 14 项问题与归因（[审计与 Fix Checklist](./research/2026-08-29-real-user-product-audit-and-fix-checklist.md)）：** 归因结论（其 §11）——主因是领域建模缺口（行程时间语义与确认前可执行性门缺失，TA-UX-001/002/003），并行脏改动是放大器（CTA 越界、触控回退等回归），另有承诺-能力一致性产品约束（「让 AI 优化站序」类伪直接操作）。Batch A 已提升为迭代文档 §11 路线图的 A0 行程正确性门禁，为最优先修复批次。
- **智能规划与 V3 前端 M0/A/B 已落地（2026-08-29）：** agentic 规划智能体仍是产品核心；结构化价格、分域预算、确定性估算、Agent 预算/推荐工具、决定行价格槽、六候选渐进比较、跨域试排 Δ、真实 activity、1180px Chat 折叠、移动 MapRouteSheet 与小程序局部确认已进入真实代码和浏览器路径。完整实施证据及 C/D 未关闭范围见[迭代文档 §12](./current/11-intelligent-planning-iteration.md)与[V3 方案 §13](./research/2026-08-29-ui-component-sources-and-first-principles-redesign.md)；按天出行总账、执行事件和真机 OAuth 不在本次完成结论内。
- **仍未关闭的 V2 结果：** 小众/当地特色仍缺独立社交或到访证据；实时设施、外宾住宿资格、生产商业授权、真实四平台 OAuth、执行事件、地点英文归一、Guest 清理和多端真机验收仍是上线门。库存班次与用户已确认到达时间冲突时只作对照，不能冒充匹配航班。
- **当前 live Agent 覆盖边界：** 独立 DeepSeek 3/3 与 Kimi 2/2 结构化 smoke 已通过；真实浏览器复杂四域请求最新为 2/3 lane，地方发现超时。界面和聊天会明确显示 partial，TripState 未确认项不变；因此只能说有界降级与状态一致性通过，不能说自然用户路径已稳定全覆盖。
- 父 Agent 默认使用 DeepSeek V4 Flash，用户可按对话切换 V4 Pro 或 Kimi K3；Pi package 的只读 Kimi K2.6 Child 在锁定 Pi 0.84.1 consumer 中可运行。Kimi 作为 Web 语义 fan-out fallback 另经双 lane 结构化门验证，2026-08-28 最新复验完整通过，当前可受控启用。
- 当前凭据下，DeepSeek、Kimi、高德、飞猪和途牛已通过各自对应的真实 smoke。高德没有 `10044`、鉴权或 QPS 阻塞。库存班次与价格只能作为带 `checkedAt` 的动态快照。Provider/模型 smoke 不等于用户路径通过；指定自然确认链仍需以 Web/TripState 证据单独判断。
- 不在 V2 核心交付：内容 Feed、创作者激励、商家自助入驻、广告竞价、统一收单、自动退改签、自动购买、完整 B 端后台或六端完全同版。
