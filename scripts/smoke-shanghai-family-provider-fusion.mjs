import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TravelService } from "../src/api/travel-service.mjs";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { buildTravelResearchCriteria } from "../src/providers/research-criteria.mjs";
import { createTravelResearchProvider } from "../src/providers/travel-research-provider.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

const env = await loadTravelRuntimeEnv();
const brief = {
  destination: "上海",
  origin: "广州",
  dates: "2026-08-27 至 2026-08-29",
  arrivalMode: "飞机",
  arrivalAirport: "浦东机场",
  arrivalTerminal: "T2",
  arrivalTime: "14:00",
  partyProfile: "与父母同行，共 3 人",
  pace: "轻松",
  lodgingPreference: "人民广场或南京东路",
  foodPreferences: ["上海本地菜", "不太大众的小店"],
  totalBudget: 8_000,
  currency: "CNY",
};
const travelers = [
  { travelerId: "traveler_1", displayName: "你", relationship: "本人", language: "zh-CN", careNeeds: {} },
  { travelerId: "traveler_2", displayName: "父亲", relationship: "父亲", language: "zh-CN", careNeeds: { mobility: { reduceWalking: true, avoidStairs: true } } },
  { travelerId: "traveler_3", displayName: "母亲", relationship: "母亲", language: "zh-CN", careNeeds: {} },
];
const question = "广州飞上海，2026-08-27 浦东 T2 14:00 落地；住宿优先人民广场或南京东路；安排外滩、博物馆和适合父母的轻松体验；想吃上海本地菜和不太大众的小店；父亲少走路并避开楼梯。";
const criteriaInput = {
  byDomain: {
    stay: { targetAreas: ["人民广场", "南京东路"], keywords: ["酒店"] },
    play: { namedEntities: ["外滩", "博物馆"], preferenceHints: ["适合父母", "轻松体验"] },
    food: { keywords: ["本帮菜", "上海本地菜", "小店"], targetAreas: ["人民广场", "南京东路"], preferenceHints: ["不太大众"] },
  },
  intercityIntent: "flight",
  localMobilityIntent: ["taxi", "accessible_transit"],
  arrival: { airport: "浦东机场", terminal: "T2", time: "14:00" },
};
const criteria = buildTravelResearchCriteria({ brief, travelers, question, criteria: criteriaInput, domains: ["play", "food", "stay", "transport"] });
const researchProvider = createTravelResearchProvider(env);
assert.equal(researchProvider.status, "configured", "No audited live travel provider is configured");

const direct = await researchProvider.research({ tripId: "smoke_shanghai_family", brief, travelers, question, criteria, domains: ["play", "food", "stay", "transport"] });
assert.equal(direct.status, "completed", JSON.stringify({ status: direct.status, errors: direct.errors }));
const directCounts = Object.fromEntries(Object.entries(direct.byDomain).map(([domain, items]) => [domain, items.length]));
const directTransportTypes = [...new Set(direct.byDomain.transport.map((item) => item.operability?.transportType).filter(Boolean))];
const directFlight = direct.byDomain.transport.find((item) => item.operability?.transportType === "FLIGHT") ?? null;
const directHotelOffer = direct.byDomain.stay.find((item) => item.operability?.hotelOfferStatus === "available_search_offer") ?? null;
assert.equal(direct.byDomain.food.some((item) => /酒店|宾馆|民宿/.test(item.title) && !/餐厅|餐馆|酒家|菜馆|饭店/.test(item.title)), false, "A lodging entity entered the food result");
assert.equal(direct.byDomain.stay.every((item) => /人民广场|南京东路/.test(`${item.title} ${item.summary} ${item.location?.label ?? ""} ${item.location?.address ?? ""} ${item.location?.district ?? ""} ${item.operability?.businessArea ?? ""}`)), true, "A stay outside the requested areas entered the fused result");
assert.equal(direct.byDomain.play.every((item) => /外滩|博物馆/.test(`${item.title} ${item.summary}`)), true, "An unrelated attraction entered the named-place result");
assert.equal(direct.byDomain.transport.every((item) => item.operability?.transportType === "FLIGHT"), true, "AMap transport facilities or rail displaced the requested flight role");

