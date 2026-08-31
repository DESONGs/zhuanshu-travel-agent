# TREK 旅行工作台深度调研与 Travel Agent 采用判断

> 日期：2026-08-20
> 对象：[Olares 的 TREK 使用指南](https://www.olares.com/docs/1.12.5/zh/use-cases/trek)、上游 [`liketrek/TREK`](https://github.com/liketrek/TREK) 及当前 Travel Agent V2。
> 结论性质：产品与交互研究，不授权复制第三方代码，也不直接覆盖当前 PRD。
> 上游核对版本：`liketrek/TREK@e60427f813dc35f688d5d9169b79ac8c43974719`；最新正式发布为 `v3.4.1`（2026-07-19）。

## Executive Summary

TREK 不是 AI 原生旅行 Agent，而是一个成熟的、自托管的多人旅行工作台。它最有价值的设计不是预算、清单、文件和协作功能的数量，而是把地图作为旅行的共同空间，并把尚未安排的地点、按天计划、交通与预订分成用户可以理解的状态。其 Planner 用大地图承载地点和路线，左侧组织每天的行程，右侧保留待安排地点；这个空间模型比当前 Travel Agent 把准备、候选、卡片和地图纵向堆叠更接近“旅行正在形成”的感觉。

但 TREK 的核心前提是用户自己创建旅行、搜索地点、拖放排序和维护工作空间。Travel Agent 的首要价值相反：用户只需要表达需求，Parent Agent 负责研究、核验、联动与局部重排，用户只确认关键取舍。因此，复制 TREK 的完整页签、手工编辑器、150+ MCP 工具或自托管管理面，会把产品重新变成旅行项目管理软件。

建议采用一个收敛后的 **Agent-assisted Trip Workspace**：保留现有对话和受控提案，把右侧方案区升级为地图底座；视觉上明确区分“候选池 → 路线骨架/按天草案 → 已确认/已预订”，并在用户需要比较时打开候选抽屉。准备事项压缩成工作区顶端的一条阻塞摘要；预算、票据、打包和协作只在旅行被确认后进入 `Trip Kit`，不进入首屏主导航。

TREK 使用 AGPL-3.0，与本项目的 PolyForm Noncommercial 授权和既定第三方规则不兼容，**不得复制、改写或合入其代码**。可独立实现其通用交互思想，不能把参考截图当作代码来源。[上游许可证说明](https://github.com/liketrek/TREK#license)

## 先区分三个对象

| 对象 | 它实际是什么 | 本研究怎样使用 |
| --- | --- | --- |
| Olares 文档中的 TREK | 在 Olares 上安装、登录、创建旅行、使用清单/PDF/协作及配置 SSO、地图 Key、2FA、备份的使用教程 | 验证自托管、账号、隐私和基础产品任务；不是完整功能清单 |
| 上游 `liketrek/TREK` | 活跃的 React 19 + NestJS 11 自托管旅行工作台，含地图、路线、预订、预算、清单、协作、PWA、插件和 MCP | 验证真实产品能力、界面、许可、发布和公开问题 |
| 当前 Travel Agent | Pi Parent Agent + 共享 TripState + Evidence/Patch + 中国 Provider + Web/原生/小程序/MCP | 判断哪些交互能增强 Agent，哪些会破坏现有产品边界 |

Olares 页面当前链接到 `1.12.5` 版本文档，展示的是 TREK 的一部分操作；上游截至本次核对已发布 `v3.4.1`，功能明显更多。不能只根据 Olares 页面得出“TREK 只有行程、清单和协作”的结论。

## TREK 已核实的产品结构

### 1. Planner 是一张地图上的工作区

上游 Planner 的真实截图显示：

- 地图占据绝大部分屏幕，路线和地点直接显示在地理空间上；
- 左侧按天组织地点、时间、交通和住宿；
- 右侧是待安排地点池，可搜索、筛选和加入日程；
- 路线、排序、PDF、ICS、地点类别和地图图层放在当前任务附近，而不是另开控制台；
- 计划、交通、预订、清单、费用、文件和协作是同一旅行下的工作模式。

这套结构解决的是“我有很多材料，怎样把它们整理成一趟旅行”，而不是“我该去哪里、为什么适合我”。[上游 README](https://github.com/liketrek/TREK#what-you-get)

### 2. 旅行资料具有明确生命周期

TREK 把资料分成：

- 收藏/想去/去过的地点；
- 未安排地点；
- 某一天的地点和交通；
- 预订、住宿、航班、费用、文件；
- 行后 Journey、照片和优缺点记录。

这种状态分层比一个无限增长的地点列表更清晰。特别是 Collections 的“想法、想去、去过”与 Trip Planner 的“未安排、已排入某天”形成了从灵感到执行的连续过程。[Collections 发布说明](https://github.com/liketrek/TREK/releases)

### 3. 协作以旅行对象为中心

TREK 支持角色、邀请链接、实时同步、群聊、共享笔记、投票和 day check-in。Olares 指南也把 Chat、Notes、Polls 和 What's next 作为协作面板的核心。[Olares TREK 指南](https://www.olares.com/docs/1.12.5/zh/use-cases/trek)

### 4. PWA 与离线不是展示标签

上游声明使用 Service Worker/Workbox 缓存地图切片、API 和上传资料，并提供移动安全区和全屏 PWA。其发布记录持续修复移动路线工具、离线帮助与地图问题，说明跨端并非一次性壳工程。[上游 README 的 Mobile & PWA](https://github.com/liketrek/TREK#mobile--pwa)

### 5. MCP 是对工作台的广泛遥控

TREK 的 MCP 暴露 150+ 工具、30 个资源和 27 个 OAuth scope，可以创建旅行、写按天计划、预算、清单、协作内容和已访问地区。它通过权限检查控制直接写入，但总体模型仍是“AI 操作工作台”。[MCP 文档](https://github.com/liketrek/TREK/blob/main/MCP.md)

当前 Travel Agent 的模式不同：Agent/Skill 只能形成 Evidence 或 `TripPatchProposal`，最终提交必须通过 Parent Agent 与用户确认。这个边界更适合包含价格、证件、外宾资格和购买跳转的 C 端旅行产品，不应为了功能数量扩展成 150 个外部写工具。

## 苏格拉底式问证

下面的问题不是修辞，而是每项采用决策的验收逻辑。

### 问：TREK 为什么看起来比当前产品更像“旅行工作台”？

因为地图是整个 Planner 的空间底座，地点池、日期、交通和路线围绕地图展开；当前产品则把准备卡、下一步、预算/天气、四域状态、地点卡和地图纵向堆叠，用户先看见系统模块，再看见旅行。

**结论：** 采用地图底座和状态分层，不采用 TREK 的完整功能页签。

### 问：如果把 TREK 的左侧日程和右侧地点池搬过来，用户是否会更轻松？

只有在 Agent 已经产生可信候选和路线骨架后才会。首次进入就给空日历、空地点池和 Add Place，会重新要求用户手工做攻略。

**结论：** 地点池必须是 Agent 返回的待确认候选；空状态仍以自然语言输入开始。

### 问：用户是否需要拖拽？

需要，但拖拽应表达“我想这样改”，不能绕过时间、预算、同行人、锁定项和路线校验。TREK 的直接拖拽适合手工工作台；本产品中拖拽应先生成可视化 Change Preview，再由用户确认提交。

**结论：** 采用拖拽预览，不采用前端直接改写 TripState。

### 问：是不是应该立刻增加 Plan、Transport、Booking、Lists、Costs、Files、Collab 七个页签？

不应该。首要用户是“不想做复杂攻略、但希望旅行能执行”的人。页签数量会把系统内部能力变成用户必须管理的工作。

**结论：** 主导航继续保持 Chat / Trip / Map。确认旅行后按需出现一个 `Trip Kit` 抽屉，承载预订、准备、文件、预算和打包；没有内容时不显示。

### 问：预算、打包和文件是否没有价值？

有价值，但价值发生在计划形成或预订之后。首次输入前展示它们只会增加认知成本。对于入境游客，真正高价值的是票据、酒店确认、支付/网络准备和双语现场卡，而不是通用的“袜子三双”。

**结论：** 先做执行资料包，再决定是否扩展通用打包和费用分摊。

### 问：TREK 的协作套件是否应该完整迁移？

不需要另一套群聊，因为 Travel Agent 已有对话；真正缺的是多人对关键决定的确认。完整聊天室、笔记和投票会与 Agent 会话重叠。

**结论：** 先做 `OpenDecision` 分享与轻量投票、逐人偏好确认和共享 Today；延期完整协作中心。

### 问：TREK 已有路线优化，我们为什么还需要 Agent？

路线优化只回答顺序和移动成本，不能可靠回答“这个地方为什么适合父亲、外宾能否住、是否值得绕路、软广是否可信、下雨后怎样局部恢复”。公开讨论中，用户也提出结合移动时间、活动时长、睡眠和到达时间检查每日可行性；维护者明确指出活动时长高度主观，自动判断容易误导。[讨论 #365](https://github.com/liketrek/TREK/discussions/365)

**结论：** Travel Agent 的优势是把已核验移动时间、用户明确给出的活动时长/体力约束和不确定项一起解释；未知时追问或标注，不发明默认游玩时长。

### 问：自动排程是否会损害用户控制？

会，尤其是缺少撤销和变化解释时。TREK 用户公开请求 undo，原因是误删多个地点；当时维护者实现了 Google Maps 列表导入，但没有加入撤销。[讨论 #205](https://github.com/liketrek/TREK/discussions/205)

**结论：** 本产品保留 Proposal、revision、锁定和拒绝机制，并在 UI 增加“将改变什么”；后续提供回到上一已确认版本，而不是静默重排。

### 问：TREK 的离线能力是否适合直接复制？

完整缓存地图、API 和上传文件会带来敏感票据、证件和空间占用风险。入境用户更需要一个离线可读的当天执行包，而不是整个工作区离线。

**结论：** 独立实现最小 `Today Offline Pack`：当天地点、路线摘要、酒店地址、票务状态、双语短句和一个备选；预订号默认遮盖，不缓存证件或支付资料。

### 问：能否复用 TREK 代码以节省时间？

不能。上游为 AGPL-3.0；本项目规则已明确排除 AGPL 直接依赖。其 Google Places/OSM/Mapbox 数据组合也不等于中国境内的高德、飞猪、途牛、12306 和社交证据链。

**结论：** 只借鉴通用交互思想，独立实现，不下载或复制代码进入工作区。

## 对当前 Travel Agent 的采用矩阵

| TREK 能力/模式 | 判断 | Travel Agent 的具体采用方式 |
| --- | --- | --- |
| 地图作为 Planner 底座 | 立即采用 | 桌面 Trip 视图改为 `路线/日程 56% + sticky map 44%`；对话可折叠 |
| 左侧按天计划 | 条件采用 | 有时间窗和移动可行性证据时显示 Day Timeline；否则显示“路线骨架”，不伪装日程 |
| 右侧未安排地点池 | 立即采用 | 改成按需打开的“候选池”抽屉，只放待确认 Proposal 节点，不永久占宽 |
| 地点/地图双向焦点 | 保留并深化 | 当前已有，扩展到路线段、日期和候选池 |
| 路线优化/拖拽 | 条件采用 | 拖拽生成 `TripPatchProposal` 和影响预览，确认后提交 |
| Trip cover/旅行首页 | 采用 | 用已核验地点照片形成目的地头图；无图时保持纯色，不使用通用假图 |
| Lists/Costs/Files | 收敛采用 | 合并为确认后出现的 `Trip Kit`；先做票据、预订状态、准备、PDF/离线包 |
| Collab Chat/Notes/Polls | 部分采用 | 只做关键 OpenDecision 分享/投票、逐人偏好确认、共享 Today |
| Journey + pros/cons | 采用语义，不照抄布局 | 对接现有地点到访记录，显示匿名结构化“值得/不值得、等待、花费、设施变化” |
| PWA/离线 | 采用目标 | 优先 Today Offline Pack 和断网可读；不缓存敏感资料 |
| PDF/分享 | 采用 | 默认遮盖预订号和私人备注，输出来源与非实时提示 |
| 多语言 | 保留目标 | 继续做地点别名、地址转写、双语现场卡；不是只翻译按钮 |
| 150+ MCP 工具 | 拒绝 | 保持 trip/decision/proposal/fulfillment 业务合同，不暴露低层直接写面 |
| 自托管 Admin/备份/SSO/2FA | 不进入 C 端主路径 | 借鉴安全原则；不把部署和管理员任务交给普通旅行者 |
| Atlas、旅行统计、社交社区 | 延期 | 不影响首次激活旅行和行中执行，不进入当前迭代 |

## 推荐的新界面模型

```mermaid
flowchart LR
  CHAT["可折叠 Agent Rail"] --> PROPOSAL["候选池 / Change Preview"]
  PROPOSAL --> WORKSPACE["地图底座上的路线骨架或 Day Timeline"]
  WORKSPACE --> CONFIRMED["已确认 / 已预订 / 锁定"]
  CONFIRMED --> TODAY["移动端 Today + Offline Pack"]
  TODAY --> VISIT["到访记录与待核验纠错"]
```

### 桌面

1. 顶栏：旅行名称、日期、同行人、保存/分享、Trip Kit。
2. Agent Rail：默认约 340px，可折叠；只展示当前决策附近的对话，不让长文主导视觉。
3. 主工作区：路线骨架或 Day Timeline，与大地图并排并共享焦点。
4. 准备摘要：顶端一条“出发前还差 N 项”，展开后才显示详细卡片。
5. 候选池：用户点击比较或 Agent 提出变化时从右侧打开；不形成永久第三栏。
6. Change Preview：显示新增、移除、换序、预算/步行/锁定影响和未知项；确认后才提交。

### 移动端

- 未规划：Chat；
- 有路线骨架：Trip；
- 旅行当天：Map/Today；
- 候选、准备和 Trip Kit 使用 bottom sheet；
- 地图不与完整编辑器同时滚动；Today 离线可读。

## 状态合同映射：不新增第二套真相源

| 用户看见的状态 | 现有所有者 | 需要补的最小合同 |
| --- | --- | --- |
| 候选池 | `pendingProposals[].byDomain` | 仅增加前端视图与跨域聚类，不复制节点 |
| 路线骨架 | 已选节点 + Mobility Observation | 现有能力；继续显示 `unscheduled` |
| Day Timeline | Decision Graph + time window + Mobility | `DayPlanProposal`，未知活动时长必须显式 |
| 已预订/锁定 | Fulfillment Plane + locked node | 复用 booking confirmation，不新建 booking 表面状态 |
| Change Preview | `TripPatchProposal` | 增加用户可读 diff 与影响摘要 |
| Trip Kit | Readiness + Fulfillment + artifact pointers | 执行资料视图；敏感内容不进入 Prompt |
| Today Offline Pack | Today View +已确认 artifact | 最小离线快照、过期时间和遮盖规则 |
| 多人投票 | OpenDecision + traveler/member refs | 投票只作为决策输入，Parent Agent 仍是提交者 |

## 分阶段建议

### 现在：直接改善主体验

1. 把永久 Session 栏收进 Trips drawer，保留会话管理但不长期占据地图宽度。
2. 把 Readiness 和 Next Step 压成顶端一条摘要，旅行内容进入首屏。
3. 将已选地点卡 + 地图重构为稳定的 `TripWorkspace`；地图固定占 40%—45%。
4. 新增按需候选池，用 pending proposal 区分“待安排”和“已确认”。
5. 长 Agent 回复默认只显示结论、一个关键取舍和下一步，来源/完整解释按需展开。

### 下一阶段：需要合同支持

1. `DayPlanProposal` 与时间窗、移动段、活动时长未知项。
2. 受控拖拽和 Change Preview。
3. 回到上一已确认版本。
4. `Trip Kit` 与默认脱敏的分享/PDF。
5. Today Offline Pack。

### 先验证再做

1. OpenDecision 轻量投票是否提升多人确认率；
2. 打包/费用分摊是否是入境自由行的高频需求；
3. 完整协作中心、Atlas、旅行统计和社区是否产生独立留存；
4. 是否真的需要 WebSocket，而不是低频共享刷新和版本冲突处理。

## 验收指标

- 首次真实方案中，旅行地点或地图在 1 个视口内出现，不被准备卡和系统状态推到第二屏；
- 用户能一眼区分候选、路线骨架、已确认和已预订；
- 用户从候选池换住宿时，能先看见路线、预算和锁定影响，再确认；
- 不知道活动时长或城市路线时，不显示伪精确 Day Timeline；
- 移动端三次点击内到达 Today，断网时仍能读到当天关键资料；
- 多人意见只影响相关 OpenDecision，不覆盖其他人的偏好；
- 分享/PDF 默认不暴露预订号、私人备注、证件或支付信息；
- UI 改造不增加低层 MCP 写接口，不改变 Parent Agent 提交权。

## 来源与证据边界

### 主要来源

- [Olares：使用 TREK (NOMAD) 协作规划旅行](https://www.olares.com/docs/1.12.5/zh/use-cases/trek)
- [Olares：配置 TREK 高级设置](https://www.olares.com/docs/1.12.5/zh/use-cases/trek-advanced-settings)
- [TREK 上游仓库](https://github.com/liketrek/TREK)
- [TREK 发布记录](https://github.com/liketrek/TREK/releases)
- [TREK MCP 文档](https://github.com/liketrek/TREK/blob/main/MCP.md)
- [公开讨论：undo 与 Google Maps 列表导入](https://github.com/liketrek/TREK/discussions/205)
- [公开讨论：每日可行性与活动时长](https://github.com/liketrek/TREK/discussions/365)

### 证据限制

- Olares 文档是部署与使用教程，不等于上游最新版本规格；
- GitHub stars、forks 和讨论代表开发者/自托管用户热度，不等于普通旅行者采用率；
- 两条公开讨论只用于验证具体摩擦，不能推断频率；
- 未安装或运行 TREK 实例，界面判断来自上游当前仓库截图、文档和发布记录；
- 本研究没有评估 TREK 的全部代码安全性，也不构成依赖审计或许可意见。
