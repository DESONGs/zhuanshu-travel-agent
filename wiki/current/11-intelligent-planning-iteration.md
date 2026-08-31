# 11. 智能规划能力产品迭代文档

- 日期：2026-08-27
- 角色：产品迭代规划（PM），承接真实使用反馈、双份代码层诊断与「要 agentic 不要 workflow」的方向拍板
- 状态：方向已确认；Agent Runtime/Skills/并行状态一致性底座与旅行行程 Plan–Check–Repair Harness 已落地，出行总账与主动补缺仍按本文 M1/M2 继续实施
- 证据基础：`wiki/research/archive/2026-08-26-user-golden-path-provider-fusion-bug-audit.md`、`wiki/research/archive/2026-08-27-visible-planning-workbench-and-route-preview-qa.md`、Agent 编排层与 Provider 数据层代码诊断（行号见 §3）

## 1. 用户反馈与核心判断

用户原话：交互顺了，但「AI 并不是很好地辅助我进行行程规划」——不知道每个部分花多少钱、不知道当地该租车还是公交、没有费用看板、玩/吃/住的路线没有规划好、没感受到智能。方向要求：**做更 agentic 的智能体，不是更精致的 workflow**。

**核心判断：这是两个问题叠加。** 一是数据建模问题（费用和路线从未成为一等公民，§3）；二是编排形态问题（当前 Agent 是脚本化流程而非决策循环，§4）。上一轮 V2 修改（未提交的 52 个文件）修复的是候选相关性与确认真实性，两者都不在其范围内。

**产品定位（2026-08-27 用户拍板）：更智能、更 agentic 的 Agent 是整个产品的核心，帮用户更好地协同规划旅行是核心价值。** 工作台、地图、预算看板都是服务于 Agent 规划能力的呈现面，而不是反过来。用户明确接受以合理等待时间换取规划深度（§2.7 等待体验设计）。因此本轮迭代的资源排序永远是：Agent 决策循环与规划质量优先，呈现层跟随。

智能感的三个可定义要素，作为本轮迭代的产品目标：

1. **有判断**：不只列候选，还给出推荐及理由（「带长辈 + 三天小雨，推荐第 2 个，步行少 300m 且全室内」）。
2. **会算账**：任何选择前能回答「花多少」，任何变更前能回答「多花/省多少、超不超预算」。
3. **主动补缺**：知道整趟旅行还差什么（第 2 天下午空着、三天只定了 2 顿正餐、返程接驳没着落），主动提出而不是等用户问。

## 2. Agentic 总纲：决策循环 + 确定性工具 + 用户确认门

### 2.1 现状为什么像 workflow（代码证据）

- **确定性捷径绕过模型**：`travel-conversation-agent.mjs:505-895` 的 `reply()` 先用正则识别「已购票 / 我确认候选X / 为什么推荐打车」直接返回，模型不参与决策。这是流程自动化，不是智能体。
- **工具集固定且顺序脚本化**：7 个工具（`:619-816`），金路径是 `save_trip_understanding → research_trip_options → 等确认` 两轮走完（`scripts/smoke-conversation-golden-path.mjs`），没有迭代。
- **一次 research 吐全部**：`research_trip_options` 一次调用返回四域候选，没有「查了住宿发现区域不对 → 自主调整条件重查」的观察-修正循环。
- **没有计划对象**：Agent 不持有「这趟旅行还差什么、下一步做什么」的显式 plan，每条回复是即时反应。
- **无自我检验**：方案的顺路性、预算一致性、约束满足度没有 Agent 自查环节，问题全靠用户发现（8/26 审计的假确认、错区域候选就是这么漏出来的）。

### 2.2 目标形态

**Agent 决定「做什么、什么时候做」；确定性工具保证「数字是真的」；用户确认门保证「改动是授权的」。** 三者各司其职，互不越界。

```
观察（对话 + TripState + 工具返回）
  → 推理（维护旅行计划 plan：还差什么、下一步查/算/问什么）
  → 行动（自主调用工具，可多轮迭代）
  → 验证（自查：顺路吗？超预算吗？约束满足吗？证据够吗？）
  → 呈现（候选 + 理由 + 影响，交给用户确认）
  ↺ 用户反馈或工具结果不符合预期 → 修正计划，继续循环
```

