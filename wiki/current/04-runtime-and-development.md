# Pi Runtime 迁移与开发计划

## 已迁移的控制面

本项目以参考项目 `DESONGs/assignment-agent` 的固定提交 `0602f134f65052f7617d417a221f7d31d29746ef` 为模式来源，保持 Pi `0.84.1`、`pi-subagents@0.46.0`、`@quintinshaw/pi-dynamic-workflows@3.5.1`。迁移的通用概念是 Planner、Capability Registry、Policy、Observability、模型路由、有界委派与 Dynamic Workflow 装载；会议领域代码没有复制。

`travel-agent-pi-package/` 的旅行专属 Runtime 已实现，并采用核心 TypeScript、外围 JavaScript 的明确边界：

- `src/contracts/*.ts`：TypeBox Schema 与 `Static` 类型的单一合同源，覆盖 Trip State、Traveler、Decision/Evidence、Patch、Context、QA、Mobility、Transit 和 ProviderResult；构建时派生 JSON Schema。
- `src/core/`：严格 TypeScript 的 TripStore、TravelService/Persistence 接口，以及经过 Runtime Schema 校验的 Trip Runtime 公共入口。
- `src/runtime/trip-runtime-implementation.ts`：Trip State、Decision Graph、dirty set、Context Pack、Patch validate/commit 与旅行 QA 的 TypeScript 实现；动态 Provider/持久化 JSON 只在这一内部归一化边界进入，公共返回值继续经过 TypeBox 校验。
- `src/mcp/`、`src/providers/`、`src/pi/`：MCP 权限合同、ProviderResult discriminated union 和不含 `Type.Any` 的核心 Pi tools。
- `extensions/`：Pi 产品工具默认只加载 Planner、Registry、Policy、Observability、模型路由、TravelService 业务接口和社交 Worker 合同。完整 TripState、低层 commit 与重复 QA Schema 不直接暴露给模型；父 Agent 通过持久化业务接口接受方案。
- `plugins/travel-agent/skills/`：22 个只返回候选、证据、天气评估或提案的语义 Skills，Pi package 直接装载唯一目录。
- `runtime/`：Capability Registry、模型路由与 JSON Schema 合同。

未迁移：ASR、会议 intelligence、标题/segment、飞书评论与文档、Rokid、Office lifecycle 和旧 agent-team fallback。

## 实施状态

1. **已完成：旅行内核。** 可创建共享状态、关联四域、构建 Context Pack、stage/accept/reject Patch、处理锁定和新鲜度，并局部重排。
2. **已完成：持久化、Chat-first 入口与 Pi 对话控制链。** 生产使用 PostgreSQL 的 JSONB snapshot 与乐观 storage version；本地开发可显式采用单目录原子 JSON repository。`travel-conversation-v1` 持久化对话归属与可见短消息，Pi `Agent` 只可调用受限的 Parent Agent 工具；`TravelService` 仍是唯一旅行状态入口。
3. **已实现：对话到待确认方案的控制链。** Parent Agent 用完整对话理解短句，目的地明确即保存，后续信息增量合并；用户要方案时调用一次四域联动研究。缺少出发地不阻塞目的地内研究。外部结果被归一为候选与一份待确认提案，网页和小程序支持逐域选择，接受后才写入已确认旅行。
4. **已实现、待真实账号验收：高德地点 Adapter。** 固定官方端点检索四域，返回核验时间、POI、照片、地址、评分/参考消费、位置、服务端静态地图与高德跳转；支持可选数字签名，不接受任意 URL，不把 Key 或私钥放入前端、状态或输出。真实地点链是否可用由配置后的 live smoke 与聊天黄金路径共同证明。
5. **已实现：天气由 Runtime Environment Gate 强制贯穿旅行控制链。** 高德天气和 Open-Meteo 开发回退均归一为 `trip-weather-v1`；目的地或日期变化会先使旧天气失效，研究入口确定性查询并把预报放入 Environment Plane、Context Pack、四域候选评估、方案画布和 QA。天气失败时提案明确降为暂定；预报变化会使旧提案失效并局部重排；超出预报窗口时不编造未来天气。`assess-trip-weather` 只做语义影响评估，不拥有抓取或新鲜度。
6. **已实现、待高德真实账号恢复：城市移动由 Runtime Mobility Gate 强制贯穿确认后链路。** 高德路径规划 2.0 的步行、公交/地铁和驾车结果归一为 `trip-mobility-v1`，进入 Environment Plane、Context Pack、QA、静态路线图和前端路线卡；步行 `walk_type` 继续贯通为直梯、扶梯、阶梯和斜坡参考，并参与逐人避开台阶约束。地点或范围变化使旧路线失效。公交计划结果固定标记为非实时到站，驾车结果只作为打车时间/费用估算，路线设施也固定标记为非实时。扩展后的 `smoke:amap` 必须同时通过路线和折线地图才允许启用。
7. **已验证：DeepSeek 基础认证与无地点资料时的诚实失败。** 父 Agent 的 Prompt、工具或模型版本改变后，必须重新运行多轮自然语言轨迹，并在真实浏览器桌面与移动视口复核。自动化测试只证明合同，不能替代这项验收。
8. **已实现：逐人旅行关怀进入共享状态与 QA。** 对话工具把具体同行人的步行、换乘、台阶、休息、时间、设施、感官与饮食要求绑定到稳定 ID；路线 Adapter 只读取具名 Traveler 约束，不再从整团描述猜测归属。明确阶梯与避开台阶要求冲突时 QA 拒绝，直梯或斜坡存在则作为非实时部分证据；变化时只使旧城市路线失效。方案画布回显预算、节奏与逐人要求，设施或连续无障碍证据缺失时保持待核验。
9. **已完成：跨平台源码运行边界。** API、MCP、测试和 Pi package 直接加载 TypeScript 源码，不依赖未提交的 `dist/`；文件名、ENV 权限检查和 npm scripts 不依赖单一平台的路径或 Shell 语法。Windows、macOS 和 Linux 使用同一组 `npm ci --ignore-scripts`、`npm run check` 与启动命令。npm package 保持 `private`，发布工作延期到公共 API 与完整分发内容稳定后。
10. **已实现：V2 匿名旅行与准备状态。** Guest 会话复用现有 Conversation、TripState、TripStore 和成员权限，登录后把临时旅行与对话转移到账号，旧 Guest 失去访问权。Readiness 写入 TripState 的独立版本，不增加 Trip revision，也不使无关待确认提案失效；父 Agent 只在用户明确确认或求助时更新，不收集证件、支付或账号内容。
11. **已实现：V2 第一结果与 Today 读模型。** `get_trip_plan_view` 从同一 TripState 派生准备清单、当前/下一步、移动段、新鲜度和待处理项；没有可靠时间时返回 `needs_schedule`，不冒充按天日程。Web 已将地图路线骨架前置，详细候选按需展开；移动端 Map 入口承担 Today 和变化恢复。
12. **待外部授权或后续实现：更深 Provider 与执行事件。** 社交 Worker、实时公交到站、站内设施、生产天气授权、生产登录、更深库存、Guest 过期物理清理，以及“已完成/跳过/现场确认”的执行事件持久化必须完成真实实现和 smoke 后才能启用。

