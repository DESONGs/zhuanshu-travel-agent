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
    { nodeId: "food_dinner", domain: "food", title: "晚餐", cost: 200, sourceStatus: "unverified", sourceRefs: ["amap_web_service:food_shared_1"] },
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
  const stagedView = await service.getTripPlanView("trip_golden");
  assert.equal(stagedView.byDomain.play.length, 0, "staging must not alter the accepted plan");
  assert.equal(stagedView.pendingProposals[0].byDomain.stay[0].price.quality, "reference", "legacy numeric cost must be visibly migrated instead of losing price provenance");
  assert.equal(stagedView.budget.estimated, 2_100);

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

test("a pending proposal is not reused for a missing domain or a narrower follow-up search", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-research-domain-refresh-"));
  const checkedAt = "2026-08-13T12:00:00.000Z";
  const calls = [];
  const makeCandidate = (domain, suffix) => ({
    candidateId: `${domain}_${suffix}`,
    domain,
    title: `${domain} ${suffix}`,
    summary: "已核验候选",
    sourceId: `source_${domain}_${suffix}`,
    claimId: `claim_${domain}_${suffix}`,
    entityId: `entity_${domain}_${suffix}`,
    checkedAt,
    source: { provider: "provider_fixture", sourceType: "official_provider", providerPoiId: `${domain}_${suffix}`, checkedAt, documentationUrl: "https://example.com/provider", independenceGroup: `source_${domain}_${suffix}`, commercialBias: "unknown" },
    entity: { entityId: `entity_${domain}_${suffix}`, kind: "place", canonicalName: `${domain} ${suffix}`, providerRefs: [`source_${domain}_${suffix}`] },
    claim: { claimId: `claim_${domain}_${suffix}`, entityId: `entity_${domain}_${suffix}`, statement: "候选存在", sourceRefs: [`source_${domain}_${suffix}`] },
  });
  const researchProvider = {
    status: "configured",
    async research({ domains }) {
      calls.push(domains);
      const byDomain = { play: [], food: [], stay: [], transport: [] };
      for (const domain of domains) byDomain[domain] = [makeCandidate(domain, String(calls.length))];
      return { status: "completed", provider: "provider_fixture", providerLabel: "Fixture", checkedAt, byDomain, partial: false, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false };
    },
  };
  const service = new TravelService({ store: new TripStore({ rootDir }), clock, researchProvider });
  await service.createTrip({ tripId: "trip_domain_refresh", brief: { destination: "大理", dates: "2026-09-15" } });

  const first = await service.researchTripOptions({ tripId: "trip_domain_refresh", domains: ["stay", "transport"], question: "找住宿和交通" });
  const second = await service.researchTripOptions({ tripId: "trip_domain_refresh", domains: ["food"], question: "找本地菜" });
  const third = await service.researchTripOptions({ tripId: "trip_domain_refresh", domains: ["transport"], question: "改为找机票" });

  assert.equal(first.status, "proposed");
  assert.equal(second.status, "proposed");
  assert.equal(third.status, "proposed");
  assert.equal(second.reusedPendingProposal, undefined);
  assert.equal(third.reusedPendingProposal, undefined);
  assert.deepEqual(calls, [["stay", "transport"], ["food"], ["transport"]]);
  assert.equal(second.proposal.byDomain.food.length, 1);
});

