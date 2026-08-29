import assert from "node:assert/strict";
import test from "node:test";
import { buildItineraryDraft, finalizeItinerarySchedule, itineraryPlanToDraft } from "../src/core/index.ts";

function nodes() {
  return [
    {
      nodeId: "flight_aq1005", domain: "transport", title: "AQ1005 广州到上海", selected: true,
      operability: { mobilityRole: "intercity_inventory", departureAt: "2026-10-15 18:45", arrivalAt: "2026-10-15 21:20", arrivalPlace: { label: "浦东机场 T2" } },
    },
    { nodeId: "stay_people_square", domain: "stay", title: "人民广场酒店", selected: true, operability: { planningWindow: { startAt: "2026-10-15T16:00:00+08:00", endAt: "2026-10-15T18:00:00+08:00" } } },
    { nodeId: "food_local", domain: "food", title: "本帮菜", selected: true, operability: { openWeek: "10:00-14:00;17:00-21:00", planningWindow: { startAt: "2026-10-15T18:00:00+08:00", endAt: "2026-10-15T19:30:00+08:00" } } },
    { nodeId: "play_bund", domain: "play", title: "外滩", selected: true, operability: { planningWindow: { startAt: "2026-10-16T10:00:00+08:00", endAt: "2026-10-16T12:00:00+08:00" } } },
  ];
}

function alternative(minutes) {
  return { mode: "taxi", totalMinutes: minutes, distanceMeters: 10_000, walkingMeters: 0, transfers: 0, estimatedFareCny: 50, scheduleBasis: "query_time_estimate", realTimeArrival: false, navigationUrl: null, polyline: [], steps: [], accessibilityFeatures: [], accessibilityAssessment: { hasStairs: false, hasElevator: false, hasEscalator: false, hasRamp: false, stepFreeContinuity: "not_verified", realTimeStatus: false } };
}

function leg(origin, destination, minutes) {
  return { legId: `leg_${origin.stopId}_${destination.stopId}`.slice(0, 128), origin: { nodeId: origin.nodeId, stopId: origin.stopId, label: origin.title, coordinates: null, dayIndex: origin.dayIndex, date: origin.date, role: origin.role, startAt: origin.startAt, endAt: origin.endAt }, destination: { nodeId: destination.nodeId, stopId: destination.stopId, label: destination.title, coordinates: null, dayIndex: destination.dayIndex, date: destination.date, role: destination.role, startAt: destination.startAt, endAt: destination.endAt }, recommendedMode: "taxi", rationale: "fixture", alternatives: [alternative(minutes)] };
}

test("builds a day-aware destination itinerary from arrivalAt instead of departureAt", () => {
  const draft = buildItineraryDraft({ dates: "2026-10-15 至 2026-10-17" }, nodes());
  assert.ok(draft.itinerary);
  const [arrival, checkIn, dayTwoDeparture, play, meal, returnStay] = draft.itinerary.stops;
  assert.equal(arrival.role, "intercity_arrival");
  assert.match(arrival.startAt, /2026-10-15T21:20/);
  assert.doesNotMatch(arrival.startAt, /18:45/);
  assert.equal(checkIn.role, "stay_check_in");
  assert.equal(dayTwoDeparture.role, "stay_departure");
  assert.equal(play.dayIndex, 2);
  assert.equal(meal.dayIndex, 2, "a flexible dinner before a late arrival moves to the next usable day");
  assert.equal(returnStay.role, "stay_return");
  assert.equal(draft.itinerary.days.length, 3);
});

test("shifts flexible stops by real route duration and blocks missing route coverage", () => {
  const draft = buildItineraryDraft({ dates: "2026-10-15 至 2026-10-17" }, nodes());
  const stops = draft.itinerary.stops;
  const legs = [
    leg(stops[0], stops[1], 57),
    leg(stops[2], stops[3], 30),
    leg(stops[3], stops[4], 20),
    leg(stops[4], stops[5], 25),
  ];
  const mobility = { schemaVersion: "trip-mobility-v1", status: "completed", destination: "上海", source: "fixture", checkedAt: "2026-08-29T12:00:00Z", freshUntil: null, coverage: { routedNodeIds: [], unresolvedNodeIds: [], routedStopIds: stops.map((stop) => stop.stopId), unresolvedStopIds: [], unscheduled: false }, legs, itinerary: null, feasibility: null, travelerFit: { avoidStairs: true }, reason: null, caveats: [], sourceDocumentation: null, fabricatedResults: false };
  const finalized = finalizeItinerarySchedule(draft, mobility);
  assert.equal(finalized.feasibility.canConfirm, true);
  assert.match(finalized.itinerary.stops[1].startAt, /2026-10-15T22:17/);
  assert.ok(new Date(finalized.itinerary.stops[4].startAt) >= new Date(finalized.itinerary.stops[3].endAt));

  const missing = finalizeItinerarySchedule(draft, { ...mobility, status: "partial", legs: legs.slice(0, -1) });
  assert.equal(missing.feasibility.canConfirm, false);
  assert.match(missing.feasibility.primaryBlocker, /路线尚未核验|多点路线尚未完整核验/);
});

