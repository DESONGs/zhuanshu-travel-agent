import { createAmapTravelResearchProvider } from "./amap-travel-research.mjs";
import { createFlyaiTravelResearchProvider } from "./flyai-travel-research.mjs";
import { createOpenMeteoWeatherProvider } from "./open-meteo-weather.mjs";
import { createTuniuTravelResearchProvider } from "./tuniu-travel-research.mjs";

const DOMAINS = Object.freeze(["play", "food", "stay", "transport"]);

function tripDates(value) {
  const dates = [...String(value ?? "").matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (!dates.length) return [];
  const start = new Date(`${dates[0]}T00:00:00.000Z`);
  const end = new Date(`${dates[1] ?? dates[0]}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const result = [];
  for (let cursor = start; cursor <= end && result.length < 60; cursor = new Date(cursor.getTime() + 86_400_000)) result.push(cursor.toISOString().slice(0, 10));
  return result;
}

function weatherGapCaveat(weather) {
  if (weather?.status === "completed") return null;
  return "旅行日期对应的天气资料暂时不可用；地点候选可以先比较，但在天气核验完成前不能视为完整日程。";
}

function deduplicate(candidates) {
  const seen = new Set();
  const output = [];
  for (const candidate of candidates) {
    const key = `${candidate.domain}:${String(candidate.title ?? "").trim().toLowerCase()}`;
    if (!candidate.title || seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output.slice(0, 6);
}

export class CompositeTravelResearchProvider {
  constructor({ providers = [], weatherProviders = [], clock } = {}) {
    this.providers = providers.filter(Boolean);
    this.weatherProviders = weatherProviders.filter(Boolean);
    this.clock = clock;
  }

  get configuredProviders() {
    return this.providers.filter((provider) => provider.status === "configured");
  }

  get status() {
    return this.configuredProviders.length ? "configured" : "provider_unavailable";
  }

  get mapProvider() {
    return this.configuredProviders.find((provider) => provider.canRenderMap && typeof provider.renderStaticMap === "function") ?? null;
  }

  get canRenderMap() {
    return Boolean(this.mapProvider);
  }

  renderStaticMap(input) {
    if (!this.mapProvider) throw Object.assign(new Error("trip_map_unavailable"), { code: "trip_map_unavailable" });
    return this.mapProvider.renderStaticMap(input);
  }

  get mobilityProvider() {
    return this.configuredProviders.find((provider) => typeof provider.planMobility === "function") ?? null;
  }

  get canPlanMobility() {
    return Boolean(this.mobilityProvider);
  }

  planMobility(input) {
    if (!this.mobilityProvider) {
      return Promise.resolve({
        schemaVersion: "trip-mobility-v1",
        status: "provider_unavailable",
        destination: input?.brief?.destination ?? null,
        source: "amap_routes_v5",
        reason: "amap_routes_live_smoke_required",
        fabricatedResults: false,
      });
    }
    return this.mobilityProvider.planMobility(input);
  }

  async resolveWeather(input) {
    const existing = input?.existingWeather;
    const checkedAt = new Date(existing?.checkedAt ?? 0).getTime();
    const current = new Date(this.clock?.() ?? Date.now()).getTime();
    const expectedTripDates = tripDates(input?.brief?.dates);
    if (existing?.status === "completed"
      && existing.destination === input?.brief?.destination
      && JSON.stringify(existing.tripDates ?? []) === JSON.stringify(expectedTripDates)
      && Number.isFinite(checkedAt)
      && current >= checkedAt
      && current - checkedAt <= 3 * 60 * 60 * 1_000) return { ...existing, reused: true };
    let lastFailure = null;
    for (const provider of this.weatherProviders.filter((item) => item.status === "configured" && typeof item.getWeather === "function")) {
      const result = await provider.getWeather(input);
      if (result?.status === "completed") return result;
      lastFailure = result;
    }
    return lastFailure;
  }

  async research(input) {
    const providers = this.configuredProviders;
    const hasWeatherProvider = this.weatherProviders.some((provider) => provider.status === "configured" && typeof provider.getWeather === "function");
    if (!providers.length && !hasWeatherProvider) return { schemaVersion: "travel-provider-result-v1", status: "provider_unavailable", provider: "composite_travel_research", fabricatedResults: false };
    const [settled, weather] = await Promise.all([
      Promise.allSettled(providers.map((provider) => provider.research({ ...input, includeWeather: false }))),
      this.resolveWeather(input),
    ]);
    const completed = settled.filter((result) => result.status === "fulfilled" && result.value?.status === "completed").map((result) => result.value);
    const errors = settled.flatMap((result) => {
      if (result.status === "rejected") return [{ code: result.reason?.code ?? "SOURCE_UNAVAILABLE" }];
      if (result.value?.status !== "completed") return [{ code: result.value?.status ?? "SOURCE_UNAVAILABLE", provider: result.value?.provider ?? null }];
      return [];
    });
    if (!completed.length) {
      if (weather?.status === "completed") {
        return {
          schemaVersion: "travel-provider-result-v1",
          status: "completed",
          provider: weather.provider,
          providerLabel: "天气资料",
          destination: input?.brief?.destination ?? null,
          checkedAt: weather.checkedAt,
          byDomain: Object.fromEntries(DOMAINS.map((domain) => [domain, []])),
          partial: true,
          errors,
          weather,
          caveats: [weather.caveat].filter(Boolean),
          fabricatedResults: false,
          sourceDocumentation: weather.sourceDocumentation,
        };
      }
      return {
        schemaVersion: "travel-provider-result-v1",
        status: errors.some((error) => error.code === "AUTH_REQUIRED")
          ? "AUTH_REQUIRED"
          : errors.some((error) => error.code === "ACCOUNT_LIMITED")
            ? "ACCOUNT_LIMITED"
            : errors.some((error) => error.code === "RATE_LIMITED")
              ? "RATE_LIMITED"
              : "EMPTY_VERIFIED",
        provider: "composite_travel_research",
        errors,
        fabricatedResults: false,
      };
    }
    const byDomain = Object.fromEntries(DOMAINS.map((domain) => [domain, deduplicate(completed.flatMap((result) => result.byDomain?.[domain] ?? []))]));
    const requested = Array.isArray(input?.domains) && input.domains.length ? input.domains : DOMAINS;
    const weatherCaveat = weatherGapCaveat(weather);
    const amapAccountGate = errors.some((error) => error.code === "ACCOUNT_LIMITED" && error.provider === "amap_web_service");
    return {
      schemaVersion: "travel-provider-result-v1",
      status: Object.values(byDomain).some((items) => items.length) ? "completed" : "EMPTY_VERIFIED",
      provider: completed.map((result) => result.provider).join("+"),
      providerLabel: completed.map((result) => result.providerLabel).filter(Boolean).join(" + "),
      destination: completed.find((result) => result.destination)?.destination ?? input?.brief?.destination ?? null,
      checkedAt: completed.map((result) => result.checkedAt).filter(Boolean).sort().at(-1) ?? new Date().toISOString(),
      byDomain,
      partial: errors.length > 0 || completed.some((result) => result.partial) || requested.some((domain) => !(byDomain[domain]?.length)) || weather?.status !== "completed",
      errors: [
        ...errors,
        ...(weather && weather.status !== "completed" ? [{ code: weather.status, provider: weather.provider ?? null, capability: "weather" }] : []),
      ],
      weather,
      caveats: [...new Set([
        ...completed.flatMap((result) => result.caveats ?? []),
        ...(amapAccountGate ? ["高德地图账号当前被平台阻止访问；本轮可以比较其它已接通来源的候选，但地图、地点照片和高德 POI 核验不完整。"] : []),
        weatherCaveat,
      ].filter(Boolean))],
      fabricatedResults: false,
      sourceDocumentation: completed.find((result) => result.sourceDocumentation)?.sourceDocumentation ?? null,
    };
  }
}

export function createTravelResearchProvider(env = process.env, options = {}) {
  const amap = createAmapTravelResearchProvider(env, options.amap);
  const openMeteo = createOpenMeteoWeatherProvider(env, options.openMeteo);
  const weatherProviders = env.TRAVEL_AGENT_AMAP_SMOKE_STATUS === "passed_live_smoke" ? [amap, openMeteo] : [openMeteo, amap];
  return new CompositeTravelResearchProvider({
    providers: [
      amap,
      createFlyaiTravelResearchProvider(env, options.flyai),
      createTuniuTravelResearchProvider(env, options.tuniu),
    ],
    weatherProviders,
    clock: options.clock,
  });
}
