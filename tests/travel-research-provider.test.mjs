import assert from "node:assert/strict";
import test from "node:test";
import { CompositeTravelResearchProvider } from "../src/providers/travel-research-provider.mjs";
import { buildTravelResearchCriteria } from "../src/providers/research-criteria.mjs";

function result(provider, byDomain, documentation) {
  return { status: "completed", provider, providerLabel: provider, destination: "大理", checkedAt: "2026-08-15T08:00:00.000Z", byDomain, partial: false, caveats: [`${provider}-caveat`], sourceDocumentation: documentation };
}

test("composite research merges official sources, deduplicates titles and keeps one valid documentation URL", async () => {
  const weather = { status: "completed", provider: "amap_weather", coverage: "covered", planningImpact: { active: true, severity: "watch" } };
  const providers = [
    { status: "configured", research: async () => result("amap", { food: [{ domain: "food", title: "菌子火锅" }], play: [{ domain: "play", title: "三塔" }], stay: [], transport: [] }, "https://lbs.amap.com/") },
    { status: "configured", research: async () => result("flyai", { food: [], play: [{ domain: "play", title: "三塔" }], stay: [{ domain: "stay", title: "洱海酒店" }], transport: [{ domain: "transport", title: "D3802" }] }, "https://flyai.open.fliggy.com/docs/overview") },
  ];
  const output = await new CompositeTravelResearchProvider({ providers, weatherProviders: [{ status: "configured", getWeather: async () => weather }] }).research({ domains: ["food", "play", "stay", "transport"] });
  assert.equal(output.status, "completed");
  assert.equal(output.byDomain.play.length, 1);
  assert.equal(output.byDomain.stay[0].title, "洱海酒店");
  assert.equal(output.sourceDocumentation, "https://lbs.amap.com/");
  assert.equal(output.weather.provider, "amap_weather");
  assert.deepEqual(output.caveats.sort(), ["amap-caveat", "flyai-caveat"]);
});

test("place candidates remain provisional when the mandatory weather gate is unavailable", async () => {
  const providers = [
    { status: "configured", research: async () => result("amap", { food: [{ domain: "food", title: "菌子火锅" }], play: [], stay: [], transport: [] }, "https://lbs.amap.com/") },
  ];
  const output = await new CompositeTravelResearchProvider({
    providers,
    weatherProviders: [{ status: "configured", getWeather: async () => ({ status: "SOURCE_UNAVAILABLE", provider: "amap_weather" }) }],
  }).research({ domains: ["food"] });

  assert.equal(output.status, "completed");
  assert.equal(output.partial, true);
  assert.equal(output.errors.some((error) => error.capability === "weather" && error.code === "SOURCE_UNAVAILABLE"), true);
  assert.equal(output.caveats.some((item) => item.includes("不能视为完整日程")), true);
});

test("cached weather is not reused after the requested trip dates change", async () => {
  let calls = 0;
  const fresh = { status: "completed", provider: "amap_weather", destination: "大理", tripDates: ["2026-08-23"], checkedAt: "2026-08-15T08:00:00.000Z", coverage: "covered", planningImpact: { active: false, severity: "none" } };
  const provider = new CompositeTravelResearchProvider({
    weatherProviders: [{ status: "configured", getWeather: async () => { calls += 1; return fresh; } }],
    clock: () => new Date("2026-08-15T08:30:00.000Z"),
  });

  const output = await provider.resolveWeather({
    brief: { destination: "大理", dates: "2026-08-23 至 2026-08-23" },
    existingWeather: { ...fresh, tripDates: ["2026-08-20"] },
  });

  assert.equal(calls, 1);
  assert.deepEqual(output.tripDates, ["2026-08-23"]);
});

test("composite research keeps other sources usable but exposes an AMap account gate", async () => {
  const output = await new CompositeTravelResearchProvider({
    providers: [
      { status: "configured", research: async () => ({ status: "ACCOUNT_LIMITED", provider: "amap_web_service" }) },
      { status: "configured", research: async () => result("flyai", { food: [{ domain: "food", title: "餐厅候选" }], play: [], stay: [], transport: [] }, "https://flyai.open.fliggy.com/docs/overview") },
    ],
    weatherProviders: [{ status: "configured", getWeather: async () => ({ status: "completed", provider: "open_meteo", coverage: "dates_unknown", planningImpact: { active: false, severity: "none" } }) }],
  }).research({ domains: ["food"] });

  assert.equal(output.status, "completed");
  assert.equal(output.partial, true);
  assert.equal(output.errors.some((error) => error.code === "ACCOUNT_LIMITED" && error.provider === "amap_web_service"), true);
  assert.equal(output.caveats.some((item) => item.includes("餐厅") && item.includes("市内路线")), true);
});

