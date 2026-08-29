import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { analysisCoverageText, budgetCalculationText, domainAvailabilityText, explicitSelectionIntent, TravelConversationAgent, userFacingAgentText } from "../src/agent/travel-conversation-agent.mjs";
import { TravelService } from "../src/api/travel-service.mjs";
import { FileConversationRepository } from "../src/persistence/conversation-repository.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

test("user-facing agent copy translates internal planning enums before rendering", () => {
  const copy = userFacingAgentText("Provider 把 weatherFit 标为 caution，等待 TripPatch revision。");
  assert.doesNotMatch(copy, /Provider|weatherFit|caution|TripPatch|revision/i);
  assert.match(copy, /资料来源|受天气影响，需要备选|方案变更|方案版本/);
});

test("negative confirmation language never becomes a selection command", () => {
  assert.equal(explicitSelectionIntent("请比较预算，不要确认任何候选"), false);
  assert.equal(explicitSelectionIntent("暂不确认住宿，只看价格"), false);
  assert.equal(explicitSelectionIntent("我选择并确认全季酒店"), true);
});

test("budget explanation keeps candidate quote quality separate from trip-total estimation", () => {
  const text = budgetCalculationText({
    budget: { totalBudget: 8_000, estimated: 5_000, domains: { stay: { estimated: 2_000, quality: "estimate", basis: ["2 晚 × 2 间房"], unknownCount: 0 }, transport: { estimated: 1_500, quality: "estimate", basis: ["3 人 × 单程票价"], unknownCount: 0 }, food: { estimated: 1_500, quality: "estimate", basis: ["3 人 × 3 天"], unknownCount: 0 }, play: { estimated: 0, quality: "unknown", basis: [], unknownCount: 1 } } },
    candidatePrices: { stay: [{ price: { amount: 500, quality: "firm", checkedAt: "2026-08-29T10:00:00Z" } }], transport: [], food: [{ price: { amount: 80, quality: "reference" } }], play: [] },
  });
  assert.match(text, /本次实价快照/);
  assert.match(text, /参考价/);
  assert.match(text, /整趟数字仍标为估算/);
  assert.match(text, /没有确认、购买或改写/);
});

test("Agent copy names missing analysis coverage and distinguishes empty inventory from unavailable sources", () => {
  const coverage = analysisCoverageText({ coverage: "partial", requiredLanes: ["inventory_budget", "local_discovery", "operability_schedule"], completedLanes: ["local_discovery"] });
  assert.match(coverage, /价格与库存/);
  assert.match(coverage, /路线、日程与同行人适配/);
  assert.match(coverage, /不能当作完整规划/);
  assert.match(coverage, /继续补充分析/);

  const availability = domainAvailabilityText({ transport: { status: "empty_verified" }, stay: { status: "provider_unavailable" }, food: { status: "rate_limited" } });
  assert.match(availability, /不代表市场上没有/);
  assert.match(availability, /资料来源当前不可用/);
  assert.match(availability, /当前限流/);
});

test("fixture: Pi conversation loop creates and reads a travel draft through bounded Parent Agent tools", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-agent-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  tripStore.mode = "file";
  const travelService = new TravelService({ store: tripStore, clock: () => new Date("2026-08-13T12:00:00.000Z") });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", {
      destination: "大理", dates: "国庆五天", origin: "广州", arrivalMode: "飞机", travelerCount: 3, language: "zh-CN",
      travelerProfiles: [
        { displayName: "你", relationship: "本人" },
        { displayName: "父亲", relationship: "父亲", careNeeds: { mobility: { maxContinuousWalkMeters: 800, maxTransfers: 1, avoidStairs: true } } },
        { displayName: "母亲", relationship: "母亲", careNeeds: { schedule: { latestDinnerTime: "19:00" } } },
      ],
    }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("get_trip_control_view", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage("我已建立旅行草案。接下来我会先确认长辈的体力与住宿位置，再联动研究吃、住、行、玩。"),
  ]);
  const agent = new TravelConversationAgent({
    travelService,
    conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }),
    modelRuntime: { models, model: faux.getModel("fixture-parent") },
    clock: () => new Date("2026-08-13T12:00:00.000Z"),
  });
  const conversation = await agent.createConversation({ userId: "user_fixture" });
  const turn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_fixture", text: "国庆和父母从广州坐飞机去大理五天，轻松一点" });

  assert.equal(turn.status, "completed");
  assert.ok(turn.tripId);
  assert.deepEqual(turn.activities.map((activity) => activity.status), ["saved", "ready"]);
  assert.match(turn.conversation.messages.at(-1).text, /已建立旅行草案/);
  const control = await travelService.getTripControlView(turn.tripId);
  assert.equal(control.brief.destination, "大理");
  assert.equal(control.travelers.length, 3);
  assert.equal(control.travelers[1].displayName, "父亲");
  assert.equal(control.travelers[1].careNeeds.mobility.maxContinuousWalkMeters, 800);
  assert.equal(control.travelers[2].careNeeds.schedule.latestDinnerTime, "19:00");
});

