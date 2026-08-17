import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TravelService } from "../src/api/travel-service.mjs";
import { AmapTravelResearchProvider, createAmapTravelResearchProvider, signedAmapParameters } from "../src/providers/amap-travel-research.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

const POIS = {
  "110000|140000": [
    { id: "play_1", name: "山水博物馆", type: "科教文化服务;博物馆", location: "100.170000,25.690000", cityname: "大理白族自治州", adname: "大理市", address: "博物馆路 1 号", business: { rating: "4.7", opentime_today: "09:00-17:00" }, photos: [{ title: "博物馆外观", url: "https://store.is.autonavi.com/example.jpg" }] },
    { id: "play_2", name: "湖滨公园", type: "风景名胜", location: "100.180000,25.700000", cityname: "大理白族自治州", adname: "大理市", address: "湖滨路", business: { rating: "4.5" } },
  ],
  "050000": [
    { id: "food_1", name: "本地菜馆一号", type: "餐饮服务;中餐厅", location: "100.171000,25.691000", cityname: "大理白族自治州", adname: "大理市", address: "人民路 8 号", business: { rating: "4.6", cost: "75" } },
    { id: "food_2", name: "本地菜馆二号", type: "餐饮服务;中餐厅", location: "100.220000,25.740000", cityname: "大理白族自治州", adname: "大理市", address: "远郊路 2 号", business: { rating: "4.8", cost: "90" } },
  ],
  "100000": [
    { id: "stay_1", name: "旅行酒店一号", type: "住宿服务;宾馆酒店", location: "100.170500,25.690500", cityname: "大理白族自治州", adname: "大理市", address: "中心路 3 号", business: { rating: "4.5", cost: "420" }, navi: { entr_location: "100.170510,25.690510", exit_location: "100.170520,25.690520" }, indoor: { indoor_map: "1" } },
    { id: "stay_2", name: "旅行酒店二号", type: "住宿服务;宾馆酒店", location: "100.250000,25.760000", cityname: "大理白族自治州", adname: "大理市", address: "远郊路 9 号", business: { rating: "4.7", cost: "500" } },
  ],
  "150000": [
    { id: "transport_1", name: "客运站", type: "交通设施服务;长途汽车站", location: "100.169000,25.688000", cityname: "大理白族自治州", adname: "大理市", address: "站前路", business: {} },
  ],
};

test("AMap requests add a deterministic signature only when a Web Service private key is configured", () => {
  const unsigned = signedAmapParameters({ key: "test-key", region: "大理", page_num: "1" });
  assert.equal(unsigned.has("sig"), false);
  const signed = signedAmapParameters({ region: "大理", key: "test-key", page_num: "1" }, "test-secret");
  const expected = createHash("md5").update("key=test-key&page_num=1&region=大理test-secret", "utf8").digest("hex");
  assert.equal(signed.get("sig"), expected);
});

test("the application provider remains disabled until the complete AMap live smoke passes", () => {
  const limited = createAmapTravelResearchProvider({ AMAP_API_KEY: "valid-key", TRAVEL_AGENT_AMAP_SMOKE_STATUS: "credential_valid_account_gate_10044" });
  assert.equal(limited.status, "provider_unavailable");
  const passed = createAmapTravelResearchProvider({ AMAP_API_KEY: "valid-key", TRAVEL_AGENT_AMAP_SMOKE_STATUS: "passed_live_smoke" });
  assert.equal(passed.status, "configured");
});

