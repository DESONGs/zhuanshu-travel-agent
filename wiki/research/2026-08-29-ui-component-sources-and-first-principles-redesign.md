# Travel Agent 前端组件调研与第一性原理 V3 设计方案

- 日期：2026-08-29
- 状态：调研与 PM/Design 审查完成，审查修改已并入本文；交付顺序以[智能规划能力产品迭代文档 §11 合并路线图](../current/11-intelligent-planning-iteration.md)为准，后续开发由 codex 主线程执行
- 范围：Beautiful UI、beUI、Rare UI、Transitions.dev、shadcn/ui，以及当前 Travel Agent Web、移动端与小程序工作区
- 约束：保留 Chat-first、共享 TripState、吃住行玩联动、地图主导、试排不落盘与用户确认边界；不做全面重写，不引入 Tailwind 迁移或通用 UI 平台

## 一、结论先行

这五个站点确实有价值，但不能作为五套组件库同时引入。

最合适的组合是：

1. **shadcn/ui 提供标准组件的行为合同与可访问性基准**，但不照搬其视觉主题，也不把当前工程整体迁移到 Tailwind。
2. **Beautiful UI 提供 Agent 工作状态、建议、证据与确认的产品语义参考**，只借鉴交互结构，不展示模型思维链或内部工具名。
3. **Transitions.dev 提供轻量、可复制的状态动效语法**，优先采用 CSS 版本，并保留 `prefers-reduced-motion`。
4. **beUI 只选少量高价值交互作为参考**，重点是移动地图上的 snap bottom sheet、drawer 和 action state swap；不引入其玻璃拟态、弹跳式动效和完整 Tailwind/Motion 体系。
5. **Rare UI 本轮不直接采用**。它更适合展示型页面，Duration Picker 等组件依赖较多，视觉表达强于旅行任务价值。

因此，新版不是“换一个组件库”，而是建立一个轻量的本地组件层，再用它重组旅行者的决策路径：

```text
表达旅行想法
  → 看见 Agent 正在处理什么
  → 看见整趟旅行还差什么
  → 聚焦一个决定比较候选
  → 试排并看到地图、时间、预算、体力影响
  → 用户确认后才写入旅行
```

## 二、第一性原理与苏格拉底式问证

### 1. 用户为什么需要这个界面？

不是为了欣赏组件，也不是为了观察 Agent 调了什么工具。用户要把一个模糊愿望变成一趟能理解、能比较、能调整、能执行的旅行。

所以界面的价值时刻不是“AI 返回了很多文字”，而是：

- 我知道有哪些真实选择；
- 我知道为什么更适合我和同行人；
- 我知道选它会怎样改变路线、时间和预算；
- 我知道哪些内容已确认，哪些仍待核验；
- 我可以放心试排，因为确认前不会改动行程。

### 2. 产品最小的设计单位是什么？

不是 Card，而是一个 **Decision Moment**：用户在证据、约束与影响都可见的情况下，保留当前选择或采用替代方案。

每个组件只有在帮助这个 Decision Moment 时才值得存在。漂亮但不缩短理解或操作路径的组件应被拒绝。

### 3. 什么必须稳定，什么可以变化？

- 稳定：用户已确认事实、当前路线基准、地图空间关系、同行人硬约束。
- 可变化：候选、试排路线、预算差额、时间顺序、资料覆盖状态。

这意味着地图不应在用户打开详情或比较候选时消失；试排也不能覆盖已确认路线。界面需要“稳定基准 + 可撤销变化”的双层表达。

### 4. 动效到底解决什么？

动效只解释四类因果：

- 内容从加载态变为真实结果；
- 当前决定切换到一个候选比较；
- 试排选择改变了路线和影响；
- 操作从处理中变为成功或失败。

如果动效不能回答“什么发生了变化”，就不应加入。Shimmer、3D Tilt、Confetti、Gooey Menu 和字母特效都不属于旅行规划主路径。

### 5. 为什么当前界面仍显得一般？

问题不只是颜色或圆角。当前工程已经有合理的信息架构，但组件实现仍集中在约 1766 行 `travel-app.jsx` 与约 1953 行 `styles.css` 中，存在以下结构性成本：