test("a native multimodal Parent Agent sees the image and can build the trip with ordinary tools in the same turn", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-multimodal-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  tripStore.mode = "file";
  const travelService = new TravelService({ store: tripStore, researchProvider: linkedProviderFixture(), clock: () => new Date("2026-08-24T08:00:00.000Z") });
  const faux = fauxProvider({ provider: "fixture-vision", models: [{ id: "fixture-vision-parent", reasoning: true, input: ["text", "image"] }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const transparentPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  faux.setResponses([
    (context) => {
      const message = context.messages.at(-1);
      assert.equal(message.role, "user");
      assert.ok(Array.isArray(message.content));
      assert.ok(message.content.some((item) => item.type === "image" && item.data === transparentPixel));
      assert.ok(context.tools.some((tool) => tool.name === "save_trip_understanding"));
      assert.ok(context.tools.some((tool) => tool.name === "research_trip_options"));
      assert.ok(context.tools.some((tool) => tool.name === "estimate_costs"));
      assert.ok(context.tools.some((tool) => tool.name === "explain_recommendation"));
      assert.match(context.systemPrompt, /本轮包含用户主动上传的旅行图片/);
      return fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "上海", travelerCount: 1, foodPreferences: ["截图里的本地餐厅"], language: "zh-CN" }), { stopReason: "toolUse" });
    },
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["food"], question: "核验图片中可见的上海餐饮线索，并与住宿、游玩和交通联合比较" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("我已经结合图片理解了你的想法，并把经资料核验的候选放到方案区；图片里的价格和营业信息仍需以当前来源为准。"),
  ]);
  const agent = new TravelConversationAgent({
    travelService,
    conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }),
    modelRuntime: { models, model: faux.getModel("fixture-vision-parent") },
    clock: () => new Date("2026-08-24T08:00:00.000Z"),
  });
  const conversation = await agent.createConversation({ userId: "user_visual_planner" });

  const turn = await agent.reply({
    conversationId: conversation.conversationId,
    userId: "user_visual_planner",
    text: "这是朋友发来的上海餐厅截图，请直接结合我的旅行核验并继续规划。",
    images: [{ mimeType: "image/png", data: transparentPixel }],
  });

  assert.equal(turn.status, "completed");
  assert.deepEqual(turn.activities.map(({ toolName, status }) => ({ toolName, status })), [
    { toolName: "interpret_visual_context", status: "completed" },
    { toolName: "save_trip_understanding", status: "saved" },
    { toolName: "research_trip_options", status: "proposed" },
  ]);
  assert.deepEqual(turn.multimodal, { status: "completed", persistence: "none", provider: "fixture-vision", model: "fixture-vision-parent" });
  assert.equal(turn.conversation.messages.find((message) => message.role === "user").kind, "multimodal_input");
  assert.equal(JSON.stringify(turn.conversation).includes(transparentPixel), false);
  assert.equal((await travelService.getTripPlanView(turn.tripId)).pendingProposals.length, 1);
});

test("a conversation whose trip draft is missing rebuilds instead of retrying a dead trip id", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-recovery-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  const travelService = new TravelService({ store: tripStore });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", {
      destination: "大理",
      dates: "国庆五天",
      travelerCount: 3,
      partyProfile: "和父母同行",
      pace: "轻松",
      lodgingPreference: "住得方便",
      foodPreferences: ["本地菜"],
    }), { stopReason: "toolUse" }),
    fauxAssistantMessage("旅行草案已经重新建立，我会从这里继续规划。"),
  ]);
  const conversationRepository = new FileConversationRepository({ rootDir: join(rootDir, "conversations") });
  const agent = new TravelConversationAgent({
    travelService,
    conversationRepository,
    modelRuntime: { models, model: faux.getModel("fixture-parent") },
  });
  const conversation = await agent.createConversation({ userId: "user_recovery", tripId: "trip_missing" });

  const turn = await agent.reply({
    conversationId: conversation.conversationId,
    userId: "user_recovery",
    text: "继续规划，还是国庆和父母去大理五天。",
  });

  assert.equal(turn.status, "completed");
  assert.notEqual(turn.tripId, "trip_missing");
  assert.equal(turn.conversation.tripId, turn.tripId);
  assert.deepEqual(turn.activities.map(({ toolName, status }) => ({ toolName, status })), [
    { toolName: "restore_trip_draft", status: "recovered" },
    { toolName: "save_trip_understanding", status: "saved" },
  ]);
  assert.equal((await tripStore.list()).length, 1);
  assert.equal((await travelService.getTripControlView(turn.tripId)).brief.destination, "大理");
});

