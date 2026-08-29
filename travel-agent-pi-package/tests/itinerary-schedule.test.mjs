import assert from "node:assert/strict";
import test from "node:test";
import { buildItineraryDraft, finalizeItinerarySchedule } from "../src/core/index.ts";

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
