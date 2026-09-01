# V2 升级实施决策与影响记录

> 日期：2026-08-20
> 范围：首条纵向黄金路径 `免登录输入 → 准备与地图结果 → 登录保存 → 移动端 Today → 变化恢复入口`。
> 目的：记录本轮自主决策、影响、可逆性和复核证据；它不替代 PRD、Provider 真实状态或安全规范。

## 决策摘要

| ID | 自主决策 | 为什么现在这样做 | 用户与系统影响 | 可逆性 / 后续复核 |
| --- | --- | --- | --- | --- |
| D01 | Guest 不建立第二套旅行内核，直接复用现有 Conversation、TripState、TripStore 与成员权限；临时身份使用随机 `guest` user ID，默认 7 天访问期 | 用户需要先获得价值再登录；复制匿名状态会制造合并、授权和提交规则漂移 | 匿名用户可完整对话、研究和确认；登录成功后旅行与对话原子转移到账号，旧 Guest 不再有访问权 | 可调整 TTL；上线前需补过期数据清理任务与真实 OAuth 合并 smoke。不能把本地开发登录当成生产授权证据 |
| D02 | Readiness 使用 TripState 内独立版本，不增加 Trip revision，也不使待确认 Proposal 失效 | “我已准备好 eSIM”不应冲掉酒店或景点比较；准备状态和行程决策的并发语义不同 | 准备项即时更新，同时保留当前候选、锁定项和提案 | 如果准备项未来直接改变可执行约束，应由 Parent Agent 另提 TripPatch，而不是扩大 Readiness 的写权限 |
| D03 | Readiness View 与 Today View 由同一 TripState 确定性派生，不新增任务数据库或第二份真相源 | 当前需要的是“现在与下一步”的读模型，不是提前搭建通用任务平台 | Web、移动壳和小程序可以复用同一 HTTP 结果；已选地点没有可靠时间时明确显示 `needs_schedule` | 日后加入已完成/跳过/现场确认时，再为执行事件增加最小持久化合同；当前不能把派生顺序称为可靠按天日程 |
| D04 | 第一份结果允许真实的部分数据先出现，以准备检查、全局地图、最多三个取舍和一个下一步为主；详细候选按需展开 | 等四条链全部返回会延迟价值，且 Provider 缺失时容易诱发假完整 | 用户可先理解路线结构和阻塞项；最终确认标准仍要求吃、住、行、玩与城市移动完整，不降低 V2 完整方案标准 | Provider 恢复后继续补齐缺失链；不得用模型知识、fixture 或旧缓存填满地图和卡片 |
| D05 | 图片与用户文字直接进入同一个原生多模态 Parent Agent turn；首选 DeepSeek V4 Flash Vision Exp，Kimi K2.6 保留为显式对照/回退。视觉 Agent 可调用既有旅行工具，但不获得提交权；链接按钮仍只形成受约束导入请求 | 用户真正需要的是“给一张截图并继续把旅行做下去”，不是先等待图片摘要、复制文字、再发起第二轮。复用同一 Agent 与工具边界比新增视觉 Workflow 或第二个 Plugin 更简单完整 | Web 先预览图片，再把图片和自然语言一起发送；本轮可完成视觉理解、旅行要求保存、真实来源核验和方案候选。原图不落盘，已保存对话只记录本轮曾包含临时图片 | 当前 DeepSeek Key 的真实图片与工具调用黄金路径已通过；小程序原生上传、服务端统一图片预处理、安全链接读取器和隔离社交 Worker仍需后续验收。图片文字是 Prompt Injection 面，任何可见观察都不能绕过 Evidence、Proposal 和用户确认 |
| D06 | 跨端不是六端同版：桌面保留可折叠对话与地图结果，移动端稳定为 Chat / Trip / Map，Map 承担 Today | 行前深度比较和行中即时行动是两种任务；复制桌面工作台会损害移动体验 | 手机三次点击内可到达 Today；当前/下一步、地图、准备缺口与变化入口集中展示 | 原生、小程序继续复用服务合同；真实定位、通知、扫码授权和平台回跳仍需各端设备验收 |
| D07 | 英文采用浏览器语言自动选择、显式中英切换和核心执行界面本地化；不伪装为已完成地点双语化 | 首次来华用户必须能操作准备、地图、确认和恢复；但 Provider 当前主要返回中文地点名和描述 | 核心匿名路径、准备项、登录、Today、主要按钮与错误引导可使用英文；中文用户可随时切回 | 地点英文别名、地址转写、Provider 文本翻译、地图焦点说明和详情层仍需统一双语归一化，V2 完整英文验收尚未关闭 |
| D08 | 桌面持久化面板宽度必须给结果区保留可读空间，并对结果容器使用 container query | 用户在大屏拉宽对话后再到较小桌面时，旧宽度会把准备卡和引导裁切 | 1440px 下结果区至少保留约 700px；窄结果容器自动改单列，面板仍可键盘和指针调整 | 需要继续覆盖 Windows 字体、浏览器缩放 125%/150% 和折叠屏宽度；当前只完成 macOS 浏览器桌面/390px 移动视口 QA |
| D09 | 第一阶段锁定 React Web Core + PWA + Capacitor 7 + 轻量微信/支付宝原生小程序 | 当前已有真实工程，能以最少框架完成 Web、iOS、Android 和境内入口；同时保留后续演化空间 | UI 和交互先在 Web Core 收敛；Capacitor 共享产物；小程序共享合同和 View Model，不复制桌面布局 | 小程序超过轻量 Chat/Today/Map 后重评 Taro；桌面需要原生分发后重评 Tauri；本轮不新增框架或升级 Capacitor |
| D10 | 地图工作台 UI 改造不得修改 Agent 后端所有权 | 用户确认 Agent、Skill、Provider、TripState、Evidence、Patch 和确认边界是当前基础能力 | 前端只重组已有 Control/Plan/Proposal/Fulfillment 读模型；所有换序和选择继续走 Proposal/accept | 如果 UI 需要新状态，先证明现有状态无法表达，再单独提合同变更；不得在 JSX 内增加隐藏业务决策 |
| D11 | 前端人体工学升级采用保留式重设计，不新增 UI 框架；Chat 只负责表达需求，Trip/Map 负责结果、选择和执行 | 现有工程能力完整，问题主要来自重复首屏、过小证据文字、静态等待状态和移动候选首屏看不到可选项，全面换框架会扩大风险且不解决信息层级 | 首屏移除重复营销式 onboarding；系统 Sans 替代外部 Serif；生成中使用地图/候选骨架；关键证据字号不低于 11px；移动抽屉在首屏显示地图与第一项候选，主要触控目标提高到约 44px | 现有 URL、导航名称、表单字段、Agent/Provider 合同和确认动作保持不变。当前锁定高对比浅色主题；后续若增加深色主题，需与地图瓦片、Provider 图片和全端真机共同验收 |
| D12 | Google Web、微信 Web/小程序、支付宝 Web/小程序分别记录凭据状态与 live smoke；支付宝 Web 和小程序使用独立 AppID/密钥，旧单组字段只作兼容回退 | “按钮可点击”或“单元测试通过”不能证明第三方账号、域名和回调已经上线；支付宝两种应用也不应被强制压成一个 AppID | `auth:setup` 生成本站私密会话/state 密钥，`auth:check` 无敏感输出地列出精确回调、缺失字段和人工任务；Provider 状态只有对应真实渠道 smoke 后才升级 | 平台主体审核、AppID/Secret、域名白名单、支付宝 RSA 文件与真实账号授权必须由持有者完成。微信网站应用和小程序需绑定同一开放平台主体，才能优先以 UnionID 合并账号 |
| D13 | 在现有研究调用内加入结构化 Research Criteria 与安全 query fingerprint；不新建第二套 Planner 或搜索数据库 | 同一真实用户路径证明自然语言虽已保存，目标片区、具名地点、餐饮特征和城际意图没有到达 Provider，定向重查还错误复用旧提案 | 同语义可复用；条件变化会替换受影响候选。高德按具名/片区检索，OTA 按城际与 Offer 角色进入融合 | Criteria 仅保留旅行决策字段并排除敏感信息；若未来需要复杂长期研究记忆，再以真实证据单独评估 |
| D14 | 候选截断延后到 Provider 角色、来源多样性、用户适配度和实体角色融合之后 | 高德按 Provider 顺序先占六条会把途牛航班和酒店 Offer 丢掉，页面上的“真实数据”仍无法回答用户问题 | 城际航班/铁路不会被高德车站替代；餐厅、住宿和游玩先做角色与目标区域校验；可用 OTA Offer 得以保留 | 已补充确认轮禁止重搜、transport criteria 过滤酒店/停车设施、具名查询容错与代表项平衡；Safari 局部补查未替换其他领域 |
| D15 | 自然语言“我选择 X”必须产生真实局部 selection commit，或明确要求用户点击方案区；模型不得仅更新 Brief 后声称已锁定 | Safari 反证中模型说住宿已锁定，但 TripState 没有 selected node、四域仍 open、Mobility 为空 | **已实现并通过 Safari/HTTP：** 支持只确认 stay，吃玩继续 open；已购机票形成独立 user-confirmed arrival node，确认 stay 后即可生成接驳 | 选择不是购买，不扩大交易权限；高置信确认走 Parent Agent 确定性控制，歧义继续交给模型澄清 |
| D16 | 开放决定改为可见 Choice Lanes；候选点击先调用不落盘 Mobility Preview，并以住宿为每日路线锚点 | 真实旅行者无法从隐藏候选和两点地图理解有哪些选择、替换会改变什么，也无法核对时间、预算、体力与天气 | 桌面同屏显示四域候选、地图、时间轴和影响；移动端沿用 Trip/Map；确认后未选项成为快捷替换，单域替换不动其他选择 | 不新增第二套状态或 Workflow；预览必须通过 revision 和成员权限，未定位候选 fail closed。真实证据见 2026-08-27 QA 报告 |
| D17 | 在 D16 的可见候选基础上，收敛为 `Trip Outline + Focused Alternatives + Stable Map` | 四个候选池同时纵向展开会制造长页面；常见 1440px 桌面对话展开时还可能把地图压到下一屏 | 四域当前选择始终可见；一次只展开一个领域的替代项；约 900px 以上工作区保持地图同屏；无试选时不显示无效确认条 | 只重组现有 Plan/Proposal/Mobility 读模型。参考 TREK 的地图/日程分工和 Airbnb Trips 的内容时间轴，不复制 AGPL 代码或扩张为旅行管理后台 |
| D18 | 路线预览失败保留上一版并禁止确认；Conversation 使用软删除与恢复 | Computer Use 发现候选切换失败后地图退化、无重试且仍可确认；会话列表也没有管理和删除入口 | 45 秒超时、Abort、重试和 fail-closed 确认进入同一状态机；酒店详情复用 Mobility 坐标；对话分为进行中/最近删除，TripState 不随会话删除 | 不新增任务平台，不物理删除旅行数据；上线前再确定最近删除保留周期 |
| D19 | 按 2026-08-27 设计基准把工作区收敛为“整趟安排 → 环节比较 → 地图试排 → 影响与确认”，移动三入口固定到底部 | 功能已经存在，但旅行者仍难以看见有哪些选择、替换会改变什么，以及确认前后的边界；继续加卡片会增加认知负担 | 桌面采用 320–440px 对话 + 400–480px 决策列 + 地图画布；移动环节比较为整页、试排自动进入地图，45/85% 路线 sheet 与 sticky 确认栏相邻；小程序同步底部三入口 | 只改读模型与临时 UI selection，不新增状态源或 Workflow；动态候选和路线仍以 Provider/TripState 为准。1440/393 并排视觉证据和完整检查记录在根目录 `design-qa.md` |
| D20 | Provider 并行取数后只运行一次有界语义 fan-out；Web 使用 Dynamic Workflow library，外部 Pi package 使用 `pi-subagents`，两者不进入同一 Parent 工具面 | Provider 已并行，高德/OTA 不能因 Child 数量重复调用；原 manifest、Skills 和 Extension 只有声明证据且 Pi business runtime 无 Provider | HTTP/MCP/Pi runtime 统一 `createTravelService(env)`；Parent/Child 实际加载四个组合 Skill；最多三条不同 lane、一次 Join、最多一次条件修正；Child 只读且无 Provider/commit/购买/Shell/任意 URL/递归委派能力 | 回滚时可将 `analysisFanout` 设为 false，Provider、TravelService、TripState 与公共 HTTP/MCP 合同保持不变；Pi package child agents 是外部宿主可选能力，不影响 Web 主路径 |
| D21 | 在 D20 内增加 run coverage、stale discard、exactly-once Join、模型 fallback ledger、Provider 空库存语义和 single-process 部署门；不新建队列或第二套状态 | 并行 lane 部分失败、旧 run 迟到、重复回调、未验证 fallback、OTA 空数组和不兼容 Pi 宿主都可能让页面/文案与 TripState 漂移 | Agent/API/UI 共读一份覆盖对象；单一 required lane 也真实执行；旧 revision/fingerprint 丢弃；Proposal 与 runId 稳定关联；高德设施不补位城际库存；默认并发 2、Child 45 秒、总轮 90 秒；多 worker 未协调时关闭 fan-out | 回滚可关闭 `analysisFanout` 并保留 Provider/TripState 主链；不能回滚状态一致性、用户文案诚实性或宿主 fail-closed。横向扩容到来时再以 PostgreSQL lease 替换进程内 coordinator，不预建 Redis/Kafka |
| D22 | V3/M1 用一个结构化 `price` 表达实价、参考价、估算和未知；旧 `cost` 仅作为持久化 v1 的数字镜像继续读取，不再承载价格性质。前端采用一个本地 `OverlaySurface` 解决三个高风险浮层，不引入整套组件库 | 直接把公开 `cost:number` 大爆炸改名会破坏历史 TripState、HTTP/MCP consumer 和 Provider fixture；为 Pi 再复制一份缩小合同又会制造用户已否决的重复工具合同。当前高风险问题只需要焦点、Escape、背景隔离和滚动锁 | Provider → Proposal → TripState → budgetLedger → Agent → Web/小程序共读同一 price；途牛可显示带 checkedAt 的 firm，高德与未核验库存显示 reference/unknown，整趟乘人数/晚数后显示 estimate。Place Detail、History Drawer、Delete Dialog 共用同一可访问浮层；无 Tailwind/Radix/Motion 增量 | 历史镜像可在下一个持久化主版本迁移完后删除；若浏览器原生 inert/focus 合同出现真实兼容缺口，再评估一个 headless primitive，不预先安装组件系统 |
| D23 | A0 采用“派生 itinerary + feasibility gate”，不新建第二份旅行状态；preview artifact 以 Trip revision + selections 为业务新鲜度，`checkedAt` 只说明数据时间 | 同一 DecisionNode 可能在多日路线中出现为入住、返回、次日出发，不能把 occurrence 强塞回单值 node.time；动态查询时间也不能成为 stale 的业务判据 | Mobility 保存 `dayIndex/date/startAt/endAt/role` stop occurrences；确认前检查时间单调、required route、已知营业窗口和硬无障碍冲突。可行 preview 在确认后直接成为当前 Mobility，避免二次路线查询 | 可单独关闭 feasibility gate 回到只读试排，但不得回滚 arrivalAt 语义、Day occurrence 或不可执行方案禁止确认；未来真正的行程编辑继续扩展该派生视图，不复制 TripState |
| D24 | 深度行程采用“LLM 计划 + 确定性 Check + 最多一次 Repair”，仅增加 `plan_itinerary_trial`；不恢复旧 Planner Extension、不放进 Dynamic Workflow、不新增 planning Sub-agent | 偏好性站序不能继续由 `buildItineraryDraft()` 固定，路线分钟和约束事实也不能交给 LLM；现有 Parent、Skill、Run Coordinator、TravelService、AMap、Proposal 和 TripState 已足够组成轻量闭环 | 模型决定 Day/顺序/时间窗/停留/role/理由，Checker 决定可执行性；成功 Trial 可撤销且 revision 不变，采用后提交同一 itinerary/mobility。逐段交通方式在服务端重检并持久化。直接按钮产生真实模型+Tool，而不是预填文本 | 回滚可隐藏 AI 优化入口并保留 quick conservative preview；不能回滚“快速连线不得冒充 AI 优化”、固定锚点归一、stale discard、确认复用与路线 mode 服务端校验 |
| D25 | 地图采用一份非持久化 `RouteMapScene` 投影与分层渲染：Web/Capacitor 优先高德 JS 薄 Adapter，失败回退 Leaflet/静态图；微信/支付宝使用原生当天地图 | 旅行者需要按 Day/leg 看懂多点路线，而不是一条统一蓝线；强迫六端同一渲染器会增加体积和平台风险，前端再次规划又会制造第二份路线事实 | railway/公交/步行 step geometry 进入同一 Mobility 合同；地图与路线卡双向焦点、方式标签、重复到访序号和缺失折线状态一致。小程序只显示 Today/下一段，并通过既有 Mobility Preview 切换方式 | 渲染器开关可关闭高德 JS 而不影响路线事实；Web JS Key/安全码、Capacitor 设备和小程序真机分别验收。不得借用另一方式折线或端点直线填补缺失 geometry |
| D26 | 桌面 Evidence Companion 采用 Electron 44 的轻量增强壳，不采用 Tauri 2，也不复制 Web Core | 当前核心是同窗展示不可信原页、独立 Session、系统浏览器 OAuth/deep link 与可控销毁。Electron `WebContentsView` 直接复用 Node/React 工程和 Chromium 安全控制；Tauri 虽包体更轻，却引入 Rust 与 macOS/Windows/Linux 系统 WebView 差异，不能减少本轮最大风险 | macOS/Windows/Linux 复用同一 Web UI；Trusted App 与 Untrusted Evidence 分离，原页无 Node/IPC/Token/Agent 权限。OAuth 只回传一次性 code，桌面使用内存 Bearer | Electron 仅是可移除外壳：Web/PWA/Capacitor/小程序与 HTTP/MCP 不依赖它。若包体或更新成本实测超过价值，可删除 `apps/desktop` 并恢复系统浏览器原文，不迁移 TripState。高德自定义 origin、生产 OAuth、签名/公证未通过前不得称为发布完成 |
| D27 | E4 先交付项目内受限 Worker 与无登录安全 smoke，不提前合入 OpenCLI/xiaohongshu-mcp/douyin-cli | 账号、条款和平台风控是当前未知；先安装第三方浏览器栈会扩大写面，却不能让生产读取合法可用 | Worker 只接受 search/read/resolve 三个动作；写操作、任意 URL、Shell/eval/下载均拒绝。没有专用账号时 search 返回 `AUTH_REQUIRED`，公开链接仍走 E1 读取器 | 只有固定 SHA 静态审计、条款批准、专用 profile 和 `passed_read_only_isolated` 全部通过后才接入 Provider routing；当前状态不是可用社交搜索 |

