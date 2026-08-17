import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TravelService } from "../src/api/travel-service.mjs";
import { TripStore, recordOfferSnapshot } from "../travel-agent-pi-package/src/core/index.ts";

const clock = () => new Date("2026-08-13T12:00:00.000Z");

async function serviceFixture() {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-service-"));
  return { rootDir, service: new TravelService({ store: new TripStore({ rootDir }), clock }) };
}

function fourDomainProposal(tripId, baseRevision = 0) {
  const nodes = [
    { nodeId: "transport_train", domain: "transport", title: "上午抵达", cost: 600, sourceStatus: "verified", operability: { routeVerified: true } },
    { nodeId: "stay_hotel", domain: "stay", title: "市中心酒店", cost: 1200, foreignGuestEligible: true, sourceStatus: "verified", travelerIds: ["traveler_1"], impactsNodeIds: ["food_dinner"] },
    { nodeId: "play_garden", domain: "play", title: "植物园", cost: 100, sourceStatus: "verified" },
    { nodeId: "food_dinner", domain: "food", title: "晚餐", cost: 200, sourceStatus: "unverified" },
  ];
  return {
    schemaVersion: "trip-patch-proposal-v1",
    proposalId: "proposal_initial_plan",
    tripId,
    baseRevision,
    writeSet: nodes.map((node) => node.nodeId),
    writeContract: { allowedNodeIds: nodes.map((node) => node.nodeId) },
    readSet: [],
    operations: nodes.map((node) => ({ kind: "add_candidate", nodeId: node.nodeId, node })),
  };
}

function selectionProposal(tripId, baseRevision, proposalId = "proposal_select_plan") {
  const nodeIds = ["transport_train", "stay_hotel", "play_garden", "food_dinner"];
  return {
    schemaVersion: "trip-patch-proposal-v1",
    proposalId,
    tripId,
    baseRevision,
    writeSet: nodeIds,
    writeContract: { allowedNodeIds: nodeIds },
    readSet: nodeIds.map((nodeId) => ({ nodeId, version: 1 })),
    operations: nodeIds.map((nodeId) => ({ kind: "select", nodeId })),
  };
}

