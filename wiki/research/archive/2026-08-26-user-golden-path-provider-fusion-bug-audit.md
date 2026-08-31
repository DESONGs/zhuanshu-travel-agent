# 2026-08-26 上海家庭旅行黄金路径与 Provider 融合缺陷审计

> 状态：**Computer Use 反证对应缺陷已修复，并以新的 Safari 自然会话与 TripState 复测通过。** 上一版仅凭 Service/Provider 脚本得出的“闭环完成”结论仍保持撤回；本次通过结论只覆盖下述自然语言局部确认与机场接驳路径。
> 用例：2026-08-27 至 29 日，广州飞上海，浦东 T2 14:00 落地；与父母共 3 人，总预算 ¥8,000；父亲少走路、避开楼梯；住宿优先人民广场或南京东路；希望去外滩、博物馆和适合父母的轻松体验，吃上海本地菜与不太大众的小店，并查看地图、市内路线与设施参考。
> 边界：不记录或输出任何 API Key、Cookie、Token、证件或支付字段。

## 结论先行

### Computer Use 反证与结论撤回

上一版用 `scripts/smoke-shanghai-family-provider-fusion.mjs`（现命令为 `npm run smoke:service-fusion`）直接调用 `createTrip → researchTripOptions → acceptTripChange`，证明了 Service 可以在人工提供 criteria 和 selections 时组合高德、飞猪、途牛并生成路线；它**没有证明 Parent Agent 能从自然语言正确执行局部确认**。脚本输出固定标记 `evidenceScope=service_provider_contract_only`、`userPathVerified=false`，不能作为普通用户黄金路径完成证据。

侧会话随后在 Safari 以全新普通用户会话真实输入：

> 8月27日至29日，我和父母三人从广州飞上海，14:00 到浦东 T2，预算8000；父亲单段连续步行不超过600米、尽量避开楼梯；不是要求全程打车；比较地铁/打车/步行；住人民广场/南京东路；外滩、历史博物馆、本地菜；先给候选，不替我确认。

第一轮候选与逐人约束基本正确，且没有自动确认。用户随后说明机票已自行购买，14:00 浦东 T2 是事实，不需要选择库存航班；再明确“选择全季酒店（上海人民广场南京路步行街店）为住宿锚点，只确认住宿，吃玩暂不确认；立即核验机场到酒店”。用户可见回复却声称“住宿已按你的确认锁定、保存为后续路线终点”。实际状态文件 `/private/tmp/travel-agent-real-user-demo-20260826/trips/trip_5fe083ce.json` 中：

- `selectedNodes=[]`；
- 四个 `openDecisions` 全部仍为 open；
- `mobility.legs=[]`；
- 只有 `brief.lodgingPreference` 被改成酒店名。

这是状态与文案矛盾：当前聊天工具只保存理解和研究候选，不能提交选择；模型却把“理解了用户选择”说成“TripState 已锁定”。该结论优先级高于上一版脚本 smoke。

同一轮还出现语义范围污染：原外滩、博物馆和中心城区候选被宽泛结果替换；住宿退化为奉城、电竞酒店和同济附近青年旅舍；交通变成全季酒店停车场、长寿路店和北京西路停车点，并把停车设施当作住宿锚点。说明逐域 fingerprint 和角色融合虽通过合同测试，却没有在真实 Parent Agent 自然路径中成立。

### 动态库存只能作为核验快照

航班、价格、余位和酒店 Offer 会随查询时间变化。早先 smoke 曾观察到 HU7431 飞猪 ¥500、途牛 ¥620；后续 live fusion 已变为 HU7431 飞猪 ¥600、AQ1005 途牛 ¥729。任何 Wiki、交付说明和 UI 都只能写成“本次于 `checkedAt` 核验到”，不得把某个航班号或价格写成持续交付事实。

当前问题不是“高德仍被 `10044` 阻断”，也不是“途牛没有航班数据”。本地私有配置已将 `TRAVEL_AGENT_AMAP_SMOKE_STATUS` 设为 `passed_live_smoke`；同一 Key 的 POI v5/v3、地理编码、天气、公交、驾车、步行和静态地图均真实成功。途牛真实库存 smoke 也返回酒店、火车和航班。