## 本轮真实落地状态

已贯通：

- 匿名会话自动创建，不再出现登录墙；
- Guest 旅行和对话在登录后归入账号，旧 Guest 访问被拒绝；
- Google、微信 Web/小程序、支付宝 Web/小程序的回调与 code exchange 合同已分别验证；本站 session/state 密钥已安全生成，`auth:check` 会阻止把未完成真实账号 smoke 的渠道标成上线；
- 账号退出或身份切换时按 `userId` 重建编辑器，清除前一身份留在浏览器内存中的旅行；空会话不再自动滚到底部而裁掉首屏标题；
- 入境准备状态、官方核对入口和不收集敏感信息的边界；
- 第一份地图结果、四域候选可见试排、按日多点路线与影响预览、确认后移动端 Today；
- 2026-08-27 工作台设计基准已落地：桌面三栏、行式环节卡、面包屑比较、当前/试排双路线、影响条与相邻确认栏；移动/微信/支付宝采用底部三入口，移动试排使用可展开路线 sheet；
- 变化入口会把“只重排受影响部分”的请求带回对话；
- 中英切换覆盖匿名入口、准备、主要行程外壳、登录和 Today；
- 用户曾拉宽对话栏时，结果区不再发生卡片裁切和竖排文字。

此前脚本结论（已被 Computer Use 反证覆盖）：