test("golden path persists a staged four-domain proposal and commits only after parent acceptance", async () => {
  const { rootDir, service } = await serviceFixture();
  const created = await service.createTrip({
    tripId: "trip_golden",
    brief: { destination: "上海", totalBudget: 4000, currency: "CNY" },
    travelers: [{ travelerId: "traveler_1", language: "en", hardConstraints: [{ type: "foreign_guest_required" }] }],
  });
  assert.equal(created.revision, 0);
  assert.equal(created.providerStatus, "provider_unavailable");
  assert.deepEqual(created.openDecisions.map((decision) => decision.domain).sort(), ["food", "play", "stay", "transport"]);

  const unavailable = await service.researchTripOptions({ tripId: "trip_golden", capability: "amap_official", query: "上海" });
  assert.equal(unavailable.status, "provider_unavailable");
  assert.equal(unavailable.fabricatedResults, false);

  const proposed = await service.proposeTripChange({ tripId: "trip_golden", proposal: fourDomainProposal("trip_golden") });
  assert.equal(proposed.status, "proposed");
  assert.equal((await service.getTripPlanView("trip_golden")).byDomain.play.length, 0, "staging must not alter the accepted plan");

  const accepted = await service.acceptTripChange({ tripId: "trip_golden", proposalId: "proposal_initial_plan" });
  assert.equal(accepted.status, "committed");
  assert.equal(accepted.revision, 1);
  assert.equal(accepted.qa.missingDomains.length, 4, "adding candidates alone does not pretend they are selected");

  const selectedProposal = selectionProposal("trip_golden", 1);
  assert.equal((await service.proposeTripChange({ tripId: "trip_golden", proposal: selectedProposal })).status, "proposed");
  const selected = await service.acceptTripChange({ tripId: "trip_golden", proposalId: selectedProposal.proposalId });
  assert.equal(selected.status, "committed");
  assert.equal(selected.revision, 2);
  assert.equal(selected.qa.status, "needs_fix");
  assert.equal(selected.qa.operabilityGaps.some((gap) => gap.code === "city_mobility_unverified"), true);

  service.researchProvider = {
    status: "configured",
    planMobility: async () => ({
      schemaVersion: "trip-mobility-v1",
      status: "completed",
      destination: "上海",
      source: "amap_routes_v5",
      checkedAt: "2026-08-13T12:00:00.000Z",
      freshUntil: "2026-08-13T15:00:00.000Z",
      coverage: { routedNodeIds: ["stay_hotel", "play_garden", "food_dinner"], unresolvedNodeIds: [], unscheduled: true },
      legs: [{
        legId: "mobility_golden",
        origin: { nodeId: "stay_hotel", label: "市中心酒店", coordinates: { longitude: 121.47, latitude: 31.23 } },
        destination: { nodeId: "play_garden", label: "植物园", coordinates: { longitude: 121.49, latitude: 31.24 } },
        recommendedMode: "transit",
        rationale: "少步行且换乘可控。",
        alternatives: [{ mode: "transit", totalMinutes: 25, distanceMeters: 5_000, walkingMeters: 500, transfers: 0, estimatedFareCny: 4, scheduleBasis: "scheduled_service", navigationUrl: "https://uri.amap.com/navigation", polyline: [{ longitude: 121.47, latitude: 31.23 }, { longitude: 121.49, latitude: 31.24 }], steps: [{ kind: "ride", instruction: "乘坐地铁", line: "地铁2号线" }] }],
      }],
      caveats: ["不是实时到站结果。"],
      sourceDocumentation: "https://lbs.amap.com/api/webservice/guide/api/newroute",
      fabricatedResults: false,
    }),
  };
  const mobility = await service.refreshTripMobility({ tripId: "trip_golden" });
  assert.equal(mobility.status, "completed");
  assert.equal(mobility.qa.status, "pass");

  const persistedService = new TravelService({ store: new TripStore({ rootDir }), clock });
  const plan = await persistedService.getTripPlanView("trip_golden");
  assert.equal(plan.byDomain.transport[0].title, "上午抵达");
  assert.equal(plan.byDomain.stay[0].foreignGuestEligible, true);
  assert.equal(plan.byDomain.play[0].spoilerLevel, "low");
  assert.equal(plan.byDomain.food[0].sourceStatus, "unverified");
  assert.equal(plan.revision, 3);
  assert.equal(plan.mobility.legs[0].recommendedMode, "transit");
  assert.deepEqual((await persistedService.getOpenDecisions("trip_golden")).decisions, []);

  const stored = JSON.parse(await readFile(join(rootDir, "trip_golden.json"), "utf8"));
  assert.equal(stored.storageVersion, 5);
  assert.equal(stored.pendingProposals.length, 0);
  assert.deepEqual(stored.proposalHistory.map((item) => item.status), ["accepted", "accepted"]);
});

test("research proposal is visibly provisional when place evidence succeeds but weather is unavailable", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-weather-gate-"));
  const candidate = {
    candidateId: "food_1",
    domain: "food",
    title: "本地餐厅",
    summary: "已核验地点资料",
    sourceId: "source_food_1",
    claimId: "claim_food_1",
    entityId: "entity_food_1",
    checkedAt: "2026-08-13T12:00:00.000Z",
    source: { provider: "amap_web_service", sourceType: "official_map_provider", providerPoiId: "poi_1", checkedAt: "2026-08-13T12:00:00.000Z", documentationUrl: "https://lbs.amap.com/", independenceGroup: "source_food_1", commercialBias: "provider_ranking_unknown" },
    entity: { entityId: "entity_food_1", kind: "place", canonicalName: "本地餐厅", providerRefs: ["source_food_1"] },
    claim: { claimId: "claim_food_1", entityId: "entity_food_1", statement: "地点存在", sourceRefs: ["source_food_1"] },
  };
  const researchProvider = {
    status: "configured",
    research: async () => ({
      status: "completed",
      provider: "amap_web_service",
      providerLabel: "高德地图 Web 服务",
      checkedAt: "2026-08-13T12:00:00.000Z",
      byDomain: { food: [candidate], play: [], stay: [], transport: [] },
      partial: false,
      weather: { status: "SOURCE_UNAVAILABLE", provider: "amap_weather" },
      caveats: [],
      fabricatedResults: false,
    }),
  };
  const service = new TravelService({ store: new TripStore({ rootDir }), clock, researchProvider });
  await service.createTrip({ tripId: "trip_weather_gate", brief: { destination: "上海", dates: "2026-08-20 至 2026-08-22" } });

  const result = await service.researchTripOptions({ tripId: "trip_weather_gate", domains: ["food"], question: "找本地菜" });

  assert.equal(result.status, "proposed");
  assert.equal(result.partial, true);
  assert.equal(result.proposal.partial, true);
  assert.equal(result.proposal.summary.includes("暂定候选"), true);
  assert.equal(result.proposal.caveats.some((item) => item.includes("天气尚未核验完成")), true);
});