### 2.3 关键共识：工具确定性 ≠ 流程确定性

估算器、费用聚合、路线计算、约束检查这些**是工具，不是流程步骤**。Agent 自主决定何时调用它们来算账、验证；数字由代码算，LLM 只负责解释和推理。推理是 agentic 的，事实层是确定的——这是防幻觉的标准架构，不矛盾。

### 2.4 工具面重构（从「7 个流程步骤」到「一组能力」）

现有 7 个工具按流程命名，改为按能力命名，供 Agent 自由组合：

| 能力工具 | 职责 | 对应现状 |
|---|---|---|
| `update_understanding` | 吸收需求/约束/偏好（原 save_trip_understanding） | 保留，去掉捷径旁路 |
| `research_domain` | 按域 + 条件研究候选（吃/住/行/玩分开、可带语义条件重查） | 拆分现 `research_trip_options` 的一次性大调用 |
| `estimate_costs` | 分域费用估算与聚合（§5 估算器，确定性） | 新增 |
| `plan_routes` | leg 级 / 按天 / 全程路线计算与多方案比较 | 现 mobility 能力工具化 |
| `check_plan` | 自查工具：覆盖缺口、顺路性、预算一致、约束满足，返回结构化问题清单 | 新增（§7.3、§7.4 引擎化为此工具的判定逻辑） |
| `propose_change` | 生成 TripPatchProposal（staged，不落盘） | 现 proposal 机制 |
| `explain_recommendation` | 取推荐理由素材（recommendationAudit / weatherFit / 约束匹配） | 现能力工具化 |

**硬性约束（不可 agentic 化）**：Agent 不能直接写 TripState（只有 `propose_change` + 用户确认 + write contract）；价格数字只能来自工具返回，LLM 生成的价格视为幻觉禁止上屏；证件/支付/联系方式边界不变；降级必须诚实。

### 2.5 宿主架构决策

两条路：a) 把 `travel-conversation-agent.mjs` 从「捷径 + 单次工具调用」改造为有界决策循环（plan 对象 + 最多 N 轮工具迭代 + 自查）；b) 把对话直接接入 Pi runtime 的 agent loop，Skills 作为工具合同接线。

实施结论：Web 保持现有 Pi Agent Core，不另建第二套 loop。Parent 每轮真实加载 1–2 个组合 Skill，并通过 `beforeToolCall` 执行 12 次工具预算、重复参数保护和最多一次研究条件修正。复杂研究在 Provider 归一化之后运行唯一一次 Dynamic Workflow library fan-out；直接安装 Pi package 的外部宿主使用 `pi-subagents`，两条路径不进入同一个 Parent 工具面。每轮使用统一 coverage、revision/fingerprint、一次 Join 与稳定 Proposal；一个 required lane 也必须真实执行。完整边界与证据见[文档 12](./12-agent-runtime-and-parallelism-architecture.md)。

### 2.6 风险与对策

| 风险 | 对策 |
|---|---|
| 延迟变长（多轮工具调用） | 用户已明确接受以等待换深度（§1 定位）。复杂度分级：简单追问单轮直答（≤3s）；规划循环目标 ≤60s，深度重规划可到 ~90s；工具并发；全程流式进度（§2.7） |
| 成本 | 工具调用上限 + 循环检测；_digest_ 只放必要字段 |
| 行为不可预测 | 金路径测试保留（行为合同），另加对抗 eval：错区域、超预算、幻觉价格、未授权写入四类红线用例 |
| 回答不一致 | 推荐话术与卡片同源（`explain_recommendation` 同一份数据），禁止话术与 TripState 矛盾（8/26 假确认教训） |

### 2.7 等待与并行体验设计（等待已被授权，设计必须配得上）

用户接受等待的前提是「看得见它在为我工作」。等待不是 loading 态，是规划过程的透明化：

