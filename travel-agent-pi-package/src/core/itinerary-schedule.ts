import { createHash } from "node:crypto";
import {
  TripFeasibilitySchema,
  TripItinerarySchema,
  assertSchema,
  type MobilityObservation,
  type TripBrief,
} from "../contracts/index.js";

type ScheduleNode = {
  nodeId: string;
  domain: "play" | "food" | "stay" | "transport";
  title?: string;
  time?: string | null;
  selected?: boolean;
  operability?: Record<string, unknown>;
};

type ItineraryRole = "intercity_arrival" | "stay_check_in" | "stay_departure" | "stay_return" | "meal" | "activity" | "local_transport";
type ItineraryDomain = ScheduleNode["domain"];
type TimeSource = "provider_schedule" | "user_confirmed" | "agent_suggested" | "derived_route";

export interface ItineraryStopValue {
  stopId: string;
  nodeId: string;
  domain: ItineraryDomain;
  title: string;
  dayIndex: number;
  date: string;
  role: ItineraryRole;
  startAt: string | null;
  endAt: string | null;
  timeSource: TimeSource;
  fixed: boolean;
  openingHours?: string | null;
}

export interface ItineraryValue {
  schemaVersion: "trip-itinerary-v1";
  tripDates: string[];
  stops: ItineraryStopValue[];
  days: Array<{ dayIndex: number; date: string; stopIds: string[] }>;
}

export interface FeasibilityIssueValue {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  stopIds: string[];
  dayIndex: number | null;
}

export interface FeasibilityValue {
  schemaVersion: "trip-feasibility-v1";
  status: "feasible" | "blocked" | "needs_context";
  canConfirm: boolean;
  primaryBlocker: string | null;
  issues: FeasibilityIssueValue[];
  checkedAt: string | null;
}

export interface ItineraryDraftResult {
  itinerary: ItineraryValue | null;
  feasibility: FeasibilityValue;
}