test("changed research criteria supersede the affected candidate while identical criteria reuse it", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-research-fingerprint-"));
  const checkedAt = "2026-08-26T08:00:00.000Z";
  const calls = [];
  const provider = {
    status: "configured",
    async research({ criteria }) {
      const area = criteria.byDomain.stay.targetAreas[0];
      calls.push({ area, fingerprint: criteria.domainFingerprints.stay });
      const suffix = String(calls.length);
      const sourceId = `fixture:stay_${suffix}`;
      const entityId = `entity_stay_${suffix}`;
      const claimId = `claim_stay_${suffix}`;
      const stay = {
        candidateId: `stay_${suffix}`,
        domain: "stay",
        title: `${area}旅行酒店`,
        summary: `${area}真实候选`,
        location: { address: `${area}附近` },
        sourceId,
        entityId,
        claimId,
        checkedAt,
        operability: { provider: "provider_fixture", inventoryVerified: true, roomName: "双床房" },
        source: { sourceId, provider: "provider_fixture", sourceType: "official_provider", providerPoiId: `stay_${suffix}`, checkedAt, documentationUrl: "https://example.com/provider", independenceGroup: sourceId, commercialBias: "unknown" },
        entity: { entityId, kind: "place", canonicalName: `${area}旅行酒店`, providerRefs: [sourceId] },
        claim: { claimId, entityId, statement: "住宿候选存在", sourceRefs: [sourceId] },
      };
      return { status: "completed", provider: "provider_fixture", providerLabel: "Fixture", checkedAt, byDomain: { play: [], food: [], stay: [stay], transport: [] }, partial: true, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false };
    },
  };
  const service = new TravelService({ store: new TripStore({ rootDir }), clock, researchProvider: provider });
  await service.createTrip({ tripId: "trip_fingerprint", brief: { destination: "上海", dates: "2026-08-27 至 2026-08-29" } });

  const first = await service.researchTripOptions({ tripId: "trip_fingerprint", domains: ["stay"], criteria: { byDomain: { stay: { targetAreas: ["人民广场"] } } }, question: "住人民广场" });
  const second = await service.researchTripOptions({ tripId: "trip_fingerprint", domains: ["stay"], criteria: { byDomain: { stay: { targetAreas: ["南京东路"] } } }, question: "改住南京东路" });
  const third = await service.researchTripOptions({ tripId: "trip_fingerprint", domains: ["stay"], criteria: { byDomain: { stay: { targetAreas: ["南京东路"] } } }, question: "还是南京东路" });

  assert.equal(first.status, "proposed");
  assert.equal(second.status, "proposed");
  assert.equal(third.reusedPendingProposal, true);
  assert.equal(calls.length, 2);
  const plan = await service.getTripPlanView("trip_fingerprint");
  assert.deepEqual(plan.pendingProposals[0].byDomain.stay.map((item) => item.title), ["南京东路旅行酒店"]);
  assert.equal(plan.pendingProposals[0].byDomain.stay[0].operability.planningWindow.label, "第 1 天 16:00–18:00 · 抵达后入住");
  const stored = JSON.parse(await readFile(join(rootDir, "trip_fingerprint.json"), "utf8"));
  assert.equal(stored.pendingProposals.length, 1);
  assert.equal(stored.proposalHistory.at(-1).status, "superseded_by_research_criteria");
  assert.equal(stored.pendingProposals[0].researchCriteria.byDomain.stay.targetAreas[0], "南京东路");
});

