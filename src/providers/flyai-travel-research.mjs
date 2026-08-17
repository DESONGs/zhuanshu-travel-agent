import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const FLYAI_PACKAGE_ROOT = dirname(require.resolve("@fly-ai/flyai-cli/package.json"));
const FLYAI_BIN = resolve(FLYAI_PACKAGE_ROOT, "dist/flyai-bundle.cjs");
const FLYAI_DOC = "https://flyai.open.fliggy.com/docs/overview";
const FLYAI_PROVIDER = "fliggy_flyai";

function text(value, limit = 500) {
  if (Array.isArray(value) || (value && typeof value === "object")) return "";
  return String(value ?? "").trim().slice(0, limit);
}

function shortHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeProviderUrl(value, kind = "handoff") {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:") return null;
    if (kind === "handoff" && url.hostname !== "router.feizhu.com") return null;
    if (kind === "image" && !(url.hostname === "alicdn.com" || url.hostname.endsWith(".alicdn.com"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function exactPrice(value) {
  const raw = text(value, 40).replace(/[¥￥,\s]/g, "");
  return /^\d+(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : 0;
}

function isoDate(year, month, day) {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;
}

function travelDates(value) {
  const raw = text(value, 160);
  const iso = [...raw.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)].map((match) => isoDate(match[1], match[2], match[3])).filter(Boolean);
  if (iso.length) return { start: iso[0], end: iso[1] ?? null };
  const chinese = raw.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日(?:\s*[-至到]\s*(?:(20\d{2})年)?(?:(\d{1,2})月)?(\d{1,2})日)?/);
  if (!chinese) return { start: null, end: null };
  return {
    start: isoDate(chinese[1], chinese[2], chinese[3]),
    end: chinese[6] ? isoDate(chinese[4] || chinese[1], chinese[5] || chinese[2], chinese[6]) : null,
  };
}

function candidateBase({ domain, providerRef, title, summary, checkedAt, media = [], location = null, cost = 0, operability = {} }) {
  const sourceId = `${FLYAI_PROVIDER}:${providerRef}`;
  const entityId = `entity_${shortHash(sourceId)}`;
  const claimId = `claim_${shortHash(`${sourceId}:${checkedAt}`)}`;
  return {
    candidateId: `${domain}_${shortHash(sourceId)}`,
    domain,
    title: text(title, 200),
    summary: text(summary, 900),
    sourceId,
    claimId,
    entityId,
    checkedAt,
    media,
    location,
    cost,
    operability: {
      provider: FLYAI_PROVIDER,
      providerRef,
      bookingProviderLabel: "飞猪",
      researchDepth: "official_ota_search",
      checkedAt,
      ...operability,
    },
    source: {
      sourceId,
      provider: FLYAI_PROVIDER,
      sourceType: "official_ota_search",
      providerPoiId: providerRef,
      checkedAt,
      documentationUrl: FLYAI_DOC,
      independenceGroup: sourceId,
      commercialBias: "ota_commercial_inventory",
    },
    entity: {
      entityId,
      kind: domain === "transport" ? "transport_offer" : "place",
      canonicalName: text(title, 200),
      providerRefs: [sourceId],
    },
    claim: {
      claimId,
      entityId,
      kind: "provider_fact",
      statement: text(summary, 1000),
      sourceRefs: [sourceId],
      sourceIndependence: "single_provider",
      commercialBias: "ota_commercial_inventory",
      confidence: 0.85,
      observedAt: checkedAt,
    },
  };
}

function normalizeHotel(item, checkedAt) {
  const providerRef = text(item.shId, 128) || shortHash(`${item.name}:${item.address}`);
  const priceHint = text(item.price, 40);
  const mediaUrl = safeProviderUrl(item.mainPic, "image");
  const longitude = numberOrNull(item.longitude);
  const latitude = numberOrNull(item.latitude);
  const address = text(item.address, 260);
  const facts = [text(item.star, 80), text(item.brandName, 80), priceHint ? `参考价 ${priceHint}` : "", text(item.interestsPoi, 160), text(item.address, 260)].filter(Boolean);
  return candidateBase({
    domain: "stay",
    providerRef,
    title: item.name,
    summary: facts.join(" · "),
    checkedAt,
    media: mediaUrl ? [{ url: mediaUrl, title: text(item.name, 120), source: FLYAI_PROVIDER }] : [],
    location: address || (longitude != null && latitude != null) ? {
      ...(address ? { address, label: address } : {}),
      ...(longitude != null && latitude != null ? { coordinates: { longitude, latitude, coordinateSystem: "GCJ-02" } } : {}),
    } : null,
    cost: exactPrice(priceHint),
    operability: {
      priceHint: priceHint || null,
      bookingUrl: safeProviderUrl(item.detailUrl),
      inventoryVerified: false,
      offerFreshness: "search_time",
    },
  });
}

function normalizePoi(item, checkedAt) {
  const providerRef = text(item.id, 128) || shortHash(`${item.name}:${item.address}`);
  const ticketPrice = text(item.ticketInfo?.price, 40);
  const mediaUrl = safeProviderUrl(item.mainPic, "image");
  const longitude = numberOrNull(item.longitude);
  const latitude = numberOrNull(item.latitude);
  const address = text(item.address, 260);
  const facts = [text(item.category, 80), text(item.poiLevel, 20) ? `${text(item.poiLevel, 20)}A` : "", ticketPrice ? `门票参考 ${ticketPrice}` : text(item.freePoiStatus, 40) === "FREE" ? "免费开放" : "", text(item.address, 260), text(item.description, 300)].filter(Boolean);
  return candidateBase({
    domain: "play",
    providerRef,
    title: item.name,
    summary: facts.join(" · "),
    checkedAt,
    media: mediaUrl ? [{ url: mediaUrl, title: text(item.name, 120), source: FLYAI_PROVIDER }] : [],
    location: address || (longitude != null && latitude != null) ? {
      ...(address ? { address, label: address } : {}),
      ...(longitude != null && latitude != null ? { coordinates: { longitude, latitude, coordinateSystem: "GCJ-02" } } : {}),
    } : null,
    cost: exactPrice(ticketPrice),
    operability: {
      priceHint: ticketPrice || null,
      bookingUrl: safeProviderUrl(item.jumpUrl),
      ticketName: text(item.ticketInfo?.ticketName, 160) || null,
      inventoryVerified: false,
    },
  });
}

function normalizeTransport(item, checkedAt) {
  const journey = Array.isArray(item.journeys) ? item.journeys[0] : null;
  const segments = Array.isArray(journey?.segments) ? journey.segments : [];
  const first = segments[0] ?? {};
  const last = segments.at(-1) ?? {};
  const transportNumbers = segments.map((segment) => text(segment.marketingTransportNo, 40)).filter(Boolean).join(" + ");
  const providerRef = shortHash(`${transportNumbers}:${first.depDateTime}:${last.arrDateTime}`);
  const priceHint = text(item.ticketPrice ?? item.price, 40);
  const title = `${transportNumbers || text(first.marketingTransportName, 80) || "交通"} ${text(first.depStationName, 100)} → ${text(last.arrStationName, 100)}`;
  const facts = [text(journey?.journeyType, 40), text(first.depDateTime, 80), text(last.arrDateTime, 80), text(first.seatClassName, 60), priceHint ? `参考价 ${priceHint}` : "", text(item.totalDuration, 20) ? `全程约 ${text(item.totalDuration, 20)} 分钟` : ""].filter(Boolean);
  return candidateBase({
    domain: "transport",
    providerRef,
    title,
    summary: facts.join(" · "),
    checkedAt,
    cost: exactPrice(priceHint),
    operability: {
      priceHint: priceHint || null,
      bookingUrl: safeProviderUrl(item.jumpUrl),
      routeVerified: true,
      scheduleVerified: true,
      mobilityRole: "intercity_inventory",
      inventoryVerified: false,
      transportType: text(first.transportType, 40) || null,
      departureAt: text(first.depDateTime, 80) || null,
      arrivalAt: text(last.arrDateTime, 80) || null,
      durationMinutes: numberOrNull(item.totalDuration),
      segments: segments.slice(0, 4).map((segment) => ({
        number: text(segment.marketingTransportNo, 40),
        carrier: text(segment.marketingTransportName, 80),
        from: text(segment.depStationName, 100),
        to: text(segment.arrStationName, 100),
        departureAt: text(segment.depDateTime, 80),
        arrivalAt: text(segment.arrDateTime, 80),
      })),
    },
  });
}

function mapCliFailure(error) {
  const message = `${error?.message ?? ""}\n${error?.stderr ?? ""}`;
  if (/401|unauthorized|authentication/i.test(message)) return "AUTH_REQUIRED";
  if (/429|rate.?limit/i.test(message)) return "RATE_LIMITED";
  if (/timed out|timeout|ETIMEDOUT/i.test(message)) return "SOURCE_UNAVAILABLE";
  return "SOURCE_UNAVAILABLE";
}

export class FlyaiTravelResearchProvider {
  constructor({ apiKey = "", enabled = false, workerHome = resolve(tmpdir(), "travel-agent-flyai-worker"), clock, timeoutMs = 35_000, runner = execFileAsync } = {}) {
    this.apiKey = text(apiKey, 512);
    this.enabled = enabled === true;
    this.workerHome = resolve(workerHome);
    this.clock = clock;
    this.timeoutMs = timeoutMs;
    this.runner = runner;
  }

  get status() {
    return this.enabled ? "configured" : "provider_unavailable";
  }

  async run(command, args) {
    if (!this.enabled) throw Object.assign(new Error("provider_unavailable"), { code: "provider_unavailable" });
    await mkdir(this.workerHome, { recursive: true, mode: 0o700 });
    const env = {
      HOME: this.workerHome,
      TMPDIR: this.workerHome,
      LANG: "zh_CN.UTF-8",
      FLYAI_JSON: "1",
      ...(this.apiKey ? { FLYAI_API_KEY: this.apiKey } : {}),
    };
    try {
      const { stdout } = await this.runner(process.execPath, [FLYAI_BIN, command, ...args], {
        env,
        timeout: this.timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      const payload = JSON.parse(String(stdout ?? "").trim());
      if (Number(payload?.status) !== 0 || !Array.isArray(payload?.data?.itemList)) throw Object.assign(new Error("SOURCE_UNAVAILABLE"), { code: "SOURCE_UNAVAILABLE" });
      return { items: payload.data.itemList.slice(0, 10), systemMessage: text(payload.systemMessage, 400) };
    } catch (error) {
      throw Object.assign(new Error(mapCliFailure(error)), { code: mapCliFailure(error) });
    }
  }

  async research({ brief = {}, domains = [] } = {}) {
    if (!this.enabled) return { schemaVersion: "travel-provider-result-v1", status: "provider_unavailable", provider: FLYAI_PROVIDER, fabricatedResults: false };
    const destination = text(brief.destination, 120);
    if (!destination) throw Object.assign(new Error("destination_required"), { code: "destination_required" });
    const requested = [...new Set(domains)].filter((domain) => ["stay", "play", "transport"].includes(domain));
    const dates = travelDates(brief.dates);
    const tasks = [];
    if (requested.includes("stay")) {
      const args = ["--dest-name", destination];
      if (dates.start) args.push("--check-in-date", dates.start);
      if (dates.end) args.push("--check-out-date", dates.end);
      tasks.push({ domain: "stay", command: "search-hotel", args, normalize: normalizeHotel });
    }
    if (requested.includes("play")) tasks.push({ domain: "play", command: "search-poi", args: ["--city-name", destination], normalize: normalizePoi });
    const origin = text(brief.origin, 120);
    if (requested.includes("transport") && origin && dates.start) {
      const mode = text(brief.arrivalMode, 80);
      const command = /飞机|航班|flight|air/i.test(mode) ? "search-flight" : "search-train";
      tasks.push({ domain: "transport", command, args: ["--origin", origin, "--destination", destination, "--dep-date", dates.start], normalize: normalizeTransport });
    }
    const byDomain = { play: [], food: [], stay: [], transport: [] };
    const checkedAt = new Date(this.clock?.() ?? Date.now()).toISOString();
    const settled = await Promise.allSettled(tasks.map(async (task) => ({ task, result: await this.run(task.command, task.args) })));
    const errors = [];
    const systemMessages = [];
    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push({ code: result.reason?.code ?? "SOURCE_UNAVAILABLE" });
        continue;
      }
      const { task, result: response } = result.value;
      byDomain[task.domain] = response.items.map((item) => task.normalize(item, checkedAt)).filter((candidate) => candidate.title).slice(0, 6);
      if (response.systemMessage) systemMessages.push(response.systemMessage);
    }
    const count = Object.values(byDomain).reduce((sum, items) => sum + items.length, 0);
    if (!count) return { schemaVersion: "travel-provider-result-v1", status: errors.some((error) => error.code === "AUTH_REQUIRED") ? "AUTH_REQUIRED" : "EMPTY_VERIFIED", provider: FLYAI_PROVIDER, errors, fabricatedResults: false };
    return {
      schemaVersion: "travel-provider-result-v1",
      status: "completed",
      provider: FLYAI_PROVIDER,
      providerLabel: "飞猪 AI 开放平台",
      destination,
      checkedAt,
      byDomain,
      partial: requested.some((domain) => byDomain[domain].length === 0) || errors.length > 0,
      errors,
      caveats: [...new Set(["飞猪结果属于商业库存与平台排序，不代表独立口碑。", ...systemMessages])],
      fabricatedResults: false,
      sourceDocumentation: FLYAI_DOC,
    };
  }
}

export function createFlyaiTravelResearchProvider(env = process.env, options = {}) {
  const enabledByConfig = env.TRAVEL_AGENT_FLYAI_ENABLED === "true";
  const smokePassed = String(env.TRAVEL_AGENT_FLYAI_SMOKE_STATUS ?? "").startsWith("passed_read_only_isolated");
  const enabled = enabledByConfig && smokePassed && (env.NODE_ENV !== "production" || Boolean(env.FLYAI_API_KEY));
  const workerHome = env.TRAVEL_AGENT_DATA_DIR ? resolve(env.TRAVEL_AGENT_DATA_DIR, "provider-workers", "flyai-home") : undefined;
  return new FlyaiTravelResearchProvider({ apiKey: env.FLYAI_API_KEY, enabled, ...(workerHome ? { workerHome } : {}), ...options });
}

export { FLYAI_BIN, FLYAI_DOC, normalizeHotel, normalizePoi, normalizeTransport, travelDates };