test("the model saves understood trip facts and asks one useful question without inventing destination facts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-context-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  tripStore.mode = "file";
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "大理", dates: "国庆五天", travelerCount: 3, partyProfile: "和父母同行", pace: "轻松", lodgingPreference: "住得方便", foodPreferences: ["本地菜"] }), { stopReason: "toolUse" }),
    fauxAssistantMessage("我已经记住目的地、时间和同行人。你们从哪里出发，准备怎样抵达？这会影响首末日交通和住宿位置。"),
  ]);
  const agent = new TravelConversationAgent({
    travelService: new TravelService({ store: tripStore }),
    conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }),
    modelRuntime: { models, model: faux.getModel("fixture-parent") },
  });
  const conversation = await agent.createConversation({ userId: "user_context" });
  const turn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_context", text: "国庆和父母去大理五天，轻松一点，住得方便，想吃本地菜。" });
  assert.equal(turn.status, "completed");
  assert.ok(turn.tripId);
  assert.deepEqual(turn.activities.map((activity) => activity.status), ["saved"]);
  assert.match(turn.conversation.messages.at(-1).text, /从哪里出发/);
  assert.doesNotMatch(turn.conversation.messages.at(-1).text, /古城|才村|双廊|喜洲/);
  assert.equal((await tripStore.list()).length, 1);
});

test("an incomplete first tool call cannot persist a one-person trip when an explicit party was understood", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-party-count-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "大理", dates: "国庆五天", partyProfile: "和父母同行" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "大理", dates: "国庆五天", partyProfile: "和父母同行", travelerCount: 3 }), { stopReason: "toolUse" }),
    fauxAssistantMessage("我已经记住你和父母三人的大理旅行。"),
  ]);
  const agent = new TravelConversationAgent({
    travelService: new TravelService({ store: tripStore }),
    conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }),
    modelRuntime: { models, model: faux.getModel("fixture-parent") },
  });
  const conversation = await agent.createConversation({ userId: "user_party_count" });
  const turn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_party_count", text: "国庆和父母去大理五天" });

  assert.deepEqual(turn.activities.map(({ toolName, status }) => ({ toolName, status })), [
    { toolName: "save_trip_understanding", status: "error" },
    { toolName: "save_trip_understanding", status: "saved" },
  ]);
  const control = await agent.travelService.getTripControlView(turn.tripId);
  assert.equal(control.travelers.length, 3);
  assert.equal((await tripStore.list()).length, 1);
});

function linkedProviderFixture() {
  const checkedAt = "2026-08-14T08:00:00.000Z";
  return {
    status: "configured",
    async research({ domains = ["play", "food", "stay", "transport"], criteria = null } = {}) {
      const byDomain = Object.fromEntries(["play", "food", "stay", "transport"].map((domain) => {
        if (!domains.includes(domain)) return [domain, []];
        const sourceId = `amap:${domain}_fixture`;
        const entityId = `entity_${domain}_fixture`;
        const claimId = `claim_${domain}_fixture`;
        return [domain, [{
          candidateId: `${domain}_fixture`, domain, title: `${domain} 候选`, summary: "Provider 返回的核验信息", sourceId, entityId, claimId, checkedAt,
          location: { label: "大理市", district: "大理市", coordinates: { longitude: 100.17, latitude: 25.69, coordinateSystem: "GCJ-02" } },
          operability: domain === "transport"
            ? { provider: "provider_fixture", mobilityRole: "intercity_inventory", transportType: criteria?.intercityIntent === "train" ? "TRAIN" : "FLIGHT", serviceNumber: "FIXTURE1", departureAt: "2026-10-03 09:00", arrivalAt: "2026-10-03 12:00", arrivalPlace: { kind: "airport", city: "大理", label: "大理机场", terminal: null }, routeVerified: true, scheduleVerified: true }
            : { provider: "amap_web_service", navigationUrl: "https://uri.amap.com/marker?poiid=fixture" },
          source: { sourceId, provider: "amap_web_service", sourceType: "official_map_provider", providerPoiId: `${domain}_fixture`, checkedAt, documentationUrl: "https://lbs.amap.com/", independenceGroup: sourceId, commercialBias: "provider_ranking_unknown" },
          entity: { entityId, kind: "place", canonicalName: `${domain} 候选`, providerRefs: [sourceId] },
          claim: { claimId, entityId, kind: "provider_fact", statement: "Provider 返回的核验信息", sourceRefs: [sourceId], sourceIndependence: "single_provider", commercialBias: "provider_ranking_unknown", confidence: 0.8, observedAt: checkedAt },
        }]];
      }));
      return { status: "completed", provider: "amap_web_service", providerLabel: "高德地图 Web 服务", destination: "大理", checkedAt, byDomain, partial: false, sourceDocumentation: "https://lbs.amap.com/" };
    },
  };
}