test("a failed targeted refresh removes stale matches but keeps unaffected domain candidates", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-research-partial-refresh-"));
  const checkedAt = "2026-08-26T08:00:00.000Z";
  const makeCandidate = (domain) => {
    const sourceId = `fixture:${domain}`;
    const entityId = `entity_${domain}`;
    const claimId = `claim_${domain}`;
    return {
      candidateId: `${domain}_candidate`, domain, title: domain === "stay" ? "人民广场酒店" : "本帮菜馆", summary: "已核验候选", checkedAt, sourceId, entityId, claimId,
      location: { address: domain === "stay" ? "人民广场附近" : "南京东路附近" },
      operability: { provider: "provider_fixture", ...(domain === "stay" ? { inventoryVerified: true } : {}) },
      source: { sourceId, provider: "provider_fixture", sourceType: "official_provider", providerPoiId: domain, checkedAt, documentationUrl: "https://example.com/provider", independenceGroup: sourceId, commercialBias: "unknown" },
      entity: { entityId, kind: "place", canonicalName: domain, providerRefs: [sourceId] },
      claim: { claimId, entityId, statement: "候选存在", sourceRefs: [sourceId] },
    };
  };
  let fail = false;
  const provider = {
    status: "configured",
    research: async () => fail
      ? ({ status: "EMPTY_VERIFIED", provider: "provider_fixture", fabricatedResults: false })
      : ({ status: "completed", provider: "provider_fixture", providerLabel: "Fixture", checkedAt, byDomain: { play: [], food: [makeCandidate("food")], stay: [makeCandidate("stay")], transport: [] }, partial: true, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false }),
  };
  const service = new TravelService({ store: new TripStore({ rootDir }), clock, researchProvider: provider });
  await service.createTrip({ tripId: "trip_partial_refresh", brief: { destination: "上海", dates: "2026-08-27 至 2026-08-29" } });
  await service.researchTripOptions({ tripId: "trip_partial_refresh", domains: ["stay", "food"], criteria: { byDomain: { stay: { targetAreas: ["人民广场"] } } } });
  fail = true;

  const refreshed = await service.researchTripOptions({ tripId: "trip_partial_refresh", domains: ["stay"], criteria: { byDomain: { stay: { targetAreas: ["南京东路"] } } } });
  const plan = await service.getTripPlanView("trip_partial_refresh");

  assert.equal(refreshed.status, "EMPTY_VERIFIED");
  assert.equal(refreshed.staleProposalRemoved, true);
  assert.equal(plan.pendingProposals.length, 1);
  assert.equal(plan.pendingProposals[0].byDomain.stay.length, 0);
  assert.equal(plan.pendingProposals[0].byDomain.food[0].title, "本帮菜馆");
});

