# Travel Agent V2 Wiki

Travel Agent 的文档总入口。三层结构：

- `current/`：唯一工作基准（产品、架构、交付规范），随用户决策持续修订；
- `research/`：**进行中迭代**的工作文档，根目录只保留当前一期；
- `research/archive/`：已关闭迭代的研究与审计，结论已吸收进 `current/`，只供追溯，不作为当前开发依据。

文档之间冲突时以最新用户决策为准并同步修订；文档更新不代表相应代码已实现。

## 当前迭代：Evidence Companion（2026-08-31 启动）

| 文档 | 角色 | 状态 |
| --- | --- | --- |
| [PRD v0.2](./research/2026-08-31-travel-evidence-companion-prd.md) | 图文证据产品需求 | E0 / E1 已实现；E2 以后仍受前置门约束 |
| [初步技术方案 v0.2](./research/2026-08-31-travel-evidence-companion-technical-proposal.md) | E0–E5 分阶段技术方案 | E0 / E1 已落地并记录真实验收 |
| [下一阶段技术调研](./research/2026-08-31-evidence-companion-next-iteration-technical-research.md) | 官方能力、开源候选与 Electron 证据 | 调研收敛 |
| [技术审核报告](./research/2026-08-31-evidence-companion-technical-review.md) | 对照真实代码的独立审核 | E1 缺口已关闭；3 个 E2 前置门仍有效 |
| [第三方候选审计登记](./research/third-party-candidate-audits.md) | third-party-audit-v1 持续登记 | 持续维护 |

实施顺序：E0 地图 baseline（已完成）→ E1 无账号图文证据闭环（已完成核心链路）→ E2 Electron 安全 Spike（未排期）→ E3 桌面证据阅读器 → E4 隔离 Worker（仅在审计、条款与专用账号 smoke 通过后）。E2 前必须完成 D26（Electron / Tauri 比较）、同步修订 06、打通桌面登录，并取得高德 JS 配置与浏览器 live smoke。

## 现行规范（current/）

| # | 文档 | 主题 |
| --- | --- | --- |
| 1 | [01-product](./current/01-product.md) | V2 产品定义与用户体验 |
| 2 | [02-agent-architecture](./current/02-agent-architecture.md) | Parent Agent、上下文与决策架构 |
| 3 | [03-skills-providers-and-mcp](./current/03-skills-providers-and-mcp.md) | Skills、数据、Provider 与 MCP |
| 4 | [04-runtime-and-development](./current/04-runtime-and-development.md) | Pi Runtime 迁移与开发计划 |
| 5 | [05-security-and-third-party](./current/05-security-and-third-party.md) | 安全、第三方与上线边界 |
| 6 | [06-cross-platform-delivery](./current/06-cross-platform-delivery.md) | 跨端交付、数据与登录 |
| 7 | [07-route-experience](./current/07-route-experience.md) | 界面与路线执行信息、Mobility 合同 |
| 8 | [08-provider-accounts-and-routing](./current/08-provider-accounts-and-routing.md) | 模型路由、账号接入与数据能力 |
| 9 | [09-account-configuration-guide](./current/09-account-configuration-guide.md) | 部署与配置指南 |
| 10 | [10-v2-implementation-decisions](./current/10-v2-implementation-decisions.md) | V2 实施决策记录（D22–D25） |
| 11 | [11-intelligent-planning-iteration](./current/11-intelligent-planning-iteration.md) | 智能规划迭代：M0/A0/A/B/C/D 路线图与实施状态 |
| 12 | [12-agent-runtime-and-parallelism-architecture](./current/12-agent-runtime-and-parallelism-architecture.md) | Agent Runtime、Skills 与动态并行架构 |
| 13 | [13-tiered-map-experience-and-rendering-iteration](./current/13-tiered-map-experience-and-rendering-iteration.md) | 分层地图与跨端渲染迭代 |

新接手建议路径：01 → 11 §11/§12 → 13 → 上方当前迭代表。

## 当前状态