test("composite research preserves a known AMap account gate when only weather returns", async () => {
  const output = await new CompositeTravelResearchProvider({
    providers: [{ status: "configured", research: async () => ({ status: "EMPTY_VERIFIED", provider: "fliggy_flyai", fabricatedResults: false }) }],
    weatherProviders: [{ status: "configured", getWeather: async () => ({ status: "completed", provider: "open_meteo", checkedAt: "2026-08-19T05:00:00.000Z", coverage: "dates_unknown", planningImpact: { active: false, severity: "none" } }) }],
    staticErrors: [{ code: "ACCOUNT_LIMITED", provider: "amap_web_service", infoCode: "10044" }],
  }).research({ domains: ["food"], brief: { destination: "大理" } });

  assert.equal(output.status, "completed");
  assert.equal(output.byDomain.food.length, 0);
  assert.equal(output.errors.some((error) => error.code === "ACCOUNT_LIMITED" && error.provider === "amap_web_service"), true);
  assert.equal(output.caveats.some((item) => item.includes("餐厅") && item.includes("市内路线")), true);
});

test("composite research merges the same flight across providers without losing fares or evidence", async () => {
  const checkedAt = "2026-08-19T05:00:00.000Z";
  const candidate = (provider, price, extra = {}) => ({
    candidateId: `transport_${provider}`,
    domain: "transport",
    title: "CZ3481 白云国际机场 → 大理机场",
    summary: `${provider} 航班资料`,
    cost: price,
    checkedAt,
    sourceId: `${provider}:cz3481`,
    claimId: `claim_${provider}`,
    entityId: `entity_${provider}`,
    operability: { provider, transportType: "FLIGHT", serviceNumber: "CZ3481", departureAt: provider === "fliggy_flyai" ? "2026-09-03 06:20:00" : "2026-09-03 06:20", arrivalAt: "2026-09-03 09:25", fareOffers: [{ provider, providerLabel: provider, currency: "CNY", totalFare: price, baseFare: null, taxes: null, checkedAt, bookingUrl: extra.bookingUrl ?? null }], ...extra },
    source: { sourceId: `${provider}:cz3481`, provider, sourceType: "official_ota_search", providerPoiId: "cz3481", checkedAt, documentationUrl: provider === "fliggy_flyai" ? "https://flyai.open.fliggy.com/docs/overview" : "https://open.tuniu.com/mcp/docs/", independenceGroup: `${provider}:cz3481`, commercialBias: "ota_commercial_inventory" },
    entity: { entityId: `entity_${provider}`, kind: "transport_offer", canonicalName: "CZ3481", providerRefs: [`${provider}:cz3481`] },
    claim: { claimId: `claim_${provider}`, entityId: `entity_${provider}`, statement: "航班存在", sourceRefs: [`${provider}:cz3481`] },
  });
  const providers = [
    { status: "configured", research: async () => result("fliggy_flyai", { play: [], food: [], stay: [], transport: [candidate("fliggy_flyai", 840, { bookingUrl: "https://router.feizhu.com/flight" })] }, "https://flyai.open.fliggy.com/docs/overview") },
    { status: "configured", research: async () => result("tuniu_official_mcp", { play: [], food: [], stay: [], transport: [candidate("tuniu_official_mcp", 1040, { departureTerminal: "T2" })] }, "https://open.tuniu.com/mcp/docs/") },
  ];

  const output = await new CompositeTravelResearchProvider({ providers }).research({ domains: ["transport"] });

  assert.equal(output.byDomain.transport.length, 1);
  assert.equal(output.byDomain.transport[0].operability.departureTerminal, "T2");
  assert.equal(output.byDomain.transport[0].operability.bookingUrl, "https://router.feizhu.com/flight");
  assert.deepEqual(output.byDomain.transport[0].operability.fareOffers.map(({ provider, totalFare }) => ({ provider, totalFare })), [
    { provider: "fliggy_flyai", totalFare: 840 },
    { provider: "tuniu_official_mcp", totalFare: 1040 },
  ]);
  assert.equal(output.byDomain.transport[0].additionalEvidence.length, 1);
});

