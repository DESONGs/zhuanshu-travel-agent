import assert from "node:assert/strict";
import test from "node:test";
import {
  addDecisionEdge,
  addDecisionNode,
  addEvidenceClaim,
  applyWeatherObservation,
  buildTravelContextPack,
  commitTripPatch,
  createTripControlState,
  estimateTripBudget,
  recordOfferSnapshot,
  updateTripControlScope,
  updateTripReadiness,
  validateTripCoherence,
} from "../src/core/index.ts";

const clock = () => new Date("2026-08-13T08:00:00.000Z");

test("updates only explicitly understood trip facts and keeps omitted facts", () => {
  const state = createTripControlState({
    tripId: "trip_scope",
    brief: { destination: "大理", durationDays: 5, pace: "轻松", currency: "CNY" },
    travelers: [{ travelerId: "traveler_1", language: "zh-CN" }, { travelerId: "traveler_2", language: "zh-CN" }, { travelerId: "traveler_3", language: "zh-CN" }],
    clock,
  });
  const updated = updateTripControlScope(state, { brief: { origin: "广州", arrivalMode: "飞机", lodgingPreference: "位置由旅行助手设计" } }, { clock });
  assert.equal(updated.brief.destination, "大理");
  assert.equal(updated.brief.durationDays, 5);
  assert.equal(updated.brief.origin, "广州");
  assert.equal(updated.brief.arrivalMode, "飞机");
  assert.equal(updated.travelers.length, 3);
  assert.equal(updated.revision, 1);
  assert.equal(state.brief.origin, undefined);
});

test("keeps source price quality while deterministically estimating the whole-trip budget", () => {
  let state = createTripControlState({
    tripId: "trip_budget_v2",
    brief: { dates: "2026-09-01 至 2026-09-03", totalBudget: 8_000, currency: "CNY" },
    travelers: [{ travelerId: "traveler_1" }, { travelerId: "traveler_2" }, { travelerId: "traveler_3" }],
    clock,
  });
  state = addDecisionNode(state, {
    nodeId: "stay_offer",
    domain: "stay",
    selected: true,
    price: { amount: 500, currency: "CNY", quality: "firm", basis: "per_night_room", checkedAt: "2026-08-29T08:00:00.000Z" },
  }, { clock });
  state.pendingProposals.push({
    schemaVersion: "trip-patch-proposal-v1",
    proposalId: "proposal_food_budget",
    tripId: state.tripId,
    baseRevision: state.revision,
    writeSet: ["food_reference"],
    writeContract: { allowedNodeIds: ["food_reference"] },
    readSet: [],
    operations: [{
      kind: "add_candidate",
      nodeId: "food_reference",
      node: { nodeId: "food_reference", domain: "food", price: { amount: 80, currency: "CNY", quality: "reference", basis: "per_person_reference" } },
    }],
  });

  const budget = estimateTripBudget(state);
  assert.equal(budget.domains.stay.committed, 2_000, "two nights and two rooms are explicit in the estimate basis");
  assert.equal(budget.domains.stay.quality, "estimate", "multiplying a firm nightly quote must remain visibly estimated");
  assert.equal(budget.domains.food.estimated, 1_440);
  assert.match(budget.domains.food.basis[0], /3 人 × 3 天/);
  assert.equal(budget.domains.transport.quality, "unknown");
  assert.equal(budget.estimated, 3_440);
  assert.equal(budget.exceedsBudget, false);
});

test("updates preparation signals without invalidating a pending travel decision", () => {
  const state = createTripControlState({ tripId: "trip_readiness", brief: { destination: "上海" }, clock });
  state.pendingProposals.push({
    schemaVersion: "trip-patch-proposal-v1",
    proposalId: "proposal_readiness",
    tripId: state.tripId,
    baseRevision: state.revision,
    readSet: [],
    writeSet: ["stay_readiness"],
    writeContract: { allowedNodeIds: ["stay_readiness"] },
    operations: [{ kind: "add_candidate", nodeId: "stay_readiness", node: { nodeId: "stay_readiness", domain: "stay", title: "待比较住宿" } }],
  });

  const updated = updateTripReadiness(state, { signalId: "mobile_access", status: "ready" }, { clock });

  assert.equal(updated.revision, state.revision);
  assert.equal(updated.readiness.version, 1);
  assert.equal(updated.readiness.signals.mobile_access, "ready");
  assert.equal(updated.pendingProposals[0].proposalId, "proposal_readiness");
  assert.equal(updated.changeJournal.at(-1).event, "trip_readiness_updated");
});