test("a model-authored bag-drop-first order is preserved and only times are normalized", () => {
  const plan = {
    schemaVersion: "itinerary-plan-v1", runId: "planrun_bagdrop", tripId: "trip_shanghai", baseRevision: 0, attempt: 1,
    objective: "抵达后先寄存行李，再参观和用餐，最后正式入住", priorities: ["保留固定抵达", "减少折返"], lockedNodeIds: ["flight_aq1005"],
    fixedAnchors: [{ nodeId: "flight_aq1005", kind: "arrival", startAt: "2026-10-15T09:00:00+08:00", endAt: "2026-10-15T09:00:00+08:00" }],
    days: [{ dayIndex: 1, date: "2026-10-15", stops: [
      { nodeId: "flight_aq1005", role: "intercity_arrival", timeWindow: { startAt: "2026-10-15T09:00:00+08:00", endAt: "2026-10-15T09:00:00+08:00" }, durationMinutes: 0, fixed: true, preferredModes: ["taxi"], rationale: "保留已确认抵达" },
      { nodeId: "stay_people_square", role: "bag_drop", timeWindow: { startAt: "2026-10-15T10:00:00+08:00", endAt: "2026-10-15T10:15:00+08:00" }, durationMinutes: 15, fixed: false, preferredModes: ["taxi", "transit"], rationale: "先放下行李" },
      { nodeId: "play_bund", role: "activity", timeWindow: { startAt: "2026-10-15T11:00:00+08:00", endAt: "2026-10-15T13:00:00+08:00" }, durationMinutes: 120, fixed: false, preferredModes: ["transit", "taxi"], rationale: "白天参观" },
      { nodeId: "food_local", role: "meal", timeWindow: { startAt: "2026-10-15T13:30:00+08:00", endAt: "2026-10-15T15:00:00+08:00" }, durationMinutes: 90, fixed: false, preferredModes: ["walk", "taxi"], rationale: "就近用餐" },
      { nodeId: "stay_people_square", role: "stay_check_in", timeWindow: { startAt: "2026-10-15T16:00:00+08:00", endAt: "2026-10-15T16:30:00+08:00" }, durationMinutes: 30, fixed: false, preferredModes: ["taxi", "transit"], rationale: "活动后正式入住" },
    ] }], assumptions: [], needsContext: [], evidenceRefs: [],
  };
  const adjustedNodes = nodes().map((node) => node.nodeId === "flight_aq1005" ? { ...node, operability: { ...node.operability, arrivalAt: "2026-10-15T09:00:00+08:00" } } : node);
  const draft = itineraryPlanToDraft(plan, { dates: "2026-10-15 至 2026-10-17" }, adjustedNodes);
  assert.equal(draft.itinerary.planningSource, "model_plan");
  assert.deepEqual(draft.itinerary.stops.map((stop) => stop.role), ["intercity_arrival", "bag_drop", "activity", "meal", "stay_check_in"]);
});

test("a fixed-time conflict returns observed facts and bounded repair directions", () => {
  const plan = {
    schemaVersion: "itinerary-plan-v1", runId: "planrun_conflict", tripId: "trip_shanghai", baseRevision: 0, attempt: 1,
    objective: "保留抵达后立即参观", priorities: ["固定预约"], lockedNodeIds: ["flight_aq1005"],
    fixedAnchors: [{ nodeId: "flight_aq1005", kind: "arrival", startAt: "2026-10-15T10:00:00+08:00", endAt: "2026-10-15T10:00:00+08:00" }],
    days: [{ dayIndex: 1, date: "2026-10-15", stops: [
      { nodeId: "flight_aq1005", role: "intercity_arrival", timeWindow: { startAt: "2026-10-15T10:00:00+08:00", endAt: "2026-10-15T10:00:00+08:00" }, durationMinutes: 0, fixed: true, preferredModes: ["taxi"], rationale: "固定抵达" },
      { nodeId: "play_bund", role: "activity", timeWindow: { startAt: "2026-10-15T10:15:00+08:00", endAt: "2026-10-15T11:15:00+08:00" }, durationMinutes: 60, fixed: true, preferredModes: ["taxi"], rationale: "固定预约" },
    ] }], assumptions: [], needsContext: [], evidenceRefs: [],
  };
  const adjustedNodes = nodes().map((node) => node.nodeId === "flight_aq1005" ? { ...node, operability: { ...node.operability, arrivalAt: "2026-10-15T10:00:00+08:00" } } : node);
  const draft = itineraryPlanToDraft(plan, { dates: "2026-10-15 至 2026-10-17" }, adjustedNodes);
  const [arrival, activity] = draft.itinerary.stops;
  const mobility = { schemaVersion: "trip-mobility-v1", status: "completed", destination: "上海", source: "fixture", checkedAt: "2026-08-29T12:00:00Z", freshUntil: null, coverage: { routedNodeIds: [arrival.nodeId, activity.nodeId], unresolvedNodeIds: [], routedStopIds: [arrival.stopId, activity.stopId], unresolvedStopIds: [], unscheduled: false }, legs: [leg(arrival, activity, 45)], itinerary: null, feasibility: null, travelerFit: {}, reason: null, caveats: [], sourceDocumentation: null, fabricatedResults: false };
  const finalized = finalizeItinerarySchedule(draft, mobility);
  const issue = finalized.feasibility.issues.find((item) => item.code === "chronology_conflict");
  assert.equal(finalized.feasibility.canConfirm, false);
  assert.equal(issue.observed.routeMinutes, 45);
  assert.match(issue.observed.earliestStartAt, /10:45/);
  assert.ok(issue.allowedRepairDirections.includes("reorder_flexible_stop"));
});