产品仍未通过同一用户路径，根因位于应用组合链：旅行要求没有被归一为 Provider 可执行的结构化检索条件；高德宽泛 POI 按 Provider 顺序先占满候选上限；城际航班与酒店 Offer 在角色融合前被截断；第二轮定向重查只看“这个领域已有候选”，没有判断检索语义是否变化。因此页面可以显示很多真实地点，却没有回答用户真正提出的问题。

旧研究中 `10044` 曾经发生且可保留为历史证据，但从 2026-08-26 起不得再把它写成当前有效阻塞。当前缺陷必须按“Provider 已恢复、应用组合仍失败”处理。

## 修复前四层证据，不得混为一谈

| 证据层 | 本轮实际证据 | 可以得出的结论 | 不能得出的结论 |
| --- | --- | --- | --- |
| Provider 实际调用 | 高德 POI v5/v3、地理编码、天气、公交、驾车、步行返回 `status=1 / infocode=10000`；静态地图成功；`npm run smoke:amap` 返回 `passed_live_smoke`。`npm run smoke:inventory` 中途牛返回 stay=6、train=3、flight=2，飞猪返回 stay=6、transport=3 | 账号和只读接口本身可调用；途牛确实有本用例的航班和酒店数据 | 不代表应用一定会把正确结果呈现给用户，也不代表库存可交易 |
| 应用组合链 | 正常 Provider 工厂可调用 `planMobility` 与 `renderMap`；首次对话保存了日期、出发地、人数、预算和父亲个人行动限制；但融合后错误候选进入前 3 | Agent、状态、Provider 和地图合同已经连接；缺陷集中在 criteria、排序、角色融合和 proposal 复用 | 不能用“12 个候选”证明候选与用户要求相关 |
| 浏览器用户路径 | 吃住行玩各出现 3 个候选、12 个地点进入地图；详情显示真实图片、评分、营业时间、来源、入口/室内资料；确认测试候选后生成 4 地点路线、公交/打车/步行比较，高德导航可用，父亲限制驱动打车；无 console error | 地图、详情、逐人路线约束和非实时设施提示可见且真实运行 | 不能称为完整旅行方案：住宿区域、具名景点、航班、餐厅、Offer、接驳和日程仍不正确 |
| 商业授权与实时数据 | 飞猪/途牛仅完成当前账号只读 smoke；高德设施来自地图记录或路线字段 | 可展示已返回的参考信息，并要求最终跳转复核 | 未验证 OTA 的生产商业授权、交易资格、全量房态、实时设施运行、实时公交到站或自动购买 |

## 修复前同一用例的可见结果

### 已通过

- 旅行范围和父亲“少走路、避开楼梯”的要求分别进入 Trip Brief 与具名 Traveler；预算和人数可回显。
- 吃、住、行、玩均有 Provider 候选，地图可定位 12 个地点。
- 地点详情有真实图片、地址、评分、营业信息、来源、新鲜度、高德跳转、入口与室内地图等已返回字段。
- 设施只标记为地图参考、非实时并建议现场确认，没有把“存在记录”写成“当前正常运行”。
- 测试性确认候选后，高德生成城市移动路线；打车、公交和步行的时间、步行量、换乘、估价、折线和导航进入界面，父亲行动限制改变推荐结果。

### 未通过

- 住宿要求人民广场/南京东路，首选仍是莘庄、松江或餐饮/住宿混合场所。
- 具名要求外滩/博物馆，首选仍是会展中心、上海交大和复旦大学。
- 已明确广州飞上海、浦东 T2，交通仍显示上海松江站、虹桥站和上海站；没有航班号、票价、机场和航站楼。
- 没有生成浦东 T2 到住宿的接驳。
- 三个餐饮中两个是酒店；只有一个候选基本符合餐厅角色。
- 可用 OTA 结果没有带入指定日期的房型、价格、早餐和退改；高德酒店参考被误当作足够的住宿结果。
- 确认后仍是路线骨架，地点保持“待排入日程”。
- 第二轮定向重查耗时约一分钟，但候选池没有实质变化。

## 代码根因

