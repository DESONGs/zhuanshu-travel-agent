# 分层地图体验与跨端渲染迭代

> 状态：2026-08-31 Changeset A–C 已进入代码；Web/Leaflet 降级、桌面与移动浏览器、以及微信/支付宝页面逻辑已完成本地验收。高德 JS API 真实浏览器加载、Capacitor 设备和小程序开发工具/真机仍需对应 Key、AppID 与设备环境后单独验收。
>
> 本文约束本轮地图前端迭代。它不修改 Agent、TripState、Provider、Mobility、Proposal 或用户确认边界。

## 1. 目标

把当前“地点和蓝色折线”升级为旅行者能看懂、能比较、能试排、能执行的路线体验，同时保持现有全平台交付方向：

- 桌面 Web / PWA / Mac / Windows 与大屏折叠屏提供完整空间规划工作台；
- iOS / Android Capacitor 复用 Web Core，以移动路线 sheet 承载同一核心能力；
- 微信、支付宝小程序采用轻量原生地图，只保留行中最需要的 Today、下一段路线、地点和快速调整；
- 所有端共读现有 `TripState.environment.mobility`、Itinerary 和 Proposal，不复制规划逻辑或增加第二份路线状态。

本轮价值时刻是：用户看见任一段路线时，立即知道“从哪里到哪里、怎么走、为什么这样推荐、切换方式会影响什么”。

## 2. 第一性原理

地图不是路线事实的所有者，也不是路线说明书。旅行路线由三层共同完成：

1. `MobilityObservation` 提供高德实际返回的步行、公交/地铁、打车路线、时间、距离、费用、换乘和设施证据；
2. `Itinerary` 提供 Day、站序、时间窗与地点角色；
3. 地图与路线卡把上述事实投影为用户可读的空间关系、逐段方式和影响差异。

因此：

- 更换地图引擎不能代替补齐路线语义；
- 桌面和小程序可以使用不同渲染器，但不能产生不同路线事实；
- 全平台能力一致指状态、站序、方式、时间、约束和确认结果一致，不要求六端版面完全相同；
- 小程序不复制桌面工作台，也不为了视觉一致承受 WebGL、复杂图层和多方案同屏成本。

## 3. 当前实现与缺口

### 3.1 已有能力

- Web 使用 Leaflet，支持桌面滚轮、移动触摸、双击、拖动、Marker、Polyline、当前/试排路线与自动视野；
- 高德 Provider 已返回步行、驾车/打车、公交/地铁 alternatives，以及时长、步行、换乘、费用、steps、navigation URL 和 polyline；
- `MobilityPlanningCard` 已能显示推荐方式、三方式比较、推荐理由和上车/换乘/步行步骤；
- Capacitor 继续承载同一 React/Vite bundle；
- 微信、支付宝小程序已有原生 `<map>`、地点 Marker 和路线摘要卡。

### 3.2 当前问题

1. Web 地图把每个 leg 压缩为 `points + recommended/comparison + mode`，没有起终点、legId、Day、路段编号、方式标签或选中状态；多段路线因统一蓝线看起来像一条难以解释的长折线。
2. 地图与路线卡没有形成强双向焦点；用户必须在其他区域寻找“这是打车还是公交”的说明。
3. 公交归一化保存 bus polyline，但 railway/地铁段没有同等贯通 geometry，可能形成残缺线路。
4. 小程序 `<map>` 当前只传 markers，没有传 polylines；文字上能看到路线摘要，地图上还不能看到真实路线。
5. 当前 Leaflet + 可配置瓦片在中国境内需要做 GCJ-02 → WGS-84 渲染转换；这增加坐标链复杂度，也无法直接使用高德官方矢量底图、路况和室内图层。

## 4. 已确认的分层产品形态

| 平台 | 地图角色 | 必须具备 | 本轮不要求 |
| --- | --- | --- | --- |
| 桌面 Web / PWA / Mac / Windows / 大屏 | 完整空间规划工作台 | 按天多点路线、逐段方式、三方式比较、当前/试排、影响、地图与时间轴联动 | 原生桌面 SDK、离线导航 |
| iOS / Android Capacitor | 移动查看与调整 | Chat / Trip / Map、Today、路线 sheet、逐段切换、约束阻断、跳转高德 | 原生高德双 SDK、桌面三栏同版 |
| 微信 / 支付宝小程序 | 轻量进入与行中执行 | Today、下一段、当天 markers/polyline、推荐方式、步行/换乘/费用、快速调整 | 全程多日地图、多方案叠加、复杂 Hover/动画、大量候选同屏 |