- **进度即叙事**：ActivityStrip 升级为规划步骤流——「正在比较人民广场 3 家酒店 → 发现 2 家超出步行上限 → 换条件重查 → 正在重算首日动线」。步骤文案来自真实工具调用，不编造进度。
- **可打断、可转向**：规划循环进行中用户可以插话（「别选静安寺，就看人民广场」），Agent 吸收新约束并修正当前计划，而不是等它跑完。打断不丢弃已完成的有效工具结果。
- **部分结果先行**：有可用中间结果就先呈现（住宿候选已出、吃的还在查），但必须由同一 coverage 对象点名未完成的分析；旧 run 迟到不能覆盖新条件。
- **长任务当前边界**：本轮使用单请求、单进程、有界同步执行，90 秒后返回部分结果；尚不支持跨实例后台 resume/steer。只有真正实现数据库 run lease、heartbeat、event sequence 和原子 Join 后，才启用后台重规划，不用进程内任务冒充生产异步。
- **延迟预算**：简单追问 ≤3s 单轮直答；常规规划循环目标 ≤60s；深度重规划 ~90s 封顶，超出必须降级为部分结果 + 明确说明，不允许无限转圈。
- 循环上限相应放宽：单轮回复内工具调用 ≤12 次（原建议 8），配合循环检测与并发。

## 3. 现状数据根因（诊断摘要）

| 用户感受 | 根因 | 证据 |
|---|---|---|
| 不知道每个环节花多少钱 | `budgetLedger` 只有扁平三数字，无分域桶；`estimated` 是死字段（初始化后全库无写入）；Agent 的 digest 把 cost 剥掉，LLM 看不到价格 | `contracts/index.ts:627`、`trip-runtime-implementation.ts:280`、`travel-conversation-agent.mjs:81-136` |
| 不知道租车还是公交 | leg 级已有 walk/transit/taxi 三方案比较与估价，但模式枚举硬编码无租车/自驾；且只在 ≥2 个已选节点后算「接驳」，没有全程出行策略 | `mobility.ts:3`、`amap-travel-research.mjs:792-843` |
| 没有费用看板 | 8/27 那轮明确「不引入费用页签」（防仪表盘化），矫枉过正；合同有 `budget` 输出，前端只有页脚一行总额 | `travel-service.ts:61`、`travel-app.jsx:1216` |
| 路线没规划好 | mobility 是所有已选节点的单链条（最多 6 段），无按天、无分域动线、无顺路性检查 | `amap-travel-research.mjs:882-897` |

天气/体力约束已进入规划逻辑（`travel-service.mjs:353-369`、`trip-runtime-implementation.ts:1102-1135`），是可复用资产。

## 4. 本迭代开发约束

以下约束只约束本轮开发的实现方式，用于保证智能能力不破坏信任与安全；它们不是产品的永久全局边界，后续迭代可按用户决策调整：

1. **数字由工具产出，LLM 只解释。** 估算、聚合、比较全部由确定性代码计算；LLM 生成的价格视为幻觉，禁止上屏。
2. **估算必标注。** 价格分三级（§5.1），界面与话术永远分得清「实价 / 参考价 / 估算」，不冒充库存或报价。
3. **确认边界不变。** 推荐、补缺、看板都只是建议与预览；写入 TripState 仍走 revision / read set / write contract 与用户确认。
4. **诚实降级不变。** 数据缺失标「未知 / 待核验」，不用估算填补关键决策（签证、外宾住宿资格）。
5. **不新增信息孤岛。** 看板、出行总账、按天动线都挂在现有整趟安排 / 试排 / 地图工作台结构上，不新增平级页签。
6. **承诺与能力一致。** UI 不得承诺系统不具备的能力：「优化」「采用」「查看库存」类动作必须绑定真实实现与校验门；能力缺失时降级为明确文案（如「向 AI 询问更优顺序」），不做伪直接操作。不可执行的方案必须禁止确认并给出唯一可理解的阻断原因。（2026-08-29 真实使用审计 TA-UX-002 / TA-UX-009）

## 5. P0：预算一等公民 + 推荐理由脊柱

> 目标：用户在任何决策点，不用追问就能知道「花多少、为什么是它」。Agent 自主调用 `estimate_costs` / `explain_recommendation`，而非流程固定环节。

### 5.1 价格三级体系

| 级别 | 定义 | 来源 | 标注文案 |
|---|---|---|---|
| 实价 firm | OTA 真实报价快照 | 途牛酒店/航班/火车、飞猪门票（带 `checkedAt`） | 「¥430 · 10 分钟前查询」 |
| 参考价 reference | 第三方参考数据 | 高德 POI 人均消费、起价 | 「人均约 ¥90（参考）」 |
| 估算 estimate | 确定性估算器计算 | §5.2 估算器 | 「估算 ¥240/3 天 · 按中档 3 人」 |