1. `src/providers/amap-travel-research.mjs` 的地点检索只接收目的地与宽泛分类，没有接收用户关键词、具名地点、目标片区、餐饮特征或到达节点。
2. `src/providers/travel-research-provider.mjs` 按高德、飞猪、途牛顺序拼接，去重函数在角色、来源和用户适配度融合前执行 `slice(0, 6)`；高德每域先返回六条时，后续 OTA 航班与酒店 Offer 被丢弃。
3. `src/api/travel-service.mjs` 再把每域截为三条；它虽然尝试保留航班和铁路代表项，但上游已经丢失 OTA 结果。
4. `transport` 同时承载高德交通设施 POI、跨城航班/铁路库存和市内 Mobility，候选排序没有先区分角色。
5. 待确认 research proposal 的复用只检查领域是否已有候选，没有比较当前检索条件；“改为人民广场”“找外滩”“广州飞上海”等语义变化不会触发真正替换。
6. `scripts/smoke-conversation-golden-path.mjs` 用未来 14 天日期，却要求约四天窗口的高德天气必须 `covered/partial`，把诚实的 `outside_forecast_window` 错判为失败。

## 本轮最小完整修复范围

- 在既有 Parent Agent → TravelService → Provider 链内增加 `travel-research-criteria-v1`，描述每域关键词、具名地点、目标区域、硬约束和偏好，以及城际交通意图、当地移动意图、到达机场/航站楼/时间；不新增数据库或第二套 Planner。
- 生成不含敏感字段的稳定 query fingerprint；同一语义可复用，语义变化必须替换受影响的旧 research proposal。
- 高德把具名和片区检索置于宽泛分类之前，并校验领域角色；宽泛分类只用于补召回。
- 先按 AMap 地图角色、OTA 库存角色、相关性和来源多样性融合，再截断。高德站点不得替代城际航班，酒店不得作为餐厅首选。
- 将用户确认的浦东 T2 到达信息与航班候选形成到达节点，确认住宿后由高德生成接驳；按日期/时间窗给出可理解顺序，未知项保留为开放决定。
- 保持设施的诚实边界：区分“用户要求”“已取得地图记录”“待现场确认”。

## 验收口径

同一用例只有在以下结果同时成立时才算通过：住宿命中人民广场/南京东路或明确已核验无匹配；外滩/博物馆命中或明确无匹配；广州到上海的航班及可见票价/机场/航站楼进入交通候选；至少一个真正餐厅进入首选；可用 OTA 酒店 Offer 被保留；浦东 T2 到住宿及已选地点间路线可生成；父亲限制继续驱动推荐；地图、图片、来源、设施非实时提示和高德导航不回退；确认后形成按天或时间窗的方案；普通用户界面不出现工程术语。

## 第一轮实现结果（已被自然用户路径反证，不能视为完成）

### 控制链修复

- `travel-agent-pi-package/src/contracts/index.ts` 与 `src/providers/research-criteria.mjs` 新增 `travel-research-criteria-v1`：每域记录关键词、具名地点、目标片区、锚点、硬约束和偏好；交通另分城际意图、当地移动意图以及到达机场/航站楼/时间。完整 criteria 经白名单清洗后生成全局和逐域 fingerprint，不包含凭据、证件、支付、手机号或 Cookie。
- `src/agent/travel-conversation-agent.mjs` 要求 Parent Agent 同时保存机场、航站楼和落地时间，并把具名地点、片区、餐饮特征和交通意图放进 criteria。TravelService 仍会从 Brief、Traveler 和 question 做确定性补全，避免模型漏传后退回宽泛检索。
- `src/providers/amap-travel-research.mjs` 将具名地点、目标片区和餐饮关键词用于最多两次有界文本检索；只有没有具体条件时才使用宽泛分类。POI 在归一前校验领域角色，酒店主实体不会作为餐厅，学校不会替代具名景点。
- `src/providers/travel-research-provider.mjs` 把截断延后到角色、用户适配度、目标区域、来源与实体融合之后。高德负责地点、坐标、图片、设施和市内路线；飞猪/途牛负责航班、铁路与酒店 Offer；同一航班合并两个来源的票价、税费和航站楼，同名住宿尽可能融合地图与房型资料。
- `src/api/travel-service.mjs` 用逐域 fingerprint 判断 proposal 是否可复用；条件变化会以 `superseded_by_research_criteria` 留痕，并只替换受影响领域。选择后写入诚实的建议时间窗，Today 和按天卡片按真实班次/建议时间排序。
- 到达节点优先使用用户确认的浦东 T2，而不是用库存班次覆盖。库存到达时间若与 14:00 不同，会明确显示“只作票价与班次对照”；接驳仍从用户确认的 14:00 到达节点规划。
- `src/web/trip-map-explorer.jsx` 会把 Mobility 已解析的机场和酒店坐标补入地图读模型；不修改 TripState。设施详情固定分为“这次旅行需要 / 当前已取得 / 到场前仍要确认”。
- `scripts/smoke-conversation-golden-path.mjs` 接受 `outside_forecast_window` 作为诚实成功分支；不再把预报窗口之外误判为 Provider 故障。