## 5. 技术决策

### 5.1 路线事实继续由现有后端负责

- 高德 WebService 继续负责 POI、步行、公交、驾车/打车路线与设施证据；
- Parent Agent、Plan–Check–Repair、Checker、Proposal 和 TripState 所有权不变；
- 前端不得调用第二次路径规划并产生与服务端不同的分钟、费用或路线；
- 高德 JS API 只作为桌面/移动 Web 地图渲染器，不成为第二个路线决策源。

### 5.2 增加一个轻量 `RouteMapScene` 投影

新增纯函数 `buildRouteMapScene({ itinerary, mobility, currentMobility, activeDay, activeLegId })`，从现有读模型派生：

```ts
type RouteMapScene = {
  stops: Array<{
    nodeId: string;
    stopId?: string;
    dayIndex?: number;
    index: number;
    title: string;
    role?: string;
    coordinates: { longitude: number; latitude: number; coordinateSystem: string };
  }>;
  legs: Array<{
    legId: string;
    dayIndex?: number;
    originNodeId: string;
    destinationNodeId: string;
    mode: "walk" | "transit" | "taxi";
    routeRole: "current" | "trial";
    selected: boolean;
    polyline: Array<{ longitude: number; latitude: number; coordinateSystem: string }>;
    minutes: number;
    walkingMeters?: number;
    transfers?: number;
    estimatedFareCny?: number;
  }>;
};
```

边界：

- 这是临时 UI 投影，不持久化、不进入 Prompt、不新增公共 HTTP/MCP 合同；
- 只转换当前已核验事实，不计算路线或用户适配度；
- Web、Capacitor 和小程序用同一投影规则，平台 Adapter 只负责格式转换；
- 若坐标或 polyline 缺失，显式标记该 leg 不可绘制，不以直线补齐。

### 5.3 桌面主渲染器升级为高德 JS API 2.0

中国境内桌面 Web/PWA/Capacitor 以高德 JS API 2.0 为目标主渲染器：

- 原生使用 GCJ-02，减少高德路线与底图之间的转换链；
- 支持 Polyline、方向箭头、Marker/LabelMarker、图层显示隐藏、路况与后续室内地图；
- 由 React 管理路线卡、时间轴、候选、影响条和确认动作；高德只管理底图、Marker、Polyline、视野与地图事件；
- JS API 安全密钥必须由服务端代理，不进入前端 bundle、日志或 TripState；
- WebService Key 与 Web JS Key 分开记录和验收。

Leaflet 在迁移期继续作为 fallback：高德 JS API 未配置、加载失败或目标位置不适合当前高德主图时，显示当前合规瓦片或服务端高德静态图。真实 A/B 通过前不删除 Leaflet。

### 5.4 小程序使用原生 `<map>` 轻量渲染

微信与支付宝分别把 `RouteMapScene` 转为平台 `markers` 与 `polyline`：

- 默认只画当前日、当前推荐方式；
- 点击某一 leg 时只高亮该段；
- 不在地图同时叠加三种方式，三方式通过下面的路线卡切换；
- 切换方式继续请求现有服务端 Mobility Preview，返回后替换当前 leg polyline；
- 地图下固定显示“下一段怎么走”：方式、分钟、步行、换乘、费用和推荐原因；
- 点击“在高德继续导航”才跳转外部导航；小程序本身不冒充实时导航。

### 5.5 暂不采用

- 不在本轮迁移 MapLibre GL JS：其数据驱动图层能力优秀，但需要额外矢量瓦片、中文地图、GCJ-02、许可和小程序适配，不能直接解决当前路线语义缺口；
- 不引入 MapLibre Native、高德 iOS/Android 双 SDK、Flutter、Taro、Tauri 或第二套地图状态；
- 不让桌面地图直接调用路线 Provider；
- 不用第三方非官方高德瓦片或未经授权的瓦片代理。

## 6. 桌面交互规格

### 6.1 默认按天

- 地图默认显示当前 Day，而不是把多日线路压在一张图上；
- 提供 `第 1 天 / 第 2 天 / 全程` 切换；
- “全程”只用于空间概览，路线决策仍按 Day 和 leg 查看。

### 6.2 逐段可读

每段至少显示：

```text
1  浦东 T2 → 人民广场酒店
推荐：打车 · 52 分钟 · 约 ¥151 · 步行 0m
```