function confirmationProviderFixture() {
  const checkedAt = "2026-08-26T10:30:00.000Z";
  const makeCandidate = (domain, id, title, location, operability = {}) => {
    const sourceId = `fixture:${id}`;
    const entityId = `entity_${id}`;
    const claimId = `claim_${id}`;
    return { candidateId: id, domain, title, summary: `${title} · 本次 ${checkedAt} 核验`, location, operability: { provider: "provider_fixture", ...operability }, checkedAt, sourceId, entityId, claimId, source: { sourceId, provider: "provider_fixture", sourceType: "official_provider", providerPoiId: id, checkedAt, documentationUrl: "https://example.com/provider", independenceGroup: sourceId, commercialBias: "unknown" }, entity: { entityId, kind: domain === "transport" ? "transport_offer" : "place", canonicalName: title, providerRefs: [sourceId] }, claim: { claimId, entityId, statement: `${title} 存在`, sourceRefs: [sourceId] } };
  };
  const byDomain = {
    play: [makeCandidate("play", "play_history", "上海市历史博物馆", { address: "南京西路", coordinates: { longitude: 121.47, latitude: 31.235 } })],
    food: [makeCandidate("food", "food_local", "上海本帮菜馆", { address: "南京东路", coordinates: { longitude: 121.48, latitude: 31.236 } })],
    stay: [makeCandidate("stay", "stay_ji", "全季酒店（上海人民广场南京路步行街店）", { address: "福建中路225号" }, { inventoryVerified: true, roomName: "双床房" })],
    transport: [makeCandidate("transport", "flight_dynamic", "动态航班库存对照", null, { mobilityRole: "intercity_inventory", transportType: "FLIGHT", serviceNumber: "DYNAMIC", arrivalPlace: { kind: "airport", city: "上海", label: "浦东国际机场", terminal: "T2" } })],
  };
  return {
    status: "configured",
    research: async ({ domains = ["play", "food", "stay", "transport"] } = {}) => ({ status: "completed", provider: "provider_fixture", providerLabel: "Fixture", destination: "上海", checkedAt, byDomain: Object.fromEntries(Object.entries(byDomain).map(([domain, items]) => [domain, domains.includes(domain) ? items : []])), partial: false, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false }),
    planMobility: async ({ selectedNodes }) => {
      const arrival = selectedNodes.find((node) => node.operability?.mobilityRole === "user_confirmed_arrival");
      const stay = selectedNodes.find((node) => node.domain === "stay");
      return { schemaVersion: "trip-mobility-v1", status: "completed", destination: "上海", source: "amap_routes_v5", checkedAt, freshUntil: "2026-08-26T13:30:00.000Z", coverage: { routedNodeIds: [arrival.nodeId, stay.nodeId], unresolvedNodeIds: [], unscheduled: false }, legs: [{ legId: "arrival_stay", origin: { nodeId: arrival.nodeId, label: "浦东机场 T2", coordinates: { longitude: 121.8079, latitude: 31.1528 } }, destination: { nodeId: stay.nodeId, label: stay.title, coordinates: { longitude: 121.4804, latitude: 31.2382 } }, recommendedMode: "taxi", rationale: "公交步行 1128 米，超过当前 600 米目标；公交需换乘 2 次，超过当前 1 次目标。打车约 52 分钟、步行 0 米、换乘 0 次，因此优先打车。电梯与连续无台阶状态仍待核验；该未知项不是本次推荐打车的直接触发条件。", recommendationAudit: { thresholds: { walkingMeters: 600, transfers: 1, walkingSource: "traveler_explicit", transferSource: "reduced_mobility_default" }, transit: { totalMinutes: 163, walkingMeters: 1128, transfers: 2, estimatedFareCny: 26, walkingExceeded: true, transfersExceeded: true, hasStairs: false, hasElevator: false, hasEscalator: true, hasRamp: false, stepFreeContinuity: "not_verified" }, taxi: { totalMinutes: 52, walkingMeters: 0, transfers: 0, estimatedFareCny: 151 }, walk: null, triggers: ["transit_walking_exceeds_target", "transit_transfers_exceed_target"], accessibilityEvidence: { status: "not_verified", directTrigger: false } }, alternatives: [{ mode: "transit", totalMinutes: 163, distanceMeters: 47_000, walkingMeters: 1128, transfers: 2, estimatedFareCny: 26, scheduleBasis: "scheduled_service", realTimeArrival: false, navigationUrl: "https://uri.amap.com/navigation?mode=bus", polyline: [], steps: [], accessibilityFeatures: [], accessibilityAssessment: { hasStairs: false, hasElevator: false, hasEscalator: true, hasRamp: false, stepFreeContinuity: "not_verified", realTimeStatus: false } }, { mode: "taxi", totalMinutes: 52, distanceMeters: 47_000, walkingMeters: 0, transfers: 0, estimatedFareCny: 151, scheduleBasis: "query_time_estimate", realTimeArrival: false, navigationUrl: "https://uri.amap.com/navigation?mode=car", polyline: [], steps: [], accessibilityFeatures: [], accessibilityAssessment: { hasStairs: false, hasElevator: false, hasEscalator: false, hasRamp: false, stepFreeContinuity: "not_verified", realTimeStatus: false } }] }], travelerFit: { constrainedTravelerIds: ["traveler_2"], maxContinuousWalkMeters: 600, maxTransfers: null, planningWalkingTarget: 600, planningTransferTarget: 1, walkingTargetSource: "traveler_explicit", transferTargetSource: "reduced_mobility_default", avoidStairs: true, accessibilityEvidence: "unverified" }, reason: null, caveats: [], sourceDocumentation: "https://lbs.amap.com/api/webservice/guide/api/newroute", fabricatedResults: false };
    },
  };
}