function tripDates(value: unknown): string[] {
  const matches = [...String(value ?? "").matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]!).filter(Boolean);
  if (!matches.length) return [];
  const start = new Date(`${matches[0]}T00:00:00.000Z`);
  const end = new Date(`${matches[1] ?? matches[0]}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const output: string[] = [];
  for (let cursor = start; cursor <= end && output.length < 60; cursor = new Date(cursor.getTime() + 86_400_000)) output.push(cursor.toISOString().slice(0, 10));
  return output;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedDateTime(value: unknown, fallbackDate: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const full = raw.match(/^(20\d{2}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})(?::\d{2})?(?:([+-]\d{2}:?\d{2}|Z))?/);
  if (full) {
    const zone = full[3] ? (full[3] === "Z" ? "Z" : full[3].includes(":") ? full[3] : `${full[3].slice(0, 3)}:${full[3].slice(3)}`) : "+08:00";
    return `${full[1]}T${full[2]!.padStart(5, "0")}:00${zone}`;
  }
  const time = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return time && fallbackDate ? `${fallbackDate}T${time[1]!.padStart(2, "0")}:${time[2]}:00+08:00` : null;
}

function addMinutes(value: string, minutes: number): string {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString().replace(".000Z", "+00:00");
}

function localIso(value: string): string {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function shifted(value: string, minutes: number): string {
  return localIso(new Date(new Date(value).getTime() + minutes * 60_000).toISOString());
}

function stopId(nodeId: string, dayIndex: number, role: string): string {
  return `${nodeId}:${dayIndex}:${role}`.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 128);
}

function dayIndexFor(date: string, dates: string[]): number {
  const index = dates.indexOf(date);
  return index >= 0 ? index + 1 : 1;
}

function datePart(value: string | null, fallback: string): string {
  return value?.slice(0, 10).match(/^20\d{2}-\d{2}-\d{2}$/)?.[0] ?? fallback;
}

function makeStop(input: Omit<ItineraryStopValue, "stopId">): ItineraryStopValue {
  return { ...input, stopId: stopId(input.nodeId, input.dayIndex, input.role) };
}

function needsContext(message: string): FeasibilityValue {
  return assertSchema(TripFeasibilitySchema, {
    schemaVersion: "trip-feasibility-v1",
    status: "needs_context",
    canConfirm: false,
    primaryBlocker: message,
    issues: [{ code: "itinerary_context_required", severity: "blocking", message, stopIds: [], dayIndex: null }],
    checkedAt: null,
  }, "invalid_trip_feasibility") as unknown as FeasibilityValue;
}

function primarySchedule(node: ScheduleNode, dates: string[]) {
  const operability = objectValue(node.operability);
  const planningWindow = objectValue(operability.planningWindow);
  const firstDate = dates[0]!;
  if (node.domain === "transport" && ["intercity_inventory", "user_confirmed_arrival"].includes(String(operability.mobilityRole ?? ""))) {
    const userAnchor = objectValue(operability.arrivalRouteAnchor);
    const arrivalAt = normalizedDateTime(operability.arrivalAt ?? planningWindow.endAt ?? userAnchor.time ?? node.time, firstDate);
    if (!arrivalAt) return null;
    const arrivalPlace = objectValue(operability.arrivalPlace);
    const title = String(userAnchor.label ?? arrivalPlace.label ?? node.title ?? "抵达点").slice(0, 200);
    const date = datePart(arrivalAt, firstDate);
    return makeStop({
      nodeId: node.nodeId, domain: node.domain, title, dayIndex: dayIndexFor(date, dates), date,
      role: "intercity_arrival", startAt: arrivalAt, endAt: arrivalAt,
      timeSource: operability.mobilityRole === "user_confirmed_arrival" ? "user_confirmed" : "provider_schedule", fixed: true,
    });
  }
  const startAt = normalizedDateTime(planningWindow.startAt ?? node.time, node.domain === "play" ? dates[1] ?? firstDate : firstDate);
  const endAt = normalizedDateTime(planningWindow.endAt, datePart(startAt, node.domain === "play" ? dates[1] ?? firstDate : firstDate))
    ?? (startAt ? shifted(startAt, node.domain === "stay" ? 30 : node.domain === "food" ? 90 : 120) : null);
  const date = datePart(startAt, node.domain === "play" ? dates[1] ?? firstDate : firstDate);
  const role = node.domain === "stay" ? "stay_check_in" : node.domain === "food" ? "meal" : node.domain === "play" ? "activity" : "local_transport";
  // `openToday` is tied to the Provider query date, not a future trip date. Only a
  // reusable weekly schedule may constrain a future itinerary.
  const openingHours = String(operability.openWeek ?? "").trim().slice(0, 300) || null;
  return makeStop({
    nodeId: node.nodeId, domain: node.domain, title: String(node.title ?? node.nodeId).slice(0, 200), dayIndex: dayIndexFor(date, dates), date,
    role, startAt, endAt, timeSource: "agent_suggested", fixed: false, openingHours,
  });
}

function preferredLocalWindow(stop: ItineraryStopValue, date: string): { startAt: string; endAt: string } {
  const startAt = `${date}T${stop.role === "meal" ? "12:30" : "10:00"}:00+08:00`;
  return { startAt, endAt: shifted(startAt, stop.role === "meal" ? 90 : 120) };
}

export function buildItineraryDraft(brief: TripBrief, nodes: ScheduleNode[]): ItineraryDraftResult {
  const dates = tripDates(brief.dates);
  if (!dates.length) return { itinerary: null, feasibility: needsContext("先补充具体旅行日期，才能核验每天的时间顺序。") };
  const selected = nodes.filter((node) => node.selected !== false);
  const baseStops = selected.map((node) => primarySchedule(node, dates)).filter((stop): stop is ItineraryStopValue => Boolean(stop));
  if (baseStops.length < 2) return { itinerary: null, feasibility: needsContext("至少试排两个可定位环节，才能核验路线是否可执行。") };
  const arrival = baseStops.find((stop) => stop.role === "intercity_arrival") ?? null;
  const stay = baseStops.find((stop) => stop.role === "stay_check_in") ?? null;
  const localStops = baseStops.filter((stop) => ["meal", "activity", "local_transport"].includes(stop.role));

  if (arrival?.startAt) {
    const arrivalMs = new Date(arrival.startAt).getTime();
    for (const stop of localStops) {
      if (!stop.startAt || stop.fixed || stop.date !== arrival.date || new Date(stop.startAt).getTime() > arrivalMs + 90 * 60_000) continue;
      const nextDate = dates[arrival.dayIndex];
      if (!nextDate) continue;
      const nextWindow = preferredLocalWindow(stop, nextDate);
      stop.date = nextDate;
      stop.dayIndex = arrival.dayIndex + 1;
      stop.startAt = nextWindow.startAt;
      stop.endAt = nextWindow.endAt;
      stop.stopId = stopId(stop.nodeId, stop.dayIndex, stop.role);
    }
    if (stay && stay.date === arrival.date && stay.startAt && new Date(stay.startAt).getTime() < arrivalMs) {
      stay.startAt = arrival.startAt;
      stay.endAt = shifted(arrival.startAt, 30);
    }
  }

  const stops: ItineraryStopValue[] = [];
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index]!;
    const dayIndex = index + 1;
    const dayPrimary = baseStops.filter((stop) => stop.date === date).sort((left, right) => String(left.startAt ?? "").localeCompare(String(right.startAt ?? "")));
    const dayArrival = dayPrimary.find((stop) => stop.role === "intercity_arrival");
    const dayStay = dayPrimary.find((stop) => stop.role === "stay_check_in");
    const dayLocal = dayPrimary.filter((stop) => ["meal", "activity", "local_transport"].includes(stop.role));
    if (dayArrival) stops.push(dayArrival);
    if (dayStay) stops.push(dayStay);
    if (stay && dayIndex > 1 && dayLocal.length) {
      const firstStart = dayLocal[0]?.startAt ?? `${date}T10:00:00+08:00`;
      stops.push(makeStop({
        nodeId: stay.nodeId, domain: "stay", title: stay.title, dayIndex, date, role: "stay_departure",
        startAt: shifted(firstStart, -60), endAt: shifted(firstStart, -55), timeSource: "derived_route", fixed: false,
      }));
    }
    stops.push(...dayLocal);
    if (stay && dayLocal.length) {
      const last = dayLocal.at(-1)!;
      const startAt = last.endAt ? shifted(last.endAt, 60) : `${date}T20:00:00+08:00`;
      stops.push(makeStop({
        nodeId: stay.nodeId, domain: "stay", title: stay.title, dayIndex, date, role: "stay_return",
        startAt, endAt: shifted(startAt, 15), timeSource: "derived_route", fixed: false,
      }));
    }
  }
  const itinerary = assertSchema(TripItinerarySchema, {
    schemaVersion: "trip-itinerary-v1",
    tripDates: dates,
    stops,
    days: dates.map((date, index) => ({ dayIndex: index + 1, date, stopIds: stops.filter((stop) => stop.dayIndex === index + 1).map((stop) => stop.stopId) })),
  }, "invalid_trip_itinerary") as unknown as ItineraryValue;
  return { itinerary, feasibility: needsContext("路线完成后才能确认这份按天安排。") };
}

function recommendedMinutes(leg: MobilityObservation["legs"][number] | undefined): number | null {
  const alternative = leg?.alternatives.find((item) => item.mode === leg.recommendedMode);
  return alternative ? alternative.totalMinutes : null;
}

export function finalizeItinerarySchedule(draft: ItineraryDraftResult, mobility: MobilityObservation, checkedAt: string | null = mobility.checkedAt): ItineraryDraftResult {
  if (!draft.itinerary) return draft;
  const itinerary = structuredClone(draft.itinerary);
  const issues: FeasibilityIssueValue[] = [];
  const legByStops = new Map<string, MobilityObservation["legs"][number]>();
  for (const leg of mobility.legs) {
    legByStops.set(`${leg.origin.stopId ?? leg.origin.nodeId}->${leg.destination.stopId ?? leg.destination.nodeId}`, leg);
    legByStops.set(`${leg.origin.nodeId}->${leg.destination.nodeId}`, leg);
  }
  for (let index = 1; index < itinerary.stops.length; index += 1) {
    const previous = itinerary.stops[index - 1]!;
    const current = itinerary.stops[index]!;
    const samePlace = previous.nodeId === current.nodeId;
    const leg = legByStops.get(`${previous.stopId}->${current.stopId}`) ?? legByStops.get(`${previous.nodeId}->${current.nodeId}`);
    const minutes = samePlace ? 0 : recommendedMinutes(leg);
    if (minutes == null) {
      issues.push({ code: "required_route_missing", severity: "blocking", message: `${previous.title}到${current.title}的路线尚未核验，不能确认这份方案。`, stopIds: [previous.stopId, current.stopId], dayIndex: current.dayIndex });
      continue;
    }
    if (!previous.endAt) continue;
    const earliest = shifted(previous.endAt, minutes);
    if (!current.startAt) {
      if (!current.fixed) {
        current.startAt = earliest;
        current.endAt = shifted(earliest, current.role === "meal" ? 90 : current.role === "activity" ? 120 : 30);
      }
      continue;
    }
    const deltaMinutes = Math.ceil((new Date(earliest).getTime() - new Date(current.startAt).getTime()) / 60_000);
    if (deltaMinutes <= 0) continue;
    if (current.fixed) {
      issues.push({ code: "chronology_conflict", severity: "blocking", message: `${current.title}的固定时间早于上一站结束加移动耗时。`, stopIds: [previous.stopId, current.stopId], dayIndex: current.dayIndex });
      continue;
    }
    const duration = current.endAt ? Math.max(0, Math.round((new Date(current.endAt).getTime() - new Date(current.startAt).getTime()) / 60_000)) : 30;
    current.startAt = earliest;
    current.endAt = shifted(earliest, duration);
    const newDate = datePart(current.startAt, current.date);
    const newIndex = itinerary.tripDates.indexOf(newDate);
    if (newIndex < 0) {
      issues.push({ code: "outside_trip_dates", severity: "blocking", message: `${current.title}调整后超出旅行日期。`, stopIds: [current.stopId], dayIndex: current.dayIndex });
    } else {
      current.date = newDate;
      current.dayIndex = newIndex + 1;
      issues.push({ code: "flexible_window_shifted", severity: "warning", message: `${current.title}已按前序路线耗时顺延。`, stopIds: [current.stopId], dayIndex: current.dayIndex });
    }
  }
  const travelerFit = objectValue(mobility.travelerFit);
  if (travelerFit.stepFreeRequired === true && travelerFit.accessibilityEvidence !== "verified") {
    issues.push({ code: "step_free_continuity_unverified", severity: "blocking", message: "同行人要求连续无台阶，但当前路线证据仍不足。", stopIds: [], dayIndex: null });
  } else if (travelerFit.avoidStairs === true && travelerFit.accessibilityEvidence === "unverified") {
    issues.push({ code: "stairs_evidence_unverified", severity: "warning", message: "当前没有发现明确楼梯冲突，但电梯与连续无台阶状态仍需现场确认。", stopIds: [], dayIndex: null });
  }
  for (const day of itinerary.days) day.stopIds = itinerary.stops.filter((stop) => stop.dayIndex === day.dayIndex).map((stop) => stop.stopId);
  const unresolved = mobility.coverage.unresolvedStopIds ?? mobility.coverage.unresolvedNodeIds;
  if (unresolved.length) issues.push({ code: "unresolved_stops", severity: "blocking", message: "仍有地点没有成功定位或接入路线。", stopIds: unresolved.slice(0, 8), dayIndex: null });
  if (mobility.status !== "completed") issues.push({ code: "mobility_incomplete", severity: "blocking", message: "多点路线尚未完整核验。", stopIds: [], dayIndex: null });
  for (const day of itinerary.days.filter((item) => item.stopIds.length === 0)) issues.push({ code: "day_without_stops", severity: "warning", message: `第 ${day.dayIndex} 天仍有待安排时段。`, stopIds: [], dayIndex: day.dayIndex });
  for (const stop of itinerary.stops.filter((item) => ["meal", "activity"].includes(item.role))) {
    const intervals = [...String(stop.openingHours ?? "").matchAll(/([01]?\d|2[0-3]):([0-5]\d)\s*[-~至]\s*([01]?\d|2[0-3]):([0-5]\d)/g)];
    if (!intervals.length || !stop.startAt) {
      issues.push({ code: "opening_hours_not_verified", severity: "warning", message: `${stop.title}的对应日期营业时间仍待核验。`, stopIds: [stop.stopId], dayIndex: stop.dayIndex });
      continue;
    }
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(stop.startAt));
    const currentMinutes = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    const insideAnyWindow = intervals.some((interval) => {
      const opens = Number(interval[1]) * 60 + Number(interval[2]);
      const closes = Number(interval[3]) * 60 + Number(interval[4]);
      return currentMinutes >= opens && currentMinutes <= closes;
    });
    if (!insideAnyWindow) issues.push({ code: "opening_hours_conflict", severity: "blocking", message: `${stop.title}的当前安排不在已取得的营业时间内。`, stopIds: [stop.stopId], dayIndex: stop.dayIndex });
  }
  for (const leg of mobility.legs) {
    const recommended = leg.alternatives.find((item) => item.mode === leg.recommendedMode);
    if ((travelerFit.avoidStairs === true || travelerFit.stepFreeRequired === true) && recommended?.accessibilityAssessment.hasStairs) {
      issues.push({ code: "stairs_conflict", severity: "blocking", message: `${leg.origin.label}到${leg.destination.label}的当前推荐路线包含阶梯。`, stopIds: [leg.origin.stopId, leg.destination.stopId].filter((value): value is string => Boolean(value)), dayIndex: leg.destination.dayIndex ?? null });
    }
  }
  const blockers = issues.filter((issue) => issue.severity === "blocking");
  const feasibility = assertSchema(TripFeasibilitySchema, {
    schemaVersion: "trip-feasibility-v1",
    status: blockers.length ? "blocked" : "feasible",
    canConfirm: blockers.length === 0,
    primaryBlocker: blockers[0]?.message ?? null,
    issues,
    checkedAt,
  }, "invalid_trip_feasibility") as unknown as FeasibilityValue;
  return { itinerary: assertSchema(TripItinerarySchema, itinerary, "invalid_trip_itinerary") as unknown as ItineraryValue, feasibility };
}

export function itineraryPreviewId(input: { tripId: string; revision: number; selections: Record<string, unknown>; itinerary: ItineraryValue | null; checkedAt: string | null }): string {
  return `itp_${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32)}`;
}
