# Evidence Companion 技术方案审核报告

> 日期：2026-08-31
>
> 审核对象：
> - [Evidence Companion PRD v0.2](./2026-08-31-travel-evidence-companion-prd.md)
> - [初步技术方案 v0.2](./2026-08-31-travel-evidence-companion-technical-proposal.md)
> - [下一阶段技术调研](./2026-08-31-evidence-companion-next-iteration-technical-research.md)
>
> 审核基线：HEAD `29e7a11` + 工作区 36 项未提交改动（地图/跨端一批 + 上述三份文档自身）。
>
> 审核方式：对照真实代码逐条核验方案中的"当前代码基础"声称（合同、运行时、HTTP、Provider、前端、构建、wiki 路线图），并后台执行 `npm run check` 验证 E0 前置条件。本文只新增审核文档，不修改任何产品源码与方案原文。

## 1. 总体结论

**方向成立，落点准确，门禁够严；但按现状不能直接进入排期。**

- 方案对当前代码的 12 项关键声称，9 项属实、2 项需修正表述、1 项部分属实（§2）。没有发现虚构能力。
- 三个新增边界（Evidence Resolve / 非持久化 Evidence Presentation / Desktop Shell）与现有代码结构兼容，文件级落点清晰，不需要触碰 TripState、Proposal、Agent 内核（§3.1）。
- 排期前必须补齐：**2 个 E1 级技术缺口**（服务端抓取 SSRF 防护规范、ContentItem 扩展 vs 侧车存储的拍板）+ **3 个 E2 前置门**（`06-cross-platform-delivery.md` 现行文本显式排除 Electron、AMap JS Key 人工配置门、Electron 客户端自身登录流未定义）+ **1 个决策记录冲突**（现行文档写的是"桌面需求出现时评估 Tauri 2"，本次直接收敛 Electron 但未记录推翻理由）。
- **E0 出口当前实测为红**：`npm run check` 失败于一个与地图改动无关的定时炸弹测试（冻结时钟 vs 真实时间，今天触雷），baseline 提交前必须先修（§8.1）。
- E1 完成门"真实餐饮证据"存在现实可行性风险：无登录态下小红书公开链接大概率返回登录墙，E1 社交内容实际可得量可能趋近于零（§3.3）。

一句话：这不是架构返工的问题，而是几个具体工程定义尚未闭合的问题。补齐后即可按 E0–E5 执行。

## 2. 方案声称 vs 代码事实核验表