合同变更：候选 `cost` 升级为 `{ amount, currency, quality: firm|reference|estimate, basis?, checkedAt? }`；旧数据 quality 缺省按 reference 迁移。

### 5.2 分域预算账本（budgetLedger v2）

- 结构：`{ currency, totalBudget, domains: { stay|transport|food|play|other: { committed, estimated } }, committed, estimated, exceedsBudget }`。
- `estimated` 不再是死字段：已选环节用其 cost；未选环节由**确定性估算器**（`estimate_costs` 工具的实现）按「天数 × 人数 × 目的地档位 × 用户预算偏好」计算。估算器是普通函数，输入输出可测试，不进 LLM。
- 候选确认 / 试排时重算，Δ 进入试排影响条：「Δ +¥124 · 整趟 ¥7,128 / ¥8,000（89%）」。
- 超支护栏：试排导致 `exceedsBudget` 时确认栏显示琥珀警告「超预算 12%」，不禁止，由用户决定。

### 5.3 Agent 算账行为

- `planDigest()` / `domainCandidateDigest()` 还回结构化 cost 与预算余量，LLM 可见数字（`travel-conversation-agent.mjs:81-136` 改造）。
- **确认前必答三问**：任何候选进入待确认时，卡片与 Agent 话术必须能回答：花多少（三级价格）、怎么走（mobility 方案）、为什么是它（§5.4）。三缺一标「待核验」，不催用户确认。
- Agent 可在比较类追问（「换便宜点的呢？」）时自主连续调用 `research_domain` + `estimate_costs` 给出带 Δ 的回答。

### 5.4 推荐理由脊柱

- 每个推荐候选必须有 ≥1 条机器可验的理由，复用 `recommendationAudit`、`weatherFit`、体力/无障碍约束匹配、来源数；UI 呈现为理由 chips（「步行 261m ≤ 600m 上限」「室内 · 雨天适用」「2 个来源已核验」）。
- Agent 话术与卡片引用同一份理由数据（`explain_recommendation`），禁止不一致。

### 5.5 预算看板（UI）

- 不新增页签：桌面在决策列底部、移动端在行程 tab 尾条，现有「¥564 / ¥8,000」升级为**可展开的分项看板**：按 住/行/吃/玩/其他 五行，每行 已确认 + 预估 + 价格级别标记（实价无标记、参考价 `≈`、估算 `~`）；底部一行预算使用率条；试排态联动显示 Δ。
- 视觉遵守 DESIGN.md 与 `design/2026-08-27-workspace-ui-ux-optimization/DESIGN-DOC.md`，Restrained 色彩，不做仪表盘化大数字卡片。

## 6. P1：全旅程出行顾问 + 主动补缺 + 按天动线

> 目标：回答「当地出行怎么安排最合理」；Agent 从「你问我答」变成「我盯着整趟旅行」。所有引擎能力以工具形式供 Agent 调用，触发时机由 Agent 依计划决定。

### 6.1 全程出行总账（plan_routes 的旅行级口径）

- 汇总：全程预计 N 段移动；三种口径总账——全程打车 ≈¥X / 全程公交 ≈¥Y（每天多 ~40 分钟）/ 推荐混合 ≈¥Z（接驳打车、市区地铁、短驳步行）。
- 场景化判断（确定性规则 + 已有数据，Agent 负责解释与取舍建议）：夜间到达、大件行李、长辈同行、降雨日（打车权重上浮）、景区偏远（无公交时直说打车/包车是唯一解）。
- 呈现：工作台「行」环节展开为「出行方式」小节；Agent 可一句话总结：「这趟 3 天市内交通预计 ¥180–420，建议地铁为主、接机打车」。

### 6.2 额外交通支出与规划清单

租车只是其一。以下纳入出行顾问的主动检查表，每项要么有真实数据，要么明确标「参考/估算/待核验」，要么只给建议不给价格：