- 点击地图路线，打开并高亮对应路线卡；
- 点击路线卡，地图只突出该 leg，其余路线降低透明度；
- 地图上的 mode chip 只显示“打车 / 公交地铁 / 步行 + 分钟”，详细步骤留在路线 sheet；
- 当前方案与试排方案用 routeRole 区分，交通方式不能只靠颜色区分；
- 键盘焦点、路线选中和屏幕阅读器标签必须可对应到 leg。

### 6.3 三方式比较与影响

每个 leg 可比较实际返回的 alternatives：

- 公交/地铁：总时长、步行、换乘、费用、线路名、上下车站、步行衔接；
- 打车：时长、估价、距离；
- 步行：时长、距离、台阶/坡道等非实时证据；
- 切换后服务端重算后续到达时间、总费用、总步行、换乘和硬约束；
- 未通过 Checker 时显示具体超限值，并禁止确认；
- UI 不把设施未知写成已发现冲突，也不把查询时估算写成实时到站或最终车费。

## 7. 实施 Changesets

### Changeset A：路线正确性与语义投影

1. 补齐 railway/地铁 polyline；确认公交、打车、步行的 geometry 与 steps 一致。
2. 新增 `buildRouteMapScene()` 和聚焦测试。
3. Leaflet 暂继续渲染，但按 Day/leg/mode/routeRole 分层，并完成地图—路线卡双向焦点。
4. 原始症状验收：用户不看其他页面也能说出每条蓝线对应的起终点、方式和时间。

### Changeset B：桌面高德 JS 渲染器

1. 以薄 Adapter 实现 AMap Marker、Polyline、视野、点击和销毁；不复制业务组件。
2. 配置独立 Web JS Key、服务端 security proxy、域名白名单和受控 feature flag。
3. 复用现有 React 路线卡、时间轴和模式切换。
4. Leaflet fallback 与静态地图降级保持可用。

### Changeset C：轻量小程序地图

1. 微信、支付宝 View Model 增加当天 markers、polylines、activeLeg 和推荐方式摘要。
2. 原生 `<map>` 绘制当前 Day 和 active leg；不复制桌面工作台。
3. 增加“下一段怎么走”和服务端方式切换；失败时保留上一条路线并禁止确认。
4. 小程序缺少真机凭据时只完成 fixture/开发工具合同，不声明真机通过。

### Changeset D：跨端收尾

1. 桌面 1440×900、1000px、大屏折叠宽度；
2. 移动 Web/Capacitor 393×852 与横屏；
3. 微信、支付宝开发工具与真机门分开；
4. 中英 mode、路线、未知/非实时说明；
5. 更新 `06-cross-platform-delivery.md`、`07-route-experience.md`、`10-v2-implementation-decisions.md` 与配置指南。

## 8. 验收场景

使用同一个上海家庭旅行用例：广州出发，14:00 抵达浦东 T2，与父母三人，父亲单段步行不超过 600 米、尽量避开楼梯，住人民广场/南京东路，安排博物馆、外滩与本帮菜。

### 桌面黄金路径

1. `第 1 天` 显示“浦东 T2 → 酒店 → 晚餐 → 酒店”，第 2 天单独显示博物馆与外滩；
2. 每条地图路线可定位到唯一 leg，显示起终点、推荐方式、分钟；
3. 机场→酒店可比较公交/地铁、打车、步行；公交显示线路/站点/换乘步骤；
4. 公交步行超过 600 米时显示实际值与阈值，不能仅说“更适合打车”；
5. 切换方式后地图、时间轴、费用与后续站点时间共同变化；
6. 当前与试排可辨认，未确认时 Trip revision 与 selected nodes 不变；
7. 采用后保存同一已核验 route modes，不重复调用路线 Provider；
8. 高德 JS 失败时 Leaflet/静态图诚实降级，路线卡仍可读。

### 小程序黄金路径

1. 三次点击内进入 Today/Map；
2. 只显示当天地点与路线，不铺开多日全程；
3. 地图下直接显示下一段推荐方式、分钟、步行、换乘和费用；
4. 切换“公交/地铁”或“打车”后，服务端核验结果和 polyline 同步更新；
5. 无 polyline、未定位、超时或 Checker 阻断时不画直线、不开放确认；
6. 微信与支付宝共享同一结果语义，但各自使用原生地图属性。

## 9. 验证门与完成证据

