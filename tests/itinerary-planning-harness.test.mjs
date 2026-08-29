import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTravelAnalysisRunCoordinator } from "../src/agent/travel-analysis-run-coordinator.mjs";
import { TravelService } from "../src/api/travel-service.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

const clock = () => new Date("2026-08-30T08:00:00.000Z");

function candidateProposal(tripId) {
  const checkedAt = "2026-08-30T08:00:00.000Z";
  const nodes = [
    { nodeId: "arrival_pvg", domain: "transport", title: "上海浦东国际机场 T2", selected: false, sourceStatus: "verified", sourceRefs: ["amap:arrival"], operability: { mobilityRole: "intercity_inventory", transportType: "FLIGHT", arrivalAt: "2026-10-15T09:00:00+08:00", arrivalPlace: { label: "上海浦东国际机场 T2" }, checkedAt } },
    { nodeId: "stay_people_square", domain: "stay", title: "人民广场酒店", selected: false, sourceStatus: "verified", sourceRefs: ["amap:stay"], operability: { openWeek: "00:00-23:59", checkedAt } },
    { nodeId: "play_museum", domain: "play", title: "上海博物馆", selected: false, sourceStatus: "verified", sourceRefs: ["amap:play"], operability: { openWeek: "09:00-17:00", checkedAt } },
    { nodeId: "food_local", domain: "food", title: "本帮菜馆", selected: false, sourceStatus: "verified", sourceRefs: ["amap:food"], operability: { openWeek: "11:00-21:00", checkedAt } },
  ];
  return {
    schemaVersion: "trip-patch-proposal-v1", proposalId: "proposal_candidates", tripId, baseRevision: 0,
    writeSet: nodes.map((node) => node.nodeId), writeContract: { allowedNodeIds: nodes.map((node) => node.nodeId) }, readSet: [],
    operations: nodes.map((node) => ({ kind: "add_candidate", nodeId: node.nodeId, node })),
  };
}

function routeAlternative(mode, minutes, walkingMeters = 0, transfers = 0, fare = 0) {
  return { mode, totalMinutes: minutes, distanceMeters: 5_000, walkingMeters, transfers, estimatedFareCny: fare, scheduleBasis: "query_time_estimate", realTimeArrival: false, navigationUrl: null, polyline: [], steps: [], accessibilityFeatures: [], accessibilityAssessment: { hasStairs: false, hasElevator: false, hasEscalator: false, hasRamp: false, stepFreeContinuity: "not_verified", realTimeStatus: false } };
}

function providerFixture({ delayFirst = false } = {}) {
  let calls = 0;
  return {
    status: "configured",
    get calls() { return calls; },
    async planMobility({ itineraryStops, signal }) {
      calls += 1;
      if (delayFirst && calls === 1) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 80);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(Object.assign(new Error("cancelled"), { code: "SOURCE_UNAVAILABLE" })); }, { once: true });
      });
      const place = (stop) => ({ nodeId: stop.nodeId, stopId: stop.stopId, label: stop.title, coordinates: null, dayIndex: stop.dayIndex, date: stop.date, role: stop.role, startAt: stop.startAt, endAt: stop.endAt });
      const legs = itineraryStops.slice(0, -1).map((stop, index) => {
        const next = itineraryStops[index + 1];
        return { legId: `plan_leg_${index}`, origin: place(stop), destination: place(next), recommendedMode: "transit", rationale: "fixture", alternatives: [routeAlternative("transit", 30, 300, 1, 4), routeAlternative("taxi", 20, 0, 0, 35), routeAlternative("walk", 70, 5_000, 0, 0)] };
      });
      return { schemaVersion: "trip-mobility-v1", status: "completed", destination: "上海", source: "fixture", checkedAt: "2026-08-30T08:00:00.000Z", freshUntil: "2026-08-30T11:00:00.000Z", coverage: { routedNodeIds: [...new Set(itineraryStops.map((stop) => stop.nodeId))], unresolvedNodeIds: [], routedStopIds: itineraryStops.map((stop) => stop.stopId), unresolvedStopIds: [], unscheduled: false }, legs, travelerFit: { maxContinuousWalkMeters: 600, maxTransfers: 1, avoidStairs: true }, reason: null, caveats: [], sourceDocumentation: null, fabricatedResults: false };
    },
  };
}