## 类型迁移边界

本轮不通过机械改名提高语言占比。严格 TypeScript 覆盖合同、Trip Runtime 实现与公共校验边界、文件 Persistence、Mobility/Transit、MCP 权限、TravelService Port 和核心 Pi 注册；HTTP、Auth、TravelService 实现、具体 Provider、对话 Agent 与 Web 继续使用 JavaScript。它们直接导入源码合同并由 `tsx` 加载，不通过 npm 包名绕到 `dist/`。读取旧 `trip-control-state-v1` 时只补齐确实缺失的新增字段；已有字段类型错误会拒绝加载，不能静默替换为数组或空对象。

## 验收情景

- 国内情侣五日旅行：四域完整并进行预算取舍。
- 入境游客城市旅行：英文交互、外宾住宿、证件、手机、支付和导航限制可见。
- 亲子/长辈小团体：个人偏好独立保存，能够折中、轮换或分组。
- 人文关怀：父亲单段步行不超过 800 米、少换乘的要求绑定到本人；预算与节奏在方案摘要可见；无障碍设施没有来源时明确待核验。
- 长尾美食旅行：社交与地图结果完成实体归一、去重和营业核验。
- 低剧透自然旅行：可先不看图片选择，再展开证据。
- 航延、下雨、闭店、换住宿：只重排影响邻域。
- 城市移动：住宿、活动和餐饮地点确认后自动生成步行/公交地铁/打车比较；地点变化使旧路线失效，超出同行人步行或换乘限制时不能通过 QA。
- 路线语义：公交计划路线不能显示为实时到站，驾车估算不能显示为即时叫车供给；`10044` 不按 QPS 重试。
- 高度雷同/相互抹黑的来源：不能形成虚假多数。
- 覆盖广州/上海、大理或西双版纳、北京和一个未专项调优目的地。

## V2 后续开发顺序

1. 先解除高德账号门控并完成餐饮、POI、照片、入口出口、步行/公交/驾车路线和折线静态地图的真实 smoke；在此之前第一结果必须保持 partial，Today 不能称为可导航路线。
2. 建立地点英文别名、地址转写和 Provider 文本双语归一；核心英文界面已经可操作，但原始中文地点与长描述仍不能作为“完整英文产品”验收证据。
3. 实现受限的分享链接读取器；只接受允许的 `http/https`、域名策略、响应上限和纯内容提取，不把任意页面脚本或指令交给 Agent。
4. 把已确认的地点组合升级为有时间窗的 `DayPlanProposal`，再增加最小执行事件；在此之前 `trip-mobility-v1.coverage.unscheduled=true` 和 Today `needs_schedule` 必须保持可见。
5. 候选阶段使用坐标与有界距离矩阵过滤明显折返，只对待确认组合调用详细路线，避免候选数增长导致路线调用爆炸。
6. 完成 Google/微信/支付宝/Apple 真实授权、Guest 物理清理与多端设备 QA；小程序和原生端继续复用同一服务端状态与 Mobility Observation，不复制提交逻辑。