| # | 方案声称 | 代码证据 | 结论 |
| --- | --- | --- | --- |
| 1 | ContentItem 缺 title/language/media/access | `contracts/index.ts:403-412`，仅 8 个字段且 `additionalProperties: false` | 属实 |
| 2 | Candidate 图片不表达授权/Claim 关联 | `MediaItemSchema`（`index.ts:252-256`）只有 `url/title/source` | 属实 |
| 3 | Social Worker 三个只读动作与安全错误码已定义 | `travel-agent-pi-package/src/workers/social-worker-contract.mjs:8`；错误码全集 `index.ts:5-13`（AUTH_REQUIRED/CHALLENGE/RATE_LIMITED/SOURCE_CHANGED/SOURCE_UNAVAILABLE/TERMS_BLOCKED/EMPTY_VERIFIED） | 属实，但仅为合同——Worker 本体不存在（`src/adapters/social/` 为空目录，`provider-status.mjs:109` 写死 `blocked_pending_isolated_worker`），方案 §2 已如实承认 |
| 4 | TripPatchProposal 提交边界（revision/read set/write contract/锁定/新鲜度） | 强制点集中在 `trip-runtime-implementation.ts:1004-1060` `validatePatch` | 属实 |
| 5 | Mobility Preview 与 Plan–Check–Repair 已具备 | `planItineraryTrial`（`src/api/travel-service.mjs:1308`）是**运行时服务方法**（非测试设施），经 `itinerary-schedule.ts` 确定性检查 + 一次 repair | 属实 |
| 6 | 费用估算能力（方案 §2.1 未单列，PRD §5.3 依赖） | `estimateTripBudget`（`trip-runtime-implementation.ts:212-256`）：已选按实价、未选域取候选价**中位数**×人数/天数折算；`estimate_costs` 是 Parent 只读工具（`travel-conversation-agent.mjs:998-1016`） | 属实，但应表述为"确定性折算 + 候选中位数投影"，**不是独立价格源**；PRD 中"+¥360 餐饮估算"的精度上限由此决定 |
| 7 | `TripMapExplorer` 已消费 `RouteMapScene` | `route-map-scene.js:51`（纯投影，185 行）、`trip-map-explorer.jsx:62` | 属实，但在**未提交工作区**，baseline 上不存在 |
| 8 | 高德 JS 薄渲染器 + 服务端安全代理已实现 | `amap-map-renderer.js:27`、`amap-js-security-proxy.mjs`（仅 GET/HEAD、服务端注入 key、禁 `..`） | 属实，但真实 Key 未配置，当前状态 `amap_js_renderer_not_configured` |
| 9 | 飞猪/途牛 booking URL 与官方跳转 | `flyai-travel-research.mjs`、`tuniu-*.mjs` 在位 | 属实 |
| 10 | "Day、leg、mode、routeRole、geometry 已统一" | Day/role 在合同（`ItineraryStopRoleSchema` `index.ts:458`，8 种角色，9df4dad 引入）；geometry 是未提交 diff（`index.ts:449` polyline + `mobility.ts:142-144`） | **部分属实**：对工作区成立，对 baseline 不成立——E0 提交前这句话不能作为依赖前提 |
| 11 | "`research-trip` 和 `digest-travel-media` 方法" | `research_trip_options` 存在（`travel-service.mjs:1559`）；`digest-travel-media` 只是 Skill 文档，**不在运行时加载清单**（`travel-skill-loader.mjs:8` 的 SKILL_IDS 仅 understand/research/plan/recover） | **需修正表述**：方案 §2 把两者并列为已有方法，实际后者未接线 |
| 12 | 无 Electron/桌面壳 | `package.json` 无 electron 依赖，无桌面脚本 | 属实 |

补充事实（方案未提及但审核相关）：

- `operability` 是开放对象（`ExtensibleObjectSchema`，`index.ts:51`），routeVerified/weatherFit 等字段不受 schema 强制，投影层读取时必须防御性处理。
- ContentItem 与 Claim 之间是弱引用（`EvidenceClaim.sourceRefs` 为普通字符串数组），图一致性靠运行时而非合同。

## 3. 架构评审

### 3.1 三个新增边界的文件级落点

| 边界 | 落点 | 兼容性结论 |
| --- | --- | --- |
| Evidence Resolve | `src/http/app.mjs` 新增端点，仿 `POST /api/visual-evidence/inspect`（`app.mjs:303`）的"requireSession + 调服务方法"模式；`api-client.js` 加 3 个方法；vite proxy 已覆盖 `/api`（`vite.config.mjs:12`） | 兼容，无需路由抽象改造 |
| Evidence Presentation | 服务端投影 + `src/persistence/` 新增 repository（翻译缓存，仿现有 JSON/Postgres 双实现工厂模式）；前端入口挂 `PlanningChoiceCard`（`travel-app.jsx:1076`）与 `PlaceDetailSheet`（`:703`），不新增顶级导航 | 兼容；注意 `visual-evidence/inspect` 先例是 `persistence:"none"`，翻译缓存是**首次引入内容类持久化**，需显式 TTL 与删除策略 |
| Desktop Shell | `apps/desktop/` 独立子工程（先例：`apps/miniapp/` 双目录 + 根 package.json 脚本 + `scripts/check-miniapps.mjs` 式校验），复用同一份 `vite build` 的 `dist/` Renderer | 兼容；新增 `desktop:*` 脚本与 Electron/打包器的 third-party-audit-v1 |

结论：三边界不触碰 `validatePatch`、`planItineraryTrial`、Provider 内核，与"不新增第二套状态/Proposal/Agent"的自我约束一致。

