import assert from "node:assert/strict";
import test from "node:test";
import { CompositeTravelResearchProvider } from "../src/providers/travel-research-provider.mjs";

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
