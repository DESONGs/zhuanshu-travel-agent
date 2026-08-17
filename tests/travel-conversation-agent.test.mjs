import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { TravelConversationAgent, userFacingAgentText } from "../src/agent/travel-conversation-agent.mjs";
import { TravelService } from "../src/api/travel-service.mjs";
import { FileConversationRepository } from "../src/persistence/conversation-repository.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

test("user-facing agent copy translates internal planning enums before rendering", () => {
  const copy = userFacingAgentText("Provider 把 weatherFit 标为 caution，等待 TripPatch revision。");
  assert.doesNotMatch(copy, /Provider|weatherFit|caution|TripPatch|revision/i);
  assert.match(copy, /资料来源|受天气影响，需要备选|方案变更|方案版本/);
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
    async research({ domains = ["play", "food", "stay", "transport"] } = {}) {
      const byDomain = Object.fromEntries(["play", "food", "stay", "transport"].map((domain) => {
        if (!domains.includes(domain)) return [domain, []];
        const sourceId = `amap:${domain}_fixture`;
        const entityId = `entity_${domain}_fixture`;
        const claimId = `claim_${domain}_fixture`;
        return [domain, [{
          candidateId: `${domain}_fixture`, domain, title: `${domain} 候选`, summary: "Provider 返回的核验信息", sourceId, entityId, claimId, checkedAt,
          location: { label: "大理市", district: "大理市", coordinates: { longitude: 100.17, latitude: 25.69, coordinateSystem: "GCJ-02" } },
          operability: { provider: "amap_web_service", navigationUrl: "https://uri.amap.com/marker?poiid=fixture" },
          source: { sourceId, provider: "amap_web_service", sourceType: "official_map_provider", providerPoiId: `${domain}_fixture`, checkedAt, documentationUrl: "https://lbs.amap.com/", independenceGroup: sourceId, commercialBias: "provider_ranking_unknown" },
          entity: { entityId, kind: "place", canonicalName: `${domain} 候选`, providerRefs: [sourceId] },
          claim: { claimId, entityId, kind: "provider_fact", statement: "Provider 返回的核验信息", sourceRefs: [sourceId], sourceIndependence: "single_provider", commercialBias: "provider_ranking_unknown", confidence: 0.8, observedAt: checkedAt },
        }]];
      }));
      return { status: "completed", provider: "amap_web_service", providerLabel: "高德地图 Web 服务", destination: "大理", checkedAt, byDomain, partial: false, sourceDocumentation: "https://lbs.amap.com/" };
    },
  };
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
    fauxAssistantMessage(fauxToolCall("save_trip_understanding", { destination: "大理", dates: "2026-10-03 至 2026-10-07", durationDays: 5, origin: "广州", arrivalMode: "飞机", travelerCount: 3, partyProfile: "与父母同行", pace: "轻松", lodgingPreference: "交通方便", foodPreferences: ["本地菜"], language: "zh-CN" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("research_trip_options", { domains: ["stay"], question: "轻松、住得方便、少折返，并兼顾本地菜" }), { stopReason: "toolUse" }),
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
  assert.deepEqual(turn.activities.map((activity) => activity.status), ["saved", "proposed"]);
  const plan = await travelService.getTripPlanView(turn.tripId);
  assert.equal(plan.pendingProposals.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(plan.pendingProposals[0].byDomain).map(([domain, items]) => [domain, items.length])), { play: 1, food: 1, stay: 1, transport: 1 });
  assert.equal(plan.byDomain.play.length, 0, "the Parent Agent must not auto-accept researched options");
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