function latestToolJson(context) {
  for (const message of [...context.messages].reverse()) {
    const items = Array.isArray(message.content) ? message.content : [];
    for (const item of items) {
      if (typeof item?.text !== "string" || !item.text.trim().startsWith("{")) continue;
      try { return JSON.parse(item.text); } catch { /* keep looking */ }
    }
  }
  return null;
}

test("a terse follow-up updates the existing trip and continues research instead of repeating the question", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-follow-up-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  tripStore.mode = "file";
  const travelService = new TravelService({ store: tripStore, researchProvider: linkedProviderFixture(), clock: () => new Date("2026-08-14T08:00:00.000Z") });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const agent = new TravelConversationAgent({
    travelService,
    conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }),
    modelRuntime: { models, model: faux.getModel("fixture-parent") },
    clock: () => new Date("2026-08-14T08:00:00.000Z"),
  });
  const conversation = await agent.createConversation({ userId: "user_terse_follow_up" });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "大理", dates: "国庆五天", travelerCount: 3, partyProfile: "和父母同行", pace: "轻松", lodgingPreference: "位置由旅行助手设计", foodPreferences: ["本地菜"] }), { stopReason: "toolUse" }),
    fauxAssistantMessage("我已经记住这趟旅行。你们从哪里出发，准备怎样抵达？"),
  ]);
  const first = await agent.reply({ conversationId: conversation.conversationId, userId: "user_terse_follow_up", text: "国庆和父母去大理5天，轻松一点，住得方便，想吃本地菜。" });
  assert.ok(first.tripId);

  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { origin: "广州", arrivalMode: "飞机", lodgingPreference: "位置由旅行助手设计" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["play", "food", "stay", "transport"], question: "和父母轻松旅行，住宿位置由旅行助手比较，想吃本地菜" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("我已经把吃、住、行、玩候选放到方案区，你可以结合位置和节奏一起比较。"),
  ]);
  const second = await agent.reply({ conversationId: conversation.conversationId, userId: "user_terse_follow_up", text: "广州 飞机 还没决定住宿位置等 需要你帮忙设计" });
  assert.deepEqual(second.activities.map((activity) => activity.status), ["saved", "proposed"]);
  assert.doesNotMatch(second.conversation.messages.at(-1).text, /从哪里出发/);
  const control = await travelService.getTripControlView(first.tripId);
  assert.equal(control.brief.origin, "广州");
  assert.equal(control.brief.arrivalMode, "飞机");
  const plan = await travelService.getTripPlanView(first.tripId);
  assert.equal(plan.pendingProposals.length, 1);
});