| 项 | 触发条件 | 数据可得性 | 呈现 |
|---|---|---|---|
| 机场/高铁接驳 | 有城际到达/离开 | 已有（mobility 首末段） | 行程首末卡 |
| 夜间到达/离开 | 班次到达晚于地铁末班 | 时刻需估算标注 | 接驳卡琥珀提示 |
| 行李寄存/搬运 | 退房后仍有行程 | 高德 POI 可查寄存点 | Today/动线节点 |
| 景区内交通（索道/摆渡/观光车） | 山岳/大型景区 | 高德 POI + 参考价 | 玩候选卡「园内交通」行 |
| 降雨应急 | 天气预报有雨 | 已有天气管线 | 影响条 + 建议话术 |
| 跨江/跨海轮渡、岛际交通 | 目的地需要 | 需 Provider 扩展，缺则标待核验 | 行环节 |
| 无障碍车/婴儿座椅 | 同行人 careNeeds 含对应项 | 无数据源，给建议不给库存 | 出行策略说明 |
| 自驾/租车/包车 | 用户主动问或公共交通显著不便 | **V1 不建模成本**，只给判断建议（§8.3） | 出行策略说明 |

### 6.3 主动补缺（check_plan + Agent 自主触发）

- `check_plan` 工具返回结构化缺口：天数 × 餐数、每日时段覆盖、首末接驳、天气冲突、体力密度（连续高步行日预警）。
- **触发时机归 Agent**：Agent 在计划中自行决定何时检查、何时提出（例：四域齐了之后例行 check；用户确认住宿后检查首日动线）。不再由引擎固定渲染缺口条。
- 呈现约束：工作台缺口摘要以一条聚合条呈现（「第 2 天下午还没安排 · 返程接驳未规划」），每条可点击让 Agent 带条件研究；话术中每轮最多提一个 P0 级缺口，不刷屏。

### 6.4 按天动线（Day Plan）

- 单链条路线升级为按天组织：每天一条「出门 → 玩 → 吃 → 回住宿」回环，地图按天切换。
- `check_plan` 含顺路性检查（确定性）：地理聚类、回头路检测、节奏检查（长辈同行每日移动段数上限）；发现问题由 Agent 提出调整建议并给试排。
- 不拆四域四条线：吃/玩在同一天动线内组织，住宿是每天的锚点，符合四域同一 TripState 边界。

## 7. P2：协同与行中

### 7.1 协同（先轻后重）

- 轻协同（本轮可启动）：同行人约束升级为**可见的同行人视图**（谁有什么约束、谁认领了准备项）；方案快照只读分享链接（不含证件/支付等敏感信息）。
- 重协同（远期）：多人实时查看/评论同一 TripState，涉及权限模型与实时通道，待 V2 上线门关闭后评估。

### 7.2 行中智能

- 依赖「执行事件」上线门：Today 已有骨架，P2 加偏离检测（错过班次/景点闭馆的替代建议）、雨天窗重排。行中不自动改行程，变更仍需用户确认。

### 7.3 租车 / 自驾（边界项）

- 正式扩展前必须解决两件事：成本模型（租金 + 油/电 + 停车 + 高速 + 异地还车费，全部估算级）与资格事实（**入境游客持外国驾照不能直接在内地自驾**，需临时驾驶许可，必须诚实呈现）。
- 定位：P2 前只提供「是否适合自驾」的判断建议与理由，不提供租车库存与价格；包车/一日游可借途牛/飞猪品类先行试探。

## 8. 分层变更清单（工程对照表）

| 层 | 变更 | 对应章节 |
|---|---|---|
| 合同 `contracts/` | cost 三级结构、budgetLedger 分域桶、DayPlan 结构、理由 reason 数组、plan/check 工具 IO | 5.1/5.2/6.4/5.4/2.4 |
| Runtime `trip-runtime-implementation.ts` | estimated 写入、估算器、覆盖缺口与顺路性判定（check_plan 实现）、超支 QA | 5.2/6.3/6.4/5.2 |
| Providers | 高德 play/food cost 数值化、景区内交通 POI、接驳首末段强化 | 5.1/6.2 |
| Agent `travel-conversation-agent.mjs` | 有界决策循环 + plan 对象、digest 还回 cost、去捷径旁路（改为模型可理解的工具语义）、确认前三问、话术与卡片同源 | 2.2/2.4/5.3 |
| Service `travel-service.mjs` | 按域 research、预算看板视图、出行总账、按天动线视图 | 2.4/5.5/6.1/6.4 |
| Web/移动/小程序 | 分项看板、理由 chips、出行方式小节、缺口聚合条、按天地图切换 | 5.5/6.1/6.3/6.4 |