test("AMap stations cannot displace a requested intercity flight returned by a later provider", async () => {
  const stations = Array.from({ length: 8 }, (_, index) => ({
    domain: "transport",
    title: `上海交通设施 ${index + 1}`,
    cost: 0,
    operability: { provider: "amap_web_service", mobilityRole: "transport_facility_poi", type: "交通设施服务;火车站" },
  }));
  const flight = {
    domain: "transport",
    title: "CZ3525 广州白云国际机场 → 上海浦东国际机场",
    cost: 780,
    operability: {
      provider: "tuniu_official_mcp",
      mobilityRole: "intercity_inventory",
      transportType: "FLIGHT",
      serviceNumber: "CZ3525",
      departureAt: "2026-08-27 11:30",
      arrivalAt: "2026-08-27 14:00",
      arrivalPlace: { kind: "airport", city: "上海", label: "上海浦东国际机场", terminal: "T2" },
      fareOffers: [{ provider: "tuniu_official_mcp", totalFare: 780 }],
    },
  };
  const criteria = buildTravelResearchCriteria({
    brief: { destination: "上海", origin: "广州", dates: "2026-08-27 至 2026-08-29", arrivalMode: "飞机", arrivalAirport: "浦东机场", arrivalTerminal: "T2" },
    domains: ["transport"],
  });
  const output = await new CompositeTravelResearchProvider({ providers: [
    { status: "configured", research: async () => result("amap", { play: [], food: [], stay: [], transport: stations }, "https://lbs.amap.com/") },
    { status: "configured", research: async () => result("tuniu", { play: [], food: [], stay: [], transport: [flight] }, "https://open.tuniu.com/mcp/docs/") },
  ] }).research({ domains: ["transport"], criteria });

  assert.equal(output.byDomain.transport.length, 1);
  assert.equal(output.byDomain.transport[0].operability.transportType, "FLIGHT");
  assert.equal(output.byDomain.transport[0].operability.arrivalRouteAnchor, undefined, "an unconfirmed desired arrival must not override the actual inventory arrival");
  assert.equal(output.byDomain.transport[0].operability.arrivalPlace.label, "上海浦东国际机场");
});

test("criteria fusion filters hotel entities from food and unrelated areas or attractions", async () => {
  const criteria = buildTravelResearchCriteria({
    brief: { destination: "上海", lodgingPreference: "人民广场或南京东路", foodPreferences: ["本帮菜", "不太大众的小店"] },
    domains: ["play", "food", "stay"],
    criteria: { byDomain: { play: { namedEntities: ["外滩", "博物馆"] } } },
  });
  const mapHotel = { domain: "stay", title: "南京东路旅行酒店", location: { address: "南京东路 100 号", coordinates: { longitude: 121.48, latitude: 31.24 } }, operability: { provider: "amap_web_service", type: "住宿服务;宾馆酒店", inventoryVerified: false } };
  const otaHotel = { domain: "stay", title: "南京东路旅行酒店", location: { address: "南京东路 100 号" }, cost: 680, operability: { provider: "tuniu_official_mcp", inventoryVerified: true, roomName: "高级双床房", meal: "双早", refundPolicy: "入住前一天可退" } };
  const output = await new CompositeTravelResearchProvider({ providers: [
    { status: "configured", research: async () => result("amap", {
      play: [{ domain: "play", title: "外滩", operability: { provider: "amap_web_service", type: "风景名胜" } }, { domain: "play", title: "上海市历史博物馆", operability: { provider: "amap_web_service", type: "科教文化服务;博物馆" } }, { domain: "play", title: "复旦大学", operability: { provider: "amap_web_service", type: "科教文化服务;学校" } }],
      food: [{ domain: "food", title: "和平饭店", operability: { provider: "amap_web_service", type: "住宿服务;宾馆酒店", typeCode: "100100" } }, { domain: "food", title: "老上海本帮菜馆", location: { address: "人民广场附近" }, operability: { provider: "amap_web_service", type: "餐饮服务;中餐厅", typeCode: "050100" } }],
      stay: [mapHotel, { domain: "stay", title: "松江远郊酒店", location: { address: "松江区" }, operability: { provider: "amap_web_service", type: "住宿服务;宾馆酒店" } }],
      transport: [],
    }, "https://lbs.amap.com/") },
    { status: "configured", research: async () => result("tuniu", { play: [], food: [], stay: [otaHotel], transport: [] }, "https://open.tuniu.com/mcp/docs/") },
  ] }).research({ domains: ["play", "food", "stay"], criteria });

  assert.deepEqual(output.byDomain.play.map((item) => item.title), ["外滩", "上海市历史博物馆"]);
  assert.deepEqual(output.byDomain.food.map((item) => item.title), ["老上海本帮菜馆"]);
  assert.deepEqual(output.byDomain.stay.map((item) => item.title), ["南京东路旅行酒店"]);
  assert.equal(output.byDomain.stay[0].operability.inventoryVerified, true);
  assert.equal(output.byDomain.stay[0].operability.roomName, "高级双床房");
  assert.ok(Number.isFinite(output.byDomain.stay[0].location.coordinates.longitude));
  assert.equal(output.caveats.some((item) => item.includes("不能单独证明") && item.includes("真实到访反馈")), true);
});

