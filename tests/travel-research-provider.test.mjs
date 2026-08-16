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
  assert.equal(output.caveats.some((item) => item.includes("高德 POI 核验不完整")), true);
});