test("intercity inventory keeps its verified schedule semantics and is not downgraded into an unverified city route", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-transport-semantics-"));
  const checkedAt = "2026-08-13T12:00:00.000Z";
  const transport = {
    candidateId: "transport_g1",
    domain: "transport",
    title: "G1 广州南 → 上海虹桥",
    summary: "高铁班次",
    sourceId: "flyai:g1",
    claimId: "claim_g1",
    entityId: "entity_g1",
    checkedAt,
    operability: { mobilityRole: "intercity_inventory", routeVerified: true, scheduleVerified: true, transportType: "TRAIN" },
    source: { provider: "fliggy_flyai", sourceType: "official_ota_inventory", providerPoiId: "g1", checkedAt, documentationUrl: "https://flyai.open.fliggy.com/", independenceGroup: "flyai:g1", commercialBias: "commercial_inventory" },
    entity: { entityId: "entity_g1", kind: "transport_offer", canonicalName: "G1", providerRefs: ["flyai:g1"] },
    claim: { claimId: "claim_g1", entityId: "entity_g1", statement: "班次存在", sourceRefs: ["flyai:g1"] },
  };
  const service = new TravelService({
    store: new TripStore({ rootDir }),
    clock,
    researchProvider: { status: "configured", research: async () => ({ status: "completed", provider: "fliggy_flyai", providerLabel: "飞猪 AI 开放平台", checkedAt, byDomain: { play: [], food: [], stay: [], transport: [transport] }, partial: true, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false }) },
  });
  await service.createTrip({ tripId: "trip_transport_semantics", brief: { destination: "上海", origin: "广州" } });
  await service.researchTripOptions({ tripId: "trip_transport_semantics", domains: ["transport"] });
  const plan = await service.getTripPlanView("trip_transport_semantics");
  assert.equal(plan.pendingProposals[0].byDomain.transport[0].operability.routeVerified, true);
  assert.equal(plan.pendingProposals[0].byDomain.transport[0].operability.mobilityRole, "intercity_inventory");
});

test("a persisted disruption requeues only the impacted stay and food neighborhood", async () => {
  const { service } = await serviceFixture();
  await service.createTrip({ tripId: "trip_disruption" });
  await service.proposeTripChange({ tripId: "trip_disruption", proposal: fourDomainProposal("trip_disruption") });
  await service.acceptTripChange({ tripId: "trip_disruption", proposalId: "proposal_initial_plan" });
  await service.proposeTripChange({ tripId: "trip_disruption", proposal: selectionProposal("trip_disruption", 1) });
  await service.acceptTripChange({ tripId: "trip_disruption", proposalId: "proposal_select_plan" });

  const disruption = {
    schemaVersion: "trip-patch-proposal-v1",
    proposalId: "proposal_move_hotel",
    tripId: "trip_disruption",
    baseRevision: 2,
    writeSet: ["stay_hotel"],
    writeContract: { allowedNodeIds: ["stay_hotel"] },
    readSet: [{ nodeId: "stay_hotel", version: 2 }],
    operations: [{ kind: "update", nodeId: "stay_hotel", changes: { location: "新住宿区域" } }],
  };
  assert.equal((await service.reportTripDisruption({ tripId: "trip_disruption", proposal: disruption })).status, "proposed");
  assert.equal((await service.acceptTripChange({ tripId: "trip_disruption", proposalId: disruption.proposalId })).status, "committed");

  const control = await service.getTripControlView("trip_disruption");
  assert.deepEqual(control.dirtySet, ["stay_hotel", "food_dinner"]);
  assert.equal(control.taskQueues.stay.length > 0, true);
  assert.equal(control.taskQueues.food.length > 0, true, "the stay→food impact edge should make food scheduling reconsidered");
  assert.equal(control.taskQueues.transport.length > 0, true, "initial selection queues remain in the audit trail");
});