test("long-tail food ranking demotes low-rated commercial food halls", async () => {
  const criteria = buildTravelResearchCriteria({ brief: { destination: "上海", lodgingPreference: "人民广场", foodPreferences: ["本帮菜", "不太大众的小店"] }, domains: ["food"], question: "想吃本帮菜和不太大众的小店" });
  const output = await new CompositeTravelResearchProvider({ providers: [{ status: "configured", research: async () => result("amap", { play: [], stay: [], transport: [], food: [
    { domain: "food", title: "沪上商业美食城购物中心店", summary: "餐饮服务", location: { address: "人民广场" }, operability: { provider: "amap_web_service", type: "餐饮服务;美食城", typeCode: "050100", rating: "3.7" } },
    { domain: "food", title: "老上海本帮菜馆", summary: "本帮菜", location: { address: "人民广场附近" }, operability: { provider: "amap_web_service", type: "餐饮服务;中餐厅", typeCode: "050100", rating: "4.6" } },
  ] }, "https://lbs.amap.com/") }] }).research({ domains: ["food"], criteria });

  assert.equal(output.byDomain.food[0].title, "老上海本帮菜馆");
  assert.equal(output.byDomain.food[0].operability.longTailEvidence, "not_verified_by_current_sources");
});

test("transport source status distinguishes verified empty, unavailable and rate limited", async () => {
  const empty = await new CompositeTravelResearchProvider({ providers: [
    { status: "configured", research: async () => result("ota_empty", { play: [], food: [], stay: [], transport: [] }, "https://example.com/empty") },
  ] }).research({ domains: ["transport"] });
  assert.equal(empty.domainStatuses.transport.status, "empty_verified");
  assert.equal(empty.domainStatuses.transport.providers[0].status, "empty_verified");

  const unavailable = await new CompositeTravelResearchProvider({ providers: [
    { status: "configured", research: async () => ({ status: "SOURCE_UNAVAILABLE", provider: "ota_unavailable", fabricatedResults: false }) },
  ] }).research({ domains: ["transport"] });
  assert.equal(unavailable.domainStatuses.transport.status, "provider_unavailable");
  assert.equal(unavailable.domainStatuses.transport.providers[0].status, "provider_unavailable");

  const limited = await new CompositeTravelResearchProvider({ providers: [
    { status: "configured", research: async () => ({ status: "RATE_LIMITED", provider: "ota_limited", fabricatedResults: false }) },
  ] }).research({ domains: ["transport"] });
  assert.equal(limited.domainStatuses.transport.status, "rate_limited");
  assert.equal(limited.domainStatuses.transport.providers[0].status, "rate_limited");
});

test("AMap transport facilities never turn verified-empty intercity inventory into a completed source", async () => {
  const output = await new CompositeTravelResearchProvider({ providers: [
    { status: "configured", research: async () => result("amap_web_service", { play: [], food: [], stay: [], transport: [{ domain: "transport", title: "上海站", operability: { provider: "amap_web_service", mobilityRole: "transport_facility_poi" } }] }, "https://lbs.amap.com/") },
    { status: "configured", research: async () => result("tuniu_official_mcp", { play: [], food: [], stay: [], transport: [] }, "https://open.tuniu.com/mcp/docs/") },
  ] }).research({ domains: ["transport"], criteria: { intercityIntent: "flight" } });

  assert.equal(output.status, "EMPTY_VERIFIED");
  assert.equal(output.domainStatuses.transport.status, "empty_verified");
  assert.deepEqual(output.domainStatuses.transport.providers.map((row) => row.provider), ["tuniu_official_mcp"]);
});

test("a Provider partial response stays partial instead of being collapsed into unavailable", async () => {
  const output = await new CompositeTravelResearchProvider({ providers: [
    { status: "configured", research: async () => ({ ...result("ota_partial", { play: [], food: [], stay: [], transport: [] }, "https://example.com/partial"), status: "partial", partial: true }) },
  ] }).research({ domains: ["transport"] });

  assert.equal(output.domainStatuses.transport.status, "partial");
  assert.equal(output.domainStatuses.transport.providers[0].status, "partial");
});