### 3.2 EvidencePresentationBundle 设计评审

赞成：单 schema、非持久化、可丢弃、Claim 引用回 EvidenceGraph、无实体坐标禁试排。这些与代码现状的约束方向完全一致。

**必须拍板而方案留白的问题：展示字段放哪。**

ContentItem 内嵌于 TripState（`state.evidence`，`index.ts:816`）。方案 §2.1 说"新增可丢弃展示 Projection，不扩张 TripState"，但 §5.1 的 bundle 里 `title/originalLanguage/access` 这类字段天然属于 ContentItem 的获取元数据。建议拆分：

- **扩 ContentItem**（小、可审计的引用元数据）：`title`、`originalLanguage`、`access`。代价是合同版本变更——`additionalProperties: false` + 既有 `runtime-data/trips/*.json` 需要一次性迁移或读取兼容。这是开发期可接受的合同演进，但要写进 E1 changeset。
- **侧车投影存储**（以 `contentItemId` 为键、带 TTL、可整体重建）：media rights、sections、译文、claimGroups。不进 TripState，符合方案原则。

**media.displayUrl 策略缺失。** 小红书图片有防盗链，前端 hotlink 大概率 403；高德/OTA 官方图能否直连需逐域验证。需要一张 per-domain 策略表：哪些域直连、哪些 `source_only`（只在原页视图）、是否允许服务端图片代理（注意：代理第三方图片在方案 §11.3 的"未授权不再分发"原则下需要单独授权论证，二者目前未对齐）。

**sourceUrl 白名单必须复用现有清单。** `social-worker-contract.mjs:3-6` 已有平台域白名单（xiaohongshu/xhslink/rednote、douyin），bundle 的 `sourceUrl` 校验应调用同一份，不允许出现第二份白名单。

### 3.3 E1 最大技术缺口：服务端抓取的 SSRF 边界

E1 的"公开分享链接 Adapter"意味着**服务端按用户提交的 URL 发起抓取**。这是一个 SSRF 面，方案只约束了 bundle 输出侧的 `sourceUrl` 白名单，没有定义抓取侧防护。排期前必须补一份抓取边界规范：

- 仅 https + 平台域白名单（复用 `social-worker-contract.mjs:3-6`）；
- 禁止跟随跨域重定向（或重定向后重新校验域）；
- DNS 解析后校验目标 IP，阻断内网/保留地址段；
- 响应大小与超时上限；不携带任何凭据与 Cookie；
- 失败映射到现有错误码（SOURCE_UNAVAILABLE / CHALLENGE），空结果与 `EMPTY_VERIFIED` 分开。

**现实可行性风险（影响 E1 完成门）**：无登录态抓取小红书公开分享链接，大概率得到登录墙或验证页，而非正文。E1 的社交内容实际可得量可能趋近于零。E1 完成门"英语用户从真实餐饮证据进入 Trial"的可行来源实际只有三类：用户分享链接的公开部分、OTA/官方/高德既有资料、创作者授权资料。建议把完成门措辞落到这三类来源上，不要隐含"平台抓取可用"；否则 E1 会在验收时才发现门不可达。

### 3.4 翻译与视觉管线

- 方向正确：固定提取器 + DeepSeek 结构化翻译 + sectionId 对齐 + 原文/译文/推断分层。图片翻译可直接复用 `/api/visual-evidence/inspect` 的"用户主动触发 + `persistence:"none"`"先例（`app.mjs:303`）。
- **方案缺失：成本与限流。** 翻译端点是登录用户的真实模型调用（按 token 计费）。需要：每用户速率限制、单次输入长度上限、超长截断策略、缓存命中率监控。§12 可观测事件建议增加 token 用量维度（只记数值，不记内容）。
- 缓存键（contentItemId + contentHash + targetLanguage + extractorVersion）设计合理；"原始正文按实现所需最短时间保存"过于模糊，E1 落地时应给出具体 TTL 数值与存储位置。

### 3.5 Electron 方案评审