- 聚焦测试：railway polyline、RouteMapScene、Day/leg 过滤、current/trial、坐标系统、缺失 geometry；
- Web：真实 AMap JS 加载、地图点击联动、三方式切换、失败 fallback、console error/warn；
- Capacitor：iOS/Android WebView 地图加载、触摸、safe area 与外部导航回跳；
- Miniapp：微信/支付宝 View Model、marker/polyline、active leg、方式切换与 fail closed；
- Provider fixture、AMap live、应用组合、桌面浏览器、Capacitor 设备、小程序开发工具/真机分别记录，不互相代替；
- 动态时间、费用和路线必须带 `checkedAt` 或查询时估算说明；
- 不以地图可见、构建通过或组件存在作为路线体验完成证据。

## 10. 账号与人工配置

桌面高德 JS API 2.0 需要人工在高德开放平台完成：

- Web 平台 JS API Key；
- `securityJsCode`；
- 生产域名白名单与技术服务许可核对；
- 服务端 security proxy 配置；
- Web/PWA/Capacitor 来源域名或本地 scheme 的实际加载验证。

官方配置入口：

- [高德地图 JS API 2.0：准备与创建 Web 端 Key](https://lbs.amap.com/api/javascript-api-v2/prerequisites)
- [高德地图 JS API 2.0：安全密钥与服务端代理](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)

配置未完成时状态必须为 `amap_js_renderer_not_configured` 或等价明确状态，继续使用 Leaflet/静态地图，不伪造已接通。

## 11. 回滚方式

- `RouteMapScene` 是纯投影，可保留并让 Leaflet继续消费；
- AMap JS renderer 可由 feature flag 关闭，恢复 Leaflet；
- 小程序 polyline 可降级为 markers + 路线文字卡，但不得声称地图路线可见；
- Provider、Mobility、Itinerary、Proposal、TripState 与确认逻辑不随渲染器回滚。

## 12. 完成定义

只有同一真实旅行在桌面与小程序分别满足自身黄金路径，才能称为本轮完成：桌面完成深度规划与比较，小程序完成轻量 Today 与下一段执行；两端读取同一 Trip revision、同一站序、同一 route mode 和同一可执行性结论。

## 13. 2026-08-31 实施与验收状态

### 13.1 已进入代码的最小完整链路

- 高德路线归一化保留步行、驾车、公交、铁路及其 step 级 polyline；缺少真实 geometry 时明确标记缺口，不连接起终点伪造直线。
- 新增纯投影 `RouteMapScene`，只从现有 Itinerary、Mobility 与节点派生 Day、leg、mode、routeRole、marker 和 geometry；它不是新的状态源，也不写 TripState。
- Web 的 Leaflet 与高德 JS 薄渲染器消费同一 Scene。地图路线、mode chip 和路线卡可双向聚焦；按 Day 查看，多次返回同一酒店时合并为一个带多序号的 marker。
- 高德 JS 采用独立 Web Key、固定服务端 security proxy 和 feature flag；代理不接受任意上游、Cookie、Authorization 或客户端传入的 Key/security code。
- 微信、支付宝原生地图只投影当前 Day 的 marker/polyline，并提供下一段方式、分钟、步行、换乘、费用和服务端方式切换；核验失败或缺少 geometry 时保留上一条路线并禁止确认。

### 13.2 当前真实证据

- 聚焦测试覆盖 railway/segment geometry、RouteMapScene、重复住宿、方式切换、缺失 geometry、代理边界及两端小程序 fail-closed 行为。
- 同一上海家庭旅行浏览器会话生成六站试排：浦东机场 → 住宿 → 次日从住宿出发 → 博物馆 → 本帮菜 → 返回住宿。Day 2 投影为 3 个物理 marker、3 条 leg；未取得折线的 leg 明确显示“缺少真实折线”。
- 地图 route chip 与路线卡双向选中有效；逐段从打车切换为公交后，服务端返回新的分钟、步行、换乘和费用，Checker 阻断时“采用”按钮保持禁用，切回可行方式后恢复。
- 浏览器已核验 1440px、1000px、393×852 与 852×393；桌面滚轮和可见 `+ / −` 控件可缩放，移动布局无横向溢出，稳定构建的新标签页无 console error/warn。触摸缩放已在 Leaflet/高德配置中启用，但尚未以真实 iOS/Android 触摸设备替代浏览器证据。
- 全部试排期间 `trip_e3a55c73` 保持 revision 1、0 个 selected node、0 条持久化 mobility leg；说明地图切换和方式比较没有绕过用户确认边界。

### 13.3 尚未通过的外部环境门

- 当前已配置独立 `AMAP_JS_API_KEY` 与 `AMAP_JS_SECURITY_CODE`；localhost 的高德底图、Marker、可绘制路线、方式 chip 和交互已真实运行，但安全代理实请求仍返回 `10009 USERKEY_PLAT_NOMATCH`。因此只能称为“Web JS 基础渲染和部分路线交互通过”，不能称为完整高德 JS live smoke，状态仍为 `not_run`。
- 微信/支付宝页面代码与 View Model 已在实际页面代码 VM 中运行，但缺少 AppID、开发工具登录和真机，所以不能声称小程序开发工具或真机通过。
- Capacitor 本轮未做 iOS/Android 设备加载、safe area、触摸和外部导航回跳验收。
- 动态路线分钟、估价与库存只代表当次查询快照；设施存在不等于实时运行，仍需现场确认。

因此，本轮可称为“分层地图核心链路与 Web 降级路径已实现”，不能称为“所有地图 Provider 与六端设备均已上线验证”。

### 13.4 E0 baseline 已形成

- 地图与跨端核心链路提交为 `afa83a6`（`Implement tiered route map experience`）。
- 本期 Evidence Companion 文档入口与 baseline 记录提交为 `2dd9a73`（`Document Evidence Companion iteration baseline`）。
- `guest_trip_expired` 定时炸弹通过向 HTTP 成员校验注入同一 `clock` 修复，没有放宽 Guest 过期规则；baseline 当天完整 `npm run check` 通过。
- E1 在该 baseline 之后独立落地，不回写 `RouteMapScene`、Mobility、Proposal 或 TripState 的事实所有权。

### 13.5 Electron 自定义 origin 与地图降级（2026-09-01）

- Electron Trusted App 使用 `travelapp://app`，互动地图仍消费同一 `RouteMapScene` 和同一 `/_AMapService` 安全代理；静态地图改为带桌面 Bearer 的受控 fetch，不把 Token 放进图片 URL。
- 桌面滚轮、触摸缩放和 `+ / −` 控件继续由同一 Web 地图组件提供。高德 JS 未配置时文案明确区分“路线/地点已核验”与“互动底图授权待配置”，不把 Leaflet 降级误写成路线数据失败。
- 新增 `npm run diagnose:amap-js`，只输出 Key/安全码/Origin/smoke 是否具备，不打印值。当前配置存在，但 Web 的安全代理校验尚未通过，Electron smoke 因此继续报告 `blocked_missing_amap_js_credentials_or_live_smoke`；这只证明自定义协议和安全壳，没有证明高德 JS 对 `travelapp://app` 可用。
- 同日服务端 WebService 先出现过 POI/静态图间歇超时；修正 smoke 的宽泛餐饮条件为真实“人民广场 + 本帮菜”等定向条件后，四域各 6 条、60 张照片、静态图、天气和 Mobility 全部真实通过，状态恢复为 `passed_live_smoke`。这不覆盖独立的 JS Key/securityJsCode 门。

### 13.6 高德 JS localhost 真实回归（2026-09-01）

- 上海家庭旅行自然路径保存固定浦东 T2 抵达后，试排住宿、餐饮和博物馆形成 7 站、6 段移动；高德 JS 显示 4 个物理地点、两条当前有真实 geometry 的路线 chip，其余缺失 geometry 继续显式标注，不伪造折线。
- Marker 点击能回写 active 状态；Day 1 / 全程分别显示 1 / 4 个物理地点；可见 `+ / −` 和地图拖动真实改变视图。自动化控制面未能可靠证明滚轮事件，因此仍以代码启用和后续人工复核为准，不把它写成新通过证据。
- 机场段从打车切换公交后，路线从 83 分钟、0 米步行、约 ¥148 变为 98 分钟、1360 米步行、约 ¥8，并因超过父亲 600 米目标禁用采用；切回打车后地图 chip 与影响看板同步恢复。
- 实测发现并修复一次 SDK/React 容器所有权冲突：高德销毁地图后 React 删除已移动节点导致白屏。现在 AMap/Leaflet 只操作 React 稳定宿主中的独立 imperative mount；新标签重复同一路径 console error/warn 为 0。
- `/_AMapService` 请求不接受客户端 key/jscode，服务端会覆盖并只转发固定高德域；但当前上游返回 `10009 USERKEY_PLAT_NOMATCH`，所以不更新 `TRAVEL_AGENT_AMAP_JS_SMOKE_STATUS`。官方解释是请求 Key 与绑定平台不符，需核对 Key 平台及配对 securityJsCode。
