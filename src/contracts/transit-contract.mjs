const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const STEP_KINDS = new Set(["walk", "enter_station", "ride", "transfer", "exit_station", "arrive"]);
const FACILITY_KINDS = new Set(["elevator", "toilet", "locker", "power_bank", "accessible_toilet", "nursing_room"]);
const FACILITY_AREAS = new Set(["outside_station", "unpaid_area", "paid_area", "platform"]);

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
}

function text(value, field, { max = 240, optional = false } = {}) {
  if ((value == null || value === "") && optional) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) fail("invalid_transit_segment", { field });
  return value.trim();
}

function id(value, field) {
  if (typeof value !== "string" || !ID.test(value)) fail("invalid_transit_segment", { field });
  return value;
}

function nonNegative(value, field, optional = false) {
  if ((value == null || value === "") && optional) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) fail("invalid_transit_segment", { field });
  return parsed;
}

function timestamp(value, field) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail("invalid_transit_segment", { field });
  return date.toISOString();
}

function normalizeFacility(input, index) {
  if (!input || typeof input !== "object") fail("invalid_transit_segment", { field: `facilities.${index}` });
  const kind = text(input.kind, `facilities.${index}.kind`, { max: 64 });
  if (!FACILITY_KINDS.has(kind)) fail("invalid_transit_segment", { field: `facilities.${index}.kind` });
  const area = text(input.area, `facilities.${index}.area`, { max: 64 });
  if (!FACILITY_AREAS.has(area)) fail("invalid_transit_segment", { field: `facilities.${index}.area` });
  return {
    facilityId: id(input.facilityId ?? `facility_${index + 1}`, `facilities.${index}.facilityId`),
    kind,
    area,
    label: text(input.label, `facilities.${index}.label`),
    distanceMeters: nonNegative(input.distanceMeters, `facilities.${index}.distanceMeters`, true),
    status: input.status === "unavailable" ? "unavailable" : "available",
    source: text(input.source ?? "user_input", `facilities.${index}.source`, { max: 128 }),
    checkedAt: timestamp(input.checkedAt, `facilities.${index}.checkedAt`),
    freshUntil: timestamp(input.freshUntil, `facilities.${index}.freshUntil`),
  };
}

function normalizeStep(input, index) {
  if (!input || typeof input !== "object") fail("invalid_transit_segment", { field: `steps.${index}` });
  const kind = text(input.kind, `steps.${index}.kind`, { max: 64 });
  if (!STEP_KINDS.has(kind)) fail("invalid_transit_segment", { field: `steps.${index}.kind` });
  return {
    stepId: id(input.stepId ?? `step_${index + 1}`, `steps.${index}.stepId`),
    kind,
    title: text(input.title, `steps.${index}.title`),
    detail: text(input.detail, `steps.${index}.detail`, { max: 500, optional: true }),
    durationMinutes: nonNegative(input.durationMinutes, `steps.${index}.durationMinutes`, true),
    distanceMeters: nonNegative(input.distanceMeters, `steps.${index}.distanceMeters`, true),
    line: text(input.line, `steps.${index}.line`, { max: 100, optional: true }),
    direction: text(input.direction, `steps.${index}.direction`, { max: 160, optional: true }),
    accessible: input.accessible === true,
    facilities: Array.isArray(input.facilities) ? input.facilities.map(normalizeFacility) : [],
  };
}

function normalizeStoredStep(input, index) {
  if (!input || typeof input !== "object") fail("invalid_transit_segment", { field: `steps.${index}` });
  const kind = text(input.kind, `steps.${index}.kind`, { max: 64 });
  if (!STEP_KINDS.has(kind)) fail("invalid_transit_segment", { field: `steps.${index}.kind` });
  return {
    stepId: id(input.stepId ?? `step_${index + 1}`, `steps.${index}.stepId`),
    kind,
    // Older accepted local entries could omit this display label; the persisted
    // domain kind is still valid and the route remains inspectable.
    title: text(input.title || (kind === "enter_station" ? "进入站内" : kind === "exit_station" ? "离开站内" : kind), `steps.${index}.title`),
    detail: text(input.detail, `steps.${index}.detail`, { max: 500, optional: true }),
    durationMinutes: nonNegative(input.durationMinutes, `steps.${index}.durationMinutes`, true),
    distanceMeters: nonNegative(input.distanceMeters, `steps.${index}.distanceMeters`, true),
    line: text(input.line, `steps.${index}.line`, { max: 100, optional: true }),
    direction: text(input.direction, `steps.${index}.direction`, { max: 160, optional: true }),
    accessible: input.accessible === true,
    facilities: Array.isArray(input.facilities) ? input.facilities.map((facility) => normalizeFacility({
      ...facility,
      distanceMeters: facility?.distanceMeters ?? undefined,
      checkedAt: facility?.checkedAt ?? undefined,
      freshUntil: facility?.freshUntil ?? undefined,
    }, index)) : [],
  };
}

export function normalizeTransitSegment(input, { stored = false } = {}) {
  if (!input || typeof input !== "object") fail("invalid_transit_segment");
  const steps = Array.isArray(input.steps) ? input.steps.map(stored ? normalizeStoredStep : normalizeStep) : [];
  if (!steps.length || steps.length > 12) fail("invalid_transit_segment", { field: "steps" });
  return {
    schemaVersion: "transit-segment-v1",
    segmentId: id(input.segmentId, "segmentId"),
    status: input.status === "provider_unavailable" ? "provider_unavailable" : input.status === "needs_refresh" ? "needs_refresh" : "ready",
    originLabel: text(input.originLabel, "originLabel"),
    destinationLabel: text(input.destinationLabel, "destinationLabel"),
    totalMinutes: nonNegative(input.totalMinutes, "totalMinutes"),
    distanceMeters: nonNegative(input.distanceMeters, "distanceMeters", true),
    source: text(input.source ?? "user_input", "source", { max: 128 }),
    checkedAt: timestamp(input.checkedAt, "checkedAt"),
    freshUntil: timestamp(input.freshUntil, "freshUntil"),
    travelerFit: {
      summary: text(input.travelerFit?.summary ?? "需要核验适配性", "travelerFit.summary", { max: 280 }),
      tradeoff: text(input.travelerFit?.tradeoff, "travelerFit.tradeoff", { max: 280, optional: true }),
      stepFree: input.travelerFit?.stepFree === true,
    },
    steps,
  };
}

export function transitSegmentFromNode(node) {
  const segment = node?.operability?.transitSegment;
  if (!segment) return null;
  // Runtime nodes use null for optional fields after proposal normalization. Rehydrate only
  // the display contract; strict input validation above remains the write boundary.
  return normalizeTransitSegment({
    ...segment,
    distanceMeters: segment.distanceMeters ?? undefined,
    checkedAt: segment.checkedAt ?? undefined,
    freshUntil: segment.freshUntil ?? undefined,
    travelerFit: {
      ...segment.travelerFit,
      tradeoff: segment.travelerFit?.tradeoff ?? undefined,
    },
    steps: segment.steps,
  }, { stored: true });
}