test("rejects concurrent stale storage writes, stale proposals, and nested sensitive fields", async () => {
  const { service } = await serviceFixture();
  await service.createTrip({ tripId: "trip_conflict" });
  const proposal = fourDomainProposal("trip_conflict");
  await service.proposeTripChange({ tripId: "trip_conflict", proposal });

  const duplicate = await service.proposeTripChange({ tripId: "trip_conflict", proposal });
  assert.equal(duplicate.status, "rejected");
  assert.equal(duplicate.validation.reason, "proposal_already_exists");

  await assert.rejects(
    () => service.createTrip({ tripId: "trip_secret", brief: { nested: { passportNumber: "forbidden" } } }),
    (error) => error.code === "sensitive_payload_blocked" && error.details.blockedPath === "brief.nested.passportNumber",
  );
});

test("records feedback as reviewable evidence without promoting it to public memory", async () => {
  const { service } = await serviceFixture();
  await service.createTrip({ tripId: "trip_feedback" });
  const result = await service.submitTripFeedback({
    tripId: "trip_feedback",
    baseRevision: 0,
    category: "fact_correction",
    text: "店铺已经搬迁，需重新核验。",
  });
  assert.equal(result.status, "committed");

  const state = await service.store.get("trip_feedback");
  assert.equal(state.feedbackLedger[0].memoryStatus, "needs_review");
  assert.equal(state.evidence.claims.length, 0);
});

test("prepares a user-confirmed external handoff and locks only after confirmation is recorded", async () => {
  const { service } = await serviceFixture();
  await service.createTrip({ tripId: "trip_booking" });
  await service.proposeTripChange({ tripId: "trip_booking", proposal: fourDomainProposal("trip_booking") });
  await service.acceptTripChange({ tripId: "trip_booking", proposalId: "proposal_initial_plan" });
  await service.proposeTripChange({ tripId: "trip_booking", proposal: selectionProposal("trip_booking", 1) });
  await service.acceptTripChange({ tripId: "trip_booking", proposalId: "proposal_select_plan" });

  const current = await service.store.get("trip_booking");
  const withOffer = recordOfferSnapshot(current, {
    offerId: "offer_hotel",
    nodeId: "stay_hotel",
    source: "authorized_provider_fixture",
    handoffUrl: "https://provider.example/handoff/offer_hotel",
    totalPrice: 1200,
    expiresAt: "2026-08-14T12:00:00.000Z",
  }, { clock });
  await service.store.save(withOffer, { expectedStorageVersion: current.storageVersion });

  await assert.rejects(
    () => service.prepareBookingHandoff({ tripId: "trip_booking", nodeId: "stay_hotel", offerId: "offer_hotel" }),
    (error) => error.code === "user_confirmation_required",
  );
  const handoff = await service.prepareBookingHandoff({
    tripId: "trip_booking", nodeId: "stay_hotel", offerId: "offer_hotel", explicitUserConfirmation: true,
  });
  assert.equal(handoff.status, "ready");
  assert.equal(handoff.automaticPurchase, false);

  const confirmed = await service.recordBookingConfirmation({
    tripId: "trip_booking",
    nodeId: "stay_hotel",
    offerId: "offer_hotel",
    confirmationRef: "confirm_123",
    baseRevision: 2,
    explicitUserConfirmation: true,
  });
  assert.equal(confirmed.status, "committed");
  const state = await service.store.get("trip_booking");
  assert.equal(state.nodes.find((node) => node.nodeId === "stay_hotel").lock.kind, "booked");
  assert.equal(state.fulfillmentEvents[0].confirmationRef, "confirm_123");
});
