# Skills、数据、Provider 与 MCP

## Skill 目录

项目内 Skill 的唯一来源位于 `plugins/travel-agent/skills/`，Pi package 通过 `travel-agent-pi-package/package.json` 装载该目录。每个 Skill 都声明作用、Context Pack、结构化输出、`needs_context` 与禁止的状态写入；不要在 Pi package 内复制第二份。

| 分组 | Skills |
| --- | --- |
| 意图与人群 | `understand-trip-request`、`resolve-trip-scope`、`elicit-party-preferences` |
| 检索与内容 | `plan-travel-research`、`retrieve-social-evidence`、`digest-travel-media`、`resolve-travel-entities`、`assess-source-independence` |
| 中国内容组合 | `research-china-travel-content`：在一次有界研究中组合社交发现、实体归一、独立性评估和官方核验 |
| 事实与可执行性 | `verify-travel-facts`、`normalize-travel-offers`、`assess-traveler-operability`、`assess-trip-weather` |
| 联合决策 | `evaluate-trip-fit`、`shape-trip-schedule`、`compare-trip-alternatives` |
| 变更与解释 | `propose-trip-change`、`explain-trip-tradeoff` |
| 履约、恢复与学习 | `prepare-fulfillment`、`handle-trip-disruption`、`review-trip-coherence`、`capture-trip-feedback` |

22 个 Skill 以“研究计划 → 受限获取 → Claim/Entity 归一 → 天气/位置联合评估 → Patch → QA”为稳定编排；它只在一次 `research_trip_options` 内有界调用，所有结果形成一份可选择的跨域提案，不产生四个孤立 Workflow。天气 Provider 是 Tool/Adapter，Runtime Environment Gate 强制保证天气新鲜度与上下文存在；`assess-trip-weather` 只评估 Runtime 已提供且覆盖旅行日期的天气，并把影响映射回四条任务链。高德、天气来源、飞猪 FlyAI 与途牛由同一个组合 Provider 汇合：高德补全地点、餐饮 POI 和市内路线，FlyAI/途牛补充酒店、景点、火车与航班商业库存；同一班次会保留各供应方独立票价证据和互补字段，不再按标题丢弃航站楼、席别或税费。FlyAI 与途牛都不承担美食口碑。

首次旅行研究由 Runtime 强制覆盖吃、住、行、玩四条任务链，即使模型只请求了其中一域；已有提案或已选方案后的局部调整才尊重受影响域子集。Provider 暂时无结果时保留缺失域，不用模型知识补齐。

## Provider 分层

模型路由独立于旅行事实来源：普通文字轮默认由 DeepSeek Parent Agent 推理并调用受限工具；用户主动附图时，图片与文字进入同一个原生多模态 Parent Agent turn，当前首选 `DeepSeek-V4-Flash-Vision-Exp`，Kimi K2.6 保留为可配置的对照/回退路线。视觉模型可以在看图后立即调用 `save_trip_understanding`、`research_trip_options` 等既有旅行工具，但图片文字始终是不可信资料，视觉观察仍需归一为待审查 Claim 并由 Provider 核验。原图不落盘，也不会绕过 Proposal、确认和提交边界。`digest-travel-media` 负责图片/媒体中的视觉 Claim 与 verification targets，不新增第二个视觉 Plugin 或第二套旅行状态。具体账号、状态与验证见 [模型路由、账号接入与数据能力](./08-provider-accounts-and-routing.md)。