test("normalizes common Chinese date ranges before weather research", () => {
  const state = createTripControlState({
    tripId: "trip_dates",
    brief: { destination: "上海", dates: "2026年8月20日至23日" },
    clock,
  });
  assert.equal(state.brief.dates, "2026-08-20 至 2026-08-23");
  const inferredYear = updateTripControlScope(state, { brief: { dates: "12月30日至1月2日" } }, { clock });
  assert.equal(inferredYear.brief.dates, "2026-12-30 至 2027-01-02");
  const nextOccurrence = updateTripControlScope(inferredYear, { brief: { dates: "3月1日至3月3日" } }, { clock });
  assert.equal(nextOccurrence.brief.dates, "2027-03-01 至 2027-03-03");
  const explicitPast = updateTripControlScope(nextOccurrence, { brief: { dates: "2025年3月1日至3月3日" } }, { clock });
  assert.equal(explicitPast.brief.dates, "2025-03-01 至 2025-03-03");
  const startAndDuration = updateTripControlScope(explicitPast, { brief: { dates: "10月3日", durationDays: 5 } }, { clock });
  assert.equal(startAndDuration.brief.dates, "2026-10-03 至 2026-10-07");
  const fuzzy = updateTripControlScope(inferredYear, { brief: { dates: "国庆五天" } }, { clock });
  assert.equal(fuzzy.brief.dates, "国庆五天");
});

test("binds humane travel needs to one traveler and invalidates only mobility when those needs change", () => {
  const state = createTripControlState({
    tripId: "trip_traveler_care",
    brief: { destination: "上海", dates: "2026-10-03 至 2026-10-05", totalBudget: 10_000, pace: "轻松" },
    travelers: [
      { travelerId: "traveler_self", displayName: "你", relationship: "本人" },
      { travelerId: "traveler_father", displayName: "父亲", relationship: "父亲" },
      { travelerId: "traveler_mother", displayName: "母亲", relationship: "母亲" },
    ],
    clock,
  });
  state.environment.weather = { status: "completed", destination: "上海" };
  state.environment.mobility = { status: "completed", legs: [{ legId: "old" }] };

  const updated = updateTripControlScope(state, {
    travelerProfiles: [{
      travelerId: "traveler_father",
      displayName: "父亲",
      relationship: "父亲",
      careNeeds: {
        mobility: { maxContinuousWalkMeters: 800, maxTransfers: 1, avoidStairs: true },
        stamina: { needsFrequentRest: true, restEveryMinutes: 60 },
        facilities: { toiletAccessPriority: true },
      },
    }],
  }, { clock });

  assert.equal(updated.travelers[1].careNeeds.mobility.maxContinuousWalkMeters, 800);
  assert.equal(updated.travelers[1].careNeeds.stamina.restEveryMinutes, 60);
  assert.equal(updated.environment.weather.status, "completed", "traveler needs must not invalidate destination weather");
  assert.equal(updated.environment.mobility, null);
  assert.equal(updated.environment.mobilityInvalidatedBy, "traveler_needs_change");
  assert.deepEqual(updated.changeJournal.at(-1).environmentInvalidated, ["mobility"]);
});

test("traveler state accepts operational needs but rejects diagnosis-shaped fields", () => {
  assert.throws(() => createTripControlState({
    tripId: "trip_private_care",
    travelers: [{ travelerId: "traveler_1", displayName: "父亲", operability: { medicalDiagnosis: "不应保存" } }],
    clock,
  }), /private_care_detail_not_allowed/);
});

function fourDomainTrip({ inbound = false, selected = true } = {}) {
  let state = createTripControlState({
    tripId: "trip_demo",
    brief: { totalBudget: 5000, currency: "CNY" },
    travelers: [{
      travelerId: "traveler_1",
      language: inbound ? "en" : "zh-CN",
      hardConstraints: inbound ? [{ type: "foreign_guest_required" }] : [],
    }],
    clock,
  });
  const nodes = [
    { nodeId: "transport_arrival", domain: "transport", cost: 800, selected, operability: { routeVerified: true } },
    { nodeId: "stay_hotel", domain: "stay", cost: 1200, selected, foreignGuestEligible: inbound ? true : null, travelerIds: ["traveler_1"] },
    { nodeId: "play_garden", domain: "play", cost: 100, selected },
    { nodeId: "food_dinner", domain: "food", cost: 220, selected },
  ];
  for (const node of nodes) state = addDecisionNode(state, node, { clock });
  state = addDecisionEdge(state, { edgeId: "arrival_to_stay", fromNodeId: "transport_arrival", toNodeId: "stay_hotel", type: "enables" });
  state = addDecisionEdge(state, { edgeId: "stay_to_food", fromNodeId: "stay_hotel", toNodeId: "food_dinner", type: "nearby" });
  return state;
}