test("fixture: one Parent Agent turn creates the scoped trip and stages one linked four-domain proposal", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-research-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  tripStore.mode = "file";
  const travelService = new TravelService({ store: tripStore, researchProvider: linkedProviderFixture(), clock: () => new Date("2026-08-14T08:00:00.000Z") });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    (context) => {
      assert.match(context.systemPrompt, /Skill understand-trip version/);
      assert.match(context.systemPrompt, /Skill research-trip version/);
      return fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "大理", dates: "2026-10-03 至 2026-10-07", durationDays: 5, origin: "广州", arrivalMode: "飞机", travelerCount: 3, partyProfile: "与父母同行", pace: "轻松", lodgingPreference: "交通方便", foodPreferences: ["本地菜"], language: "zh-CN" }), { stopReason: "toolUse" });
    },
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["stay"], question: "轻松、住得方便、少折返，并兼顾本地菜", criteria: { byDomain: { stay: { targetAreas: ["大理古城"], preferenceHints: ["少折返"] } } } }), { stopReason: "toolUse" }),
    fauxAssistantMessage("已完成一次联动研究，方案画布里有吃、住、行、玩候选和来源，请先比较后确认。"),
  ]);
  const agent = new TravelConversationAgent({
    travelService,
    conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }),
    modelRuntime: { models, model: faux.getModel("fixture-parent") },
    clock: () => new Date("2026-08-14T08:00:00.000Z"),
  });
  const conversation = await agent.createConversation({ userId: "user_research" });
  const turn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_research", text: "10月3日从广州飞大理，和父母三人玩5天，轻松、住得方便、想吃本地菜，请给我完整方案。" });

  assert.equal(turn.status, "completed");
  assert.deepEqual(turn.agentTrace.skills.map((skill) => skill.skillId), ["understand-trip", "research-trip"]);
  assert.deepEqual(turn.activities.map((activity) => activity.status), ["saved", "proposed"]);
  const plan = await travelService.getTripPlanView(turn.tripId);
  assert.equal(plan.pendingProposals.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(plan.pendingProposals[0].byDomain).map(([domain, items]) => [domain, items.length])), { play: 1, food: 1, stay: 1, transport: 1 });
  assert.equal(plan.byDomain.play.length, 0, "the Parent Agent must not auto-accept researched options");
});

