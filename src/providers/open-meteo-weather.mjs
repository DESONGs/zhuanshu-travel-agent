const FREE_GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const FREE_FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CUSTOMER_GEOCODE_ENDPOINT = "https://customer-geocoding-api.open-meteo.com/v1/search";
const CUSTOMER_FORECAST_ENDPOINT = "https://customer-api.open-meteo.com/v1/forecast";
const DOCUMENTATION_URL = "https://open-meteo.com/en/docs";

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function dateRange(value) {
  const parsed = [...String(value ?? "").matchAll(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/g)].map((match) => {
    const [year, month, day] = match[1].split("-").map(Number);
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
  if (!parsed.length) return [];
  const start = new Date(`${parsed[0]}T00:00:00.000Z`);
  const end = new Date(`${parsed[1] ?? parsed[0]}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const dates = [];
  for (let cursor = start; cursor <= end && dates.length < 60; cursor = new Date(cursor.getTime() + 86_400_000)) dates.push(cursor.toISOString().slice(0, 10));
  return dates;
}

function weatherCondition(code) {
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return code >= 65 ? "大雨" : "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return code === 82 ? "强阵雨" : "阵雨";
  if ([85, 86].includes(code)) return "阵雪";
  if (code >= 95) return "雷暴";
  return "天气待确认";
}

function providerError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

export class OpenMeteoWeatherProvider {
  constructor({ apiKey = "", commercial = false, fetchImpl = globalThis.fetch, clock, timeoutMs = 8_000, enabled = true } = {}) {
    this.apiKey = text(apiKey, 512);
    this.commercial = commercial === true;
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.timeoutMs = timeoutMs;
    this.enabled = enabled === true && (!this.commercial || Boolean(this.apiKey));
  }

  get status() {
    return this.enabled ? "configured" : "provider_unavailable";
  }

  async request(endpoint, parameters) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
    if (this.apiKey) url.searchParams.set("apikey", this.apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw providerError(response.status === 429 ? "RATE_LIMITED" : "SOURCE_UNAVAILABLE", { provider: "open_meteo", httpStatus: response.status });
      const payload = await response.json();
      if (payload?.error) throw providerError("SOURCE_UNAVAILABLE", { provider: "open_meteo", reason: text(payload.reason, 160) });
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw providerError("SOURCE_UNAVAILABLE", { provider: "open_meteo", reason: "timeout" });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getWeather({ brief = {} } = {}) {
    if (!this.enabled) return { schemaVersion: "trip-weather-v1", status: "provider_unavailable", reason: this.commercial ? "OPEN_METEO_API_KEY_not_configured" : "open_meteo_disabled", fabricatedResults: false };
    const destination = text(brief.destination, 120);
    if (!destination) return { schemaVersion: "trip-weather-v1", status: "provider_unavailable", reason: "destination_required", fabricatedResults: false };
    try {
      const geocode = await this.request(this.commercial ? CUSTOMER_GEOCODE_ENDPOINT : FREE_GEOCODE_ENDPOINT, { name: destination, count: 1, language: "zh", format: "json" });
      const location = Array.isArray(geocode.results) ? geocode.results[0] : null;
      if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return { schemaVersion: "trip-weather-v1", status: "EMPTY_VERIFIED", reason: "destination_coordinates_not_found", fabricatedResults: false };
      const payload = await this.request(this.commercial ? CUSTOMER_FORECAST_ENDPOINT : FREE_FORECAST_ENDPOINT, {
        latitude: location.latitude,
        longitude: location.longitude,
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
        timezone: "auto",
        forecast_days: 16,
      });
      const daily = payload.daily ?? {};
      const forecastDays = (Array.isArray(daily.time) ? daily.time : []).slice(0, 16).map((date, index) => {
        const code = Number(daily.weather_code?.[index]);
        return {
          date: text(date, 10),
          weekday: null,
          dayCondition: weatherCondition(code),
          nightCondition: null,
          highC: Number.isFinite(daily.temperature_2m_max?.[index]) ? daily.temperature_2m_max[index] : null,
          lowC: Number.isFinite(daily.temperature_2m_min?.[index]) ? daily.temperature_2m_min[index] : null,
          dayWind: null,
          nightWind: null,
          maxWindLevel: null,
          maxWindKph: Number.isFinite(daily.wind_speed_10m_max?.[index]) ? daily.wind_speed_10m_max[index] : null,
          precipitationProbability: Number.isFinite(daily.precipitation_probability_max?.[index]) ? daily.precipitation_probability_max[index] : null,
          weatherCode: Number.isFinite(code) ? code : null,
        };
      }).filter((day) => day.date);
      const tripDates = dateRange(brief.dates);
      const availableDates = new Set(forecastDays.map((day) => day.date));
      const coveredDates = tripDates.filter((date) => availableDates.has(date));
      const coverage = !tripDates.length ? "dates_unknown" : !coveredDates.length ? "outside_forecast_window" : coveredDates.length === tripDates.length ? "covered" : "partial";
      const relevant = forecastDays.filter((day) => coveredDates.includes(day.date));
      const precipitation = relevant.some((day) => (day.precipitationProbability ?? 0) >= 60 || (day.weatherCode ?? 0) >= 51);
      const heat = relevant.some((day) => day.highC != null && day.highC >= 35);
      const cold = relevant.some((day) => day.lowC != null && day.lowC <= 5);
      const strongWind = relevant.some((day) => day.maxWindKph != null && day.maxWindKph >= 38);
      const severe = relevant.some((day) => [65, 67, 75, 77, 82, 86, 95, 96, 99].includes(day.weatherCode)) || heat || strongWind;
      const riskSignals = [...(precipitation ? ["precipitation"] : []), ...(heat ? ["heat"] : []), ...(cold ? ["cold"] : []), ...(strongWind ? ["strong_wind"] : [])];
      const severity = severe ? "high" : riskSignals.length ? "watch" : "none";
      const active = ["covered", "partial"].includes(coverage) && severity !== "none";
      return {
        schemaVersion: "trip-weather-v1",
        status: "completed",
        provider: "open_meteo",
        destination,
        city: text(location.name, 120) || destination,
        province: text(location.admin1, 120) || null,
        adcode: null,
        reportTime: null,
        checkedAt: new Date(this.clock?.() ?? Date.now()).toISOString(),
        coverage,
        tripDates,
        forecastDays,
        riskSignals,
        planningImpact: {
          active,
          severity,
          affectedDomains: active ? ["play", "food", "stay", "transport"] : [],
          guidance: {
            play: active ? (precipitation ? "优先室内或可取消体验，户外项目保留替代方案。" : "调整高暴露户外活动时段并保留休息窗口。") : null,
            transport: active ? "减少紧凑换乘并增加步行、等车和行李移动缓冲。" : null,
            stay: active ? "优先公共交通与室内衔接便利的位置。" : null,
            food: active ? "餐饮尽量靠近当日活动或住宿，减少额外往返。" : null,
          },
        },
        sourceDocumentation: DOCUMENTATION_URL,
        attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
        usageMode: this.commercial ? "commercial_subscription" : "noncommercial_development",
        caveat: coverage === "outside_forecast_window" ? "行程日期不在当前预报窗口内，暂不据此改动方案，临近出发需重新核验。" : coverage === "dates_unknown" ? "尚无可解析的具体日期，当前预报只作目的地近期天气参考。" : null,
        fabricatedResults: false,
      };
    } catch (error) {
      return { schemaVersion: "trip-weather-v1", status: error?.code ?? "SOURCE_UNAVAILABLE", reason: error?.code ?? "SOURCE_UNAVAILABLE", diagnostic: error?.details ?? null, sourceDocumentation: DOCUMENTATION_URL, fabricatedResults: false };
    }
  }
}

export function createOpenMeteoWeatherProvider(env = process.env, options = {}) {
  const commercial = env.NODE_ENV === "production";
  const enabled = env.TRAVEL_AGENT_OPEN_METEO_ENABLED !== "false" && (!commercial || Boolean(env.OPEN_METEO_API_KEY));
  return new OpenMeteoWeatherProvider({ apiKey: env.OPEN_METEO_API_KEY, commercial, enabled, ...options });
}

export { CUSTOMER_FORECAST_ENDPOINT, CUSTOMER_GEOCODE_ENDPOINT, DOCUMENTATION_URL, FREE_FORECAST_ENDPOINT, FREE_GEOCODE_ENDPOINT };
