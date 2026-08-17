import { TransitSegmentSchema, assertSchema, type DecisionNode, type TransitSegment } from "./index.js";

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const STEP_KINDS = new Set(["walk", "enter_station", "ride", "transfer", "exit_station", "arrive"]);
const FACILITY_KINDS = new Set(["elevator", "toilet", "locker", "power_bank", "accessible_toilet", "nursing_room"]);
const FACILITY_AREAS = new Set(["outside_station", "unpaid_area", "paid_area", "platform"]);
type UnknownObject = { [key: string]: unknown };

function fail(details: { field?: string } = {}): never {
  throw Object.assign(new Error("invalid_transit_segment"), { code: "invalid_transit_segment", details });
}

function objectValue(value: unknown, field?: string): UnknownObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(field ? { field } : {});
  return value as UnknownObject;
}

function optionalObject(value: unknown): UnknownObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownObject : null;
}

function text(value: unknown, field: string, options: { optional: true; max?: number }): string | null;
function text(value: unknown, field: string, options?: { optional?: false; max?: number }): string;
function text(value: unknown, field: string, { max = 240, optional = false }: { max?: number; optional?: boolean } = {}): string | null {
  if ((value == null || value === "") && optional) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) return fail({ field });
  return value.trim();
}

function id(value: unknown, field: string): string {
  if (typeof value !== "string" || !ID.test(value)) return fail({ field });
  return value;
}

function nonNegative(value: unknown, field: string, optional = false): number | null {
  if ((value == null || value === "") && optional) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fail({ field });
  return parsed;
}

function timestamp(value: unknown, field: string): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return fail({ field });
  return date.toISOString();
}

function normalizeFacility(input: unknown, index: number) {
  const value = objectValue(input, `facilities.${index}`);
  const kind = text(value.kind, `facilities.${index}.kind`, { max: 64 });
  if (!FACILITY_KINDS.has(kind)) return fail({ field: `facilities.${index}.kind` });
  const area = text(value.area, `facilities.${index}.area`, { max: 64 });
  if (!FACILITY_AREAS.has(area)) return fail({ field: `facilities.${index}.area` });
  return {
    facilityId: id(value.facilityId ?? `facility_${index + 1}`, `facilities.${index}.facilityId`), kind, area,
    label: text(value.label, `facilities.${index}.label`),
    distanceMeters: nonNegative(value.distanceMeters, `facilities.${index}.distanceMeters`, true),
    status: value.status === "unavailable" ? "unavailable" as const : "available" as const,
    source: text(value.source ?? "user_input", `facilities.${index}.source`, { max: 128 }),
    checkedAt: timestamp(value.checkedAt, `facilities.${index}.checkedAt`),
    freshUntil: timestamp(value.freshUntil, `facilities.${index}.freshUntil`),
  };
}

function normalizeStep(input: unknown, index: number, stored: boolean) {
  const value = objectValue(input, `steps.${index}`);
  const kind = text(value.kind, `steps.${index}.kind`, { max: 64 });
  if (!STEP_KINDS.has(kind)) return fail({ field: `steps.${index}.kind` });
  const title = stored && !value.title
    ? (kind === "enter_station" ? "进入站内" : kind === "exit_station" ? "离开站内" : kind)
    : value.title;
  return {
    stepId: id(value.stepId ?? `step_${index + 1}`, `steps.${index}.stepId`), kind,
    title: text(title, `steps.${index}.title`),
    detail: text(value.detail, `steps.${index}.detail`, { max: 500, optional: true }),
    durationMinutes: nonNegative(value.durationMinutes, `steps.${index}.durationMinutes`, true),
    distanceMeters: nonNegative(value.distanceMeters, `steps.${index}.distanceMeters`, true),
    line: text(value.line, `steps.${index}.line`, { max: 100, optional: true }),
    direction: text(value.direction, `steps.${index}.direction`, { max: 160, optional: true }),
    accessible: value.accessible === true,
    facilities: Array.isArray(value.facilities) ? value.facilities.map(normalizeFacility) : [],
  };
}

export function normalizeTransitSegment(input: unknown, { stored = false }: { stored?: boolean } = {}): TransitSegment {
  const value = objectValue(input);
  const steps = Array.isArray(value.steps) ? value.steps.map((stepValue, index) => normalizeStep(stepValue, index, stored)) : [];
  if (!steps.length || steps.length > 12) return fail({ field: "steps" });
  const travelerFit = optionalObject(value.travelerFit);
  return assertSchema(TransitSegmentSchema, {
    schemaVersion: "transit-segment-v1", segmentId: id(value.segmentId, "segmentId"),
    status: value.status === "provider_unavailable" ? "provider_unavailable" : value.status === "needs_refresh" ? "needs_refresh" : "ready",
    originLabel: text(value.originLabel, "originLabel"), destinationLabel: text(value.destinationLabel, "destinationLabel"),
    totalMinutes: nonNegative(value.totalMinutes, "totalMinutes"), distanceMeters: nonNegative(value.distanceMeters, "distanceMeters", true),
    source: text(value.source ?? "user_input", "source", { max: 128 }), checkedAt: timestamp(value.checkedAt, "checkedAt"),
    freshUntil: timestamp(value.freshUntil, "freshUntil"),
    travelerFit: {
      summary: text(travelerFit?.summary ?? "需要核验适配性", "travelerFit.summary", { max: 280 }),
      tradeoff: text(travelerFit?.tradeoff, "travelerFit.tradeoff", { max: 280, optional: true }),
      stepFree: travelerFit?.stepFree === true,
    }, steps,
  }, "invalid_transit_segment");
}

export function transitSegmentFromNode(node: DecisionNode): TransitSegment | null {
  const operability = optionalObject(node.operability);
  const segment = optionalObject(operability?.transitSegment);
  return segment ? normalizeTransitSegment(segment, { stored: true }) : null;
}