- D13/D14 在直接 Service smoke 中通过，但不能再表述为自然用户路径已闭环；
- 构建产物在桌面与 390×844 移动视口完成真实操作，地图由 Mobility 解析坐标补齐到 4 个地点，console error/warn 为空；
- 高德当前账号门控已解除，地点、天气、三类路线和静态地图真实 smoke 已通过；历史 `10044` 仅保留为历史诊断；
- 途牛真实库存返回酒店、火车和航班，飞猪返回住宿与交通；应用现在先按角色和用户适配度融合再截断。

Computer Use 反证修复闭环：

- 高置信已购票/候选确认进入 Parent Agent 确定性控制，只有 commit 成功才生成“已确认”文案；
- Safari 最终状态只选 arrival 与 stay，玩/吃 residual proposal 保留且与 trip revision 同步；
- 上海浦东国际机场 T2 → 全季酒店 Mobility 完成，路线阈值、实际值、触发项与无障碍未知状态可审计；
- 真实 HTTP 等价测试与 `npm run check` 共同守住该路径，但 Provider 动态库存和其他上线门继续独立验收。

Agent Runtime P0/P1 加固：

- 每轮语义分析记录 required/started/completed/failed/timed-out lanes，并以 `complete|partial|failed` 统一驱动 Agent、API 和工作台文案；
- run/lane 绑定 revision 与 criteria fingerprint，旧 run 迟到会 `stale_discarded`；lane completion、Join 和 Proposal 均有稳定幂等键；
- Child semaphore 默认 2，单 Child 45 秒、Parent 90 秒，连续超时停止尚未开始的 lane；未通过专用 smoke 的模型保持 `fallback_unavailable`；
- Provider 空库存、不可用、限流、授权和 partial 分开；高德交通设施不作为航班/铁路库存；
- 锁定 Pi 0.84.1 的临时 consumer 已运行真实只读 Child；目标全局 Pi 0.74.0 fail closed。生产仅声明 `single_process`，多 worker 无 coordinator 时关闭语义 fan-out。
- 2026-08-28 在启用 DeepSeek JSON-only、两端共用有界对象提取并把 AbortSignal 传到底层请求后，最新 live 复验为 DeepSeek 3/3 required lanes、Kimi 2/2 required lanes 完整；Kimi fallback ledger 恢复为 available。先前 partial/failed 仍保留为门控生效证据，不能被删成“从未失败”。
- 同日真实浏览器的复杂四域请求仍出现 `local_discovery` 45 秒超时；滚动 semaphore 让已完成的 `inventory_budget` 立即释放槽给 `operability_schedule`，最终 2/3 lane 成功。页面、聊天与 TripState 一致显示 partial，候选保持未确认且 revision 不变。结论是“状态一致性和有界降级通过”，不是“live 自然路径稳定 3/3”。

