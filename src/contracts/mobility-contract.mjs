const MODES = new Set(["walk", "transit", "taxi"]);
const STATUSES = new Set(["completed", "partial", "needs_context", "provider_unavailable"]);
const WALK_TYPES = Object.freeze({
  "0": { kind: "road", label: "普通道路" },
  "1": { kind: "crosswalk", label: "人行横道" },
  "3": { kind: "underpass", label: "地下通道" },
  "4": { kind: "footbridge", label: "过街天桥" },
  "5": { kind: "subway_passage", label: "地铁通道" },
  "6": { kind: "park", label: "公园路段" },
  "7": { kind: "plaza", label: "广场路段" },
  "8": { kind: "escalator", label: "扶梯" },
  "9": { kind: "elevator", label: "直梯" },
  "10": { kind: "cable_car", label: "索道" },
  "11": { kind: "skybridge", label: "空中通道" },
  "12": { kind: "building_passage", label: "建筑物穿越通道" },
  "13": { kind: "pedestrian_passage", label: "行人通道" },
  "14": { kind: "boat_route", label: "游船路线" },
  "15": { kind: "sightseeing_vehicle", label: "观光车路线" },
  "16": { kind: "slide", label: "滑道" },
  "18": { kind: "widened_road", label: "扩路" },
  "19": { kind: "road_connector", label: "道路附属连接线" },
  "20": { kind: "stairs", label: "阶梯" },
  "21": { kind: "ramp", label: "斜坡" },
  "22": { kind: "bridge", label: "桥" },
  "23": { kind: "tunnel", label: "隧道" },
  "30": { kind: "ferry", label: "轮渡" },
});
const ACCESSIBILITY_FEATURE_KINDS = new Set(["escalator", "elevator", "stairs", "ramp"]);

function fail(field) {
  const error = new Error("invalid_trip_mobility");
  error.code = "invalid_trip_mobility";
  error.details = { field };
  throw error;
}

function text(value, field, { optional = false, max = 500 } = {}) {
  if ((value == null || value === "") && optional) return null;
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > max) fail(field);
  return normalized;
}

function number(value, field, { optional = false } = {}) {
  if ((value == null || value === "") && optional) return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) fail(field);
  return normalized;
}

function timestamp(value, field, { optional = false } = {}) {
  if ((value == null || value === "") && optional) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(field);
  return date.toISOString();
}

function safeAmapUrl(value, field, { optional = true } = {}) {
  if ((value == null || value === "") && optional) return null;
  let url;
  try { url = new URL(String(value)); } catch { fail(field); }
  if (url.protocol !== "https:" || !["uri.amap.com", "lbs.amap.com"].includes(url.hostname)) fail(field);
  return url.toString();
}

function coordinates(input, field) {
  if (!input) return null;
  const longitude = Number(input.longitude);
  const latitude = Number(input.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) fail(field);
  return { longitude, latitude, coordinateSystem: "GCJ-02" };
}

export function amapWalkTypeMetadata(value) {
  if (value == null || value === "") return null;
  const code = String(value).trim();
  if (!/^\d{1,2}$/.test(code)) return null;
  const known = WALK_TYPES[code];
  return known ? { code, ...known } : { code, kind: "other", label: `特殊步行路段（${code}）` };
}

export function accessibilityFeaturesForWalkType(walkType, source = "amap_routes_v5") {
  const normalized = walkType?.code ? amapWalkTypeMetadata(walkType.code) : amapWalkTypeMetadata(walkType);
  if (!normalized || !ACCESSIBILITY_FEATURE_KINDS.has(normalized.kind)) return [];
  return [{
    kind: normalized.kind,
    label: normalized.label,
    status: "mapped_non_realtime",
    source,
    realTime: false,
    guidance: normalized.kind === "stairs"
      ? "路线资料显示该路段包含阶梯；如需避开台阶，应改用其他路线。"
      : `路线资料显示该路段包含${normalized.label}；不代表当前正在运行或开放，建议现场确认。`,
  }];
}