安全默认值、Session partition、显式关闭 webContents、20 次开关无泄漏、不接 Provider/LLM/购买——这些与 Electron 官方安全指南一致，写得扎实。以下四点必须补：

1. **决策记录冲突（E2 前置门）。** 现行规范 `wiki/current/06-cross-platform-delivery.md:26` 写明"当前不引入 Flutter、React Native、**Electron**、Tauri 或 Taro 依赖"，且 `:25` 写的是"桌面出现商店、自动更新、托盘或文件关联需求后才评估 **Tauri 2**"。本次调研直接收敛到 Electron，但没有记录推翻 Tauri-first 立场的理由。技术上 Electron 对本案有真实优势（per-partition Session 隔离、`capturePage()`、WebContentsView 双视图模型成熟），应把比较与结论写成正式决策（`10-v2-implementation-decisions.md` 新增 D26），并同步修订 06 的 :14/:25/:26 三行。不处理就是 research 与 current 两份规范长期矛盾。
2. **桌面端自身登录流未定义（E2 Spike 漏项）。** Trusted App View 如何获得 Travel Agent 会话？现有 Web 走 OAuth 302 + Cookie；Electron 自定义 origin 不匹配 `TRAVEL_AGENT_CORS_ORIGINS`，且 `api-client.js:13-15` 的 `credentials:"same-origin"` 跨源不带 Cookie。可行路径是小程序模式（系统浏览器 OAuth + deep link 回传 Bearer token + `VITE_TRAVEL_API_BASE_URL` 等价配置）。方案 §7.4 只把"OAuth/deep link 焦点恢复"列为 Spike 项，**没有把"桌面端完成登录并持有会话"列为验证项**——这是桌面壳能否成立的同等核心项。
3. **不可信视图 → 可信侧的 IPC 合同未定义。** 方案 §7.2 允许证据视图使用"固定、无 Node 能力的隔离提取 preload"，§7.3 又说主进程只接收可信 App View 的消息——两处存在张力。实际数据流必须是：证据视图 preload → 固定 IPC 通道（如 `evidence:visible-text`）→ main 校验 `event.sender` 属于证据 view 的 webContents → payload 过 schema → 转发可信侧。这个合同要在 Spike 里以负面用例验证（伪造 sender 必须被拒绝）。
4. **AMap 项有外部前置。** Spike 清单含"AMap JS 与自定义 origin"，但 `AMAP_JS_API_KEY`/`AMAP_JS_SECURITY_CODE` 人工配置门未关闭（`13-tiered-map-experience-and-rendering-iteration.md` §13.3，当前 `amap_js_renderer_not_configured`）。方案 §7.4 未把此外部依赖列为 Spike 入口前置——不先配 Key，Spike 的 AMap 项无法出真实证据。

打包取向正确（不用 Forge experimental Vite plugin 接管构建）；建议在 Spike 中直接选定 electron-builder 或 Forge 仅 package/make 之一，并连同 Electron 本体一起过 third-party-audit-v1（固定版本、许可、写面）。

### 3.6 Social Worker（E4）与既有边界一致性

方案 §4.2 与 AGENTS.md 的小红书/抖音边界逐项一致：三个只读动作、独立受限 Worker、主进程不持 Cookie、禁止任意 URL/Shell/eval、Challenge 即停。固定 SHA + 许可审计 + 三层 smoke + 条款书面审查的门禁设置正确。"没有真实专用账号和条款结论时保持 blocked"的停止条件正确。无意见。

## 4. 与既有路线图的关系

- **A0 行程正确性门禁已关闭**（9df4dad 双闸门 + 29e7a11 Plan–Check–Repair；审计 14 项全部 VERIFIED）。E 系列无现存阻塞。
- **E0 是真实未满足的前置**：HEAD 仍为 `29e7a11`，36 个脏文件中包括三份新文档自身。建议 E0 拆成两个提交：地图/跨端代码一个 commit，文档（13 + 三份 research + 本文）一个 commit，各自可回滚。E0 出口必须含 `npm run check` 全绿（结果见 §8）。
- **C/D 未关闭但与 E 系列无依赖冲突**。注意 PRD §5.3"整趟影响"依赖的分域账本已落地（§12 实施状态确认）。需要提醒：用户此前核心诉求中的"费用透明看板、租车 vs 公交决策"对应路线图的 C/D（出行总账、租车判断），**不是** E 系列的交付物；E 系列交付的是"证据可信"轴。排期上应显式说明两轴关系，避免 E 系列挤占 C/D。
- 三份文档的命名小瑕疵：调研文档称 E3 为"Electron Evidence Reader"，技术方案 §14 称"Electron Evidence Companion"，应统一。