| 需求 | 首选来源 | 当前状态 |
| --- | --- | --- |
| 长尾体验发现 | 隔离的 XHS/Douyin 只读 Worker；用户提供微信文章链接 | `blocked`，仅有合同与安全门。 |
| 餐饮与本地菜 | 高德餐饮 POI（类型 `050000`）；大众点评/美团合作接口作为后续增强；XHS/Douyin 作为社交发现层 | 当前可执行 Adapter 只有高德；高德账号 `10044` 解除前餐饮保持缺口。大众点评/美团需企业或合作方授权，尚无凭据与 Adapter；小红书没有已确认可用于本产品的公开笔记搜索 API。 |
| POI 地点发现与地图唤端 | 高德 Web 服务 2.0，权益不足时降级官方基础 POI；Static Map + URI API | Adapter 与完整提案链已接线；当前账号实际配额异常，生产仍由 `smoke:amap` 门控。 |
| 旅行天气 | 高德天气；开发环境可回退 Open-Meteo | 已接入 Environment Plane、候选排序、局部重排和前端。Open-Meteo 免费端点仅限非商业开发，生产需付费 Key 或通过 smoke 的高德。 |
| 城市路线 | 高德路径规划 2.0、Static Map paths、URI API | 代码已进入 Runtime Mobility Gate、QA、服务端路线图与前端；`walk_type` 的直梯、扶梯、阶梯和斜坡已作为非实时路线参考参与逐人约束。当前高德账号 `10044` 未解除前保持 blocked，不能用 POI 冒充。 |
| 入口、室内图与设施参考 | 高德 POI `navi/indoor` 与路线 `walk_type` | 有字段时展示入口、出口、室内地图及路线设施，并固定注明“非实时、现场确认”；字段缺失时不补造。 |
| 实时到站与设施运行状态 | 获授权的实时公交、站点或设施来源 | 尚未接线；高德计划路线和公交首末班不能冒充实时到站，地图记录的电梯、卫生间、储物柜和充电宝也不能冒充当前开放或正常运行。 |
| 铁路 | 飞猪 FlyAI；途牛官方 MCP；购买时跳转 12306 或授权渠道 | 两个个人 Key 均已接入并通过真实只读 smoke；展示列车号、准确车站、出发/到达时间、席别价格和可见余票。无公开官方 12306 开发 API，且不自动购票。 |
| 航班/酒店/景点库存 | 飞猪 FlyAI；途牛官方 MCP 为互补来源 | 同一航班按航班号与出发时间合并，保留不同供应方报价、税费、航站楼、机型、舱等与跳转；酒店保留房型、面积、窗户、早餐和退改等已返回字段。价格、余位、房态仍需进入供应方页面再次核验，不自动购买。 |
| 跨城到市内接驳 | FlyAI/途牛城际库存 + 高德地理编码/路径规划 | 用户未指定交通方式时并行比较航班与铁路；选定后把到达机场或车站作为高德市内路线起点，接到住宿、餐饮和游玩动线。高德账号门控时只展示已核验班次，不伪造接驳路线。 |
| 企业差旅与酒店直连 | 携程商旅 MCP、华住会 B2B API | 需企业申请/签约；当前没有凭据，不进入 C 端默认路由。 |
| 动态事实 | 官方、地图或授权 Provider | 任何失效时返回 `provider_unavailable`。 |

社交 Worker 仅可暴露 `search_social_content`、`read_social_content`、`resolve_social_share_url`。固定失败码：`AUTH_REQUIRED`、`CHALLENGE`、`RATE_LIMITED`、`SOURCE_CHANGED`、`SOURCE_UNAVAILABLE`、`TERMS_BLOCKED`、`EMPTY_VERIFIED`。

## MCP V1 业务合同

```text
create_trip
update_trip_scope
get_trip_control_view
get_trip_plan_view
get_open_decisions
research_trip_options
propose_trip_change
accept_trip_change
reject_trip_change
prepare_booking_handoff
record_booking_confirmation
report_trip_disruption
submit_trip_feedback
```

`submit_trip_feedback` 既保留原有分类反馈，也支持地点关联的匿名结构化到访记录。共享记录必须绑定已选地点及其稳定来源标识；跨旅行只返回聚合后的推荐、标签、花费、等待和待核验数量，不返回自由文字，也不把用户报告提升为官方事实。

`save_trip_understanding` 是 Parent Agent 的对话工具名，底层首次调用 `create_trip`，后续调用 `update_trip_scope`。`research_trip_options` 会建立待确认提案，因此不是纯读接口。用户可在 Web 画布更换每域候选；`accept_trip_change` 将选择和 Evidence 原子提交。MCP 调用不能绕过 Parent Agent 的 revision、write set、锁定、新鲜度和跨域约束检查。

`create_trip` 的 `travelers` 与 `update_trip_scope.travelerProfiles` 支持逐人称呼、关系与有界 `careNeeds`。`elicit-party-preferences` 负责把自然语言翻译成行动要求，`assess-traveler-operability` 与 `review-trip-coherence` 负责核验它们是否被路线、住宿、活动、餐饮和日程满足；这些 Skill 不能保存诊断或直接修改旅行状态。

当前实现包括 `src/mcp/server.mjs` 的本地 stdio MCP 与 `src/http/server.mjs` 的 HTTP API；两者都直接调用同一个 `TravelService`。生产部署使用 `PostgresTripRepository`（`DATABASE_URL`），本地显式未配置数据库时才使用原子 JSON repository。它们不各自维护业务规则、行程状态或 Provider 结果。