const rootDir = await mkdtemp(join(tmpdir(), "travel-agent-shanghai-family-"));
const service = new TravelService({ store: new TripStore({ rootDir }), researchProvider });
await service.createTrip({ tripId: "trip_shanghai_family_smoke", brief, travelers });
const researched = await service.researchTripOptions({ tripId: "trip_shanghai_family_smoke", domains: ["play", "food", "stay", "transport"], question, criteria: criteriaInput });
assert.equal(researched.status, "proposed", JSON.stringify({ status: researched.status, errors: researched.errors }));
const proposal = researched.proposal;
const candidateCounts = Object.fromEntries(Object.entries(proposal.byDomain).map(([domain, items]) => [domain, items.length]));
assert.equal(proposal.byDomain.transport.every((item) => item.operability?.transportType === "FLIGHT"), true);
assert.equal(proposal.byDomain.food.some((item) => /酒店|宾馆|民宿/.test(item.title) && !/餐厅|餐馆|酒家|菜馆|饭店/.test(item.title)), false);
const selections = Object.fromEntries(Object.entries(proposal.byDomain).filter(([, items]) => items.length).map(([domain, items]) => [domain, items[0].nodeId]));
const accepted = await service.acceptTripChange({ tripId: "trip_shanghai_family_smoke", proposalId: proposal.proposalId, selections });
assert.equal(accepted.status, "committed");
const mobility = await service.refreshTripMobility({ tripId: "trip_shanghai_family_smoke" });
const plan = await service.getTripPlanView("trip_shanghai_family_smoke");
const map = await service.renderTripMap("trip_shanghai_family_smoke");
assert.equal(plan.today.status, "ready", "Accepted places did not form understandable planning windows");
assert.ok(map.body.length > 0, "The accepted trip did not render a real static map");
if (proposal.byDomain.transport.length && proposal.byDomain.stay.length) {
  assert.ok(["completed", "partial"].includes(mobility.status), JSON.stringify({ mobility: mobility.status, reason: mobility.mobility?.reason }));
  assert.match(mobility.mobility.legs[0]?.origin?.label ?? "", /浦东|机场|航班/, "The first local mobility leg did not start at the confirmed arrival node");
}

console.log(JSON.stringify({
  status: "passed_service_provider_smoke",
  evidenceScope: "service_provider_contract_only",
  userPathVerified: false,
  scenario: "2026-08-27_Guangzhou_to_Shanghai_family",
  criteriaFingerprint: criteria.fingerprint,
  directProvider: {
    provider: direct.provider,
    counts: directCounts,
    transportTypes: directTransportTypes,
    flight: directFlight ? {
      serviceNumber: directFlight.operability.serviceNumber,
      departure: directFlight.operability.departurePlace,
      arrival: directFlight.operability.arrivalPlace,
      departureAt: directFlight.operability.departureAt,
      arrivalAt: directFlight.operability.arrivalAt,
      fareOffers: directFlight.operability.fareOffers,
      requestedArrival: directFlight.operability.arrivalRouteAnchor,
      arrivalTimeFit: directFlight.operability.researchFit?.arrivalTimeFit ?? null,
    } : null,
    titles: Object.fromEntries(Object.entries(direct.byDomain).map(([domain, items]) => [domain, items.slice(0, 3).map((item) => item.title)])),
    hotelOfferCount: direct.byDomain.stay.filter((item) => item.operability?.hotelOfferStatus === "available_search_offer").length,
    hotelOffer: directHotelOffer ? { title: directHotelOffer.title, offer: directHotelOffer.operability.hotelOffer } : null,
  },
  application: {
    candidateCounts,
    acceptedDomains: Object.keys(selections),
    todayStatus: plan.today.status,
    planningWindows: Object.fromEntries(Object.entries(plan.byDomain).map(([domain, items]) => [domain, items.filter((item) => item.selected).map((item) => item.operability?.planningWindow?.label ?? null)])),
    mobilityStatus: mobility.status,
    mobilityLegs: mobility.mobility?.legs?.map((leg) => ({ from: leg.origin.label, to: leg.destination.label, recommendedMode: leg.recommendedMode })) ?? [],
    mapBytes: map.body.length,
  },
  gaps: {
    missingDomains: Object.entries(candidateCounts).filter(([, count]) => count === 0).map(([domain]) => domain),
    flightInventory: directTransportTypes.includes("FLIGHT") ? "returned" : "verified_no_match",
    hotelOffer: direct.byDomain.stay.some((item) => item.operability?.hotelOfferStatus === "available_search_offer") ? "returned" : "not_returned",
    facilities: "map_reference_non_realtime_only",
  },
  fabricatedResults: false,
}, null, 2));