- Dialog、Drawer、Sheet、Toast、Tabs、Skeleton 和状态提示各自手写，交互状态与焦点行为不完全统一；
- 同一个“当前、候选、试排、已确认、部分资料”在不同区域使用不同视觉语法；
- Agent 进度主要表现为文字或 loading，而不是能与最终方案同构的任务状态；
- 候选、证据、详情、确认之间仍有卡片和浮层叠加感；
- 响应式规则经过多轮增量追加，维护者难以判断哪一条是当前组件合同；
- 视觉细节已比早期成熟，但“为什么推荐、变化影响、下一步动作”还没有通过统一组件变得直观。

所以根因是 **组件语义和状态合同不统一**，不是组件数量不够。

## 三、五个站点的真实采用判断

| 来源 | 已核实能力 | 技术与许可 | 对 Travel Agent 的有效部分 | 不采用部分 | 结论 |
| --- | --- | --- | --- | --- | --- |
| [Beautiful UI](https://www.beautifului.dev/) | Loading、Thinking、Streaming Text、Approval Card、Task Rows、Recommendation Card、Context Cards、Chat、Prompt Bar 等 AI-native patterns，可查看和复制源码 | MIT；实际源码使用 React、Tailwind tokens、自有 Button/GlideMenu/RollingDigits 等基础设施 | AgentProgressRail、结构化澄清、建议与替代、证据卡、带 elapsed time 的加载状态 | 暗色展示风格、工具调用可视化、模型思维链、伪精确 confidence meter、整套 Tailwind 基础 | **高语义价值，低直接移植价值** |
| [beUI](https://beui.dev/) | 111 个 React 19 + Tailwind 4 组件；Motion 动效；shadcn registry；Bottom Sheet、Drawer、Toast Stack、Tabs、Agent Activity 等 | MIT；React 19、Tailwind 4、Motion，源码复制进项目 | Bottom Sheet snap points、Drawer、状态切换、Toast 的交互细节 | Dynamic Island、Dock、Tilt Card、玻璃表面、弹跳 Accordion、整套主题与 Tailwind 迁移 | **选择性交互参考** |
| [Rare UI](https://www.rareui.com/) | 14 个 React/shadcn 动画组件，支持 reduced motion；Duration Picker、Step Player、Fluid Orb 等 | MIT；React、Next、Tailwind、Motion。Duration Picker 额外依赖 figma-squircle、flubber、react-use-measure、Radix Slot | Step Player 可作为时间线灵感；输入错误反馈可参考 | Fluid Orb、Gravity Letters、Bounce/Proximity Sidebar、Gooey Duration Picker、展示型动效 | **本轮不直接采用** |
| [Transitions.dev](https://transitions.dev/) | CSS/React 状态动效；每项可复制；namespaced CSS variables；官方说明包含 reduced-motion guard | MIT；免费 CSS 可独立复制，Refine 为 Beta 且会调用 Agent 修改源码 | Card Resize、Text State Swap、Panel Reveal、Page Side-by-side、Icon Swap、Success Check、Skeleton Reveal、Spinner-to-check | Shimmer Text、Organic Shimmer、3D Tilt、Confetti、Like Burst、Reasoning Stream、Refine 工具 | **最适合当前工程的动效来源** |
| [shadcn/ui](https://ui.shadcn.com/) | Open code、可定制、可拥有源码；标准 Button、Dialog/Sheet、Tabs、Tooltip、Popover、Scroll Area、Command、Skeleton、Alert 等；registry 支持 view/dry-run/diff | MIT；当前生态常结合 Radix/Base UI 与 Tailwind。官方提醒安装第三方 registry 前检查依赖、文件、环境变量并固定版本 | 组件状态合同、焦点管理、键盘交互、标准表单与浮层语义、源码审计方式 | 全站视觉主题、Dashboard block、全量 CLI 安装、Tailwind 重构、通用后台布局 | **作为基础行为标准，不作为主题** |

### 采用优先级

```text
P0  shadcn/ui 的行为合同 + 当前 Travel Agent tokens
P0  Transitions.dev 的轻量状态动效
P1  Beautiful UI 的 Agent 状态与确认语义
P1  beUI Bottom Sheet 的手势与 snap 逻辑
P2  Rare UI，仅在未来出现明确场景时重新评估
```

## 四、明确采用与明确拒绝

### 直接进入新版设计语言

1. **AgentProgressRail**
   - 来源：Beautiful UI Task Rows + Transitions Text State Swap。
   - 只显示用户能理解的工作阶段，例如“理解同行人要求”“核验交通与住宿”“比较路线和体力”“整理可选方案”。
   - 不显示 chain-of-thought、token、内部 Tool 名、Provider 技术名。

2. **PlanChangeApproval**
   - 来源：Beautiful UI Approval Card。
   - 用于真正需要用户回答且会改变方案的一个问题，或者试排后的最终确认。
   - 放在决策区域或地图影响栏，不塞进长聊天气泡。

3. **MapRouteSheet**
   - 来源：beUI Bottom Sheet 的 snap 与 drag 行为。
   - 移动端只有 40% 和 85% 两个稳定 snap；地图在背后持续可见。
   - 使用 Travel Agent 白色实面与现有 tokens，不使用 glass blur。

4. **State Motion Pack**
   - 来源：Transitions.dev。
   - 只包含 Skeleton Reveal、Text State Swap、Panel Reveal、Page Side-by-side、Icon Swap、Success Check。
   - 统一 150–250ms，路线绘制可到 300ms；全部支持 reduced motion。

5. **Accessible Primitive Layer**
   - 来源：shadcn/ui 的组件合同。
   - 统一 Dialog/Sheet、Tabs、Tooltip、Popover、Scroll Area、Command、Skeleton、Alert、Button、Field 的状态与键盘行为。

### 条件采用

- Beautiful UI Recommendation Card：保留“主建议 + 其他选项 + 依据”结构，删除 confidence 百分比，改为可验证理由与未知项。
- Beautiful UI Context Cards：只用于详情层的来源证据，不进入主工作台。
- beUI Toast：只允许单层状态通知，不做三层堆叠表演。
- shadcn Command：当旅行/会话数量真实增长后，用于“跳到某一天、某地点、某决定”，不在当前阶段增加空命令面板。

### 明确拒绝

- 不安装五个 Agent Skills，让多个设计指令同时控制代码；`impeccable` 与当前 PRODUCT/DESIGN 继续作为设计判断基准。
- 不迁移到 Tailwind，不引入完整 shadcn theme，不把现有 CSS tokens 重写为另一套 tokens。
- 不复制 Rare UI Duration Picker。旅行时间应使用日期、时间窗和标准输入，不值得引入五个依赖来获得 gooey 动画。
- 不展示模型思维链、内部 Tool Chips 或 Reasoning Stream。
- 不采用 Dark AI Dashboard、Glassmorphism、Dynamic Island、Dock、3D Tilt、Shimmer Text、Confetti 或流体特效。
- 不以组件数、动效数或视觉新奇度作为验收指标。

## 五、V3 产品形态：Spatial Decision Workspace

新版工作台仍是“对话 + 决策 + 地图”，但把三栏从并列页面变成一条清晰的决策路径。

### 核心循环

```text
Chat 表达意图
  → Progress 看懂 Agent 正在做什么
  → Trip Outline 看整趟缺口与当前选择
  → Focused Compare 只比较一个决定
  → Map Trial 看多点路线与影响
  → Approval 确认或保持当前
```

### 桌面端

```text
┌──────────────────────────────────────────────────────────────────┐
│ Topbar：旅行摘要、当前状态、语言、账号                           │
├───────────────┬───────────────────┬──────────────────────────────┤
│ Chat Rail      │ Decision Spine    │ Stable Map Canvas            │
│ 320–380px      │ 400–460px         │ flex-1                       │
│ 可折叠         │ 一次聚焦一个决定   │ 当前路线 + 试排路线 + 影响栏  │
└───────────────┴───────────────────┴──────────────────────────────┘
```

#### Chat Rail

- 用户表达、纠正和追问仍从这里进入。
- 响应式规则：三栏并列只在 ≥1180px 成立；900–1180px 时 Chat Rail 折叠为 48px 窄条或覆盖式 drawer（默认折叠，可唤出），保证 Decision Spine 与地图不被同时压缩；900px 以下进入移动三入口结构。
- 生成时显示 AgentProgressRail，而不是重复的 shimmer 文本或内部工具日志。
- 方案出现后，聊天栏可以折叠；决策和地图成为主工作区。

#### Decision Spine

- 默认是按旅行时间顺序排列的决定行：抵达、住宿、餐饮、游玩、返程或额外接驳。
- 每行显示名称、时间窗、状态、**价格槽**、一个关键取舍和“另有 N 个选择”。价格槽不允许为版面干净而省略：实价显示金额与查询时间，参考价标 `≈`，估算标 `~` 并给口径（如“3 人 3 天”），未知标“待核验”（三级价格体系见[智能规划能力产品迭代文档 §5.1](../current/11-intelligent-planning-iteration.md)）。
- 点击一行在原位进入 Focused Compare，不打开新 modal，也不铺开四个候选池。
- 候选比较统一回答：价格性质、路线差异、时间差、同行人适配、**跨域影响**（换住宿对餐饮动线、体力分配与预算的联动 Δ）以及证据与未知。

#### Stable Map Canvas

- 地图始终保留已确认路线作为低饱和基准。
- 试排路线叠加显示，不覆盖基准。
- 地点详情从右侧 Sheet 打开时，地图仍保留并自动让出可视范围。
- 影响栏与确认栏相邻：时间、步行、换乘、预算和硬约束在确认按钮旁出现。

### 移动端

- 底部三入口继续保持 Chat、Trip、Map。
- Trip 采用紧凑决定行，不内嵌大地图。
- 点击候选“试排”后自动切到 Map；MapRouteSheet 默认 40%，上拉到 85% 查看多点路线、设施和证据。
- 确认栏固定在 sheet 与底部 tab 之间，保持当前与采用此方案始终同屏。
- 对话生成状态压缩为顶部 Progress Rail，不让长 loading 占据整个屏幕。

### 小程序

- 复用同一信息层级和 View Model，不复制 Web 动画库。
- Bottom Sheet、Tabs、Toast 使用微信/支付宝原生交互与 CSS transition 的轻量等价实现。
- 不追求像素级相同，必须保证选择、试排、影响与确认的语义相同。

## 六、新版本地组件架构

### 保留的技术基础

- React 19 + Vite；
- 当前 CSS custom properties 与 Restrained 配色；
- Phosphor Icons；
- Leaflet 地图；
- 现有 API、TripState、Proposal 与确认边界。

### 新增的本地层级

```text
src/web/ui/
  button
  badge
  notice
  field
  skeleton
  sheet-dialog
  tabs
  tooltip
  toast

src/web/features/trip-workspace/
  agent-progress-rail
  decision-spine
  option-compare-list
  plan-impact-bar
  place-evidence-sheet
  map-route-sheet
  plan-change-approval
```

这不是新的 UI package、registry 或 monorepo，只是把当前重复的交互合同从 `travel-app.jsx` 和 `styles.css` 中抽出来。

### 依赖策略

1. 第一阶段不安装 Tailwind、Beautiful UI、beUI 或 Rare UI package。
2. 优先评估一个 headless primitives 依赖来解决 focus trap、keyboard、portal 和 ARIA；候选是 shadcn 常用的 Radix/Base UI 底层，最终只选一套。
3. 移动 Bottom Sheet 只有在现有手势无法满足 40%/85% snap 时才评估 Vaul；不先引入 Motion。
4. 动效优先复制经过审计的 Transitions.dev CSS；只有共享布局或拖拽确实需要时才增加 `motion`。
5. 每个第三方源码都固定 commit SHA，记录 MIT 许可证、依赖、文件写入面与本地改动；使用 `shadcn view`、`--dry-run` 和 `--diff` 先审查，不直接执行覆盖式安装。

## 七、组件状态合同

每个可交互组件至少覆盖：

```text
default
hover / focus-visible
active / selected
disabled
loading
partial
error
success
stale / superseded（涉及动态旅行资料时）
```

旅行专属组件还必须区分：

- 当前已确认；
- 候选；
- 试排中；
- 部分资料；
- 已核验为空；
- 来源不可用；
- 需要用户确认；
- 需要现场确认。

这些状态沿用 Agent/API 的同一对象，不能由前端自行猜测。

## 八、动效规范

| 动效 | 场景 | 时长 | 采用来源 |
| --- | --- | --- | --- |
| Skeleton Reveal | 候选和路线从加载态进入真实结果 | 180–220ms crossfade | Transitions.dev |
| Text State Swap | Agent 进度阶段、partial/retry 文案切换 | 140–180ms | Transitions.dev |
| Panel Reveal | Decision Spine 进入 Focused Compare、详情 Sheet | 180–220ms | Transitions.dev / shadcn contract |
| Page Side-by-side | 移动端 Trip → Compare | 200–240ms | Transitions.dev |
| Icon Swap / Success Check | 保存、确认、重新核验完成 | 160–200ms | Transitions.dev |
| Route Update | 当前与试排折线更新 | 250–300ms | Travel Agent 自有 |
| Bottom Sheet | MapRouteSheet snap | 200–280ms，跟手 | beUI interaction reference |

规则：

- 同一时刻最多两个区域发生动效；
- 默认只动画 transform、opacity 和已有 SVG path；
- 所有内容在动画失败时仍然可见；
- reduced motion 下改为 100ms crossfade 或立即切换；
- 不使用 shimmer gradient 表达“AI 正在思考”。

## 九、迭代方案

### Changeset 0：组件审计与采用门

- 建立当前组件和状态清单；
- 对候选 headless primitive、Bottom Sheet 和六个 CSS transitions 做固定版本审计；
- 记录许可、依赖、bundle 增量和回滚方式；
- 不改用户流程。

完成标准：能明确回答每个候选解决哪个当前问题，以及不引入它的替代实现。

### Changeset 1：基础组件收敛

- 抽取 Button、Badge、Notice、Field、Skeleton、Sheet/Dialog、Tabs、Tooltip、Toast；
- 统一 focus、keyboard、disabled、loading、error 与 reduced-motion；
- 先迁移 PlaceDetailSheet、History Drawer 和 Delete Dialog 三个高风险浮层。

完成标准：现有视觉基本不变，键盘、焦点恢复、Escape、body scroll lock 和移动安全区行为统一。

### Changeset 2：桌面决策主循环

前置依赖：与[智能规划能力产品迭代文档](../current/11-intelligent-planning-iteration.md) M1 同车交付——AgentProgressRail 的阶段必须来自真实 Agent 循环的工具调用，ImpactBar 的预算格需要分域账本，OptionCompareList 的价格性质需要三级价格体系；M1 落地前这些组件只显示真实已有的数据，不先上壳后填数。

- 用 AgentProgressRail 取代分散 loading 文案；
- 将整趟安排收敛为 Decision Spine；
- 重构 Focused Compare、OptionCompareList、ImpactBar 与 PlanChangeApproval；
- 地图保持稳定，不因比较或详情消失。

完成标准：用户从整趟安排进入任一领域候选不超过两步；试排影响与确认按钮同屏；未确认状态不修改 TripState。

### Changeset 3：移动地图与路线 Sheet

- 实现 40%/85% MapRouteSheet；
- 试排后自动进入地图；
- 路线、设施、来源和确认栏在同一 sheet 中渐进展开；
- 键盘弹出时正确处理 Composer 与底部 tab。

完成标准：393×852、320px、横屏与安全区无裁切；单指拖地图、双指缩放、sheet drag 不互相抢手势。

### Changeset 4：状态动效与诚实降级

前置依赖：价格三级标注（迭代文档 11 M1）落地后再做“动态价格或路线变化”的呈现，否则变化原因无级别可标。

- 接入六个批准的 CSS transitions；
- Agent/API/UI 共用 loading、partial、failed、stale、success 状态；
- 重新核验时保留已有候选与地图基准，不闪回空态；
- 动态价格或路线变化展示 checkedAt 与变化原因。

完成标准：无动效也能完成全部任务；用户不会把 partial 看成完整，也不会把试排看成已确认。

### Changeset 5：小程序等价与最终 QA

- 在微信和支付宝实现等价 Decision Row、Compare、Impact、Confirm 和 Map Sheet；
- 1440、1180、900、393、320、横屏、200% zoom 与中英长文本验收；
- 键盘、屏幕阅读器、触控、低性能设备和 reduced motion QA；
- 每个 changeset 比较 bundle delta，前端新增 gzip 总量建议控制在 40KB 内，超出时优先回到本地 CSS 和更小的 headless primitive。

完成标准：不以截图或构建通过冒充产品验收，必须完成真实的“表达 → 候选 → 试排 → 地图影响 → 确认”路径。

## 十、验收标准

### 用户路径

- 用户进入后无需理解任何 Agent、Workflow 或组件术语；
- 生成期间能知道当前阶段、已经完成什么和仍缺什么；
- 四域状态始终可见，但一次只比较一个决定；
- 地图、当前路线和试排路线在比较过程中保持空间连续；
- 每次试排都能看到时间、步行、换乘、预算和同行人约束影响；
- 任何确认动作附近都说明它会改变什么；
- partial、empty、unavailable、stale 与 failed 使用不同文案和恢复动作。
- 智能真实性：生成期间的进度阶段必须对应真实 Agent 工具调用；抽验一条规划会话的 activity 日志，进度文案可逐一对上，不允许“进度表演”。

### 人体工学

- 桌面主要动作在 1440px 与 1180px 下无需水平滚动；
- 移动主要触控目标至少 44×44px；
- 正文不低于 14px，证据和来源不低于 11px；
- 主要决策不依赖 hover；
- 详情 Sheet、Drawer 和 Dialog 有焦点圈、焦点锁定与关闭后恢复；
- 用户在 10cm 视距内能同时看到试排影响与确认按钮。

### 性能与维护

- 常用状态切换目标 INP <200ms，CLS <0.1；
- 低端移动设备上不同时运行动画地图、blur 和多个 spring；
- 新组件必须有行为测试或可访问性断言，不以视觉截图代替；
- `travel-app.jsx` 和 `styles.css` 按功能逐步拆分，不做一次性大爆炸改写；
- Web、PWA、Capacitor 与小程序继续共享业务 View Model，不复制旅行确认逻辑。

## 十一、来源、许可证与安全说明

- [Beautiful UI 官方组件页](https://www.beautifului.dev/)，[MIT License](https://www.beautifului.dev/license)
- [beUI 官方站](https://beui.dev/)，[GitHub 源码](https://github.com/starc007/ui-components)
- [Rare UI 官方站](https://www.rareui.com/)，[GitHub 源码](https://github.com/swamimalode07/rare-ui)
- [Transitions.dev 官方站](https://transitions.dev/)，[GitHub 源码](https://github.com/Jakubantalik/transitions.dev)
- [shadcn/ui 官方站](https://ui.shadcn.com/)，[GitHub 源码](https://github.com/shadcn-ui/ui)，[第三方 Registry 审计指引](https://ui.shadcn.com/docs/registry/github)

以上仓库或站点当前均声明 MIT 或开放源码，但许可证本身不证明组件安全、可访问、性能合格或适合当前工程。正式复制前仍必须按固定版本检查文件、依赖、环境变量、安装写面、SSR/Vite 兼容、React 19 兼容与 reduced-motion 行为。

## 十二、最终设计决策

### 采纳

- 保留现有 Travel Agent 配色、地图主导和三栏/三入口信息架构；
- 新增轻量本地 Primitive Layer；
- 采用 Beautiful UI 的 Agent 语义、Transitions.dev 的状态动效、beUI 的 Bottom Sheet 交互、shadcn/ui 的可访问性合同；
- 以 Decision Moment 而不是 Card 数量组织界面。

### 延后

- Command Palette；
- Motion runtime；
- Vaul；
- 地点数据增长后的虚拟列表；
- Dark theme。

这些能力只有在真实内容规模或交互缺口出现时才进入实现。

### 否决

- 五套组件系统并存；
- 全量 Tailwind/shadcn 迁移；
- Rare UI 的展示型动效；
- 暴露思维链或内部工具；
- 为视觉新鲜感重构 Agent、TripState、Provider 或确认边界。

## 十三、实施确认门

本文件已经给出生产级设计方向和分步落地方案，但按 preserve-mode 不直接进入代码实施。用户确认后，实施应严格按 Changeset 0 → 5 推进，每个 changeset 保持可运行，并用真实桌面与移动黄金路径验收。

2026-08-29 PM/Design 审查结论已并入本文（决定行价格槽、Focused Compare 跨域影响、1180px 以下 Chat Rail 规则、CS2/CS4 与 M1 依赖、智能真实性验收）。交付顺序以[智能规划能力产品迭代文档 §11 合并路线图](../current/11-intelligent-planning-iteration.md)为准；后续开发由 codex 主线程按该路线图执行。

同日开发实施已完成 M0/A/B 的纵向闭环并经过真实浏览器验收：决定行价格槽、六候选渐进比较、分域预算、跨域试排 Δ、真实 activity、1180px Chat 折叠、本地可访问 Overlay、393px MapRouteSheet 和小程序局部确认已进入代码。具体完成与未关闭范围以[迭代文档 §12](../current/11-intelligent-planning-iteration.md)为准；C/D 中的按天出行总账、执行事件、真机 OAuth 与完整端侧验收没有被提前写成完成。