## 5. 风险清单（按严重度）

| # | 级别 | 风险 | 缓解 |
| --- | --- | --- | --- |
| R1 | 高 | E1 社交内容实际可得量趋近于零，完成门不可达 | 完成门改落到"用户链接 + OTA/官方 + 创作者授权"三类来源；创作者授权资料先行 |
| R2 | 高 | 服务端抓取 SSRF 面未定义 | §3.3 抓取边界规范，E1 排期前补齐并配负面测试 |
| R3 | 中 | Electron 与现行 06/Tauri-first 决策冲突未记录 | E2 前新增 D26 + 修订 06:14/25/26 |
| R4 | 中 | Electron 桌面端登录流未定义 | 列入 Spike Go/No-Go 清单 |
| R5 | 中 | 媒体展示授权与防盗链未分域定义 | per-domain 媒体策略表；代理图片需授权论证 |
| R6 | 中 | 翻译端点无成本/限流设计 | 每用户配额 + 输入上限 + token 用量观测 |
| R7 | 低 | ContentItem 合同变更需迁移既有 runtime-data JSON | E1 changeset 写明迁移/兼容策略 |
| R8 | 低 | `operability` 为开放对象，投影层读取无 schema 保护 | 投影层防御性读取，后续迭代再收紧合同 |
| R9 | 低 | 文档表述问题：digest-travel-media"方法"未接线；E3 命名不一致；"路线语义已统一"对 baseline 不成立 | §6 修改建议 |

## 6. 对方案文档的具体修改建议

对《初步技术方案 v0.2》：

1. §2"当前代码基础"：把"`research-trip` 和 `digest-travel-media` 方法"改为"`research_trip_options` 服务方法；`digest-travel-media` Skill 文档（未列入运行时加载清单）"。
2. §2.1 表格"路线语义已统一"行加注：geometry（polyline）在未提交工作区，E0 提交前不作为依赖前提。
3. §4.1 公开分享链接 Adapter 一行：补充"抓取侧 SSRF 防护规范（本审核 §3.3）为 E1 排期前置"。
4. §5.1：增加"ContentItem 扩展 vs 侧车投影存储"的拍板结论（建议采用本审核 §3.2 的拆分）与既有 TripState JSON 迁移策略。
5. §5.1 media：增加 per-domain `displayUrl` 策略表（直连/source_only/代理），并对齐 §11.3 的再分发原则。
6. §6：增加翻译端点的每用户限流、输入长度上限与 token 用量观测。
7. §7.4 Spike 清单增加两项：桌面端 OAuth + deep link 登录并持有会话；伪造 IPC sender 的负面用例。并把 AMap JS Key 人工配置门列为 Spike 入口前置。
8. §14 E2 前增加决策动作：`10-v2-implementation-decisions.md` 新增 D26（Electron vs Tauri 2 比较与结论），同步修订 `06-cross-platform-delivery.md:14/25/26`。
9. §14 E1 完成门：改以"用户分享链接公开部分 + OTA/官方 + 创作者授权资料"为证据来源表述，删除对无登录态平台抓取的隐含依赖。
10. 统一 E3 命名（建议沿用"Electron Evidence Companion"）。

对《PRD v0.2》：§13 实施前置门增加第 7 条"完成 D26 决策记录与 06 文档修订"；§14"仍待复核"增加"E1 完成门的证据来源可得性（创作者授权资料是否就位）"。

## 7. E1 文件级实施图（交接开发线程）

按依赖顺序：