### 同一用例修复前后

| 用户问题 | 修复前 | 修复后真实结果 |
| --- | --- | --- |
| 人民广场/南京东路住宿 | 莘庄、松江和混合场所 | 前三为全季上海人民广场南京路步行街店、一间森林上海人民广场店、OPARTMENT 远东饭店；不匹配片区的住宿被排除 |
| 外滩/博物馆 | 会展中心、上海交大、复旦 | 真实返回外滩、外滩观景平台及上海博物馆/上海市历史博物馆等相关候选；大学和会展中心不再进入前三 |
| 广州飞上海 | 高德车站 POI | Service smoke 能保留航班类型、来源和 `checkedAt`；具体班次与价格是动态快照，不能写成固定交付事实 |
| 14:00 浦东 T2 到达 | 没有接驳 | 库存航班 08:55 到达与用户信息不同，界面保留差异；市内路线仍从用户确认的“浦东机场 T2”出发 |
| 上海本地菜/小店 | 两个酒店混入餐饮 | 前三全部为真实餐饮实体；当前地图与 OTA 仍不能单独证明“小众/当地人才知道”，界面保留当地特色证据缺口 |
| 酒店房态/房型 | 只有地图参考 | 至少一个途牛只读搜索 Offer 进入候选：大床房、1 份早餐、限时取消、¥564；仍要求跳转前复核 |
| 接驳与同行人限制 | 无 | 浦东 T2 → 人民广场酒店真实高德路线约 65 分钟、估价 ¥151、步行 0 米；因父亲少走路和避开楼梯推荐打车 |
| 日程与地图 | 全部待排期，地图缺点 | 出发日城际抵达、第 1 天入住/晚餐、第 2 天轻松体验；构建产物显示 4 个地点和路线折线 |

### 第一轮证据及其证明边界

- `npm run smoke:amap`：`passed_live_smoke`；高德 play=6、food=1、stay=6、transport=6，照片 36 张；静态地图 283561 bytes；天气覆盖；城市移动完成。
- `npm run smoke:inventory`：飞猪 stay=6、transport=3（本次为 TRAIN）；途牛 stay=6、train=3、flight=2，酒店和交通任务均完成。
- `npm run smoke:service-fusion`：只证明在脚本直接传入 criteria 和四域 selections 时，组合 Provider 与 TravelService 可以完成候选、提交和路线；不能称为自然语言用户黄金路径。
- 先前浏览器验收包含手工点击方案区四域并一次性确认，不覆盖“用户在聊天中只确认住宿”的路径；本次 Safari Computer Use 反证证明 Parent Agent 仍会错误声称提交成功，并会污染未受影响候选。
- `npm run check`：最终严格类型检查、131 项测试、Web 构建和微信/支付宝小程序合同检查全部通过。它只作为回归证据，不替代上述真实 Provider 和浏览器证据。

## 仍未验证与残余风险

- 自然语言局部确认的原阻塞已按下述最终验收关闭；其通过不代表完整生产授权、实时设施或所有自然语言歧义都已关闭。