function itineraryPlan({ runId = "planrun_fixture", attempt = 1, activityStart = "2026-10-15T11:00:00+08:00", activityFixed = false } = {}) {
  return {
    schemaVersion: "itinerary-plan-v1", runId, tripId: "trip_plan_harness", baseRevision: 0, attempt,
    objective: "上午抵达后先寄存行李，再参观、用餐和入住", priorities: ["保留抵达", "减少步行", "不超过一次换乘"], lockedNodeIds: [],
    fixedAnchors: [{ nodeId: "arrival_pvg", kind: "arrival", startAt: "2026-10-15T09:00:00+08:00", endAt: "2026-10-15T09:00:00+08:00" }],
    days: [{ dayIndex: 1, date: "2026-10-15", stops: [
      { nodeId: "arrival_pvg", role: "intercity_arrival", timeWindow: { startAt: "2026-10-15T09:00:00+08:00", endAt: "2026-10-15T09:00:00+08:00" }, durationMinutes: 0, fixed: true, preferredModes: ["taxi"], rationale: "保留已确认抵达" },
      { nodeId: "stay_people_square", role: "bag_drop", timeWindow: { startAt: "2026-10-15T10:00:00+08:00", endAt: "2026-10-15T10:15:00+08:00" }, durationMinutes: 15, fixed: false, preferredModes: ["taxi", "transit"], rationale: "先放下行李" },
      { nodeId: "play_museum", role: "activity", timeWindow: { startAt: activityStart, endAt: "2026-10-15T13:00:00+08:00" }, durationMinutes: 120, fixed: activityFixed, preferredModes: ["transit", "taxi"], rationale: "白天参观" },
      { nodeId: "food_local", role: "meal", timeWindow: { startAt: "2026-10-15T13:30:00+08:00", endAt: "2026-10-15T15:00:00+08:00" }, durationMinutes: 90, fixed: false, preferredModes: ["taxi", "walk"], rationale: "就近用餐" },
      { nodeId: "stay_people_square", role: "stay_check_in", timeWindow: { startAt: "2026-10-15T16:00:00+08:00", endAt: "2026-10-15T16:30:00+08:00" }, durationMinutes: 30, fixed: false, preferredModes: ["taxi", "transit"], rationale: "活动后正式入住" },
    ] }], assumptions: [], needsContext: [], evidenceRefs: ["amap:arrival", "amap:stay", "amap:play", "amap:food"],
  };
}

async function harnessFixture(options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), "itinerary-plan-harness-"));
  const provider = providerFixture(options);
  const service = new TravelService({ store: new TripStore({ rootDir }), clock, researchProvider: provider, planningRunCoordinator: createTravelAnalysisRunCoordinator() });
  await service.createTrip({ tripId: "trip_plan_harness", brief: { destination: "上海", dates: "2026-10-15 至 2026-10-17", totalBudget: 8_000 }, travelers: [{ travelerId: "traveler_1", displayName: "父亲", careNeeds: { mobility: { maxContinuousWalkMeters: 600, maxTransfers: 1, avoidStairs: true } } }] });
  await service.proposeTripChange({ tripId: "trip_plan_harness", proposal: candidateProposal("trip_plan_harness") });
  return { service, provider };
}

test("a model plan becomes one reversible Trial and confirmation reuses it with selected route modes", async () => {
  const { service, provider } = await harnessFixture();
  const before = await service.getTripPlanView("trip_plan_harness");
  const selections = { transport: "arrival_pvg", stay: "stay_people_square", play: "play_museum", food: "food_local" };
  const quickPreview = await service.previewTripMobility({ tripId: "trip_plan_harness", baseRevision: 0, selections });
  const trial = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: itineraryPlan(), baselinePreviewId: quickPreview.previewId });
  const staged = await service.getTripPlanView("trip_plan_harness");

  assert.equal(trial.status, "trial_ready", JSON.stringify(trial.feasibility));
  assert.deepEqual(trial.itinerary.stops.map((stop) => stop.role), ["intercity_arrival", "bag_drop", "activity", "meal", "stay_check_in"]);
  assert.equal(before.revision, staged.revision, "a Trial must not commit selected nodes or advance Trip revision");
  assert.equal(Object.values(staged.byDomain).flat().some((node) => node.selected), false);
  assert.equal(trial.impact.baseline.kind, "current_trial");
  assert.ok(trial.impact.deltaFromConfirmed);
  assert.equal(provider.calls, 2);

  const routeModes = Object.fromEntries(trial.mobility.legs.map((leg) => [leg.legId, "taxi"]));
  const accepted = await service.acceptTripChange({ ...trial.accept, tripId: "trip_plan_harness", routeModes });
  const confirmed = await service.getTripPlanView("trip_plan_harness");
  assert.equal(accepted.status, "committed");
  assert.equal(provider.calls, 2, "confirmation must reuse the checked Trial");
  assert.ok(confirmed.mobility.legs.every((leg) => leg.recommendedMode === "taxi"));
  assert.equal(confirmed.mobility.itinerary.planningSource, "model_plan");
});