- **产品方向：** V2 锁定入境优先、免登录首次价值，agentic 规划智能体为产品核心；吃住行玩在同一 TripState 上联动，不拆四个 Workflow（01、11）。
- **已落地基线：** V2 纵向路径（Guest Trip、登录合并、候选可见工作台、多点试排、移动端 Today、变化恢复）；Agentic Runtime 四 Changeset；智能规划 M0/A/B（价格三级、分域账本、确定性估算、Agent 预算/推荐工具）；A0 行程正确性门禁与 Plan–Check–Repair；分层地图核心链路；Evidence Companion E0/E1（统一展示合同、证据侧车、受限公开链接、快速翻译、候选与详情入口、路线试排联动）。实施证据见 10、11 §12–§14、12、13。
- **进行中：** Evidence Companion E2–E5 尚未启动。E2 仍受 D26、current/06 修订、桌面登录、高德 JS live smoke 和第三方安全审计约束；E4 还需要专用账号、条款结论和隔离只读 smoke。
- **未关闭（C/D 与上线门）：** 全程出行总账、执行事件、租车判断、四端真机、生产 OAuth、实时设施、外宾住宿资格、社交独立证据、Guest 清理、地点英文归一、高德 JS Key 配置（11 §12、13 §13）。
- **模型与 Provider：** DeepSeek V4 Flash 默认，可按对话切 V4 Pro / Kimi K3；DeepSeek、Kimi、高德、飞猪、途牛真实 smoke 通过。Provider/模型 smoke 不等于用户路径通过；partial 不冒充完整（08）。
- **不在 V2 交付：** 内容 Feed、创作者激励、商家自助入驻、广告竞价、统一收单、自动退改签、自动购买、完整 B 端后台、六端完全同版。

## 历史研究归档

[research/archive/](./research/archive/) 按日期收录已关闭迭代（一句话定位，正文含完整证据与截图资产）：

| 日期 | 文档 | 定位 |
| --- | --- | --- |
| 08-13 | [会议追溯](./research/archive/2026-08-13-meeting-traceability.md) | rwa-docs 会议证据的公开追溯副本 |
| 08-14 | [全链路用户路径审计](./research/archive/2026-08-14-full-user-path-audit.md) · [产品偏移与修正](./research/archive/2026-08-14-product-drift-and-correction.md) | V1→V2 偏移原因与修复证据 |
| 08-15 | [旅行者可用性审计](./research/archive/2026-08-15-traveler-usability-audit.md) · [库存 Provider 调研](./research/archive/2026-08-15-china-travel-inventory-provider-research.md) | 真实旅行者实测；铁路/飞猪/途牛库存来源 |
| 08-16 | [高德数据能力全景](./research/archive/2026-08-16-amap-data-capability-landscape.md) · [配额、成本与天气](./research/archive/2026-08-16-amap-quota-cost-and-weather-integration.md) · [城市移动审计](./research/archive/2026-08-16-amap-city-mobility-product-and-code-audit.md) · [能力申请与旅行关怀](./research/archive/2026-08-16-amap-entitlements-and-traveler-care.md) | 高德采用依据、Mobility Gate 与逐人关怀来源 |
| 08-20 | [入境市场验证](./research/archive/2026-08-20-inbound-china-market-validation.md) · [Brainstorm V2](./research/archive/2026-08-20-next-iteration-product-brainstorm-v2.md)（[V1](./research/archive/2026-08-20-next-iteration-product-brainstorm.md)）· [TREK 产品调研](./research/archive/2026-08-20-trek-workbench-product-research.md) · [TREK 技术栈与全平台](./research/archive/2026-08-20-trek-technical-stack-and-cross-platform-options.md) | V2 入境定位的市场与竞品依据 |
| 08-26 | [黄金路径与 Provider 融合审计](./research/archive/2026-08-26-user-golden-path-provider-fusion-bug-audit.md) | 上海家庭旅行验收基线 |
| 08-27 | [工作台与路线 QA](./research/archive/2026-08-27-visible-planning-workbench-and-route-preview-qa.md) · [UI/UX 优化记录](./research/archive/2026-08-27-travel-workbench-ui-ux-reference-and-impeccable-pass.md) | 候选可见工作台与三端实测 |
| 08-29 | [真实用户审计与 Fix Checklist](./research/archive/2026-08-29-real-user-product-audit-and-fix-checklist.md) · [前端组件调研与 V3 方案](./research/archive/2026-08-29-ui-component-sources-and-first-principles-redesign.md) | 14 项问题全部 VERIFIED；V3 Spatial Decision Workspace 与合并路线图来源 |

## 资料说明

- 父 Agent 行为与 Runtime 合同：`agent.md`、`.pi/SYSTEM.md`、`travel-agent-pi-package/runtime/`。
- 可装载 Skills 统一维护在 `plugins/travel-agent/skills/`；Pi package 只引用该目录，不另存副本。
- 本地私有 `rwa-docs/`：不可改写且不随公开仓库分发的会议原始证据；公开追溯以 `research/archive/` 为准。
