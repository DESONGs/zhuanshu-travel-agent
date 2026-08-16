# Agent、上下文与决策架构

## 责任边界

| 层级 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| Parent Agent | 意图、追问、旅行状态、取舍解释、局部重排和最终提交 | 直接抓取、直接修改状态之外的第三方系统。 |
| Semantic Skill | 可复用的研究、归一、核验、评估、排程、解释与恢复语义 | 直接写入 `TripState` 或直接购买。 |
| Tool / Adapter | 单一平台的受限读能力或官方 Provider 调用 | 旅行决策和跨域编排。 |
| Bounded workflow | 一次有界的并行研究、汇合和失败处理 | 持有长期旅行真相或替代 Parent Agent。 |
| MCP | 对外暴露稳定旅行业务合同 | 另建第二份业务逻辑。 |

这几层是协作关系，不是替代关系。吃、住、行、玩是共享状态上的四条任务链，因此一个住宿变更能够只影响邻近的交通和餐食，而不是触发四个独立流程重做。:codex-annotation{index="1"}

```mermaid
flowchart LR
  UI[登录后 Chatbox / 小程序 / MCP Client] --> PA[Travel Parent Agent]
  PA --> CP[Control State 与 Planner]
  CP --> TQ[行住玩吃任务队列]
  TQ --> SS[共享 Semantic Skills]
  SS --> WK[受限只读 Worker / 官方 Provider]
  WK --> EG[Evidence Graph]
  EG --> CTX[Decision-scoped Context Pack]
  CTX --> SS
  SS --> PP[TripPatchProposal]
  PP --> PA
  PA --> DG[Trip Decision Graph 与 Ledgers]
```

## 对话入口与会话状态

Web/PWA 默认进入「旅行编辑」对话。`travel-conversation-v1` 只保存用户和 Agent 可见的短文本、会话归属、可选的 `tripId` 与 storage version；它不是第六份旅行事实状态，也不保存 Prompt trace、Token、证件、支付、Cookie 或 Provider 原始响应。Parent Agent 通过 `save_trip_understanding` 结合完整历史理解短句：首次目的地明确时创建旅行，后续调用 `update_trip_scope` 增量合并，未提及字段保持原值。

每轮对话的边界如下：

1. 先持久化用户输入，并在进入模型前阻断显然的密钥、卡号和证件号码。
2. 模型 Provider 可用时，Pi `Agent` 只获得受限业务工具；没有 Provider 时返回 `agent_unavailable` 状态，不能伪造一条 Agent 研究回复。
3. Parent Agent 保存或更新理解、读取控制视图并发起研究；不得用关键词或正则判断语义是否“足够”。所有外部研究仍需通过 Capability Registry，研究结果才可进入 Evidence Graph 与网页方案画布。
4. 方案画布显示的是待确认状态。Skill 仍不可直写 `TripState`，用户接受 `TripPatchProposal` 前不得改变行程。

Capability Registry 只校验父 Agent 已选择的显式能力 ID，Planner 只编排显式 `focusOrder`；二者都不能通过字符串包含关系猜测用户意图。结构化状态与校验结果也不得原样出现在用户回复中。

## 六个相互引用的状态平面

1. `Trip Control Plane`：开放决策、任务队列、dirty set、分支、锁定项和当前 revision。
2. `Traveler Plane`：每位同行人的硬约束、软偏好、语言、证件与操作限制。
3. `Environment Plane`：与目的地、旅行日期和核验时间绑定的天气观察，以及连接已选地点的城市移动观察；包含覆盖范围、风险、新鲜度、步行/换乘负担与跨域影响，但不复制进四域节点。
4. `Trip Decision Graph`：候选/已选决定、依赖、时间、空间、预算和影响边。
5. `Evidence Graph`：`ContentItem → Claim → Entity → Decision`，含来源、独立性、商业倾向、时间和定位。
6. `Fulfillment Plane`：Offer、BookingIntent、跳转、确认、异常和售后状态。