function accessibilityFeature(input, index, field) {
  if (!input || typeof input !== "object") fail(`${field}.${index}`);
  const kind = text(input.kind, `${field}.${index}.kind`, { max: 40 });
  if (!ACCESSIBILITY_FEATURE_KINDS.has(kind)) fail(`${field}.${index}.kind`);
  return {
    kind,
    label: text(input.label, `${field}.${index}.label`, { max: 80 }),
    status: "mapped_non_realtime",
    source: text(input.source ?? "amap_routes_v5", `${field}.${index}.source`, { max: 120 }),
    realTime: false,
    guidance: text(input.guidance, `${field}.${index}.guidance`, { optional: true, max: 300 }),
  };
}

function place(input, field) {
  if (!input || typeof input !== "object") fail(field);
  return {
    nodeId: text(input.nodeId, `${field}.nodeId`, { optional: true, max: 128 }),
    label: text(input.label, `${field}.label`, { max: 200 }),
    coordinates: coordinates(input.coordinates, `${field}.coordinates`),
  };
}

function step(input, index, field) {
  if (!input || typeof input !== "object") fail(`${field}.${index}`);
  const kind = text(input.kind, `${field}.${index}.kind`, { max: 40 });
  if (!["walk", "ride", "transfer", "taxi", "arrive"].includes(kind)) fail(`${field}.${index}.kind`);
  const walkType = input.walkType?.code
    ? amapWalkTypeMetadata(input.walkType.code)
    : amapWalkTypeMetadata(input.walkType ?? input.walkTypeCode);
  const suppliedFeatures = Array.isArray(input.accessibilityFeatures)
    ? input.accessibilityFeatures.slice(0, 8).map((item, featureIndex) => accessibilityFeature(item, featureIndex, `${field}.${index}.accessibilityFeatures`))
    : [];
  const accessibilityFeatures = suppliedFeatures.length
    ? suppliedFeatures
    : accessibilityFeaturesForWalkType(walkType);
  return {
    kind,
    instruction: text(input.instruction, `${field}.${index}.instruction`, { max: 500 }),
    line: text(input.line, `${field}.${index}.line`, { optional: true, max: 160 }),
    origin: text(input.origin, `${field}.${index}.origin`, { optional: true, max: 160 }),
    destination: text(input.destination, `${field}.${index}.destination`, { optional: true, max: 160 }),
    durationMinutes: number(input.durationMinutes, `${field}.${index}.durationMinutes`, { optional: true }),
    distanceMeters: number(input.distanceMeters, `${field}.${index}.distanceMeters`, { optional: true }),
    walkType,
    accessibilityFeatures,
  };
}

function alternative(input, index, field) {
  if (!input || typeof input !== "object") fail(`${field}.${index}`);
  const mode = text(input.mode, `${field}.${index}.mode`, { max: 20 });
  if (!MODES.has(mode)) fail(`${field}.${index}.mode`);
  const steps = Array.isArray(input.steps) ? input.steps.slice(0, 24).map((item, stepIndex) => step(item, stepIndex, `${field}.${index}.steps`)) : [];
  const accessibilityFeatures = [...new Map(steps
    .flatMap((item) => item.accessibilityFeatures)
    .map((feature) => [feature.kind, feature])).values()];
  return {
    mode,
    totalMinutes: number(input.totalMinutes, `${field}.${index}.totalMinutes`),
    distanceMeters: number(input.distanceMeters, `${field}.${index}.distanceMeters`, { optional: true }),
    walkingMeters: number(input.walkingMeters, `${field}.${index}.walkingMeters`, { optional: true }),
    transfers: number(input.transfers, `${field}.${index}.transfers`, { optional: true }),
    estimatedFareCny: number(input.estimatedFareCny, `${field}.${index}.estimatedFareCny`, { optional: true }),
    scheduleBasis: ["query_time_estimate", "scheduled_service"].includes(input.scheduleBasis) ? input.scheduleBasis : "query_time_estimate",
    realTimeArrival: false,
    navigationUrl: safeAmapUrl(input.navigationUrl, `${field}.${index}.navigationUrl`),
    polyline: Array.isArray(input.polyline) ? input.polyline.map((point, pointIndex) => coordinates(point, `${field}.${index}.polyline.${pointIndex}`)).filter(Boolean).slice(0, 600) : [],
    steps,
    accessibilityFeatures,
    accessibilityAssessment: {
      hasStairs: accessibilityFeatures.some((feature) => feature.kind === "stairs"),
      hasElevator: accessibilityFeatures.some((feature) => feature.kind === "elevator"),
      hasEscalator: accessibilityFeatures.some((feature) => feature.kind === "escalator"),
      hasRamp: accessibilityFeatures.some((feature) => feature.kind === "ramp"),
      stepFreeContinuity: "not_verified",
      realTimeStatus: false,
    },
  };
}