test("user-confirmed arrival plus a stay-only acceptance preserves other choices and enables the airport transfer", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-partial-stay-arrival-"));
  const checkedAt = "2026-08-26T10:00:00.000Z";
  const candidate = (domain, id, title, extra = {}) => {
    const sourceId = `fixture:${id}`;
    const entityId = `entity_${id}`;
    const claimId = `claim_${id}`;
    return {
      candidateId: id, domain, title, summary: `${title} 已核验`, checkedAt, sourceId, entityId, claimId,
      location: extra.location ?? null,
      operability: { provider: "provider_fixture", ...(extra.operability ?? {}) },
      source: { sourceId, provider: "provider_fixture", sourceType: "official_provider", providerPoiId: id, checkedAt, documentationUrl: "https://example.com/provider", independenceGroup: sourceId, commercialBias: "unknown" },
      entity: { entityId, kind: domain === "transport" ? "transport_offer" : "place", canonicalName: title, providerRefs: [sourceId] },
      claim: { claimId, entityId, statement: `${title} 存在`, sourceRefs: [sourceId] },
    };
  };
  const byDomain = {
    play: [candidate("play", "play_bund", "外滩", { location: { address: "中山东一路", coordinates: { longitude: 121.49, latitude: 31.24 } } })],
    food: [
      candidate("food", "food_local", "本帮菜馆", { location: { address: "南京东路", coordinates: { longitude: 121.48, latitude: 31.235 } } }),
      candidate("food", "food_alt", "另一家本帮菜", { location: { address: "人民广场", coordinates: { longitude: 121.475, latitude: 31.232 } } }),
    ],
    stay: [candidate("stay", "stay_ji", "全季酒店（上海人民广场南京路步行街店）", { location: { address: "福建中路225号" }, operability: { inventoryVerified: true, roomName: "双床房" } })],
    transport: [candidate("transport", "flight_compare", "库存航班对照", { operability: { mobilityRole: "intercity_inventory", transportType: "FLIGHT", serviceNumber: "DYNAMIC", arrivalPlace: { kind: "airport", city: "上海", label: "浦东国际机场", terminal: "T2" } } })],
  };
  const researchProvider = {
    status: "configured",
    research: async () => ({ status: "completed", provider: "provider_fixture", providerLabel: "Fixture", checkedAt, byDomain, partial: false, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false }),
    planMobility: async ({ selectedNodes }) => {
      const arrival = selectedNodes.find((node) => node.operability?.mobilityRole === "user_confirmed_arrival");
      const stay = selectedNodes.find((node) => node.domain === "stay");
      assert.ok(arrival, "mobility must use the user-confirmed arrival rather than inventory");
      assert.equal(stay?.title, "全季酒店（上海人民广场南京路步行街店）");
      return {
        schemaVersion: "trip-mobility-v1", status: "completed", destination: "上海", source: "amap_routes_v5", checkedAt, freshUntil: "2026-08-26T13:00:00.000Z",
        coverage: { routedNodeIds: [arrival.nodeId, stay.nodeId], unresolvedNodeIds: [], unscheduled: false },
        legs: [{
          legId: "arrival_to_stay", origin: { nodeId: arrival.nodeId, label: "浦东机场 T2", coordinates: { longitude: 121.8079, latitude: 31.1528 } }, destination: { nodeId: stay.nodeId, label: stay.title, coordinates: { longitude: 121.4804, latitude: 31.2382 } }, recommendedMode: "taxi",
          rationale: "公交步行 1128 米，超过当前 600 米目标；公交需换乘 2 次，超过当前 1 次目标。打车约 52 分钟、步行 0 米、换乘 0 次，因此优先打车。电梯与连续无台阶状态仍待核验；该未知项不是本次推荐打车的直接触发条件。",
          recommendationAudit: { thresholds: { walkingMeters: 600, transfers: 1, walkingSource: "traveler_explicit", transferSource: "reduced_mobility_default" }, transit: { totalMinutes: 163, walkingMeters: 1128, transfers: 2, estimatedFareCny: 26, walkingExceeded: true, transfersExceeded: true, hasStairs: false, hasEscalator: true, stepFreeContinuity: "not_verified" }, taxi: { totalMinutes: 52, walkingMeters: 0, transfers: 0, estimatedFareCny: 151 }, triggers: ["transit_walking_exceeds_target", "transit_transfers_exceed_target"], accessibilityEvidence: { status: "not_verified", directTrigger: false } },
          alternatives: [{ mode: "transit", totalMinutes: 163, distanceMeters: 40_000, walkingMeters: 1128, transfers: 2, estimatedFareCny: 26, scheduleBasis: "scheduled_service", realTimeArrival: false, navigationUrl: "https://uri.amap.com/navigation?mode=bus", polyline: [], steps: [], accessibilityFeatures: [], accessibilityAssessment: { hasStairs: false, hasElevator: false, hasEscalator: true, hasRamp: false, stepFreeContinuity: "not_verified", realTimeStatus: false } }, { mode: "taxi", totalMinutes: 52, distanceMeters: 47_000, walkingMeters: 0, transfers: 0, estimatedFareCny: 151, scheduleBasis: "query_time_estimate", realTimeArrival: false, navigationUrl: "https://uri.amap.com/navigation?mode=car", polyline: [], steps: [], accessibilityFeatures: [], accessibilityAssessment: { hasStairs: false, hasElevator: false, hasEscalator: false, hasRamp: false, stepFreeContinuity: "not_verified", realTimeStatus: false } }],
        }],
        travelerFit: { constrainedTravelerIds: ["traveler_2"], maxContinuousWalkMeters: 600, maxTransfers: null, planningWalkingTarget: 600, planningTransferTarget: 1, walkingTargetSource: "traveler_explicit", transferTargetSource: "reduced_mobility_default", avoidStairs: true, accessibilityEvidence: "unverified" },
        reason: null, caveats: [], sourceDocumentation: "https://lbs.amap.com/api/webservice/guide/api/newroute", fabricatedResults: false,
      };
    },
  };
  const service = new TravelService({ store: new TripStore({ rootDir }), clock, researchProvider });
  await service.createTrip({ tripId: "trip_partial_stay", brief: { destination: "上海", origin: "广州", dates: "2026-08-27 至 2026-08-29", lodgingPreference: "人民广场或南京东路", totalBudget: 8_000 }, travelers: [{ travelerId: "traveler_1", displayName: "你" }, { travelerId: "traveler_2", displayName: "父亲", careNeeds: { mobility: { maxContinuousWalkMeters: 600, avoidStairs: true } } }, { travelerId: "traveler_3", displayName: "母亲" }] });
  await service.researchTripOptions({ tripId: "trip_partial_stay", domains: ["play", "food", "stay", "transport"], question: "先给候选，不替我确认" });

  const arrival = await service.confirmUserArrival({ tripId: "trip_partial_stay", airport: "浦东机场", terminal: "T2", time: "14:00", intercityBooked: true, explicitUserConfirmation: true });
  assert.equal(arrival.status, "committed");
  assert.equal(arrival.arrival.airport, "上海浦东国际机场");
  assert.match(arrival.selectedNode.title, /上海浦东国际机场 T2/);
  let plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.byDomain.transport.filter((node) => node.selected).length, 1);
  assert.equal(plan.byDomain.transport.find((node) => node.selected).operability.mobilityRole, "user_confirmed_arrival");
  assert.equal(plan.pendingProposals[0].byDomain.transport.length, 0, "inventory transport must not remain a confirmation requirement");
  assert.equal(plan.pendingProposals[0].byDomain.play.length, 1);
  assert.equal(plan.pendingProposals[0].byDomain.food.length, 2);
  assert.equal(plan.pendingProposals[0].byDomain.stay.length, 1);
  await service.researchTripOptions({ tripId: "trip_partial_stay", domains: ["play", "food", "stay", "transport"], question: "重新核验尚未确认的候选" });
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.pendingProposals[0].byDomain.transport.length, 0, "confirmed booked arrival must not return as another transport decision");
  const preview = await service.previewTripMobility({ tripId: "trip_partial_stay", baseRevision: plan.revision, selections: { stay: plan.pendingProposals[0].byDomain.stay[0].nodeId, food: plan.pendingProposals[0].byDomain.food[0].nodeId, play: plan.pendingProposals[0].byDomain.play[0].nodeId } });
  assert.equal(preview.committed, false);
  assert.equal(preview.impact.stopCount, 4);
  assert.deepEqual(preview.selectedNodes.map((node) => node.domain).sort(), ["food", "play", "stay", "transport"]);
  let unchangedPlan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(unchangedPlan.byDomain.stay.some((node) => node.selected), false, "route preview must not commit tentative choices");
  assert.equal(unchangedPlan.mobility, null, "route preview must not persist a Mobility observation");

  const stayNodeId = plan.pendingProposals[0].byDomain.stay[0].nodeId;
  const accepted = await service.acceptTripChange({ tripId: "trip_partial_stay", proposalId: plan.pendingProposals[0].proposalId, selections: { stay: stayNodeId }, partial: true });
  assert.equal(accepted.status, "committed");
  assert.deepEqual(accepted.openDomains.sort(), ["food", "play"]);
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.byDomain.stay.find((node) => node.selected).title, "全季酒店（上海人民广场南京路步行街店）");
  assert.equal(plan.pendingProposals[0].byDomain.stay.length, 0);
  assert.equal(plan.pendingProposals[0].byDomain.play.length, 1);
  assert.equal(plan.pendingProposals[0].byDomain.food.length, 2);

  const mobility = await service.refreshTripMobility({ tripId: "trip_partial_stay" });
  assert.equal(mobility.status, "completed");
  assert.equal(mobility.mobility.legs[0].origin.label, "浦东机场 T2");
  assert.equal(mobility.mobility.legs[0].destination.nodeId, stayNodeId);
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.pendingProposals[0].baseRevision, plan.revision, "mobility updates must keep unaffected pending choices committable");
  const correctedArrival = await service.confirmUserArrival({ tripId: "trip_partial_stay", airport: "上海浦东国际机场", terminal: "T2", time: "14:00", intercityBooked: true, explicitUserConfirmation: true });
  assert.equal(correctedArrival.status, "committed", "updating an existing arrival must not make the strict Mobility contract invalid");
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.mobility.status, "needs_context");
  assert.equal(plan.mobility.reason, "selected_places_changed");
  await service.refreshTripMobility({ tripId: "trip_partial_stay" });
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.pendingProposals[0].baseRevision, plan.revision);

  const firstFoodId = plan.pendingProposals[0].byDomain.food[0].nodeId;
  const secondFoodId = plan.pendingProposals[0].byDomain.food[1].nodeId;
  const firstFood = await service.acceptTripChange({ tripId: "trip_partial_stay", proposalId: plan.pendingProposals[0].proposalId, selections: { food: firstFoodId }, partial: true });
  assert.equal(firstFood.status, "committed");
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.byDomain.food.find((node) => node.selected)?.nodeId, firstFoodId);
  assert.deepEqual(plan.pendingProposals[0].byDomain.food.map((node) => node.nodeId), [secondFoodId], "unchosen food should remain available as a quick replacement");
  assert.equal(plan.pendingProposals[0].byDomain.play.length, 1, "an unrelated pending choice must survive a food confirmation");

  const replacedFood = await service.acceptTripChange({ tripId: "trip_partial_stay", proposalId: plan.pendingProposals[0].proposalId, selections: { food: secondFoodId }, partial: true });
  assert.equal(replacedFood.status, "committed");
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.byDomain.food.find((node) => node.nodeId === firstFoodId)?.selected, false);
  assert.equal(plan.byDomain.food.find((node) => node.nodeId === firstFoodId)?.status, "rejected");
  assert.equal(plan.byDomain.food.find((node) => node.selected)?.nodeId, secondFoodId, "replacement should select exactly the new food option");
  assert.equal(plan.pendingProposals[0].byDomain.food[0].nodeId, firstFoodId, "the previous choice should remain available as an undoable replacement");
  assert.equal(plan.pendingProposals[0].byDomain.play.length, 1);

  const restoredFood = await service.acceptTripChange({ tripId: "trip_partial_stay", proposalId: plan.pendingProposals[0].proposalId, selections: { food: firstFoodId }, partial: true });
  assert.equal(restoredFood.status, "committed");
  plan = await service.getTripPlanView("trip_partial_stay");
  assert.equal(plan.byDomain.food.find((node) => node.selected)?.nodeId, firstFoodId);
  assert.equal(plan.pendingProposals[0].byDomain.food[0].nodeId, secondFoodId);
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
    additionalEvidence: [{
      sourceId: "tuniu:g1",
      claimId: "claim_tuniu_g1",
      entityId: "entity_tuniu_g1",
      source: { provider: "tuniu_official_mcp", sourceType: "official_ota_inventory", providerPoiId: "g1", checkedAt, documentationUrl: "https://open.tuniu.com/mcp/docs/", independenceGroup: "tuniu:g1", commercialBias: "commercial_inventory" },
      entity: { entityId: "entity_tuniu_g1", kind: "transport_offer", canonicalName: "G1", providerRefs: ["tuniu:g1"] },
      claim: { claimId: "claim_tuniu_g1", entityId: "entity_tuniu_g1", statement: "途牛返回同一班次", sourceRefs: ["tuniu:g1"] },
    }],
  };
  const service = new TravelService({
    store: new TripStore({ rootDir }),
    clock,
    researchProvider: { status: "configured", research: async () => ({ status: "completed", provider: "fliggy_flyai", providerLabel: "飞猪 AI 开放平台", checkedAt, byDomain: { play: [], food: [], stay: [], transport: [transport] }, partial: true, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false }) },
  });
  await service.createTrip({ tripId: "trip_transport_semantics", brief: { destination: "上海", origin: "广州" } });
  const research = await service.researchTripOptions({ tripId: "trip_transport_semantics", domains: ["transport"] });
  const plan = await service.getTripPlanView("trip_transport_semantics");
  assert.equal(plan.pendingProposals[0].byDomain.transport[0].operability.routeVerified, true);
  assert.equal(plan.pendingProposals[0].byDomain.transport[0].operability.mobilityRole, "intercity_inventory");
  assert.deepEqual(plan.pendingProposals[0].byDomain.transport[0].sourceRefs.sort(), ["flyai:g1", "tuniu:g1"]);
  assert.equal(research.status, "proposed");
  const stored = JSON.parse(await readFile(join(rootDir, "trip_transport_semantics.json"), "utf8"));
  assert.equal(stored.pendingProposals[0].evidenceBundle.contentItems.length, 2);
  assert.equal(stored.pendingProposals[0].evidenceBundle.claims.length, 2);
});