## 9. 验收与度量

- **确认前信息自足率**：抽 20 个真实决策点，用户不追问「多少钱 / 怎么去 / 为什么」即可完成确认的比例；目标 ≥80%。
- **规划轮次效率**：从一句话到四域齐 + 预算看板完整的对话轮次；目标草案即带估算看板。
- **Agentic 健康度**：单轮平均工具调用数、循环触发重查率（查完自主改条件重查的比例 >0 即证明循环真实存在）、红线用例零命中（幻觉价格 / 未授权写入 / 话术与状态矛盾）。
- **预算惊讶**：行中/结算超预算事件为 0（估算覆盖到的域）。
- 每项沿用现有验收：`npm run check` + 真实自然语言路径 QA（Safari/移动端实测，不接受脚本自证）+ 393×852 与 1440×900 截图归档 `design/audits/`。

## 10. 风险

- **Agentic 行为不可预测**：见 §2.6（有界循环、红线 eval、同源话术）。
- **估算可信风险**：估算与实价偏差过大伤信任。对策：三级标注 + 区间化 + 实价到达即替换。
- **信息过载**：看板、理由、缺口同屏可能变吵。对策：默认摘要、点击展开；密度 dial 5 不变。
- **范围蔓延**：租车库存、多人实时协同、行中事件都有明确分期，不进 P0/P1。
- **上线门不变**：生产 OAuth、社交数据源、执行事件、真机验收仍为既有上线门，本轮不宣称覆盖。

## 11. 合并交付路线图（与 V3 前端方案合并，2026-08-29）

V3 前端方案（`wiki/research/archive/2026-08-29-ui-component-sources-and-first-principles-redesign.md`）是呈现层，本文档是智能层；两者按下表合并交付，后续开发由 codex 主线程执行：

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| M0 地基 | 工作区未提交修改（融合 + 试排 + Agentic Runtime 底座）落库并全量验收 | 无 |
| A0 行程正确性门禁（2026-08-29 审计 Batch A，最优先） | 到达/离开时间语义（`arrivalAt`/`departureAt` 分离）、Day 语义与住宿回环（dayIndex/date/role）、确认前可执行性门（日期单调、移动可达、开放时间不冲突时禁止「采用此方案」）、试排 Δ 改用当前已确认方案为有效基准。对应审计 TA-UX-001/002/003/006 | M0 |
| A 组件层 | V3 CS0 组件审计与采用门 + CS1 基础组件收敛（Button/Badge/Notice/Field/Skeleton/Sheet/Tabs/Tooltip/Toast；先迁移 PlaceDetailSheet、History Drawer、Delete Dialog 三个高风险浮层） | 无；与 B 可并行 |
| B 智能核心（同车交付） | 本文档 M1：决策循环与工具面（§2.4，宿主按 §2.5 实施结论）+ 价格三级 + 分域账本 + 估算器 + digest 改造 + 预算看板 + 理由脊柱；同时交付 V3 CS2 桌面决策主循环与 CS4 状态动效、诚实降级 | M0、A |
| C 移动与出行 | V3 CS3 移动 MapRouteSheet 与手势；本文档 P1：出行总账、额外交通检查表、check_plan 主动补缺、按天动线 | B 的账本与循环 |
| D 收尾 | V3 CS5 小程序等价与全端 QA；本文档 P2：轻协同、行中偏离建议、租车判断建议（无库存） | C；行中依赖执行事件上线门 |

验收门禁：每阶段 `npm run check` + 393×852 / 1440×900 双视口真实路径 QA（不接受脚本自证）；B 阶段额外执行智能真实性抽验（进度文案可对应真实工具调用）与四条红线 eval（幻觉价格、未授权写入、话术与状态矛盾、估算未标注）。

注：Agent Runtime/Skills/并行一致性底座（[文档 12](./12-agent-runtime-and-parallelism-architecture.md) 范围）已先行落地，B 阶段的决策循环与工具面在其上继续，不重复建设。