1. **合同**：`travel-agent-pi-package/src/contracts/index.ts` 扩 ContentItem（`title/originalLanguage/access`）；新增 `EvidencePresentationBundle` schema（单一定义，Provider/Agent/HTTP 共用）；同步 `runtime/` 合同镜像与既有 runtime-data 迁移策略。
2. **抓取**：新增 `src/adapters/share-link/`（或 `src/adapters/social/` 内）公开链接 Adapter——平台白名单复用 `social-worker-contract.mjs:3-6`，实现 §3.3 全部 SSRF 防护；输出经 `sanitizeSocialWorkerResponse` 同款净化。
3. **投影与缓存**：`src/persistence/evidence-projection-repository.mjs`（JSON/Postgres 双实现工厂，TTL + contentHash 键）；投影构建器从 EvidenceGraph + 展示元数据生成 bundle。
4. **HTTP**：`app.mjs` 仿 `:303` 模式新增三类端点（resolve 分享链接 / 读 bundle / 翻译）；全部 requireSession + 限流。
5. **前端**：`api-client.js` +3 方法；`PlanningChoiceCard` 加"当地人怎么说"聚合区；`PlaceDetailSheet` 扩展媒体/来源/Claim 展示与"看图文证据"入口；Evidence 模式 UI 状态（方案 §8.2 七项）保持前端会话级。
6. **测试**：合同 fixture、SSRF 负面用例（内网 IP/跨域重定向/超规响应）、上海家庭黄金路径真实浏览器证据（1440/1180/393），遵守审计规则——fixture 与单测不单独关闭任何验收项。
7. **出口**：`npm run check` 全绿 + 完成门真实路径证据。

## 8. 审核未覆盖项与 E0 验证结果

- 本审核基于文档与代码静态核验，未实际运行 Electron Spike、未触发真实平台抓取。
- `npm run check` 在 HEAD `29e7a11` + 工作区改动下实测：**未通过**。typecheck 通过；测试 187 项中 186 过、1 失败；链式命令在 `npm test` 处中止，`web:build` 与 `miniapp:check` 未执行。

### 8.1 失败项根因（与地图改动无关的定时炸弹）

失败用例：`tests/http-app.test.mjs:432`「guest travelers can plan before login and claim trips…」，断言 readiness 返回 200，实际 410 `guest_trip_expired`。

因果链：

1. 测试 fixture 注入冻结时钟 `clock: () => new Date("2026-08-24T12:00:00.000Z")`（`tests/http-app.test.mjs:20`）；
2. 建行程时 `guestExpiresAt = 冻结时钟 + 7 天 TTL`（`src/api/travel-service.mjs:937`，`GUEST_TRIP_TTL_MS` 7 天，`:33`），即 **2026-08-31T12:00:00Z**；
3. 过期判断用的是**真实** `Date.now()`（`src/http/app.mjs:154-156`），真实时间今天越过该阈值，用例从此刻起必然失败。

已核实 `src/http/app.mjs:154-156` 在 HEAD 上原样存在、测试文件无未提交改动、app.mjs 工作区 diff 只含 AMap 代理挂载——**干净检出的 HEAD 今天同样失败**，这不是地图/跨端改动引入的回归。

暴露的设计瑕疵：服务层时钟可注入，HTTP 层的 `requireTripMember` 却直接读 `Date.now()`，测试可测性不一致。建议最小修复（E0 内完成）：`createHttpApp` 接收 clock（默认 `() => new Date()`）并传入过期判断，或 fixture 改用不会过期的冻结日期；修复后补跑完整 check 再提交 baseline。

### 8.2 对 E0 结论的修正

E0 出口不能只是"提交 + 重跑黄金路径"：当前 check 是红的，baseline 提交前必须先修 §8.1。这与三份文档"地图改动已完成验证"的表述不矛盾（该失败与地图无关），但说明上一轮验证没有跑到全量 check，或跑时真实日期尚未触雷——恰好印证了审计 §11"存在性验收"的提醒：**只有全量 check 在提交当天重新跑绿，baseline 才算形成**。