test("a bounded intercity comparison keeps all relevant flight and rail options when the traveler did not choose a mode", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-transport-balance-"));
  const checkedAt = "2026-08-13T12:00:00.000Z";
  const makeTransport = (type, number, cost) => {
    const sourceId = `provider:${number}`;
    const entityId = `entity_${number}`;
    const claimId = `claim_${number}`;
    return {
      candidateId: `transport_${number}`,
      domain: "transport",
      title: `${number} 广州 → 大理`,
      summary: "真实班次候选",
      cost,
      sourceId,
      claimId,
      entityId,
      checkedAt,
      operability: { transportType: type, serviceNumber: number, mobilityRole: "intercity_inventory", routeVerified: true, scheduleVerified: true },
      source: { provider: "provider_fixture", sourceType: "official_ota_inventory", providerPoiId: number, checkedAt, documentationUrl: "https://example.com/provider", independenceGroup: sourceId, commercialBias: "commercial_inventory" },
      entity: { entityId, kind: "transport_offer", canonicalName: number, providerRefs: [sourceId] },
      claim: { claimId, entityId, statement: "班次存在", sourceRefs: [sourceId] },
    };
  };
  const candidates = [makeTransport("FLIGHT", "CZ1", 800), makeTransport("FLIGHT", "MU2", 900), makeTransport("FLIGHT", "MU3", 1000), makeTransport("TRAIN", "D1", 420), makeTransport("TRAIN", "D2", 680)];
  const service = new TravelService({
    store: new TripStore({ rootDir }),
    clock,
    researchProvider: { status: "configured", research: async () => ({ status: "completed", provider: "provider_fixture", providerLabel: "Fixture", checkedAt, byDomain: { play: [], food: [], stay: [], transport: candidates }, partial: true, weather: { status: "SOURCE_UNAVAILABLE" }, caveats: [], fabricatedResults: false }) },
  });
  await service.createTrip({ tripId: "trip_transport_balance", brief: { destination: "大理", origin: "广州", dates: "2026-09-20 至 2026-09-24" } });

  const research = await service.researchTripOptions({ tripId: "trip_transport_balance", domains: ["transport"], question: "帮我安排合适的交通工具" });

  assert.equal(research.status, "proposed");
  assert.equal(research.proposal.byDomain.transport.length, 5);
  assert.deepEqual([...new Set(research.proposal.byDomain.transport.map((item) => item.operability.transportType))].sort(), ["FLIGHT", "TRAIN"]);
});

