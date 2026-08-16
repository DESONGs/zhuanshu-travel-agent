import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { signedAmapParameters } from "../src/providers/amap-travel-research.mjs";

const REQUEST_INTERVAL_MS = 2_200;
const env = await loadTravelRuntimeEnv();

if (!env.AMAP_API_KEY) {
  process.stdout.write(`${JSON.stringify({ status: "blocked", reason: "AMAP_API_KEY_not_configured", sensitiveOutput: false }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  const cases = [
    {
      caseId: "v5_keyword_minimal_beijing",
      endpoint: "https://restapi.amap.com/v5/place/text",
      params: { keywords: "北京大学", region: "北京", city_limit: "true", page_size: "1", page_num: "1", output: "json" },
    },
    {
      caseId: "v5_types_only_shanghai",
      endpoint: "https://restapi.amap.com/v5/place/text",
      params: { types: "050000", region: "上海", city_limit: "true", page_size: "1", page_num: "1", output: "json" },
    },
    {
      caseId: "v5_enriched_keyword_shanghai",
      endpoint: "https://restapi.amap.com/v5/place/text",
      params: { keywords: "外滩", types: "110000", region: "上海", city_limit: "true", show_fields: "business,navi,indoor,photos", page_size: "1", page_num: "1", output: "json" },
    },
    {
      caseId: "v5_invalid_parameter_control",
      endpoint: "https://restapi.amap.com/v5/place/text",
      params: { region: "上海", city_limit: "true", page_size: "1", page_num: "1", output: "json" },
    },
    {
      caseId: "v3_keyword_shanghai",
      endpoint: "https://restapi.amap.com/v3/place/text",
      params: { keywords: "外滩", city: "上海", citylimit: "true", extensions: "all", offset: "1", page: "1", output: "json" },
    },
    {
      caseId: "v3_geocode_shanghai",
      endpoint: "https://restapi.amap.com/v3/geocode/geo",
      params: { address: "上海市人民广场", city: "上海", output: "json" },
    },
    {
      caseId: "v3_weather_beijing",
      endpoint: "https://restapi.amap.com/v3/weather/weatherInfo",
      params: { city: "110000", extensions: "all", output: "json" },
    },
  ];

  const results = [];
  let previousStartedAt = null;
  for (const testCase of cases) {
    if (previousStartedAt !== null) {
      const remaining = REQUEST_INTERVAL_MS - (Date.now() - previousStartedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    const startedAt = Date.now();
    previousStartedAt = startedAt;
    const parameters = signedAmapParameters({ ...testCase.params, key: env.AMAP_API_KEY }, env.AMAP_API_SECRET);
    try {
      const response = await fetch(`${testCase.endpoint}?${parameters}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      const payload = await response.json();
      const pois = Array.isArray(payload?.pois) ? payload.pois : [];
      const forecasts = Array.isArray(payload?.forecasts) ? payload.forecasts : [];
      const geocodes = Array.isArray(payload?.geocodes) ? payload.geocodes : [];
      results.push({
        caseId: testCase.caseId,
        endpoint: new URL(testCase.endpoint).pathname,
        requestStartedAt: new Date(startedAt).toISOString(),
        intervalFromPreviousMs: results.length ? startedAt - new Date(results.at(-1).requestStartedAt).getTime() : null,
        elapsedMs: Date.now() - startedAt,
        httpStatus: response.status,
        status: String(payload?.status ?? ""),
        infoCode: String(payload?.infocode ?? ""),
        info: String(payload?.info ?? "").slice(0, 160),
        resultCount: pois.length || forecasts.length || geocodes.length,
        sampleNames: pois.slice(0, 2).map((poi) => String(poi?.name ?? "").slice(0, 80)).filter(Boolean),
      });
    } catch (error) {
      results.push({
        caseId: testCase.caseId,
        endpoint: new URL(testCase.endpoint).pathname,
        requestStartedAt: new Date(startedAt).toISOString(),
        intervalFromPreviousMs: results.length ? startedAt - new Date(results.at(-1).requestStartedAt).getTime() : null,
        elapsedMs: Date.now() - startedAt,
        transportError: error?.name ?? "request_failed",
      });
    }
  }

  const infoCodes = [...new Set(results.map((result) => result.infoCode).filter(Boolean))];
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "amap-web-service-diagnostic-v1",
    status: results.every((result) => result.infoCode === "10000" || result.caseId === "v5_invalid_parameter_control") ? "completed" : "diagnostic_failure_observed",
    requestIntervalMs: REQUEST_INTERVAL_MS,
    qpsUpperBound: Number((1_000 / REQUEST_INTERVAL_MS).toFixed(3)),
    infoCodes,
    results,
    sensitiveOutput: false,
  }, null, 2)}\n`);
}
