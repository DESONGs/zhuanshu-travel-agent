import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { AmapTravelResearchProvider } from "../src/providers/amap-travel-research.mjs";

const env = await loadTravelRuntimeEnv();
if (!env.AMAP_API_KEY) {
  process.stdout.write(`${JSON.stringify({ provider: "amap_web_service", status: "blocked", reason: "AMAP_API_KEY_not_configured", sensitiveOutput: false }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  const start = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const provider = new AmapTravelResearchProvider({ apiKey: env.AMAP_API_KEY, apiSecret: env.AMAP_API_SECRET, enabled: true });
  const result = await provider.research({
    brief: { destination: "上海", dates: `${start} 至 ${end}` },
    domains: ["play", "food", "stay", "transport"],
    criteria: {
      byDomain: {
        play: { namedEntities: ["外滩"] },
        food: { targetAreas: ["人民广场"], keywords: ["本帮菜"] },
        stay: { targetAreas: ["人民广场"], keywords: ["酒店"] },
        transport: { namedEntities: ["上海浦东国际机场"] },
      },
    },
  });
  const counts = Object.fromEntries(Object.entries(result.byDomain ?? {}).map(([domain, items]) => [domain, items.length]));
  const candidates = Object.values(result.byDomain ?? {}).flat();
  const points = candidates.map((candidate) => ({ coordinates: candidate.location?.coordinates })).filter((point) => point.coordinates).slice(0, 10);
  const photoCount = candidates.reduce((count, candidate) => count + (candidate.media?.length ?? 0), 0);
  const mobilityNodes = candidates.filter((candidate) => candidate.location?.coordinates).slice(0, 2).map((candidate, index) => ({
    nodeId: `smoke_${index + 1}`,
    domain: candidate.domain === "stay" ? "stay" : index === 0 ? "play" : "food",
    title: candidate.title,
    selected: true,
    location: candidate.location,
    operability: candidate.operability,
  }));
  const mobility = mobilityNodes.length >= 2
    ? await provider.planMobility({ brief: { destination: "上海", dates: `${start} 至 ${end}` }, selectedNodes: mobilityNodes, travelers: [] })
    : { status: "needs_context", reason: "not_enough_geocoded_smoke_candidates", legs: [] };
  let mapPreview = { status: "not_run" };
  if (points.length) {
    try {
      const paths = (mobility.legs ?? []).map((leg) => leg.alternatives?.find((alternative) => alternative.mode === leg.recommendedMode)?.polyline ?? []).filter((path) => path.length >= 2);
      const map = await provider.renderStaticMap({ points, paths });
      mapPreview = { status: "passed", contentType: map.contentType, bytes: map.body.length };
    } catch (error) {
      mapPreview = { status: "failed", code: error?.code ?? "SOURCE_UNAVAILABLE", details: error?.details ?? null };
    }
  }
  const weather = result.weather ? {
    status: result.weather.status,
    coverage: result.weather.coverage ?? null,
    forecastDayCount: result.weather.forecastDays?.length ?? 0,
    provider: result.weather.provider ?? null,
  } : { status: "not_run" };
  const passed = result.status === "completed" && Object.values(counts).every((count) => count > 0) && mapPreview.status === "passed" && weather.status === "completed" && ["covered", "partial"].includes(weather.coverage) && ["completed", "partial"].includes(mobility.status) && (mobility.legs?.length ?? 0) > 0;
  process.stdout.write(`${JSON.stringify({
    provider: "amap_web_service",
    status: passed ? "passed_live_smoke" : result.status,
    destination: "上海",
    counts,
    photoCount,
    mapPreview,
    weather,
    mobility: { status: mobility.status, legCount: mobility.legs?.length ?? 0, reason: mobility.reason ?? null },
    partial: result.partial ?? null,
    diagnostic: result.errors?.[0]?.details ?? (result.reason ? { reason: result.reason } : null),
    fabricatedResults: result.fabricatedResults,
    sensitiveOutput: false,
    nextStep: passed ? "Set TRAVEL_AGENT_AMAP_SMOKE_STATUS=passed_live_smoke in the server-only environment." : "Keep the provider blocked and inspect the returned status.",
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}