function proposalForStay(baseRevision = 0, changes = { cost: 1300 }) {
  return {
    schemaVersion: "trip-patch-proposal-v1",
    proposalId: `proposal_${baseRevision}`,
    tripId: "trip_demo",
    baseRevision,
    writeSet: ["stay_hotel"],
    writeContract: { allowedNodeIds: ["stay_hotel"] },
    readSet: [{ nodeId: "stay_hotel", version: 1 }],
    operations: [{ kind: "update", nodeId: "stay_hotel", changes }],
  };
}

test("builds a decision-scoped context pack with traveler and evidence slices", () => {
  let state = fourDomainTrip({ inbound: true });
  state = addEvidenceClaim(state, {
    claimId: "claim_queue",
    entityId: "entity_hotel",
    nodeId: "stay_hotel",
    statement: "Late check-in was reported by two independent visitors.",
    sourceRefs: ["content_1", "content_2"],
    sourceIndependence: "likely_independent",
    confidence: 0.7,
  }, { clock });

  const pack = buildTravelContextPack(state, {
    workUnitId: "verify_stay",
    targetNodeId: "stay_hotel",
    neighborhoodNodeIds: ["food_dinner"],
    successCriteria: ["foreign_guest_eligibility_verified"],
    clock,
  });

  assert.equal(pack.schemaVersion, "travel-context-pack-v2");
  assert.equal(pack.baseRevision, 0);
  assert.deepEqual(pack.decisionNeighborhood.nodeIds, ["stay_hotel", "food_dinner"]);
  assert.equal(pack.travelerSlice[0].language, "en");
  assert.equal(pack.evidenceBundle[0].claimId, "claim_queue");
  assert.equal(pack.readSet[0].nodeId, "stay_hotel");
  assert.equal(pack.contextHash.length, 64);
});

test("verified weather becomes shared context and dirties all linked task chains when it changes", () => {
  const state = fourDomainTrip({ inbound: true });
  const weather = {
    schemaVersion: "trip-weather-v1",
    status: "completed",
    provider: "amap_weather",
    destination: "大理",
    city: "大理市",
    adcode: "532901",
    checkedAt: "2026-08-13T08:00:00.000Z",
    coverage: "covered",
    tripDates: ["2026-08-13"],
    forecastDays: [{ date: "2026-08-13", dayCondition: "大雨", nightCondition: "中雨", highC: 24, lowC: 17, maxWindLevel: 5 }],
    riskSignals: ["precipitation", "strong_wind"],
    planningImpact: { active: true, severity: "high", affectedDomains: ["play", "food", "stay", "transport"], guidance: { play: "优先室内", food: "减少往返", stay: "靠近交通", transport: "增加缓冲" } },
    sourceDocumentation: "https://lbs.amap.com/api/webservice/guide/api/weatherinfo",
  };
  const updated = applyWeatherObservation(state, weather, { clock });
  assert.equal(updated.revision, 1);
  assert.equal(updated.environment.weather.planningImpact.severity, "high");
  assert.deepEqual(new Set(updated.dirtySet), new Set(["transport_arrival", "stay_hotel", "play_garden", "food_dinner"]));
  assert.equal(updated.taskQueues.play.length, 1);
  assert.equal(updated.taskQueues.food.length, 1);
  const pack = buildTravelContextPack(updated, { workUnitId: "weather_replan", targetNodeId: "play_garden", clock });
  assert.equal(pack.environmentSlice.weather.provider, "amap_weather");
});

test("changing destination or dates invalidates the previous WeatherEnvelope before new planning", () => {
  const state = applyWeatherObservation(createTripControlState({
    tripId: "trip_weather_scope",
    brief: { destination: "大理", dates: "2026-08-20 至 2026-08-22" },
    clock,
  }), {
    status: "completed",
    provider: "amap_weather",
    destination: "大理",
    checkedAt: "2026-08-13T08:00:00.000Z",
    coverage: "covered",
    tripDates: ["2026-08-20", "2026-08-21", "2026-08-22"],
    forecastDays: [{ date: "2026-08-20", dayCondition: "晴" }],
    planningImpact: { active: false, severity: "none", affectedDomains: [], guidance: {} },
  }, { clock });

  const updated = updateTripControlScope(state, { brief: { dates: "2026-08-23 至 2026-08-25" } }, { clock });

  assert.equal(updated.environment.weather, null);
  assert.equal(updated.environment.weatherInvalidatedBy, "trip_scope_change");
  assert.deepEqual(updated.changeJournal.at(-1).environmentInvalidated, ["weather", "mobility"]);
});