2026-08-29 真实使用审计（[审计与 Fix Checklist](../research/archive/2026-08-29-real-user-product-audit-and-fix-checklist.md)，归因分析见其 §11）证明行程时间正确性是地基而非增强：原 C 阶段「按天动线」的数据基础（dayIndex/date/role）随 A0 提前落地，C 阶段只做顺路性检查与按天视图。审计归因结论：主因是领域建模缺口（时间与可执行性模型缺失），并行改动是放大器，另有承诺-能力一致性产品约束（§4 第 6 条）。

## 12. 2026-08-29 实施状态

- **M0 / A / B 已形成可运行纵向闭环。** Provider 候选带 `firm|reference|estimate|unknown` 价格语义；旧数字 `cost` 只作兼容镜像。TripState 的 `budgetLedger` 已有住/行/吃/玩/其他分桶、确定性总额、口径、未知项和超预算判断，候选试排会返回整趟预算 Δ。
- Parent Agent 已获得只读 `estimate_costs` 与 `explain_recommendation`；“不要确认任何候选”不会再被识别成确认命令。预算话术固定区分“未确认候选仍可有 OTA 实价快照”与“按人数/晚数汇总后仍是估算”，数字不由模型生成。
- V3 Decision Spine 每行固定显示价格槽；Focused Compare 首屏显示 3 个候选并可渐进展开到最多 6 个，展示推荐证据、无票状态、试排路线/预算/体力 Δ 和住宿跨域影响。1180px 以下 Chat 默认折叠，393px 使用 MapRouteSheet 与底部三入口；地图桌面滚轮缩放、移动触摸缩放均启用。
- 生成中的旧按秒阶段文案已移除。完成后 AgentProgressRail 只渲染真实 activity；2026-08-29 浏览器自然请求实际显示 `save_trip_understanding`、`research_trip_options`，预算追问实际显示 `get_trip_plan_view`、`estimate_costs`。分析 lane 失败时仍显示 failed/partial，不冒充完整。
- A 阶段没有为清单完整而抽取无消费者的 Button/Badge 包装；只落地并迁移当前确有风险的 `OverlaySurface`，统一 Place Detail、History Drawer、Delete Dialog 的 Escape、focus trap、焦点恢复、body scroll lock 与全工作区 inert。
- 微信/支付宝小程序已同步抵达优先顺序、六候选、价格性质、分域预算和局部确认，不再强迫四域一次确认；仍使用平台原生 Map 与轻量 CSS，不复制 Web 动画运行时。
- **A0 行程正确性门禁已关闭。** 新增派生的 Day/Date/Role itinerary 与 feasibility；城际目的地节点使用 `arrivalAt`，柔性时间窗按真实移动耗时顺延，缺路、固定时间逆序、已知营业冲突和楼梯硬冲突会在提交前阻断。确认复用同 revision preview，不重复请求路线。
- **C / D 尚未全部关闭。** A0 已提前交付按天数据基础、路线模式比较和可执行性缺口；全程出行策略总账、执行事件、租车判断、四端真机与真实 OAuth 仍按既有上线门继续，不能从本次 Web QA 推断完成。

验证：严格 TypeScript、175 项完整测试、Web production build、微信/支付宝 native contract 均通过；真实浏览器完成 1440、1152（125% 等效）、393 视口，以及“自然语言请求 → 航班/高铁 → 分域预算 → Day 1/2 多点路线 → 模式切换 → feasibility gate → 确认”路径。复杂四域语义 fan-out 仍可能 partial，诚实降级生效，但不能称为稳定完整分析。

## 13. 旅行行程 Plan–Check–Repair Harness（2026-08-30）

### 职责归位

- LLM 负责 Day、站序、时间窗、停留时长、role、跨域取舍与理由；不生成路线分钟、价格、营业、设施或无障碍事实。
- `plan_itinerary_trial` 复用 TravelService、AMap Mobility 与 `finalizeItinerarySchedule()`，检查相邻路线、固定时间、跨日、旅行日期、营业证据、步行、换乘、楼梯、锁定项和新鲜度。
- Parent 最多提交 attempt 1 与一次 bounded repair attempt 2。成功结果进入现有 pending proposal artifact；用户确认前 Trip revision、selected nodes 与当前 Mobility 不变。
- 用户逐段选择 transit/taxi/walk 后，选择会进入服务端 Trial 重检，并在确认后保存；不再只改变前端显示。