test("natural conversation confirms arrival and only the named stay without lying about TripState", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-partial-confirm-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  tripStore.mode = "file";
  const travelService = new TravelService({ store: tripStore, researchProvider: confirmationProviderFixture(), clock: () => new Date("2026-08-26T10:30:00.000Z") });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const agent = new TravelConversationAgent({ travelService, conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }), modelRuntime: { models, model: faux.getModel("fixture-parent") }, clock: () => new Date("2026-08-26T10:30:00.000Z") });
  const conversation = await agent.createConversation({ userId: "user_partial_confirm" });

  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "上海", dates: "2026-08-27 至 2026-08-29", origin: "广州", arrivalMode: "飞机", arrivalAirport: "浦东机场", arrivalTerminal: "T2", arrivalTime: "14:00", travelerCount: 3, partyProfile: "与父母同行", lodgingPreference: "人民广场或南京东路", foodPreferences: ["本地菜"], totalBudget: 8000, travelerProfiles: [{ displayName: "你", relationship: "本人" }, { displayName: "父亲", relationship: "父亲", careNeeds: { mobility: { maxContinuousWalkMeters: 600, avoidStairs: true } } }, { displayName: "母亲", relationship: "母亲" }] }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["play", "food", "stay", "transport"], question: "先给候选，不替我确认" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("候选已经出现，但我没有替你确认。"),
  ]);
  const first = await agent.reply({ conversationId: conversation.conversationId, userId: "user_partial_confirm", text: "8月27日至29日和父母三人从广州飞上海，14:00到浦东T2；父亲单段步行不超过600米并尽量避楼梯；住人民广场或南京东路；先给候选，不替我确认。" });
  assert.equal(first.status, "completed");
  let plan = await travelService.getTripPlanView(first.tripId);
  assert.equal(plan.pendingProposals.length, 1);
  assert.equal(Object.values(plan.byDomain).flat().some((node) => node.selected), false);

  faux.setResponses([
    (context) => {
      assert.equal(context.tools.some((tool) => tool.name === "research_trip_options"), false);
      assert.equal(context.tools.some((tool) => tool.name === "save_trip_understanding"), false);
      return fauxAssistantMessage(fauxToolCall("confirm_user_arrival", { airport: "浦东机场", terminal: "T2", time: "14:00", intercityBooked: true, explicitUserConfirmation: true }), { stopReason: "toolUse" });
    },
    fauxAssistantMessage("我已记录。"),
  ]);
  const arrivalTurn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_partial_confirm", text: "机票已自行购买，以14:00浦东T2为事实，不需选择库存航班；先比较机场到人民广场酒店。" });
  assert.match(arrivalTurn.conversation.messages.at(-1).text, /库存航班只作价格对照/);
  assert.deepEqual(arrivalTurn.activities.map(({ toolName, status }) => ({ toolName, status })), [{ toolName: "confirm_user_arrival", status: "committed" }]);
  plan = await travelService.getTripPlanView(first.tripId);
  assert.equal(plan.byDomain.transport.find((node) => node.selected).operability.mobilityRole, "user_confirmed_arrival");
  assert.equal(plan.pendingProposals[0].byDomain.transport.length, 0);
  assert.equal(plan.pendingProposals[0].byDomain.stay.length, 1);

  const conciseArrivalTurn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_partial_confirm", text: "机票已购，确认上海浦东国际机场T2 14:00，刷新接驳。" });
  assert.match(conciseArrivalTurn.conversation.messages.at(-1).text, /已把上海浦东国际机场 T2 14:00记录为你确认的抵达事实/);

  faux.setResponses([
    (context) => {
      assert.deepEqual(context.tools.map((tool) => tool.name).sort(), ["confirm_trip_selection", "get_trip_control_view", "get_trip_plan_view"]);
      return fauxAssistantMessage(fauxToolCall("get_trip_plan_view", {}), { stopReason: "toolUse" });
    },
    (context) => {
      const current = latestToolJson(context);
      if (!current) throw new Error("missing tool json");
      const selectedStayNodeId = current.pendingProposals[0].domains.stay.options[0].nodeId;
      return fauxAssistantMessage(fauxToolCall("confirm_trip_selection", { domain: "stay", nodeId: selectedStayNodeId, explicitUserConfirmation: true }), { stopReason: "toolUse" });
    },
    fauxAssistantMessage("住宿已经锁定。"),
  ]);
  const stayTurn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_partial_confirm", text: "选择全季酒店（上海人民广场南京路步行街店）为住宿锚点，只确认住宿，吃玩暂不确认；立即核验机场到酒店。" });
  assert.deepEqual(stayTurn.activities.map(({ toolName, status }) => ({ toolName, status })), [{ toolName: "get_trip_plan_view", status: "ready" }, { toolName: "confirm_trip_selection", status: "committed" }, { toolName: "refresh_trip_mobility", status: "completed" }]);
  assert.match(stayTurn.conversation.messages.at(-1).text, /已只确认住宿：全季酒店/);
  assert.match(stayTurn.conversation.messages.at(-1).text, /公交地铁约 163 分钟、步行 1128 米、换乘 2 次/);
  assert.match(stayTurn.conversation.messages.at(-1).text, /目标是步行不超过 600 米、换乘不超过 1 次/);
  assert.match(stayTurn.conversation.messages.at(-1).text, /未知项不是本次推荐打车的直接触发条件/);
  plan = await travelService.getTripPlanView(first.tripId);
  assert.equal(plan.byDomain.stay.filter((node) => node.selected).length, 1);
  assert.equal(plan.byDomain.play.filter((node) => node.selected).length, 0);
  assert.equal(plan.byDomain.food.filter((node) => node.selected).length, 0);
  assert.equal(plan.pendingProposals[0].byDomain.play.length, 1);
  assert.equal(plan.pendingProposals[0].byDomain.food.length, 1);
  assert.deepEqual((await travelService.getOpenDecisions(first.tripId)).decisions.map((decision) => decision.domain).sort(), ["food", "play"]);
  assert.equal(plan.mobility.legs[0].origin.label, "浦东机场 T2");
  assert.equal(plan.mobility.legs[0].destination.nodeId, plan.byDomain.stay.find((node) => node.selected).nodeId);

  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("get_trip_plan_view", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage("因为父亲不喜欢地铁，所以建议打车。"),
  ]);
  const whyTurn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_partial_confirm", text: "为什么建议打车？地铁是否可行？" });
  assert.match(whyTurn.conversation.messages.at(-1).text, /公交地铁约 163 分钟、步行 1128 米、换乘 2 次/);
  assert.match(whyTurn.conversation.messages.at(-1).text, /打车约 52 分钟、步行 0 米、换乘 0 次/);
  assert.doesNotMatch(whyTurn.conversation.messages.at(-1).text, /不喜欢地铁/);
});

