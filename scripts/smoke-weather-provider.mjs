import assert from "node:assert/strict";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { createOpenMeteoWeatherProvider } from "../src/providers/open-meteo-weather.mjs";

const env = await loadTravelRuntimeEnv();
const provider = createOpenMeteoWeatherProvider({ ...env, NODE_ENV: "development" });
assert.equal(provider.status, "configured", "Open-Meteo local evaluation route is disabled");

const start = new Date();
start.setUTCDate(start.getUTCDate() + 2);
const end = new Date(start);
end.setUTCDate(end.getUTCDate() + 3);
const dates = `${start.toISOString().slice(0, 10)} 至 ${end.toISOString().slice(0, 10)}`;
const weather = await provider.getWeather({ brief: { destination: "上海", dates } });

assert.equal(weather.status, "completed", `Weather provider returned ${weather.status}: ${weather.reason ?? "unknown"}`);
assert.ok(weather.forecastDays.length > 0, "Weather provider returned no forecast days");
assert.ok(["covered", "partial"].includes(weather.coverage), `Trip dates are not covered: ${weather.coverage}`);
assert.equal(weather.fabricatedResults, false);
assert.match(weather.attribution, /Open-Meteo/);

process.stdout.write(`${JSON.stringify({
  status: "passed_noncommercial_development_smoke",
  provider: weather.provider,
  destination: weather.destination,
  coverage: weather.coverage,
  forecastDayCount: weather.forecastDays.length,
  riskSignals: weather.riskSignals,
  planningSeverity: weather.planningImpact.severity,
  usageMode: weather.usageMode,
  attribution: weather.attribution,
  sensitiveOutput: false,
  productionReady: false,
  nextStep: "Production requires a paid Open-Meteo customer key or an AMap weather route that has passed live smoke.",
}, null, 2)}\n`);