test("commits a proposal then replans only the impacted stay and food chains", () => {
  const state = fourDomainTrip({ inbound: true });
  const result = commitTripPatch(state, proposalForStay(), { clock });

  assert.equal(result.status, "committed");
  assert.equal(result.state.revision, 1);
  assert.equal(state.revision, 0, "commit must not mutate the caller state");
  assert.deepEqual(result.state.dirtySet, ["stay_hotel", "food_dinner"]);
  assert.equal(result.state.taskQueues.stay.length, 1);
  assert.equal(result.state.taskQueues.food.length, 1);
  assert.equal(result.state.taskQueues.play.length, 0);
  assert.equal(result.state.taskQueues.transport.length, 0);
  assert.equal(result.state.budgetLedger.committed, 2420);
  assert.equal(result.qa.status, "needs_fix");
  assert.equal(result.qa.operabilityGaps.some((gap) => gap.code === "city_mobility_unverified"), true);
});

test("rejects stale revision, locked mutation, out-of-contract operation, and stale offer", () => {
  const state = fourDomainTrip();
  const first = commitTripPatch(state, proposalForStay(), { clock });
  const stale = commitTripPatch(first.state, proposalForStay(0), { clock });
  assert.equal(stale.status, "needs_rebase");

  let locked = addDecisionNode(createTripControlState({ tripId: "trip_lock", clock }), {
    nodeId: "stay_locked", domain: "stay", lock: { kind: "user" }, selected: true,
  }, { clock });
  const lockedResult = commitTripPatch(locked, {
    schemaVersion: "trip-patch-proposal-v1", proposalId: "p_lock", tripId: "trip_lock", baseRevision: 0,
    writeSet: ["stay_locked"], writeContract: { allowedNodeIds: ["stay_locked"] }, readSet: [{ nodeId: "stay_locked", version: 1 }],
    operations: [{ kind: "update", nodeId: "stay_locked", changes: { cost: 2 } }],
  }, { clock });
  assert.equal(lockedResult.validation.reason, "locked_node_mutation_blocked");

  const contractResult = commitTripPatch(state, {
    ...proposalForStay(), proposalId: "p_contract", writeSet: ["stay_hotel"],
    operations: [{ kind: "update", nodeId: "food_dinner", changes: { cost: 1 } }],
  }, { clock });
  assert.equal(contractResult.validation.reason, "operation_outside_write_set");

  let offers = recordOfferSnapshot(state, {
    offerId: "offer_expired", nodeId: "stay_hotel", source: "fixture", expiresAt: "2026-08-12T00:00:00.000Z",
  }, { clock });
  const expired = commitTripPatch(offers, { ...proposalForStay(), proposalId: "p_expired", offerRefs: ["offer_expired"] }, { clock });
  assert.equal(expired.validation.reason, "offer_stale");
});

test("requires verified foreign-guest lodging instead of hiding inbound operability", () => {
  const state = fourDomainTrip({ inbound: true });
  const verifiedStay = validateTripCoherence(state);
  assert.equal(verifiedStay.status, "needs_fix", "city mobility remains independently required");
  assert.deepEqual(verifiedStay.hardConstraintViolations, []);

  const unverified = fourDomainTrip({ inbound: false });
  unverified.travelers[0].hardConstraints.push({ type: "foreign_guest_required" });
  const review = validateTripCoherence(unverified);
  assert.equal(review.status, "needs_fix");
  assert.deepEqual(review.hardConstraintViolations, [{ travelerId: "traveler_1", code: "foreign_guest_stay_unverified" }]);
});

test("coherence review keeps per-traveler walking and accessibility needs visible", () => {
  const state = fourDomainTrip();
  state.travelers[0].displayName = "父亲";
  state.travelers[0].careNeeds = {
    mobility: { maxContinuousWalkMeters: 800, maxTransfers: 1, avoidStairs: true },
    facilities: { accessibleToiletRequired: true },
  };
  state.environment.mobility = {
    status: "completed",
    checkedAt: "2026-08-13T08:00:00.000Z",
    travelerFit: { accessibilityEvidence: "unverified" },
    legs: [{
      recommendedMode: "transit",
      alternatives: [{ mode: "transit", walkingMeters: 960, transfers: 2, accessibilityAssessment: { hasStairs: true, stepFreeContinuity: "not_verified", realTimeStatus: false } }],
    }],
  };

  const review = validateTripCoherence(state);
  assert.equal(review.hardConstraintViolations.some((gap) => gap.travelerId === "traveler_1" && gap.code === "traveler_walk_limit_exceeded"), true);
  assert.equal(review.hardConstraintViolations.some((gap) => gap.travelerId === "traveler_1" && gap.code === "traveler_transfer_limit_exceeded"), true);
  assert.equal(review.hardConstraintViolations.some((gap) => gap.travelerId === "traveler_1" && gap.code === "traveler_stairs_route_conflict"), true);
  assert.equal(review.operabilityGaps.some((gap) => gap.travelerId === "traveler_1" && gap.code === "traveler_step_free_route_unverified"), true);
  assert.equal(review.operabilityGaps.some((gap) => gap.travelerId === "traveler_1" && gap.code === "traveler_accessible_toilet_unverified"), true);
});