test("replaces model prose with an explicit no-result state when linked research is unavailable", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-provider-blocked-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  tripStore.mode = "file";
  const travelService = new TravelService({ store: tripStore });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "大理", dates: "2026-10-03 至 2026-10-07", origin: "广州", arrivalMode: "飞机", travelerCount: 3 }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["play", "food", "stay", "transport"], question: "完整方案" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("这里是一些未经工具核验的具体地点。"),
  ]);
  const agent = new TravelConversationAgent({ travelService, conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }), modelRuntime: { models, model: faux.getModel("fixture-parent") } });
  const conversation = await agent.createConversation({ userId: "user_provider_blocked" });
  const turn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_provider_blocked", text: "10月3日从广州飞大理，和父母三人玩5天，请给我完整方案。" });
  assert.equal(turn.activities[1].status, "provider_unavailable");
  assert.match(turn.conversation.messages.at(-1).text, /无法连接实时地点或天气资料/);
  assert.doesNotMatch(turn.conversation.messages.at(-1).text, /未经工具核验的具体地点/);
});

test("a successful research retry wins over an earlier failure in the same Agent turn", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-retry-success-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  const successful = linkedProviderFixture();
  let calls = 0;
  const researchProvider = { status: "configured", research: async (input) => { calls += 1; return calls === 1 ? { status: "SOURCE_UNAVAILABLE", provider: "fixture", fabricatedResults: false } : successful.research(input); } };
  const travelService = new TravelService({ store: tripStore, researchProvider, clock: () => new Date("2026-08-26T12:00:00.000Z") });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "上海", dates: "2026-08-27 至 2026-08-29", travelerCount: 1 }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["play", "food", "stay", "transport"], question: "完整方案" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["play", "food", "stay", "transport"], question: "重试完整方案" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("第二次核验成功，候选已经放到方案区。"),
  ]);
  const agent = new TravelConversationAgent({ travelService, conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }), modelRuntime: { models, model: faux.getModel("fixture-parent") } });
  const conversation = await agent.createConversation({ userId: "user_retry_success" });

  const turn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_retry_success", text: "去上海，请先给候选。" });

  assert.deepEqual(turn.activities.filter((activity) => activity.toolName === "research_trip_options").map((activity) => activity.status), ["SOURCE_UNAVAILABLE", "proposed"]);
  assert.match(turn.conversation.messages.at(-1).text, /第二次核验成功/);
  assert.doesNotMatch(turn.conversation.messages.at(-1).text, /当前无法连接/);
});

test("explains an AMap account gate without mislabeling it as transient QPS limiting", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-conversation-account-limited-"));
  const tripStore = new TripStore({ rootDir: join(rootDir, "trips") });
  const travelService = new TravelService({
    store: tripStore,
    researchProvider: { status: "configured", research: async () => ({ status: "ACCOUNT_LIMITED", provider: "amap_web_service", fabricatedResults: false }) },
  });
  const faux = fauxProvider({ provider: "fixture-pi", models: [{ id: "fixture-parent" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "上海", dates: "2026-10-03 至 2026-10-05", travelerCount: 1 }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["play", "food", "stay", "transport"], question: "完整方案" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("稍后重试即可。"),
  ]);
  const agent = new TravelConversationAgent({ travelService, conversationRepository: new FileConversationRepository({ rootDir: join(rootDir, "conversations") }), modelRuntime: { models, model: faux.getModel("fixture-parent") } });
  const conversation = await agent.createConversation({ userId: "user_account_limited" });

  const turn = await agent.reply({ conversationId: conversation.conversationId, userId: "user_account_limited", text: "去上海三天，请给我完整方案。" });

  assert.equal(turn.activities[1].status, "ACCOUNT_LIMITED");
  assert.match(turn.conversation.messages.at(-1).text, /账号当前被服务平台阻止访问/);
  assert.doesNotMatch(turn.conversation.messages.at(-1).text, /稍后重试即可/);
});