### 复用与拒绝

从 assignment-agent Planner/Adaptive Execution Ledger 只复用机制：run/plan/revision、`runId:attempt` operation ID、acceptance evidence、events、blocked/repair 与 stop condition。不复制 Office task types、文件 run 目录、Todo 平台、通用 Planner Extension 或文档 worker。

当前 Travel 直接复用 `TravelAnalysisRunCoordinator` 的 supersede/abort/stale/idempotency/exactly-once join，`plan-trip` Skill、Parent Pi turn、TravelService、AMap、TripPatchProposal 与 TripState。Dynamic Workflow 继续只负责无反馈依赖的语义 fan-out；行程修正留在 Parent 的顺序循环，不新增 Sub-agent 或第二编排内核。

### 用户可见闭环

- 桌面与移动端按钮恢复为“AI 优化当前路线”，点击立即执行，不再预填 Composer。
- 请求期间只显示真实总状态；完成后 activity 对应实际 context read 与 planning Tool。成功 Trial 显示地图、按天时间轴、总耗时、步行、换乘、估算费用、理由与当前方案影响。
- 操作固定为“采用优化方案 / 保持当前 / 继续调整”；保持当前会只移除 itinerary Trial，不删除研究候选。
- 快速候选试排继续使用 `buildItineraryDraft()`，但固定标识为 `conservative_fallback`，不能称为 AI 优化。

### 真实验收

2026-08-30 的上海家庭旅行真实浏览器路径中，DeepSeek 生成“夜间抵达先入住，次日博物馆→本帮菜→返回住宿”的计划；AMap/Checker 得到 5 段、79 分钟、0 米步行、0 次换乘、估算 ¥283。393px 端把机场段改成公交后，服务端因 1145 米步行超过 600 米上限禁用确认；切回打车后确认成功，revision 1→2，`planningSource=model_plan`。完整反证与边界见审计文档 §13。

## 14. Evidence Companion E0 / E1 实施状态（2026-08-31）

### 已进入真实链路

- `ContentItem` 只增加 `title / originalLanguage / access` 等小型引用元数据；完整展示使用单一 `EvidencePresentationBundle`，存放在可过期的 JSON / PostgreSQL 侧车，不创建第二份 TripState 或 Evidence Graph。
- 候选卡先给一行来源摘要，地点详情在同一个 Overlay 内切换到 Evidence 模式；原文、快速翻译、Claim、同源聚类提示、适配理由、来源与核验时间保持分层，未知媒体权利不代理显示。
- 用户粘贴的小红书、抖音或微信文章链接只经过固定 HTTPS 域名、DNS 私网阻断、逐跳重定向复核、8 秒超时和 1 MB 上限的公开读取器；不发送 Cookie，不接受任意 URL，不执行页面脚本，也不下载原始媒体。
- 翻译复用当前服务端模型 resolver，按用户限流、限制输入长度并记录 token 用量；翻译失败保留原文，不把译文提升为新的地点事实。
- Evidence 中的“加入路线试排”复用现有 Candidate Trial、地图与影响条；确认前仍不修改 TripState。

### 验证证据与边界

- 完整 `npm run check` 通过：严格 TypeScript、192 项测试、Web production build、微信/支付宝 native contract。
- 真实浏览器自然请求取得吃住行玩候选后，住宿、外滩与本帮菜三类候选共同形成 5 段试排；页面显示 67 分钟、3523 米、约 ¥21，并继续标为“快速试排，不是 AI 优化站序”。试排前后 `trip_5b568d1b` 保持 revision 1、0 个 selected node、0 条持久化 itinerary stop。
- DeepSeek 英文快速翻译在真实页面返回，原文可展开；393×852 下证据面板无横向溢出，路线 CTA 可见，浏览器 console 无 error。
- 本次 E1 浏览器用例是两人、少走路目标，不替代 §13 已完成的父亲 600 米硬约束路径。当前真实候选只有一个独立来源时，界面明确显示 1 个来源，不伪造“多来源多数”。
- E2 Electron、桌面登录、高德 JS 自定义 origin、E3 原页阅读和 E4 专用账号 Worker 均未启动；对应前置门见 06 与本期技术审核。