仍未关闭：

- 小众/当地特色仍缺独立社交内容或足够真实到访反馈；当前地图和 OTA 结果只能证明实体、位置与部分营业/库存资料；
- Google、Apple、微信和支付宝仍需真实平台授权；本地开发身份只用于验证 Guest 合并合同；
- 地点名称、地址和 Provider 长描述尚未完成英文别名与翻译归一，不能宣称完整英文产品已经完成；
- Guest 过期访问已阻断，但物理数据清理任务尚未实施；
- 分享链接还没有安全读取器；DeepSeek 原生多模态 Agent turn 已完成当前账号真实图片与工具调用验收，Kimi 保留为可配置回退；服务端统一图片预处理与小程序真机上传仍未关闭；
- Today 当前是确定性读模型，尚未持久化“已完成、跳过、现场确认”等执行事件。
- 当前 coordinator 只在单进程内保证 run/Join 幂等；尚不支持跨实例 background/resume/steer。若要横向扩容，必须先实现数据库 lease 与原子 Join，而不是直接增加 worker。

## 复核方式

1. 合同层：运行 `npm run typecheck`、相关 Runtime / Service / Agent / HTTP 测试和 `npm run check`。
2. 浏览器桌面：匿名英文输入上海四日旅行，确认准备清单、地图、部分结果说明、候选确认与登录后无损保存。
3. 浏览器移动端：390×844 视口打开 Chat / Trip / Map，Map 显示 Today、当前/下一步、非实时说明和变化恢复入口。
4. Provider 证据：分别记录高德、飞猪、途牛的直接 smoke、应用组合结果和浏览器结果；任何一层通过都不能替代下一层。设施记录与路线仍固定注明非实时。
5. 生产前复核：真实 OAuth 回调、专用 Provider 账号、Windows/Android/iOS/微信/支付宝设备、英文地点归一和 Guest 清理任务必须另行关闭。
