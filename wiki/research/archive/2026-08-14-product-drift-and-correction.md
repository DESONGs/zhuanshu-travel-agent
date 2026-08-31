# 2026-08-14 产品链路偏移审计与纠正

> 后续全面用户路径审计已覆盖本记录中的“确定性出发地追问”和“首个住宿位置锚点”做法。当前规范改为完整会话语义理解、目的地明确即保存、缺少出发地不阻塞目的地内研究，且系统不得擅自预选首个住宿候选。本文件保留为历史证据，不作为当前实现依据。

本记录追溯“会议原始意图 → 当前 PRD → Agent/Provider 架构 → 实际产品行为”，只保存本次偏移证据与纠正结论，不复制当前 Wiki 的完整产品规范。

## 一致性结论

会议与当前 PRD 一致，开发实现曾发生偏移。

| 层级 | 原始要求 | 审计结论 |
| --- | --- | --- |
| 会议纪要与转录 | 用户以目的地、天数、同行人、预算/交通等自然语言开始；AI 负责收集信息、判断、组合，并返回可选择的吃住行玩方案 | 一致。转录 `01:10:42–01:14:38` 明确是 AI 查找并处理对应信息，不是用户先做行程。 |
| 当前 PRD | 登录后对话 → 一次关键追问 → 联动研究四链 → 网页返回证据与待确认方案 → 用户确认 | 一致。`wiki/current/01-product.md` 没有要求用户手工录入条目。 |
| 既有架构文档 | Parent Agent 管意图/状态，Skill 管语义能力，Workflow 只做一次有界并行，MCP 暴露业务合同；四链共享状态 | 一致。架构方向没有要求四个独立 Workflow。 |
| 纠正前实现 | 对话只创建空旅行；研究服务固定返回 `provider_unavailable`；20 个 Skill 只有描述文件；方案画布只读已提交节点；模型在无 Evidence 时给出具体目的地判断 | 偏移。用户看到了“AI 已经在规划”的文案，但没有候选、证据、提案或可选择动作。 |

## 偏移发生的位置

1. `TravelConversationAgent` 只有 create/control/research 三个窄工具，创建旅行后没有把 research 结果推进到 proposal 与网页。
2. `TravelService.researchTripOptions()` 无条件返回 `provider_unavailable`，所以四域队列、Skill 文档和 Evidence Graph 没有进入真实控制链。
3. 前端 `PlanCanvas` 只展示 accepted nodes，没有 pending proposal、候选切换、来源、新鲜度、接受或拒绝。
4. Parent Prompt 虽写了“不编造”，但模型在工具调用前仍输出了具体片区、拥堵和通勤判断；缺少确定性产品门禁。
5. “创建了 TripState”被开发过程当成了咨询完成的中间证据，替代了用户真正需要的“收到可选方案”。

纠正前证据：

- [空白咨询入口](../../../design/audit-consultation-before/02-empty-chat.png)
- [对话后只有空草案](../../../design/audit-consultation-before/03-empty-draft-after-chat.png)

## 已实施纠正

- 首次研究增加就绪门：目的地、日期/天数、同行人、出发地/抵达方式不足时，只问一个问题，不创建空旅行。
- 对已知的出发/抵达缺口使用确定性追问，避免模型在 Evidence 前给出具体目的地事实。
- 范围完整后，Parent Agent 同一轮调用 `create_trip` 和一次 `research_trip_options`；后者内部有界并行吃、住、行、玩，而不是四个独立 Workflow。
- 新增固定端点的高德 Web 服务 2.0 Adapter，归一 POI、位置、评分/参考消费、检查时间和地图 URI；Key 不进入状态或输出。
- Provider 结果生成一份跨域 `TripPatchProposal`，以住宿位置为初始空间锚点并保留每域候选；研究不会直接改 accepted plan。
- 网页显示四域候选、来源、时间和限制，支持逐域切换后接受/拒绝。接受时选择与 Evidence 原子提交，旧 revision 与越权写入仍由 Runtime 拒绝。
- Provider unavailable、限流、空结果或来源错误时，确定性状态文案覆盖模型回复，禁止继续用模型记忆补空。
- 桌面端保持对话与方案并行；移动端改为单列对话后进入完整方案面，确认栏在候选滚动时保持可达。

纠正后证据：

- [只问一个关键问题，未创建空旅行](../../../design/audit-consultation-after/01-targeted-question.png)
- [桌面候选与逐域选择](../../../design/audit-consultation-after/02-selectable-proposal-fixture.png)（显式 QA Fixture，仅证明界面和合同）
- [确认后写入共享计划](../../../design/audit-consultation-after/03-confirmed-plan-fixture.png)（显式 QA Fixture）
- [移动端对话单列](../../../design/audit-consultation-after/04-mobile-chat-top.png)
- [移动端候选与粘性确认动作](../../../design/audit-consultation-after/05-mobile-proposal.png)（显式 QA Fixture）

## 仍然阻塞的产品能力

- 当前 `env_travel.local` 没有 `AMAP_API_KEY`，所以真实地点候选不能启用；必须先运行 `npm run smoke:amap`，通过后设置 `TRAVEL_AGENT_AMAP_SMOKE_STATUS=passed_live_smoke`。
- AMap POI 基线不等于路线、天气、站内电梯/卫生间/储物柜/充电宝、航班/铁路班次、酒店房态与外宾入住资格。它们需要各自授权 Provider 和独立 smoke。
- 小红书/抖音只读 Worker 尚未完成固定版本安全审计与专用账号 smoke，不能把社交发现能力标为已接线。
- Kimi 当前视觉认证失败，图片入口仍应保持 blocked。

因此，本次纠正恢复了正确的产品黄金路径和真实 Provider 接线位置，但在高德账号与后续 Provider 授权完成前，不能宣称 Travel Agent V1 已具备生产数据覆盖。