test("a fixed conflict yields structured repair evidence and one repaired attempt succeeds", async () => {
  const { service } = await harnessFixture();
  const first = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: itineraryPlan({ runId: "planrun_repair", activityStart: "2026-10-15T10:20:00+08:00", activityFixed: true }) });
  assert.equal(first.status, "needs_repair");
  const conflict = first.issues.find((issue) => issue.code === "chronology_conflict");
  assert.equal(conflict.observed.routeMinutes, 30);
  assert.ok(conflict.allowedRepairDirections.includes("reorder_flexible_stop"));
  assert.equal((await service.getTripPlanView("trip_plan_harness")).revision, 0);

  const repaired = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: itineraryPlan({ runId: "planrun_repair", attempt: 2, activityStart: "2026-10-15T11:00:00+08:00", activityFixed: false }) });
  assert.equal(repaired.status, "trial_ready", JSON.stringify(repaired.feasibility));
});

test("a second failed repair stops without a third route request", async () => {
  const { service, provider } = await harnessFixture();
  const firstPlan = itineraryPlan({ runId: "planrun_stops_after_repair", activityStart: "2026-10-15T10:20:00+08:00", activityFixed: true });
  assert.equal((await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: firstPlan })).status, "needs_repair");
  const secondPlan = itineraryPlan({ runId: "planrun_stops_after_repair", attempt: 2, activityStart: "2026-10-15T10:25:00+08:00", activityFixed: true });
  const blocked = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: secondPlan });
  assert.equal(blocked.status, "blocked");
  const callCount = provider.calls;
  const replay = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: secondPlan });
  assert.equal(replay.status, "blocked");
  assert.equal(provider.calls, callCount);
  assert.equal((await service.getTripPlanView("trip_plan_harness")).revision, 0);
});

test("keeping the current plan discards only the itinerary Trial and preserves candidate choices", async () => {
  const { service } = await harnessFixture();
  const trial = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: itineraryPlan({ runId: "planrun_discard" }) });
  assert.equal(trial.status, "trial_ready");
  const discarded = await service.discardItineraryTrial({ tripId: "trip_plan_harness", proposalId: trial.proposalId, baseRevision: 0 });
  const plan = await service.getTripPlanView("trip_plan_harness");
  assert.equal(discarded.status, "discarded");
  assert.equal(plan.revision, 0);
  assert.equal(plan.pendingProposals[0].itineraryPlan, null);
  assert.equal(plan.pendingProposals[0].byDomain.stay.length, 1, "discarding an itinerary Trial must not discard researched candidates");
});

test("invalid nodes, replay, and a superseded late run cannot create competing Trials", async () => {
  const { service, provider } = await harnessFixture({ delayFirst: true });
  const invalid = itineraryPlan({ runId: "planrun_invalid" });
  invalid.days[0].stops[2].nodeId = "invented_museum";
  invalid.evidenceRefs.push("invented:evidence");
  const invalidResult = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: invalid });
  assert.equal(invalidResult.status, "needs_repair");
  assert.deepEqual(invalidResult.issues.map((issue) => issue.code), ["plan_node_not_found", "plan_evidence_not_allowed"]);

  const runA = service.planItineraryTrial({ tripId: "trip_plan_harness", plan: itineraryPlan({ runId: "planrun_a" }) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const runB = service.planItineraryTrial({ tripId: "trip_plan_harness", plan: itineraryPlan({ runId: "planrun_b" }) });
  const [a, b] = await Promise.all([runA, runB]);
  assert.equal(a.status, "stale_discarded");
  assert.equal(b.status, "trial_ready");
  const callsAfterB = provider.calls;
  const replay = await service.planItineraryTrial({ tripId: "trip_plan_harness", plan: itineraryPlan({ runId: "planrun_b" }) });
  assert.equal(replay.previewId, b.previewId);
  assert.equal(provider.calls, callsAfterB, "operation replay must reuse the first attempt result");
  assert.equal((await service.getTripPlanView("trip_plan_harness")).revision, 0);
});