function leg(input, index) {
  if (!input || typeof input !== "object") fail(`legs.${index}`);
  const alternatives = Array.isArray(input.alternatives)
    ? input.alternatives.slice(0, 3).map((item, alternativeIndex) => alternative(item, alternativeIndex, `legs.${index}.alternatives`))
    : [];
  if (!alternatives.length) fail(`legs.${index}.alternatives`);
  const recommendedMode = text(input.recommendedMode, `legs.${index}.recommendedMode`, { max: 20 });
  if (!MODES.has(recommendedMode) || !alternatives.some((item) => item.mode === recommendedMode)) fail(`legs.${index}.recommendedMode`);
  return {
    legId: text(input.legId, `legs.${index}.legId`, { max: 128 }),
    origin: place(input.origin, `legs.${index}.origin`),
    destination: place(input.destination, `legs.${index}.destination`),
    recommendedMode,
    rationale: text(input.rationale, `legs.${index}.rationale`, { max: 400 }),
    alternatives,
  };
}

function travelerFit(input) {
  if (!input || typeof input !== "object") return {
    constrainedTravelerIds: [], maxContinuousWalkMeters: null, maxTransfers: null,
    stepFreeRequired: false, avoidStairs: false, accessibilityEvidence: "not_required",
  };
  const accessibilityEvidence = ["verified", "partial", "unverified", "not_required"].includes(input.accessibilityEvidence)
    ? input.accessibilityEvidence
    : (input.stepFreeRequired || input.avoidStairs ? "unverified" : "not_required");
  return {
    constrainedTravelerIds: Array.isArray(input.constrainedTravelerIds) ? [...new Set(input.constrainedTravelerIds.map(String))].slice(0, 12) : [],
    maxContinuousWalkMeters: number(input.maxContinuousWalkMeters, "travelerFit.maxContinuousWalkMeters", { optional: true }),
    maxTransfers: number(input.maxTransfers, "travelerFit.maxTransfers", { optional: true }),
    stepFreeRequired: input.stepFreeRequired === true,
    avoidStairs: input.avoidStairs === true,
    accessibilityEvidence,
  };
}

export function normalizeTripMobility(input) {
  if (!input || typeof input !== "object") fail("root");
  const status = text(input.status, "status", { max: 40 });
  if (!STATUSES.has(status)) fail("status");
  const legs = ["completed", "partial"].includes(status)
    ? (Array.isArray(input.legs) ? input.legs.slice(0, 8).map(leg) : [])
    : [];
  if (status === "completed" && !legs.length) fail("legs");
  return {
    schemaVersion: "trip-mobility-v1",
    status,
    destination: text(input.destination, "destination", { optional: true, max: 120 }),
    source: text(input.source ?? "amap_routes_v5", "source", { max: 120 }),
    checkedAt: timestamp(input.checkedAt, "checkedAt", { optional: true }),
    freshUntil: timestamp(input.freshUntil, "freshUntil", { optional: true }),
    coverage: {
      routedNodeIds: Array.isArray(input.coverage?.routedNodeIds) ? [...new Set(input.coverage.routedNodeIds.map(String))].slice(0, 24) : [],
      unresolvedNodeIds: Array.isArray(input.coverage?.unresolvedNodeIds) ? [...new Set(input.coverage.unresolvedNodeIds.map(String))].slice(0, 24) : [],
      unscheduled: input.coverage?.unscheduled !== false,
    },
    legs,
    travelerFit: travelerFit(input.travelerFit),
    reason: text(input.reason, "reason", { optional: true, max: 200 }),
    caveats: Array.isArray(input.caveats) ? input.caveats.map((item) => String(item).trim().slice(0, 500)).filter(Boolean).slice(0, 12) : [],
    sourceDocumentation: safeAmapUrl(input.sourceDocumentation, "sourceDocumentation"),
    fabricatedResults: false,
  };
}

export function mobilityRecommendedAlternative(leg) {
  return leg?.alternatives?.find((alternative) => alternative.mode === leg.recommendedMode) ?? null;
}
