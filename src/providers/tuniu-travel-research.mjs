import { createHash } from "node:crypto";
import { createTuniuOfficialMcpClient } from "./tuniu-official-mcp.mjs";
import { travelDates } from "./flyai-travel-research.mjs";

const PROVIDER = "tuniu_official_mcp";
const DOCUMENTATION = "https://open.tuniu.com/mcp/docs/";

function text(value, limit = 500) {
  if (Array.isArray(value) || (value && typeof value === "object")) return "";
  return String(value ?? "").trim().slice(0, limit);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function numeric(value) {
  const parsed = Number(String(value ?? "").replace(/[¥￥,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeImage(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:" || !(url.hostname === "tuniucdn.com" || url.hostname.endsWith(".tuniucdn.com"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function lowestPrice(price = {}) {
  const values = Object.values(price).map(numeric).filter((value) => value != null && value > 0);
  return values.length ? Math.min(...values) : null;
}

function candidate({ domain, providerRef, title, summary, checkedAt, cost = 0, media = [], location = null, operability = {} }) {
  const sourceId = `${PROVIDER}:${providerRef}`;
  const entityId = `entity_${hash(sourceId)}`;
  const claimId = `claim_${hash(`${sourceId}:${checkedAt}`)}`;
  return {
    candidateId: `${domain}_${hash(sourceId)}`,
    domain,
    title: text(title, 200),
    summary: text(summary, 900),
    sourceId,
    claimId,
    entityId,
    checkedAt,
    cost,
    media,
    location,
    operability: { provider: PROVIDER, providerRef, bookingProviderLabel: "途牛", researchDepth: "official_ota_search", checkedAt, ...operability },
    source: { sourceId, provider: PROVIDER, sourceType: "official_ota_search", providerPoiId: providerRef, checkedAt, documentationUrl: DOCUMENTATION, independenceGroup: sourceId, commercialBias: "ota_commercial_inventory" },
    entity: { entityId, kind: domain === "transport" ? "transport_offer" : "place", canonicalName: text(title, 200), providerRefs: [sourceId] },
    claim: { claimId, entityId, kind: "provider_fact", statement: text(summary, 1000), sourceRefs: [sourceId], sourceIndependence: "single_provider", commercialBias: "ota_commercial_inventory", confidence: 0.86, observedAt: checkedAt },
  };
}

function normalizeHotel(item, checkedAt) {
  const providerRef = text(item.hotelId, 100) || hash(`${item.hotelName}:${item.address}`);
  const cost = numeric(item.lowestPrice) ?? 0;
  const photo = safeImage(item.firstPic);
  const address = text(item.address, 240);
  const district = text(item.business, 120);
  const city = text(item.cityName, 100);
  const details = [text(item.starName, 50), text(item.brandName, 80), item.commentScore ? `评分 ${item.commentScore}` : "", cost ? `最低价 ¥${cost}` : "", text(item.roomName, 120), text(item.meal, 60), text(item.refund, 100), text(item.commentDigest, 200), text(item.address, 240)].filter(Boolean);
  return candidate({
    domain: "stay",
    providerRef,
    title: item.hotelName,
    summary: details.join(" · "),
    checkedAt,
    cost,
    media: photo ? [{ url: photo, title: text(item.hotelName, 120), source: PROVIDER }] : [],
    location: address || district || city ? { ...(address ? { address, label: address } : {}), ...(district ? { district } : {}), ...(city ? { city } : {}) } : null,
    operability: { rating: numeric(item.commentScore), priceHint: cost ? `¥${cost} 起` : null, roomName: text(item.roomName, 120) || null, meal: text(item.meal, 80) || null, refundPolicy: text(item.refund, 140) || null, inventoryVerified: true, offerFreshness: "search_time" },
  });
}

function normalizeTrain(item, checkedAt) {
  const providerRef = hash(`${item.trainNum}:${item.departStationName}:${item.destStationName}:${item.departureTime}`);
  const cost = lowestPrice(item.price) ?? 0;
  const available = Object.values(item.seatAvailable ?? {}).map(numeric).filter((value) => value != null).reduce((sum, value) => sum + value, 0);
  const title = `${text(item.trainNum, 40) || "火车"} ${text(item.departStationName, 100)} → ${text(item.destStationName, 100)}`;
  const details = [text(item.trainType, 50), text(item.departureTime, 80), text(item.arrivalTime, 80), text(item.duration, 60), cost ? `最低席别 ¥${cost}` : "", Number.isFinite(available) ? `可见余票 ${available}` : ""].filter(Boolean);
  return candidate({ domain: "transport", providerRef, title, summary: details.join(" · "), checkedAt, cost, operability: { transportType: "TRAIN", mobilityRole: "intercity_inventory", priceHint: cost ? `¥${cost} 起` : null, departureAt: text(item.departureTime, 80) || null, arrivalAt: text(item.arrivalTime, 80) || null, availableSeats: Number.isFinite(available) ? available : null, routeVerified: true, scheduleVerified: true, inventoryVerified: true, offerFreshness: "search_time" } });
}

function normalizeFlight(item, checkedAt) {
  const providerRef = hash(`${item.flightNumber}:${item.departureAirport}:${item.arrivalAirport}:${item.departureTime}`);
  const base = numeric(item.basePrice) ?? 0;
  const tax = numeric(item.totalTax) ?? 0;
  const cost = base + tax;
  const title = `${text(item.flightNumber, 40) || "航班"} ${text(item.departureAirport, 100)} → ${text(item.arrivalAirport, 100)}`;
  const details = [text(item.airlineCompany, 80), text(item.type, 40), text(item.departureTime, 80), text(item.arrivalTime, 80), text(item.cabinClass, 60), cost ? `含税参考 ¥${cost}` : "", item.remainingSeats ? `余位 ${text(item.remainingSeats, 20)}` : ""].filter(Boolean);
  return candidate({ domain: "transport", providerRef, title, summary: details.join(" · "), checkedAt, cost, operability: { transportType: "FLIGHT", mobilityRole: "intercity_inventory", priceHint: cost ? `¥${cost} 含税` : null, departureAt: text(item.departureTime, 80) || null, arrivalAt: text(item.arrivalTime, 80) || null, availableSeats: numeric(item.remainingSeats), routeVerified: true, scheduleVerified: true, inventoryVerified: true, offerFreshness: "search_time" } });
}

export class TuniuTravelResearchProvider {
  constructor({ client, clock } = {}) {
    this.client = client;
    this.clock = clock;
  }

  get status() {
    return this.client?.status === "configured" ? "configured" : "provider_unavailable";
  }

  async research({ brief = {}, domains = [] } = {}) {
    if (this.status !== "configured") return { schemaVersion: "travel-provider-result-v1", status: "provider_unavailable", provider: PROVIDER, fabricatedResults: false };
    const destination = text(brief.destination, 120);
    if (!destination) throw Object.assign(new Error("destination_required"), { code: "destination_required" });
    const requested = [...new Set(domains)].filter((domain) => ["stay", "transport"].includes(domain));
    const dates = travelDates(brief.dates);
    const origin = text(brief.origin, 120);
    const tasks = [];
    if (requested.includes("stay")) {
      const args = { cityName: destination };
      if (dates.start && dates.end) Object.assign(args, { checkIn: dates.start, checkOut: dates.end });
      tasks.push({ domain: "stay", service: "hotel", tool: "tuniuHotelSearch", args, extract: (result) => result?.hotels ?? [], normalize: normalizeHotel });
    }
    if (requested.includes("transport") && origin && dates.start) {
      const flight = /飞机|航班|flight|air/i.test(text(brief.arrivalMode, 80));
      tasks.push({
        domain: "transport",
        service: flight ? "flight" : "train",
        tool: flight ? "searchLowestPriceFlight" : "searchLowestPriceTrain",
        args: { departureCityName: origin, arrivalCityName: destination, departureDate: dates.start },
        extract: (result) => result?.data ?? [],
        normalize: flight ? normalizeFlight : normalizeTrain,
      });
    }
    const checkedAt = new Date(this.clock?.() ?? Date.now()).toISOString();
    const byDomain = { play: [], food: [], stay: [], transport: [] };
    const settled = await Promise.allSettled(tasks.map(async (task) => ({ task, result: await this.client.callReadTool(task.service, task.tool, task.args) })));
    const errors = [];
    for (const result of settled) {
      if (result.status === "rejected") { errors.push({ code: result.reason?.code ?? "SOURCE_UNAVAILABLE" }); continue; }
      const { task, result: response } = result.value;
      byDomain[task.domain] = task.extract(response).map((item) => task.normalize(item, checkedAt)).filter((item) => item.title).slice(0, 6);
    }
    const count = Object.values(byDomain).reduce((sum, items) => sum + items.length, 0);
    if (!count) return { schemaVersion: "travel-provider-result-v1", status: errors.some((item) => item.code === "AUTH_REQUIRED") ? "AUTH_REQUIRED" : "EMPTY_VERIFIED", provider: PROVIDER, errors, fabricatedResults: false };
    return { schemaVersion: "travel-provider-result-v1", status: "completed", provider: PROVIDER, providerLabel: "途牛官方 MCP", destination, checkedAt, byDomain, partial: requested.some((domain) => byDomain[domain].length === 0) || errors.length > 0, errors, caveats: ["途牛结果属于商业库存与平台排序，价格、余位和退改政策需在最终跳转前再次核验。", "当前只读接入不会创建、查询或取消订单。"], fabricatedResults: false, sourceDocumentation: DOCUMENTATION };
  }
}

export function createTuniuTravelResearchProvider(env = process.env, options = {}) {
  const client = options.client ?? createTuniuOfficialMcpClient(env, options.clientOptions);
  return new TuniuTravelResearchProvider({ client, clock: options.clock });
}

export { normalizeFlight, normalizeHotel, normalizeTrain };
