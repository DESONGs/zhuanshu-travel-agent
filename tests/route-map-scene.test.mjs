import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteMapScene, mergeRouteMapSceneStops, routeMapSceneTotals } from "../src/web/route-map-scene.js";

const point = (longitude, latitude) => ({ longitude, latitude, coordinateSystem: "GCJ-02" });
const alternative = (mode, minutes, polyline = []) => ({ mode, totalMinutes: minutes, walkingMeters: mode === "walk" ? 500 : 0, transfers: mode === "transit" ? 1 : 0, estimatedFareCny: mode === "taxi" ? 42 : 0, polyline, steps: [] });

const itinerary = {
  days: [{ dayIndex: 1, date: "2026-10-15", stopIds: ["arrival", "stay"] }, { dayIndex: 2, date: "2026-10-16", stopIds: ["museum", "meal"] }, { dayIndex: 3, date: "2026-10-17", stopIds: [] }],
  stops: [
    { stopId: "arrival", nodeId: "airport", title: "浦东 T2", dayIndex: 1, role: "intercity_arrival" },
    { stopId: "stay", nodeId: "hotel", title: "人民广场酒店", dayIndex: 1, role: "stay_check_in" },
    { stopId: "museum", nodeId: "museum", title: "上海博物馆", dayIndex: 2, role: "activity" },
    { stopId: "meal", nodeId: "food", title: "本帮菜", dayIndex: 2, role: "meal" },
  ],
};

const mobility = {
  checkedAt: "2026-08-31T08:00:00.000Z",
  itinerary,
  legs: [
    { legId: "leg-1", origin: { stopId: "arrival", nodeId: "airport", label: "浦东 T2", dayIndex: 1, coordinates: point(121.8, 31.15) }, destination: { stopId: "stay", nodeId: "hotel", label: "人民广场酒店", dayIndex: 1, coordinates: point(121.47, 31.23) }, recommendedMode: "taxi", alternatives: [alternative("taxi", 52, [point(121.8, 31.15), point(121.47, 31.23)]), alternative("transit", 110, [point(121.8, 31.15), point(121.47, 31.23)])], rationale: "步行更少" },
    { legId: "leg-2", origin: { stopId: "museum", nodeId: "museum", label: "上海博物馆", dayIndex: 2, coordinates: point(121.47, 31.23) }, destination: { stopId: "meal", nodeId: "food", label: "本帮菜", dayIndex: 2, coordinates: point(121.49, 31.24) }, recommendedMode: "walk", alternatives: [alternative("walk", 12, [])], rationale: "距离较近" },
  ],
};

test("RouteMapScene defaults to the first day and keeps each drawable leg attributable", () => {
  const scene = buildRouteMapScene({ itinerary, mobility, activeLegId: "leg-1" });
  assert.equal(scene.activeDay, 1);
  assert.deepEqual(scene.availableDays, [1, 2]);
  assert.equal(scene.legs.length, 1);
  assert.equal(scene.legs[0].originLabel, "浦东 T2");
  assert.equal(scene.legs[0].destinationLabel, "人民广场酒店");
  assert.equal(scene.legs[0].mode, "taxi");
  assert.equal(scene.legs[0].selected, true);
  assert.equal(scene.legs[0].drawable, true);
  assert.equal(scene.stops.length, 2);
  assert.deepEqual(scene.stops.map((stop) => stop.title), ["浦东 T2", "人民广场酒店"]);
});

test("RouteMapScene changes only the selected mode and never draws a missing geometry fallback", () => {
  const transit = buildRouteMapScene({ itinerary, mobility, activeDay: 1, routeRole: "trial", routeModes: { "leg-1": "transit" } });
  assert.equal(transit.legs[0].mode, "transit");
  assert.equal(transit.legs[0].routeRole, "trial");
  assert.equal(transit.legs[0].minutes, 110);
  const secondDay = buildRouteMapScene({ itinerary, mobility, activeDay: 2 });
  assert.equal(secondDay.legs[0].mode, "walk");
  assert.equal(secondDay.legs[0].drawable, false);
  assert.equal(secondDay.legs[0].unavailableReason, "geometry_unavailable");
  assert.deepEqual(secondDay.legs[0].polyline, []);
});

test("RouteMapScene all-day totals are derived without mutating Mobility", () => {
  const before = structuredClone(mobility);
  const scene = buildRouteMapScene({ itinerary, mobility, activeDay: "all" });
  assert.deepEqual(routeMapSceneTotals(scene), { minutes: 64, walkingMeters: 500, transfers: 0, estimatedFareCny: 42 });
  assert.deepEqual(mobility, before);
});

test("map scene keeps repeated visits to the same hotel visible on one marker", () => {
  const stops = [
    { stopId: "arrival", nodeId: "airport", dayIndex: 1, title: "浦东 T2" },
    { stopId: "drop", nodeId: "hotel", dayIndex: 1, title: "人民广场酒店" },
    { stopId: "meal", nodeId: "food", dayIndex: 1, title: "本帮菜" },
    { stopId: "return", nodeId: "hotel", dayIndex: 1, title: "人民广场酒店" },
  ];
  const nodes = [
    { nodeId: "airport", title: "浦东 T2", location: { coordinates: point(121.8, 31.15) } },
    { nodeId: "hotel", title: "人民广场酒店", location: { coordinates: point(121.47, 31.23) } },
    { nodeId: "food", title: "本帮菜", location: { coordinates: point(121.48, 31.24) } },
  ];
  const routeLeg = (legId, origin, destination, polyline) => ({
    legId,
    origin: { ...origin, label: nodes.find((node) => node.nodeId === origin.nodeId).title, coordinates: nodes.find((node) => node.nodeId === origin.nodeId).location.coordinates },
    destination: { ...destination, label: nodes.find((node) => node.nodeId === destination.nodeId).title, coordinates: nodes.find((node) => node.nodeId === destination.nodeId).location.coordinates },
    recommendedMode: "taxi",
    alternatives: [alternative("taxi", 12, polyline)],
  });
  const scene = buildRouteMapScene({
    itinerary: { days: [{ dayIndex: 1, stopIds: stops.map((stop) => stop.stopId) }], stops },
    mobility: { status: "completed", legs: [
      routeLeg("arrival-hotel", stops[0], stops[1], [point(121.8, 31.15), point(121.47, 31.23)]),
      routeLeg("hotel-food", stops[1], stops[2], [point(121.47, 31.23), point(121.48, 31.24)]),
      routeLeg("food-hotel", stops[2], stops[3], [point(121.48, 31.24), point(121.47, 31.23)]),
    ] },
    nodes,
    routeRole: "trial",
  });
  const hotel = mergeRouteMapSceneStops(scene).find((stop) => stop.nodeId === "hotel");
  assert.deepEqual(hotel.visitIndexes, [2, 4]);
  assert.equal(hotel.sequenceLabel, "2·4");
});