function fakeAmapFetch(url) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://restapi.amap.com");
  assert.equal(parsed.searchParams.get("key"), "amap-test-key");
  if (parsed.pathname === "/v3/staticmap") {
    assert.match(parsed.searchParams.get("markers"), /^mid,0xFF5A4F,:100\.17/);
    return Promise.resolve(new Response(Uint8Array.from([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } }));
  }
  if (parsed.pathname === "/v3/geocode/geo") {
    return Promise.resolve(new Response(JSON.stringify({ status: "1", info: "OK", infocode: "10000", geocodes: [{ city: "大理白族自治州", adcode: "532901", location: "100.170000,25.690000" }] }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  if (parsed.pathname === "/v3/weather/weatherInfo") {
    return Promise.resolve(new Response(JSON.stringify({ status: "1", info: "OK", infocode: "10000", forecasts: [{ city: "大理市", province: "云南", adcode: "532901", reporttime: "2026-08-14 11:00:00", casts: [
      { date: "2026-08-14", week: "5", dayweather: "中雨", nightweather: "小雨", daytemp: "26", nighttemp: "18", daywind: "东", nightwind: "东", daypower: "4", nightpower: "3" },
      { date: "2026-08-15", week: "6", dayweather: "多云", nightweather: "多云", daytemp: "28", nighttemp: "17", daywind: "东", nightwind: "东", daypower: "3", nightpower: "3" },
    ] }] }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  assert.equal(parsed.searchParams.get(parsed.pathname.startsWith("/v5/") ? "region" : "city"), "大理");
  if (parsed.pathname.startsWith("/v5/")) assert.match(parsed.searchParams.get("show_fields"), /photos/);
  const pois = POIS[parsed.searchParams.get("types")] ?? [];
  return Promise.resolve(new Response(JSON.stringify({ status: "1", info: "OK", infocode: "10000", count: String(pois.length), pois }), { status: 200, headers: { "content-type": "application/json" } }));
}

test("AMap provider runs one bounded four-domain pass and never includes its key in normalized evidence", async () => {
  const provider = new AmapTravelResearchProvider({ apiKey: "amap-test-key", fetchImpl: fakeAmapFetch, clock: () => new Date("2026-08-14T08:00:00.000Z") });
  const result = await provider.research({ brief: { destination: "大理" } });
  assert.equal(result.status, "completed");
  assert.deepEqual(Object.keys(result.byDomain).sort(), ["food", "play", "stay", "transport"]);
  assert.equal(result.byDomain.food.length, 2);
  assert.equal(result.weather.status, "completed");
  assert.equal(result.weather.coverage, "dates_unknown");
  assert.equal(JSON.stringify(result).includes("amap-test-key"), false);
  assert.match(result.byDomain.food[0].operability.navigationUrl, /^https:\/\/uri\.amap\.com\/marker\?/);
  assert.equal(result.byDomain.play[0].media[0].url, "https://store.is.autonavi.com/example.jpg");
  assert.deepEqual(result.byDomain.stay[0].operability.mappedFacilities.map(({ kind }) => kind), ["entrance", "exit", "indoor_map"]);
  assert.equal(result.byDomain.stay[0].operability.mappedFacilities.every((facility) => facility.realTime === false && facility.status === "mapped_non_realtime"), true);
  assert.equal(result.byDomain.stay[0].operability.inventoryVerified, false);
  assert.equal(result.byDomain.stay[0].operability.hotelOfferStatus, "ota_offer_required");
  const map = await provider.renderStaticMap({ points: [{ coordinates: { longitude: 100.17, latitude: 25.69 } }] });
  assert.equal(map.contentType, "image/png");
  assert.equal(map.body.length, 4);
});

test("AMap classifies CUQPS limit responses as retryable rate limiting", async () => {
  const provider = new AmapTravelResearchProvider({
    apiKey: "amap-test-key",
    fetchImpl: async () => new Response(JSON.stringify({ status: "0", info: "CUQPS_HAS_EXCEEDED_THE_LIMIT", infocode: "10021" }), { status: 200, headers: { "content-type": "application/json" } }),
    rateLimitRetryMs: 0,
  });
  const result = await provider.research({ brief: { destination: "上海" }, domains: ["food"] });
  assert.equal(result.status, "RATE_LIMITED");
  assert.equal(result.errors[0].details.infoCode, "10021");
});

test("AMap retries one transient CUQPS response and then returns verified candidates", async () => {
  let calls = 0;
  const provider = new AmapTravelResearchProvider({
    apiKey: "amap-test-key",
    rateLimitRetryMs: 0,
    fetchImpl: async (url) => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ status: "0", info: "CUQPS_HAS_EXCEEDED_THE_LIMIT", infocode: "10021" }), { status: 200, headers: { "content-type": "application/json" } });
      return fakeAmapFetch(url);
    },
  });
  const result = await provider.research({ brief: { destination: "大理" }, domains: ["food"] });
  assert.equal(result.status, "completed");
  assert.equal(result.byDomain.food.length, 2);
  assert.equal(calls, 4);
});

test("AMap distinguishes account-level 10044 from retryable QPS limiting", async () => {
  let calls = 0;
  const provider = new AmapTravelResearchProvider({
    apiKey: "amap-test-key",
    rateLimitRetryMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: "0", info: "USER_DAILY_QUERY_OVER_LIMIT", infocode: "10044" }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await assert.rejects(
    provider.requestJsonWithRetry("https://restapi.amap.com/v5/place/text", { types: "050000", region: "上海" }, "amap_poi_v5"),
    (error) => error.code === "ACCOUNT_LIMITED" && error.details.infoCode === "10044",
  );
  assert.equal(calls, 1);
});

test("AMap falls back to POI v3 only when the v5 interface permission is unavailable", async () => {
  const paths = [];
  const provider = new AmapTravelResearchProvider({
    apiKey: "amap-test-key",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      paths.push(parsed.pathname);
      if (parsed.pathname === "/v5/place/text") return new Response(JSON.stringify({ status: "0", info: "NO_EFFECTIVE_INTERFACE", infocode: "10041" }), { status: 200, headers: { "content-type": "application/json" } });
      return fakeAmapFetch(url);
    },
    clock: () => new Date("2026-08-14T08:00:00.000Z"),
  });
  const result = await provider.research({ brief: { destination: "大理", dates: "2026-08-14 至 2026-08-15" }, domains: ["food", "stay"] });
  assert.equal(result.status, "completed");
  assert.equal(result.byDomain.food.length, 2);
  assert.equal(result.byDomain.food[0].operability.researchDepth, "amap_poi_v3_basic_fallback");
  assert.deepEqual(paths.filter((path) => path.includes("/place/text")), ["/v5/place/text", "/v3/place/text", "/v3/place/text"]);
  assert.equal(result.weather.coverage, "covered");
  assert.equal(result.weather.planningImpact.active, true);
  assert.deepEqual(result.weather.riskSignals, ["precipitation"]);
});

test("AMap does not multiply requests by downgrading an account-wide 10044 gate", async () => {
  const paths = [];
  const provider = new AmapTravelResearchProvider({
    apiKey: "amap-test-key",
    fetchImpl: async (url) => {
      paths.push(new URL(url).pathname);
      return new Response(JSON.stringify({ status: "0", info: "USER_DAILY_QUERY_OVER_LIMIT", infocode: "10044" }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await provider.research({ brief: { destination: "上海" }, domains: ["food"], includeWeather: false });

  assert.equal(result.status, "ACCOUNT_LIMITED");
  assert.deepEqual(paths, ["/v5/place/text"]);
});

test("AMap reuses a fresh forecast for same-trip local refinements", async () => {
  let geocodeCalls = 0;
  let weatherCalls = 0;
  const provider = new AmapTravelResearchProvider({
    apiKey: "amap-test-key",
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/v3/geocode/geo") geocodeCalls += 1;
      if (pathname === "/v3/weather/weatherInfo") weatherCalls += 1;
      return fakeAmapFetch(url);
    },
    clock: () => new Date("2026-08-14T08:00:00.000Z"),
  });
  const brief = { destination: "大理", dates: "2026-08-14 至 2026-08-15" };
  const first = await provider.research({ brief, domains: ["food"] });
  const second = await provider.research({ brief, domains: ["play"], existingWeather: first.weather });
  assert.equal(second.weather.reused, true);
  assert.equal(geocodeCalls, 1);
  assert.equal(weatherCalls, 1);
});

test("AMap surfaces JSON errors returned by the static map endpoint", async () => {
  const provider = new AmapTravelResearchProvider({
    apiKey: "amap-test-key",
    fetchImpl: async () => new Response(JSON.stringify({ status: "0", info: "CUQPS_HAS_EXCEEDED_THE_LIMIT", infocode: "10021" }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  await assert.rejects(
    provider.renderStaticMap({ points: [{ coordinates: { longitude: 121.47, latitude: 31.23 } }] }),
    (error) => error.code === "RATE_LIMITED" && error.details.infoCode === "10021",
  );
});

test("provider-backed research stages selectable linked candidates and promotes evidence only after acceptance", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-amap-service-"));
  const store = new TripStore({ rootDir });
  store.mode = "file";
  const provider = new AmapTravelResearchProvider({ apiKey: "amap-test-key", fetchImpl: fakeAmapFetch, clock: () => new Date("2026-08-14T08:00:00.000Z") });
  const service = new TravelService({ store, researchProvider: provider, clock: () => new Date("2026-08-14T08:00:00.000Z") });
  await service.createTrip({ tripId: "trip_amap", brief: { destination: "大理", origin: "广州", dates: "2026-10-03 至 2026-10-07" }, travelers: [{ travelerId: "traveler_1" }] });

  const researched = await service.researchTripOptions({ tripId: "trip_amap", domains: ["play", "food", "stay", "transport"], question: "轻松、少折返" });
  assert.equal(researched.status, "proposed");
  assert.equal(researched.candidateCounts.food, 2);
  const before = await service.getTripPlanView("trip_amap");
  assert.equal(before.byDomain.food.length, 0, "research must not alter the accepted plan");
  assert.equal(before.pendingProposals.length, 1);
  assert.equal(before.pendingProposals[0].byDomain.food.length, 2);
  assert.equal(before.pendingProposals[0].byDomain.play[0].media[0].title, "博物馆外观");
  assert.equal(before.mapPreviewAvailable, true);
  const map = await service.renderTripMap("trip_amap");
  assert.equal(map.contentType, "image/png");
  assert.equal(map.body.length, 4);

  const proposal = before.pendingProposals[0];
  const selections = Object.fromEntries(Object.entries(proposal.byDomain).filter(([, items]) => items.length).map(([domain, items]) => [domain, items.at(-1).nodeId]));
  const accepted = await service.acceptTripChange({ tripId: "trip_amap", proposalId: proposal.proposalId, selections });
  assert.equal(accepted.status, "committed");
  const after = await service.getTripPlanView("trip_amap");
  assert.equal(after.pendingProposals.length, 0);
  assert.equal(after.byDomain.food.find((node) => node.selected).nodeId, selections.food);
  const persisted = await store.get("trip_amap");
  assert.deepEqual(after.qa.operabilityGaps, [{ domain: "transport", code: "city_mobility_unverified" }]);
  assert.equal(persisted.evidence.claims.length, 7);
  assert.equal(persisted.evidence.contentItems.length, 7);
  assert.equal(persisted.evidence.claims.every((claim) => persisted.nodes.some((node) => node.nodeId === claim.nodeId)), true);
});

test("verified forecast is persisted before choice and shapes play candidates across the proposal", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-amap-weather-"));
  const store = new TripStore({ rootDir });
  const provider = new AmapTravelResearchProvider({ apiKey: "amap-test-key", fetchImpl: fakeAmapFetch, clock: () => new Date("2026-08-14T08:00:00.000Z") });
  const service = new TravelService({ store, researchProvider: provider, clock: () => new Date("2026-08-14T08:00:00.000Z") });
  await service.createTrip({ tripId: "trip_weather", brief: { destination: "大理", dates: "2026-08-14 至 2026-08-15" }, travelers: [{ travelerId: "traveler_1" }] });
  const researched = await service.researchTripOptions({ tripId: "trip_weather", domains: ["play"], question: "下雨时也能轻松游玩" });
  assert.equal(researched.status, "proposed");
  assert.equal(researched.weather.planningImpact.active, true);
  const plan = await service.getTripPlanView("trip_weather");
  assert.equal(plan.weather.coverage, "covered");
  assert.equal(plan.weather.planningImpact.severity, "watch");
  assert.equal(plan.pendingProposals[0].byDomain.play[0].title, "山水博物馆");
  assert.equal(plan.pendingProposals[0].byDomain.play[0].operability.weatherFit, "preferred");
  assert.equal(plan.pendingProposals[0].byDomain.play[1].operability.weatherFit, "caution");
});