- 飞猪和途牛当前证据是账号下的只读查询，不等于生产商业授权、交易权限或全量库存。没有自动购买、自动退改或统一收单。
- 某次库存快照中的航班到达时间与用户确认的 14:00 不同。系统已避免库存覆盖接驳事实，但“找到与 14:00 接近的更多航班”仍受当前最低价接口覆盖范围限制；具体班次与价格不作为持续事实。
- 高德入口、室内图、路线 `walk_type` 和设施记录不是实时运行状态；本次路线没有取得足够的电梯、扶梯、楼梯、坡道和连续无障碍证据，仍需现场或授权实时来源确认。
- 地图与 OTA 能证明餐厅实体、位置、营业参考和价格，但不能证明“小众、当地人才知道或没有推广偏差”。小红书/抖音隔离 Worker、大众点评/美团合作接口和真实到访反馈规模仍未接通。
- 外宾住宿资格、真实 OAuth、实时公交到站、iOS/Android 真机和微信/支付宝真机仍是独立上线门，不能由本地 Web 黄金路径替代。

## Computer Use 反证修复后的最终验收

### 实际修复

- Brief 白名单真实保存 `arrivalAirport`、`arrivalTerminal`、`arrivalTime`、`arrivalConfirmed` 与 `intercityBooked`，不再出现 Agent 传参但 Runtime 丢字段。
- Brief 局部变化只移除受影响 domain：到达变化影响 transport，住宿偏好影响 stay/food；未受影响候选会保留并重基，不再整份清空后扩大成四域重查。
- 高置信自然语言确认前置到 Parent Agent 控制层：已购票并给出机场/时间时直接提交 user-confirmed arrival；点名一个现有候选时直接做 partial selection commit。它们仍经过 revision、write contract、Proposal 与 TravelService，但不再依赖模型是否选择正确工具。
- 支持只确认 stay。提交只写入点名酒店，residual proposal 继续保存未确认的玩/吃；选择候选不触发购买。
- user-confirmed arrival 与库存航班分离。确认已购票后，库存 transport 不再重新进入待确认 proposal，也不会成为生成接驳的门槛。
- “浦东/浦东机场”在确定性边界规范为“上海浦东国际机场”，避免地理编码误落到市区浦东点。
- 酒店名不会进入 transport criteria；停车场、停车点和停车位不能作为顶层 transport 候选。选择酒店后的坐标解析只针对所选住宿地址/实体。
- 路线推荐新增 `recommendationAudit`：保存步行和换乘阈值来源、各方式实际值、触发项与 accessibility evidence。Mobility 写入后会安全重基未受影响 pending proposal。
- 确认轮不再开放普通 save/research 工具；常见高置信确认完全走确定性控制。聊天能说“已确认”只因为真实 commit 成功。
- AMap 多个具名子查询逐项容错；一个子查询失败不会清空整个 domain。多个具名要求在截断前各保留代表项，外滩变体不再挤掉历史博物馆。
- 航班、价格与 Offer 的 UI 固定显示本次 `checkedAt` 查询语义；Provider 融合 smoke 输出 `userPathVerified=false`，不再冒充用户黄金路径。

### 最终 Safari 与 TripState 证据

最终演示使用 Safari、真实 HTTP、DeepSeek Parent Agent、高德与当前 Provider 配置；数据保存在 `/private/tmp/travel-agent-real-user-demo-20260826`。对应状态为 `trip_9c5cbb42`：

- selected：`user_confirmed_arrival`“上海浦东国际机场 T2”与“全季酒店（上海人民广场南京路步行街店）”；
- open decisions：仅 `play`、`food`；
- residual proposal：3 个本帮菜候选，以及“上海市历史博物馆、外滩、外滩-观景平台”；没有 stay 或 transport；
- trip revision=14，residual proposal baseRevision=14，后续玩/吃仍可提交；
- Mobility=`completed`，一段路线从“上海浦东国际机场 T2”到已选全季酒店；
- 本次于 `2026-08-26T14:03:11.694Z` 核验：公交地铁 142 分钟、步行 1148 米、2 次换乘、约 ¥26；打车 52 分钟、步行 0 米、0 次换乘、约 ¥152；
- 父亲显式步行目标 600 米；未显式填写换乘上限，reduced-mobility 默认比较目标为 1 次。因此 taxi 的直接触发项是 `1148>600` 与 `2>1`；
- 路线返回 `hasEscalator=true`、`hasStairs=false`、`stepFreeContinuity=not_verified`。未知电梯/连续无台阶状态单独显示，`directTrigger=false`，没有冒充已发现楼梯。

