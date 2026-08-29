import assert from "node:assert/strict";
import test from "node:test";
import { buildTravelResearchCriteria } from "../src/providers/research-criteria.mjs";

const brief = {
  destination: "上海",
  origin: "广州",
  dates: "2026-08-27 至 2026-08-29",
  arrivalMode: "飞机",
  lodgingPreference: "人民广场或南京东路",
  foodPreferences: ["上海本地菜", "不太大众的小店"],
  totalBudget: 8_000,
};
const travelers = [
  { displayName: "父亲", careNeeds: { mobility: { reduceWalking: true, avoidStairs: true } } },
  { displayName: "母亲", careNeeds: {} },
  { displayName: "你", careNeeds: {} },
];

test("research criteria preserve target areas, named places, arrival anchor and traveler constraints", () => {
  const criteria = buildTravelResearchCriteria({
    brief,
    travelers,
    domains: ["play", "food", "stay", "transport"],
    question: "广州飞上海，浦东 T2 14:00 落地。住宿优先人民广场或南京东路，想去外滩、博物馆，吃上海本地菜和不太大众的小店。",
  });

  assert.deepEqual(criteria.byDomain.stay.targetAreas, ["人民广场", "南京东路"]);
  assert.deepEqual(criteria.byDomain.play.namedEntities, ["外滩", "博物馆"]);
  assert.ok(criteria.byDomain.food.keywords.includes("上海本地菜"));
  assert.equal(criteria.intercityIntent, "flight");
  assert.deepEqual(criteria.arrival, { airport: "浦东机场", terminal: "T2", time: "14:00", confirmed: false });
  assert.deepEqual(criteria.localMobilityIntent, ["taxi", "accessible_transit"]);
  assert.ok(criteria.travelerConstraintHints.includes("父亲:避开楼梯"));
  assert.match(criteria.fingerprint, /^rc_[a-f0-9]{24}$/);
});

test("arrival becomes authoritative only after the traveler explicitly confirms it", () => {
  const criteria = buildTravelResearchCriteria({
    brief: { ...brief, arrivalAirport: "浦东机场", arrivalTerminal: "T2", arrivalTime: "14:00", arrivalConfirmed: true },
    travelers,
    domains: ["transport"],
  });
  assert.equal(criteria.arrival.confirmed, true);
});

test("keeps high-speed rail intent distinct from generic train inventory", () => {
  const criteria = buildTravelResearchCriteria({ brief: { ...brief, arrivalMode: "飞机或高铁" }, travelers, domains: ["transport"], question: "飞机和高铁都可以，但不要用普通慢车替代高铁。" });
  assert.equal(criteria.intercityIntent, "flexible");
  assert.ok(criteria.byDomain.transport.preferenceHints.includes("high_speed_train"));
  assert.ok(criteria.byDomain.transport.preferenceHints.includes("compare_flight_high_speed_train"));
});

test("domain fingerprints change only for affected research semantics", () => {
  const first = buildTravelResearchCriteria({ brief, travelers, domains: ["stay"], criteria: { byDomain: { stay: { targetAreas: ["人民广场"] } } } });
  const second = buildTravelResearchCriteria({ brief: { ...brief, lodgingPreference: "南京东路" }, travelers, domains: ["stay"], criteria: { byDomain: { stay: { targetAreas: ["南京东路"] } } } });

  assert.notEqual(first.domainFingerprints.stay, second.domainFingerprints.stay);
  assert.equal(first.domainFingerprints.play, second.domainFingerprints.play);
  assert.equal(first.domainFingerprints.transport, second.domainFingerprints.transport);
});