六者只通过 ID 和 artifact pointer 引用，避免把同一信息复制进多个 Prompt 或状态对象。天气发生实质变化时，Runtime 增加 revision、使旧待确认提案失效，并只把当前存在且受影响的四域节点加入 dirty set；同一预报在三小时内可复用，不重复请求。已选地点、顺序、日期或同行人移动约束变化时，旧城市路线立即失效；没有重新核验前不得称为可执行日程。

`Traveler Plane` 中每个人都有稳定 `travelerId`、用户可理解的称呼/关系和有界 `careNeeds`。`careNeeds` 只存行动结果，按 mobility、stamina、schedule、facilities、sensory、food 分组；它是路线、住宿、活动、餐饮与日程共同读取的约束事实，不复制进四域节点，也不新增“关怀 Workflow”。同行人移动要求变化只使 Mobility Observation 失效，不使同目的地/日期的天气失效。

## Environment Gate：天气不靠模型召回

天气能力分成三个责任，不以 Skill 数量堆叠：

1. **Tool / Adapter** 查询高德或具名天气 Provider，并归一为 `WeatherEnvelope`。
2. **Runtime Environment Gate** 是强制所有者。目的地或日期变化时立刻清空旧天气；`research_trip_options` 每次在提案成立前解析日期覆盖、新鲜度和来源状态，并把结果放入 Context Pack。天气不可用时，地点候选只能形成标记为 partial 的暂定提案。
3. **`assess-trip-weather` Semantic Skill** 只把已核验天气翻译成四域取舍、受影响邻域或重排建议；它不抓天气，也不决定是否需要天气。

把天气做成普通 Extension 只能让模型“有一个可调用工具”，不能保证它一定调用、不会复用错日期的旧预报，或在失败时降低提案可信度，因此 Extension 不是状态与新鲜度所有者。这里吸收 DeepSeek Harness 的 reactive dependency、capability seam、append-only change journal 和统一受限工具入口原则，但不迁移其整套插件/会话体系：旅行日期和目的地是天气的显式依赖，变化会失效旧环境事实；Provider 可替换，父 Agent 的提交协议仍是唯一控制面。

## Mobility Gate：城市移动不等于“行”候选

城市移动同样由 Runtime 强制持有，而不是增加一个可被模型漏掉的 Workflow：

1. **Tool / Adapter** 使用高德路径规划 2.0 查询步行、公交/地铁和驾车，归一为 `trip-mobility-v1`；查询有界，不能接受任意 URL，也不把 Key 放入前端。
2. **Runtime Mobility Gate** 在用户确认地点后自动运行，把住宿、活动、餐饮和必要抵达点连接成路线段；地点或范围变化立即使旧路线失效。结果为 unavailable 或 needs_context 时，QA 不允许把地点列表称为完整行程。
3. **Semantic Skills** 只解释路线取舍，或在步行、换乘、天气和行李约束冲突时提出局部换序、换方式或换住宿提案；Skill 不拥有路线新鲜度，也不能直接提交变更。

交通设施 POI、飞猪/途牛的城际班次和城市路线段分别使用 `transport_facility_poi`、`intercity_inventory` 和 Mobility Observation 表达。高德路线中的计划耗时、换乘和估算车费不是实时公交到站、即时叫车供给、最终车费或站内设施状态。

## `travel-context-pack-v2`

每次 Skill 调用只获得当前决策邻域：任务契约和成功条件、相关同行人切片、Environment Plane 中与目的地/日期匹配的天气和已选地点移动段、Decision Graph 邻域、已归一化 Evidence Bundle、入境可操作性、预算/路线/新鲜度/风险、`readSet`、`writeContract`、版本和 artifact pointer。信息不足时，Skill 必须返回结构化 `needs_context`。

## 提案与提交协议

Skill 返回 `TripPatchProposal`；父 Agent 以相同 `baseRevision` 检查：目标 trip、read set、write set、write contract、锁定项、Offer 新鲜度、操作白名单和跨域约束。通过后才原子提交，增加 revision，计算 dirty set，并只将受影响域加入 replan 队列。旧 revision、超出 write set、修改锁定项与过期 Offer 均被拒绝。

`destination-memory-curator` 是一个 fresh、只读的候选公共记忆审稿角色，不能直接写入长期记忆或旅行状态。