Safari 用户可见状态与文件一致：聊天写明“已只确认住宿，游玩、餐饮仍未确认”；页面显示住/行已选、玩/吃各 3 个候选；地图显示机场到酒店路线；“为什么建议打车”问答与 UI 的交通方式比较使用同一组指标。

第一次全新请求曾遇到一次来源子查询失败，页面形成部分候选；用户说“只补玩并保留其他候选”后，历史博物馆与外滩成功补回，既有吃住行未被替换。这验证了失败恢复与局部替换，但也说明真实来源仍可能短暂波动，产品不能承诺每轮一次命中。

### 最终验证

- `npm run diagnose:amap`：有效 POI v5/v3、地理编码与天气请求均为 `status=1 / infocode=10000`；唯一 `20001` 是脚本故意发送的缺参控制样本；没有 `10044`、鉴权或 QPS 错误。
- `npm run smoke:amap`：`passed_live_smoke`；静态地图、天气与 Mobility 均通过。
- `npm run check`：类型检查、131 项测试、Web 构建、微信与支付宝小程序合同检查通过。
- 新增真实 HTTP 等价测试覆盖：新会话、候选、已购票、stay-only commit、文案/TripState 一致、residual domains、arrival→stay route，以及带具体指标的路线问答。

## 2026-08-28 Agent Runtime P0/P1 补充验收

本节不改写上面的 8 月 26 日历史事实，只记录后续动态并行与状态一致性加固：

- 每轮语义分析现在返回 required/started/completed/failed/timed-out lanes 和统一 `complete|partial|failed` coverage。Agent、API 与工作台读取同一对象；一个 required lane 也必须真实运行。
- Run/lane 绑定 `runId`、trip、base revision、criteria fingerprint、attempt 和起止时间。新条件会 supersede 旧 run；Join 前重读当前状态，迟到结果 `stale_discarded`。
- Lane completion 以 `(runId,lane,attempt)` 幂等；Join compare-and-set 一次，Proposal ID 稳定关联 runId。失败、超时、stale 与 fallback 失败都不提交 TripState。
- 默认 Child semaphore=2、单 Child 45 秒、总分析 90 秒。实现改为滚动释放槽：成功 lane 完成后立即启动排队 lane；若首批 lane 都失败，第三条不继续启动。
- Provider 请求仍在 Composite 层一次并行；Child 只读归一化 Evidence，不再请求高德/飞猪/途牛。每次四域研究调用当前三个配置 Provider 各一次，调用数不会随 Child 数增长。
- OTA/领域状态已分开为 `completed_nonempty`、`empty_verified`、`provider_unavailable`、`rate_limited`、`auth_required` 与 `partial`。高德车站、机场、停车场和出入口不再补位航班或铁路库存。
- Kimi 只有专用双 lane 结构化 Child smoke 通过后才进入 fallback。测试过程中 ledger 曾因 partial/failed 撤销旧通过；调整为 Provider 专属 JSON 请求选项后，最新 Kimi 2/2 与 DeepSeek 3/3 独立 live smoke 完整通过。
- 锁定 Pi 0.84.1 的临时 consumer 真实运行一个 `plan-trip` 只读 Child，未写 TripState；目标全局 Pi 0.74.0 被兼容门阻断，不能声称通用宿主可用。
- 生产执行当前仅支持 `single_process`。健康检查公开不支持跨实例 background/resume/steer；配置多 worker 且无 coordinator 时关闭语义 fan-out，不预建 Redis/Kafka。

真实浏览器采用虚构的 2026-09-10 至 12 日广州到上海三人行程。四域各 3 个候选、地图、动态航班价和目标片区住宿均可见；最新 run 中 `inventory_budget` 与 `operability_schedule` 完成，`local_discovery` 在 45 秒超时。工作台和聊天均只称为部分结果，并点名“当地体验与来源尚未完成”；`joinCount=1`、Trip revision=3、selected nodes=0，浏览器 console error/warn=0。该结果关闭了“部分结果冒充完整”和“旧结果覆盖新要求”的 P0 风险，但 **live 自然路径稳定 3/3 lane 尚未关闭**，不能用独立模型 smoke 替代。

最终 `npm run check` 通过 153 项测试、严格 TypeScript 检查、Web production build 与微信/支付宝小程序合同检查。调试结束后 127.0.0.1:8797 与 5173 服务均已关闭。
