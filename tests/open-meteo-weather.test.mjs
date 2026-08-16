import assert from "node:assert/strict";
import test from "node:test";
import { createOpenMeteoWeatherProvider, OpenMeteoWeatherProvider } from "../src/providers/open-meteo-weather.mjs";

function fakeFetch(url) {
  const parsed = new URL(url);
  if (parsed.hostname.includes("geocoding-api")) {
    return Promise.resolve(new Response(JSON.stringify({ results: [{ name: "大理市", admin1: "云南", latitude: 25.69, longitude: 100.17, timezone: "Asia/Shanghai" }] }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  assert.equal(parsed.pathname, "/v1/forecast");
  assert.match(parsed.searchParams.get("daily"), /precipitation_probability_max/);
  return Promise.resolve(new Response(JSON.stringify({ daily: {
    time: ["2026-08-14", "2026-08-15"],
    weather_code: [63, 2],
    temperature_2m_max: [26, 28],
    temperature_2m_min: [18, 17],
    precipitation_probability_max: [80, 20],
    wind_speed_10m_max: [22, 14],
  } }), { status: 200, headers: { "content-type": "application/json" } }));
}

test("Open-Meteo fallback returns attributable date-covered weather without a key in local evaluation", async () => {
  const provider = new OpenMeteoWeatherProvider({ fetchImpl: fakeFetch, clock: () => new Date("2026-08-14T08:00:00.000Z") });
  const weather = await provider.getWeather({ brief: { destination: "大理", dates: "2026-08-14 至 2026-08-15" } });
  assert.equal(weather.status, "completed");
  assert.equal(weather.coverage, "covered");
  assert.equal(weather.planningImpact.active, true);
  assert.deepEqual(weather.riskSignals, ["precipitation"]);
  assert.match(weather.attribution, /Open-Meteo/);
  assert.equal(weather.usageMode, "noncommercial_development");
});

test("Open-Meteo production route stays blocked without a commercial API key", () => {
  const provider = createOpenMeteoWeatherProvider({ NODE_ENV: "production", TRAVEL_AGENT_OPEN_METEO_ENABLED: "true", OPEN_METEO_API_KEY: "" });
  assert.equal(provider.status, "provider_unavailable");
});