test("AMap transport-facility POIs never substitute for missing flexible intercity inventory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-no-station-inventory-substitute-"));
  const checkedAt = "2026-08-13T12:00:00.000Z";
  const station = {
    candidateId: "transport_dali_station",
    domain: "transport",
    title: "大理站(出站口)",
    summary: "地图交通设施",
    sourceId: "amap:dali_station",
    claimId: "claim_dali_station",
    entityId: "entity_dali_station",
    checkedAt,
    operability: { provider: "amap_web_service", mobilityRole: "transport_facility_poi", type: "交通设施服务;火车站" },
    source: { provider: "amap_web_service", sourceType: "official_map_provider", providerPoiId: "dali_station", checkedAt, documentationUrl: "https://lbs.amap.com/", independenceGroup: "amap:dali_station", commercialBias: "provider_ranking_unknown" },
    entity: { entityId: "entity_dali_station", kind: "transport_facility", canonicalName: "大理站", providerRefs: ["amap:dali_station"] },
    claim: { claimId: "claim_dali_station", entityId: "entity_dali_station", statement: "车站存在", sourceRefs: ["amap:dali_station"] },
  };
  const service = new TravelService({ store: new TripStore({ rootDir }), clock, researchProvider: { status: "configured", research: async () => ({ status: "completed", provider: "amap_web_service", providerLabel: "高德地图", checkedAt, byDomain: { play: [], food: [], stay: [], transport: [station] }, partial: true, caveats: [], fabricatedResults: false, domainStatuses: { transport: { status: "partial", count: 0, providers: [{ provider: "amap_web_service", status: "completed_nonempty", count: 1, checkedAt }] } } }) } });
  await service.createTrip({ tripId: "trip_no_station_substitute", brief: { destination: "大理", origin: "广州", dates: "2026-09-20 至 2026-09-24", arrivalMode: "飞机或高铁" } });

  const research = await service.researchTripOptions({ tripId: "trip_no_station_substitute", domains: ["transport"], question: "飞机和高铁都可以，比较城际库存" });

  assert.equal(research.status, "EMPTY_VERIFIED");
  assert.equal((await service.getTripPlanView("trip_no_station_substitute")).pendingProposals.length, 0);
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