test("the same candidates support fatigue-first and late-arrival orders chosen by the model", () => {
  const adjustedNodes = nodes().map((node) => node.nodeId === "flight_aq1005" ? { ...node, operability: { ...node.operability, arrivalAt: "2026-10-15T15:00:00+08:00" } } : node);
  const base = { schemaVersion: "itinerary-plan-v1", tripId: "trip_shanghai", baseRevision: 0, attempt: 1, priorities: ["同行人先休息"], lockedNodeIds: [], assumptions: [], needsContext: [], evidenceRefs: [] };
  const tiredPlan = { ...base, runId: "planrun_tired", objective: "下午抵达后先入住休息，再就近用餐", fixedAnchors: [{ nodeId: "flight_aq1005", kind: "arrival", startAt: "2026-10-15T15:00:00+08:00", endAt: "2026-10-15T15:00:00+08:00" }], days: [{ dayIndex: 1, date: "2026-10-15", stops: [
    { nodeId: "flight_aq1005", role: "intercity_arrival", timeWindow: { startAt: "2026-10-15T15:00:00+08:00", endAt: "2026-10-15T15:00:00+08:00" }, durationMinutes: 0, fixed: true, preferredModes: ["taxi"], rationale: "固定抵达" },
    { nodeId: "stay_people_square", role: "stay_check_in", timeWindow: { startAt: "2026-10-15T16:00:00+08:00", endAt: "2026-10-15T17:30:00+08:00" }, durationMinutes: 90, fixed: false, preferredModes: ["taxi"], rationale: "先入住休息" },
    { nodeId: "food_local", role: "meal", timeWindow: { startAt: "2026-10-15T18:00:00+08:00", endAt: "2026-10-15T19:30:00+08:00" }, durationMinutes: 90, fixed: false, preferredModes: ["taxi"], rationale: "附近用餐" },
  ] }] };
  const tired = itineraryPlanToDraft(tiredPlan, { dates: "2026-10-15 至 2026-10-17" }, adjustedNodes);
  assert.deepEqual(tired.itinerary.stops.map((stop) => stop.role), ["intercity_arrival", "stay_check_in", "meal"]);

  const lateNodes = adjustedNodes.map((node) => node.nodeId === "flight_aq1005" ? { ...node, operability: { ...node.operability, arrivalAt: "2026-10-15T23:40:00+08:00" } } : node);
  const latePlan = { ...base, runId: "planrun_late", objective: "深夜只接驳酒店，吃玩移到第二天", fixedAnchors: [{ nodeId: "flight_aq1005", kind: "arrival", startAt: "2026-10-15T23:40:00+08:00", endAt: "2026-10-15T23:40:00+08:00" }], days: [
    { dayIndex: 1, date: "2026-10-15", stops: [{ nodeId: "flight_aq1005", role: "intercity_arrival", timeWindow: { startAt: "2026-10-15T23:40:00+08:00", endAt: "2026-10-15T23:40:00+08:00" }, durationMinutes: 0, fixed: true, preferredModes: ["taxi"], rationale: "深夜固定抵达" }] },
    { dayIndex: 2, date: "2026-10-16", stops: [
      { nodeId: "stay_people_square", role: "stay_check_in", timeWindow: { startAt: "2026-10-16T00:20:00+08:00", endAt: "2026-10-16T00:50:00+08:00" }, durationMinutes: 30, fixed: false, preferredModes: ["taxi"], rationale: "直接入住" },
      { nodeId: "play_bund", role: "activity", timeWindow: { startAt: "2026-10-16T10:00:00+08:00", endAt: "2026-10-16T12:00:00+08:00" }, durationMinutes: 120, fixed: false, preferredModes: ["transit"], rationale: "吃玩移到第二天" },
    ] },
  ] };
  const late = itineraryPlanToDraft(latePlan, { dates: "2026-10-15 至 2026-10-17" }, lateNodes);
  assert.deepEqual(late.itinerary.stops.map((stop) => [stop.dayIndex, stop.role]), [[1, "intercity_arrival"], [2, "stay_check_in"], [2, "activity"]]);
});