test("shares only structured trip-linked visit evidence with a later traveler", async () => {
  const { service } = await serviceFixture();
  await service.createTrip({ tripId: "trip_feedback_author" });
  await service.proposeTripChange({ tripId: "trip_feedback_author", proposal: fourDomainProposal("trip_feedback_author") });
  await service.acceptTripChange({ tripId: "trip_feedback_author", proposalId: "proposal_initial_plan" });
  await service.proposeTripChange({ tripId: "trip_feedback_author", proposal: selectionProposal("trip_feedback_author", 1) });
  await service.acceptTripChange({ tripId: "trip_feedback_author", proposalId: "proposal_select_plan" });

  const experience = await service.submitTripFeedback({
    tripId: "trip_feedback_author",
    baseRevision: 2,
    category: "personal_experience",
    nodeId: "food_dinner",
    text: "本地菜很有特色，周末午餐等了二十五分钟。",
    visibility: "anonymous_travelers",
    verdict: "recommend",
    tags: ["local_character", "low_queue"],
    spendCny: 86,
    waitMinutes: 25,
  });
  assert.equal(experience.status, "committed");
  const correction = await service.submitTripFeedback({
    tripId: "trip_feedback_author",
    baseRevision: 3,
    category: "fact_correction",
    nodeId: "food_dinner",
    text: "原入口正在施工，建议重新核验。",
    visibility: "anonymous_travelers",
  });
  assert.equal(correction.status, "committed");

  await service.createTrip({ tripId: "trip_feedback_reader" });
  await service.proposeTripChange({ tripId: "trip_feedback_reader", proposal: fourDomainProposal("trip_feedback_reader") });
  const readerPlan = await service.getTripPlanView("trip_feedback_reader");
  const summary = readerPlan.pendingProposals[0].byDomain.food[0].visitFeedback;
  assert.equal(summary.experienceCount, 1);
  assert.deepEqual(summary.recommendation, { recommend: 1, mixed: 0, notRecommend: 0 });
  assert.deepEqual(summary.topTags, [{ key: "local_character", count: 1 }, { key: "low_queue", count: 1 }]);
  assert.equal(summary.typicalSpendCny, 86);
  assert.equal(summary.typicalWaitMinutes, 25);
  assert.equal(summary.pendingFactCheckCount, 1);
  assert.doesNotMatch(JSON.stringify(summary), /本地菜很有特色|原入口正在施工/);
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
