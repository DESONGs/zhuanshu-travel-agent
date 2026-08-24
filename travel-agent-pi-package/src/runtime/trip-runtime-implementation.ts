import { createHash, randomUUID } from "node:crypto";

// Provider and persisted inputs are intentionally normalized from dynamic JSON here.
// The public TypeScript facade validates every returned value with the TypeBox contracts.
type DynamicValue = any;
type DynamicRecord = Record<string, DynamicValue>;

export const FOUR_DOMAINS = ["play", "food", "stay", "transport"] as const;

export const SOCIAL_ERROR_CODES = Object.freeze([
  "AUTH_REQUIRED",
  "CHALLENGE",
  "RATE_LIMITED",
  "SOURCE_CHANGED",
  "SOURCE_UNAVAILABLE",
  "TERMS_BLOCKED",
  "EMPTY_VERIFIED",
]);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function now(clock: DynamicValue): string {
  const value = typeof clock === "function" ? clock() : (clock ?? new Date());
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_clock_value");
  return date.toISOString();
}

function isoDate(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nearestFutureYear(reference: Date, month: number, day: number): number {
  const currentYear = reference.getUTCFullYear();
  const candidate = isoDate(currentYear, month, day);
  const referenceDate = reference.toISOString().slice(0, 10);
  return candidate && candidate >= referenceDate ? currentYear : currentYear + 1;
}

function inclusiveDateRange(start: string, durationDays: number): string {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(startDate.getTime() + (durationDays - 1) * 86_400_000);
  return `${start} 至 ${endDate.toISOString().slice(0, 10)}`;
}

function normalizedTravelDates(value: unknown, referenceTimestamp: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const isoMatches = [...raw.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)];
  if (isoMatches.length) {
    const startMatch = isoMatches[0]!;
    const start = isoDate(Number(startMatch[1]), Number(startMatch[2]), Number(startMatch[3]));
    const endMatch = isoMatches[1] ?? startMatch;
    const end = isoDate(Number(endMatch[1]), Number(endMatch[2]), Number(endMatch[3]));
    if (start && end && end >= start) return start === end ? start : `${start} 至 ${end}`;
  }
  const chineseRange = raw.match(/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:至|到|[-—~～])\s*(?:(20\d{2})\s*年\s*)?(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日?/);
  if (chineseRange) {
    const reference = new Date(referenceTimestamp);
    const startMonth = Number(chineseRange[2]);
    const startDay = Number(chineseRange[3]);
    const startYear = chineseRange[1] ? Number(chineseRange[1]) : nearestFutureYear(reference, startMonth, startDay);
    let endYear = Number(chineseRange[4] ?? startYear);
    const endMonth = Number(chineseRange[5] ?? startMonth);
    const endDay = Number(chineseRange[6]);
    if (!chineseRange[4] && endMonth < startMonth) endYear += 1;
    const start = isoDate(startYear, startMonth, startDay);
    const end = isoDate(endYear, endMonth, endDay);
    if (start && end && end >= start) return start === end ? start : `${start} 至 ${end}`;
  }
  const chineseSingle = raw.match(/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (chineseSingle) {
    const reference = new Date(referenceTimestamp);
    const month = Number(chineseSingle[2]);
    const day = Number(chineseSingle[3]);
    const year = chineseSingle[1] ? Number(chineseSingle[1]) : nearestFutureYear(reference, month, day);
    return isoDate(year, month, day) ?? raw.slice(0, 120);
  }
  return raw.slice(0, 120);
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function requireDomain(value: DynamicValue): typeof FOUR_DOMAINS[number] {
  if (!FOUR_DOMAINS.includes(value)) throw new Error("invalid_travel_domain");
  return value;
}

function asArray(value: unknown): DynamicValue[] {
  return Array.isArray(value) ? value : [];
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

function indexNodes(nodes: DynamicRecord[]): Map<string, DynamicRecord> {
  return new Map(nodes.map((node) => [node.nodeId, node]));
}

function immutablePatchTarget(node: DynamicRecord | undefined): boolean {
  return node?.lock?.kind === "booked" || node?.lock?.kind === "hard" || node?.lock?.kind === "user";
}

function createDecisionNodeRecord(input: DynamicRecord, timestamp: string): DynamicRecord {
  return {
    nodeId: requireId(input.nodeId, "node_id"),
    domain: requireDomain(input.domain),
    kind: input.kind ?? "option",
    title: String(input.title ?? input.nodeId).slice(0, 200),
    summary: String(input.summary ?? "").slice(0, 1000),
    status: input.status ?? "candidate",
    selected: input.selected === true,
    lock: input.lock ?? null,
    offerRef: input.offerRef ?? null,
    foreignGuestEligible: input.foreignGuestEligible ?? null,
    claimRefs: unique(asArray(input.claimRefs)),
    sourceRefs: unique(asArray(input.sourceRefs)),
    sourceStatus: input.sourceStatus ?? "unverified",
    travelerIds: unique(asArray(input.travelerIds)),
    impactsNodeIds: unique(asArray(input.impactsNodeIds)),
    operability: clone(input.operability ?? {}),
    spoilerLevel: input.spoilerLevel ?? "low",
    time: input.time ?? null,
    location: input.location ?? null,
    media: asArray(input.media).slice(0, 6).map((item) => ({
      url: String(item?.url ?? "").slice(0, 2_000),
      title: String(item?.title ?? "").slice(0, 200),
      source: String(item?.source ?? "provider").slice(0, 120),
    })).filter((item) => item.url),
    cost: Number(input.cost ?? 0),
    version: 1,
    updatedAt: timestamp,
  };
}

const CARE_NEED_GROUPS = Object.freeze({
  mobility: {
    booleans: ["reduceWalking", "avoidStairs", "stepFreeRequired", "wheelchairSpaceRequired", "luggageAssistanceRequired"],
    integers: { maxContinuousWalkMeters: [50, 20_000], maxTransfers: [0, 8] },
  },
  stamina: {
    booleans: ["needsFrequentRest"],
    integers: { restEveryMinutes: [10, 240], maxActiveMinutesPerBlock: [20, 720] },
  },
  schedule: {
    booleans: ["regularMealTimes"],
    times: ["earliestStartTime", "latestReturnTime", "latestDinnerTime"],
  },
  facilities: {
    booleans: ["accessibleToiletRequired", "toiletAccessPriority", "nursingRoomRequired", "strollerFriendlyRequired", "quietRetreatRequired"],
  },
  sensory: {
    booleans: ["avoidCrowds", "avoidStrongSensoryStimuli"],
  },
  food: {
    strings: ["exclusions"],
  },
});

function normalizedCareNeeds(current: DynamicRecord = {}, changes: DynamicValue): DynamicRecord {
  if (changes === undefined) return clone(current ?? {});
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("invalid_traveler_care_needs");
  const next = clone(current ?? {});
  for (const [group, rawContract] of Object.entries(CARE_NEED_GROUPS)) {
    const contract = rawContract as DynamicRecord;
    if (changes[group] === undefined) continue;
    if (changes[group] === null) {
      delete next[group];
      continue;
    }
    if (typeof changes[group] !== "object" || Array.isArray(changes[group])) throw new Error(`invalid_traveler_care_${group}`);
    const groupNext = clone(next[group] ?? {});
    for (const field of contract.booleans ?? []) {
      if (changes[group][field] === undefined) continue;
      if (changes[group][field] === null) delete groupNext[field];
      else if (typeof changes[group][field] === "boolean") groupNext[field] = changes[group][field];
      else throw new Error(`invalid_traveler_care_${group}_${field}`);
    }
    for (const [field, [minimum, maximum]] of Object.entries(contract.integers ?? {}) as Array<[string, [number, number]]>) {
      if (changes[group][field] === undefined) continue;
      if (changes[group][field] === null) {
        delete groupNext[field];
        continue;
      }
      const value = Number(changes[group][field]);
      if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`invalid_traveler_care_${group}_${field}`);
      groupNext[field] = value;
    }
    for (const field of contract.times ?? []) {
      if (changes[group][field] === undefined) continue;
      if (changes[group][field] === null) {
        delete groupNext[field];
        continue;
      }
      const value = String(changes[group][field]).trim();
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`invalid_traveler_care_${group}_${field}`);
      groupNext[field] = value;
    }
    for (const field of contract.strings ?? []) {
      if (changes[group][field] === undefined) continue;
      if (changes[group][field] === null) {
        delete groupNext[field];
        continue;
      }
      if (!Array.isArray(changes[group][field])) throw new Error(`invalid_traveler_care_${group}_${field}`);
      groupNext[field] = unique(changes[group][field].map((item) => String(item ?? "").trim().slice(0, 80)).filter(Boolean)).slice(0, 12);
    }
    if (Object.keys(groupNext).length) next[group] = groupNext;
    else delete next[group];
  }
  return next;
}

function assertNoPrivateCareDetails(value: DynamicValue): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/diagnos|medicalHistory|disease|病史|诊断|病历|证明材料/i.test(key)) throw new Error("private_care_detail_not_allowed");
    assertNoPrivateCareDetails(child);
  }
}

function normalizedTravelerRecord(input: DynamicRecord, index: number, current: DynamicRecord | null = null): DynamicRecord {
  assertNoPrivateCareDetails(input);
  const travelerId = requireId(input?.travelerId ?? current?.travelerId ?? `traveler_${index + 1}`, "traveler_id");
  const displayNameValue = input?.displayName === undefined ? current?.displayName : input.displayName;
  const relationshipValue = input?.relationship === undefined ? current?.relationship : input.relationship;
  return {
    travelerId,
    displayName: String(displayNameValue ?? `同行人 ${index + 1}`).trim().slice(0, 40) || `同行人 ${index + 1}`,
    relationship: relationshipValue == null ? null : (String(relationshipValue).trim().slice(0, 40) || null),
    role: input?.role ?? current?.role ?? "traveler",
    language: input?.language ?? current?.language ?? "zh-CN",
    hardConstraints: (input?.hardConstraints === undefined ? asArray(current?.hardConstraints) : asArray(input.hardConstraints)).map((constraint) => {
      if (/diagnos|medical_history|disease|病史|诊断|病历/i.test(String(constraint?.type ?? ""))) throw new Error("private_care_detail_not_allowed");
      return clone(constraint);
    }),
    softPreferences: input?.softPreferences === undefined ? asArray(current?.softPreferences) : asArray(input.softPreferences),
    careNeeds: normalizedCareNeeds(current?.careNeeds, input?.careNeeds),
    operability: clone(input?.operability === undefined ? (current?.operability ?? {}) : input.operability),
  };
}

export function createTripControlState({ tripId = `trip_${randomUUID().slice(0, 8)}`, brief = {}, travelers = [], clock }: DynamicRecord = {}): DynamicRecord {
  requireId(tripId, "trip_id");
  const createdAt = now(clock);
  const normalizedBrief = normalizedBriefUpdate({}, brief, createdAt);
  return {
    schemaVersion: "trip-control-state-v1",
    tripId,
    revision: 0,
    storageVersion: 0,
    activeBranchId: "main",
    brief: normalizedBrief,
    travelers: travelers.map((traveler: DynamicRecord, index: number) => normalizedTravelerRecord(traveler, index)),
    nodes: [],
    edges: [],
    taskQueues: Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, []])),
    openDecisions: FOUR_DOMAINS.map((domain) => ({
      decisionId: `decision_${domain}`,
      domain,
      status: "open",
      candidateNodeIds: [],
      selectedNodeIds: [],
    })),
    dirtySet: [],
    budgetLedger: { currency: normalizedBrief.currency ?? "CNY", totalBudget: normalizedBrief.totalBudget ?? null, committed: 0, estimated: 0 },
    environment: { weather: null, mobility: null, updatedAt: null },
    readiness: {
      schemaVersion: "trip-readiness-state-v1",
      version: 0,
      signals: {
        travel_documents: "unknown",
        mobile_access: "unknown",
        cashless_access: "unknown",
        china_account_continuity: "unknown",
      },
      updatedAt: null,
    },
    fulfillmentLedger: [],
    evidence: { contentItems: [], claims: [], entities: [] },
    pendingProposals: [],
    proposalHistory: [],
    feedbackLedger: [],
    fulfillmentEvents: [],
    changeJournal: [],
    createdAt,
    updatedAt: createdAt,
  };
}

const READINESS_SIGNAL_IDS = Object.freeze([
  "travel_documents", "mobile_access", "cashless_access", "china_account_continuity",
]);
const READINESS_SIGNAL_STATUSES = new Set(["unknown", "ready", "needs_help", "not_applicable"]);

export function updateTripReadiness(state: DynamicRecord, input: DynamicRecord = {}, { clock }: DynamicRecord = {}): DynamicRecord {
  const updates = input.signals ?? (input.signalId ? { [input.signalId]: input.status } : {});
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) throw new Error("invalid_readiness_update");
  const next = clone(state);
  const currentSignals = next.readiness?.signals ?? {};
  const signals = { ...currentSignals };
  let changed = false;
  for (const [signalId, status] of Object.entries(updates)) {
    if (!READINESS_SIGNAL_IDS.includes(signalId)) throw new Error("invalid_readiness_signal");
    if (typeof status !== "string" || !READINESS_SIGNAL_STATUSES.has(status)) throw new Error("invalid_readiness_status");
    if (signals[signalId] !== status) {
      signals[signalId] = status;
      changed = true;
    }
  }
  if (!changed) return next;
  const timestamp = now(clock);
  next.readiness = {
    schemaVersion: "trip-readiness-state-v1",
    version: Number(next.readiness?.version ?? 0) + 1,
    signals,
    updatedAt: timestamp,
  };
  next.updatedAt = timestamp;
  next.changeJournal.push({
    changeId: `readiness_${next.readiness.version}_${randomUUID().slice(0, 8)}`,
    baseRevision: state.revision,
    revision: state.revision,
    event: "trip_readiness_updated",
    signalIds: Object.keys(updates),
    committedAt: timestamp,
  });
  return next;
}

function normalizeWeatherObservation(input: DynamicRecord): DynamicRecord {
  if (!input || input.status !== "completed") throw new Error("verified_weather_required");
  const guidance = input.planningImpact?.guidance ?? {};
  return {
    schemaVersion: "trip-weather-v1",
    status: "completed",
    provider: String(input.provider ?? "unknown").slice(0, 120),
    destination: String(input.destination ?? "").slice(0, 120),
    city: input.city == null ? null : String(input.city).slice(0, 120),
    province: input.province == null ? null : String(input.province).slice(0, 120),
    adcode: input.adcode == null ? null : String(input.adcode).slice(0, 20),
    reportTime: input.reportTime == null ? null : String(input.reportTime).slice(0, 40),
    checkedAt: input.checkedAt == null ? null : String(input.checkedAt).slice(0, 40),
    coverage: ["dates_unknown", "outside_forecast_window", "partial", "covered"].includes(input.coverage) ? input.coverage : "dates_unknown",
    tripDates: unique(asArray(input.tripDates).map((item) => String(item).slice(0, 10))).slice(0, 60),
    forecastDays: asArray(input.forecastDays).slice(0, 16).map((day) => ({
      date: String(day?.date ?? "").slice(0, 10),
      weekday: day?.weekday == null ? null : String(day.weekday).slice(0, 8),
      dayCondition: day?.dayCondition == null ? null : String(day.dayCondition).slice(0, 80),
      nightCondition: day?.nightCondition == null ? null : String(day.nightCondition).slice(0, 80),
      highC: Number.isFinite(day?.highC) ? day.highC : null,
      lowC: Number.isFinite(day?.lowC) ? day.lowC : null,
      dayWind: day?.dayWind == null ? null : String(day.dayWind).slice(0, 40),
      nightWind: day?.nightWind == null ? null : String(day.nightWind).slice(0, 40),
      maxWindLevel: Number.isFinite(day?.maxWindLevel) ? day.maxWindLevel : null,
      maxWindKph: Number.isFinite(day?.maxWindKph) ? day.maxWindKph : null,
      precipitationProbability: Number.isFinite(day?.precipitationProbability) ? day.precipitationProbability : null,
      weatherCode: Number.isFinite(day?.weatherCode) ? day.weatherCode : null,
    })).filter((day) => day.date),
    riskSignals: unique(asArray(input.riskSignals).map((item) => String(item).slice(0, 80))).slice(0, 12),
    planningImpact: {
      active: input.planningImpact?.active === true,
      severity: ["none", "watch", "high"].includes(input.planningImpact?.severity) ? input.planningImpact.severity : "none",
      affectedDomains: unique(asArray(input.planningImpact?.affectedDomains).filter((domain) => FOUR_DOMAINS.includes(domain))),
      guidance: Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, guidance[domain] == null ? null : String(guidance[domain]).slice(0, 300)])),
    },
    sourceDocumentation: input.sourceDocumentation == null ? null : String(input.sourceDocumentation).slice(0, 1_000),
    attribution: input.attribution == null ? null : String(input.attribution).slice(0, 300),
    usageMode: input.usageMode == null ? null : String(input.usageMode).slice(0, 80),
    caveat: input.caveat == null ? null : String(input.caveat).slice(0, 500),
    fabricatedResults: false,
  };
}

function weatherPlanningFingerprint(weather: DynamicRecord): string {
  return stableHash({
    destination: weather.destination,
    adcode: weather.adcode,
    coverage: weather.coverage,
    tripDates: weather.tripDates,
    forecastDays: weather.forecastDays,
    riskSignals: weather.riskSignals,
    planningImpact: weather.planningImpact,
  });
}

export function applyWeatherObservation(state: DynamicRecord, observation: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  const timestamp = now(clock);
  const weather = normalizeWeatherObservation(observation);
  const next = clone(state);
  const current = next.environment?.weather ?? null;
  const changed = !current || weatherPlanningFingerprint(current) !== weatherPlanningFingerprint(weather);
  next.environment = { ...(next.environment ?? {}), weather, updatedAt: timestamp };
  if (!changed) {
    next.updatedAt = timestamp;
    return next;
  }
  if (next.pendingProposals.length) {
    next.proposalHistory.push(...next.pendingProposals.map((proposal: DynamicRecord) => ({ proposalId: proposal.proposalId, status: "superseded_by_weather_change", decidedAt: timestamp, revision: state.revision })));
    next.pendingProposals = [];
  }
  next.revision = state.revision + 1;
  next.updatedAt = timestamp;
  if (next.nodes.length) {
    const dirty = enqueueAffectedTaskChains(next, next.nodes.map((node: DynamicRecord) => node.nodeId), { clock: () => new Date(timestamp) });
    next.dirtySet = dirty.dirtySet;
    next.taskQueues = dirty.taskQueues;
  }
  next.changeJournal.push({
    changeId: `change_${next.revision}_${randomUUID().slice(0, 8)}`,
    baseRevision: state.revision,
    revision: next.revision,
    changedNodeIds: next.nodes.map((node: DynamicRecord) => node.nodeId),
    event: "weather_context_updated",
    weatherCoverage: weather.coverage,
    weatherSeverity: weather.planningImpact.severity,
    committedAt: timestamp,
  });
  return next;
}

function normalizeMobilityObservation(input: DynamicRecord): DynamicRecord {
  const allowedStatuses = ["completed", "partial", "needs_context", "provider_unavailable"];
  if (!input || !allowedStatuses.includes(input.status)) throw new Error("valid_mobility_observation_required");
  return {
    schemaVersion: "trip-mobility-v1",
    status: input.status,
    destination: input.destination == null ? null : String(input.destination).slice(0, 120),
    source: String(input.source ?? "unknown").slice(0, 120),
    checkedAt: input.checkedAt == null ? null : String(input.checkedAt).slice(0, 40),
    freshUntil: input.freshUntil == null ? null : String(input.freshUntil).slice(0, 40),
    coverage: {
      routedNodeIds: unique(asArray(input.coverage?.routedNodeIds).map((item) => String(item).slice(0, 128))).slice(0, 24),
      unresolvedNodeIds: unique(asArray(input.coverage?.unresolvedNodeIds).map((item) => String(item).slice(0, 128))).slice(0, 24),
      unscheduled: input.coverage?.unscheduled !== false,
    },
    legs: asArray(input.legs).slice(0, 8).map((leg) => clone(leg)),
    travelerFit: clone(input.travelerFit ?? {}),
    reason: input.reason == null ? null : String(input.reason).slice(0, 200),
    caveats: asArray(input.caveats).map((item) => String(item).slice(0, 500)).slice(0, 12),
    sourceDocumentation: input.sourceDocumentation == null ? null : String(input.sourceDocumentation).slice(0, 2_000),
    fabricatedResults: false,
  };
}

function mobilityPlanningFingerprint(mobility: DynamicRecord): string {
  return stableHash({
    status: mobility.status,
    destination: mobility.destination,
    coverage: mobility.coverage,
    legs: mobility.legs,
    travelerFit: mobility.travelerFit,
    reason: mobility.reason,
  });
}

export function applyMobilityObservation(state: DynamicRecord, observation: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  const timestamp = now(clock);
  const mobility = normalizeMobilityObservation(observation);
  const next = clone(state);
  const current = next.environment?.mobility ?? null;
  const changed = !current || mobilityPlanningFingerprint(current) !== mobilityPlanningFingerprint(mobility);
  next.environment = { ...(next.environment ?? {}), mobility, updatedAt: timestamp };
  next.updatedAt = timestamp;
  if (!changed) return next;
  next.revision = state.revision + 1;
  next.changeJournal.push({
    changeId: `change_${next.revision}_${randomUUID().slice(0, 8)}`,
    baseRevision: state.revision,
    revision: next.revision,
    changedNodeIds: mobility.coverage.routedNodeIds,
    event: "city_mobility_context_updated",
    mobilityStatus: mobility.status,
    committedAt: timestamp,
  });
  return next;
}

const BRIEF_TEXT_FIELDS = Object.freeze([
  "destination", "dates", "origin", "arrivalMode", "partyProfile", "pace", "lodgingPreference", "currency",
]);

function normalizedBriefUpdate(current: DynamicRecord, changes: DynamicRecord, referenceTimestamp = new Date().toISOString()): DynamicRecord {
  const next = clone(current ?? {});
  for (const field of BRIEF_TEXT_FIELDS) {
    if (changes[field] === undefined) continue;
    const value = String(changes[field] ?? "").trim();
    next[field] = field === "dates"
      ? normalizedTravelDates(value, referenceTimestamp)
      : value ? value.slice(0, field === "partyProfile" || field === "lodgingPreference" ? 240 : 120) : null;
  }
  if (changes.durationDays !== undefined) {
    const durationDays = Number(changes.durationDays);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 60) throw new Error("invalid_duration_days");
    next.durationDays = durationDays;
  }
  if (typeof next.dates === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(next.dates) && Number.isInteger(next.durationDays) && next.durationDays > 1) {
    next.dates = inclusiveDateRange(next.dates, next.durationDays);
  }
  if (changes.totalBudget !== undefined) {
    const totalBudget = Number(changes.totalBudget);
    if (!Number.isFinite(totalBudget) || totalBudget < 0) throw new Error("invalid_total_budget");
    next.totalBudget = totalBudget;
  }
  if (changes.foodPreferences !== undefined) {
    if (!Array.isArray(changes.foodPreferences)) throw new Error("invalid_food_preferences");
    next.foodPreferences = unique(changes.foodPreferences.map((item) => String(item ?? "").trim().slice(0, 120)).filter(Boolean)).slice(0, 12);
  }
  return next;
}

export function updateTripControlScope(state: DynamicRecord, input: DynamicRecord = {}, { clock }: DynamicRecord = {}): DynamicRecord {
  const timestamp = now(clock);
  const next = clone(state);
  const previousDestination = next.brief?.destination ?? null;
  const previousDates = next.brief?.dates ?? null;
  const previousBrief = JSON.stringify(next.brief ?? {});
  const previousTravelers = JSON.stringify(next.travelers ?? []);
  next.brief = normalizedBriefUpdate(next.brief, input.brief ?? input, timestamp);
  const environmentScopeChanged = previousDestination !== (next.brief?.destination ?? null)
    || previousDates !== (next.brief?.dates ?? null);

  const travelerProfiles = asArray(input.travelerProfiles);
  const requestedCount = input.travelerCount === undefined ? Math.max(1, next.travelers.length, travelerProfiles.length) : Number(input.travelerCount);
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 12) throw new Error("invalid_traveler_count");
  const language = input.language === undefined ? null : String(input.language ?? "").trim().slice(0, 24);
  const foreignGuestRequired = input.foreignGuestRequired;
  const consumedProfiles = new Set();
  next.travelers = Array.from({ length: requestedCount }, (_, index) => {
    const current = next.travelers[index] ?? normalizedTravelerRecord({}, index);
    let profileIndex = travelerProfiles.findIndex((profile, candidateIndex) => !consumedProfiles.has(candidateIndex) && profile?.travelerId === current.travelerId);
    if (profileIndex < 0) profileIndex = travelerProfiles.findIndex((profile, candidateIndex) => !consumedProfiles.has(candidateIndex) && ((profile?.displayName && profile.displayName === current.displayName) || (profile?.relationship && profile.relationship === current.relationship)));
    if (profileIndex < 0 && travelerProfiles.length === requestedCount && travelerProfiles[index]) profileIndex = index;
    const profile = profileIndex >= 0 ? travelerProfiles[profileIndex] : {};
    if (profileIndex >= 0) consumedProfiles.add(profileIndex);
    const hardConstraints = foreignGuestRequired === undefined
      ? (profile.hardConstraints === undefined ? asArray(current.hardConstraints) : asArray(profile.hardConstraints))
      : [
        ...asArray(profile.hardConstraints === undefined ? current.hardConstraints : profile.hardConstraints).filter((item) => item?.type !== "foreign_guest_required"),
        ...(foreignGuestRequired === true ? [{ type: "foreign_guest_required" }] : []),
      ];
    return normalizedTravelerRecord({ ...profile, language: profile.language ?? (language || current.language || "zh-CN"), hardConstraints }, index, current);
  });

  const travelerScopeChanged = previousTravelers !== JSON.stringify(next.travelers);

  const changed = previousBrief !== JSON.stringify(next.brief)
    || travelerScopeChanged;
  if (!changed) return next;

  if (next.pendingProposals.length) {
    next.proposalHistory.push(...next.pendingProposals.map((proposal: DynamicRecord) => ({
      proposalId: proposal.proposalId,
      status: "superseded_by_scope_change",
      decidedAt: timestamp,
      revision: state.revision,
    })));
    next.pendingProposals = [];
  }
  next.budgetLedger.currency = next.brief.currency ?? next.budgetLedger.currency;
  next.budgetLedger.totalBudget = next.brief.totalBudget ?? null;
  const mobilityScopeChanged = environmentScopeChanged || travelerScopeChanged;
  if (environmentScopeChanged || mobilityScopeChanged) next.environment = { ...(next.environment ?? {}), updatedAt: timestamp };
  if (environmentScopeChanged) Object.assign(next.environment, { weather: null, weatherInvalidatedAt: timestamp, weatherInvalidatedBy: "trip_scope_change" });
  if (mobilityScopeChanged) Object.assign(next.environment, { mobility: null, mobilityInvalidatedAt: timestamp, mobilityInvalidatedBy: travelerScopeChanged && !environmentScopeChanged ? "traveler_needs_change" : "trip_scope_change" });
  next.revision = state.revision + 1;
  next.updatedAt = timestamp;
  if (next.nodes.length) {
    const dirty = enqueueAffectedTaskChains(next, next.nodes.map((node: DynamicRecord) => node.nodeId), { clock: () => new Date(timestamp) });
    next.dirtySet = dirty.dirtySet;
    next.taskQueues = dirty.taskQueues;
  }
  next.changeJournal.push({
    changeId: `change_${next.revision}_${randomUUID().slice(0, 8)}`,
    baseRevision: state.revision,
    revision: next.revision,
    changedNodeIds: next.nodes.map((node: DynamicRecord) => node.nodeId),
    event: "trip_scope_updated",
    environmentInvalidated: [...(environmentScopeChanged ? ["weather"] : []), ...(mobilityScopeChanged ? ["mobility"] : [])],
    committedAt: timestamp,
  });
  return next;
}

export function addDecisionNode(state: DynamicRecord, input: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  const next = clone(state);
  const nodeId = requireId(input.nodeId, "node_id");
  if (next.nodes.some((node: DynamicRecord) => node.nodeId === nodeId)) throw new Error("decision_node_already_exists");
  next.nodes.push(createDecisionNodeRecord(input, now(clock)));
  for (const impactedNodeId of unique(asArray(input.impactsNodeIds))) {
    if (!next.nodes.some((node: DynamicRecord) => node.nodeId === impactedNodeId)) throw new Error("impact_node_not_found");
    next.edges.push({
      edgeId: requireId(`${nodeId}->${impactedNodeId}:impacts`, "edge_id"),
      fromNodeId: nodeId,
      toNodeId: impactedNodeId,
      type: "impacts",
    });
  }
  return next;
}

export function addDecisionEdge(state: DynamicRecord, input: DynamicRecord): DynamicRecord {
  const next = clone(state);
  const fromNodeId = requireId(input.fromNodeId, "from_node_id");
  const toNodeId = requireId(input.toNodeId, "to_node_id");
  const nodes = indexNodes(next.nodes);
  if (!nodes.has(fromNodeId) || !nodes.has(toNodeId)) throw new Error("decision_edge_node_not_found");
  const edgeId = requireId(input.edgeId ?? `${fromNodeId}->${toNodeId}:${input.type ?? "depends_on"}`, "edge_id");
  if (next.edges.some((edge: DynamicRecord) => edge.edgeId === edgeId)) throw new Error("decision_edge_already_exists");
  next.edges.push({ edgeId, fromNodeId, toNodeId, type: input.type ?? "depends_on" });
  return next;
}

export function addEvidenceClaim(state: DynamicRecord, input: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  const next = clone(state);
  const claimId = requireId(input.claimId, "claim_id");
  const entityId = requireId(input.entityId, "entity_id");
  const nodeId = requireId(input.nodeId, "node_id");
  if (!next.nodes.some((node: DynamicRecord) => node.nodeId === nodeId)) throw new Error("claim_decision_node_not_found");
  if (next.evidence.claims.some((claim: DynamicRecord) => claim.claimId === claimId)) throw new Error("claim_already_exists");
  next.evidence.claims.push({
    claimId,
    entityId,
    nodeId,
    kind: input.kind ?? "experience",
    statement: String(input.statement ?? "").slice(0, 1000),
    sourceRefs: unique(asArray(input.sourceRefs)),
    sourceIndependence: input.sourceIndependence ?? "unknown",
    commercialBias: input.commercialBias ?? "unknown",
    confidence: Number(input.confidence ?? 0),
    observedAt: input.observedAt ?? now(clock),
  });
  return next;
}

export function recordOfferSnapshot(state: DynamicRecord, input: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  const next = clone(state);
  const offerId = requireId(input.offerId, "offer_id");
  const nodeId = requireId(input.nodeId, "node_id");
  if (!next.nodes.some((node: DynamicRecord) => node.nodeId === nodeId)) throw new Error("offer_decision_node_not_found");
  if (next.fulfillmentLedger.some((offer: DynamicRecord) => offer.offerId === offerId)) throw new Error("offer_already_exists");
  if (input.expiresAt && Number.isNaN(new Date(input.expiresAt).getTime())) throw new Error("invalid_offer_expiry");
  next.fulfillmentLedger.push({
    offerId,
    nodeId,
    source: input.source ?? "unknown",
    handoffUrl: input.handoffUrl ?? null,
    totalPrice: Number(input.totalPrice ?? 0),
    currency: input.currency ?? next.budgetLedger.currency,
    expiresAt: input.expiresAt ?? null,
    checkedAt: input.checkedAt ?? now(clock),
    status: "active",
  });
  return next;
}

export function computeDirtySet(state: DynamicRecord, changedNodeIds: string[]): string[] {
  const changed = unique(asArray(changedNodeIds).map((nodeId) => requireId(nodeId, "changed_node_id")));
  const adjacency = new Map();
  for (const edge of state.edges) {
    const neighbors = adjacency.get(edge.fromNodeId) ?? [];
    neighbors.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, neighbors);
  }
  const dirty = new Set(changed);
  const queue = [...changed];
  while (queue.length) {
    const nodeId = queue.shift();
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!dirty.has(neighbor)) {
        dirty.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return [...dirty];
}

export function enqueueAffectedTaskChains(state: DynamicRecord, changedNodeIds: string[], { clock }: DynamicRecord = {}): DynamicRecord {
  const next = clone(state);
  const dirtySet = computeDirtySet(next, changedNodeIds);
  const nodes = indexNodes(next.nodes);
  const domains = unique(dirtySet.map((nodeId) => nodes.get(nodeId)?.domain).filter(Boolean));
  for (const domain of domains) {
    const queue = next.taskQueues[domain] ?? [];
    queue.push({ workUnitId: `replan_${domain}_${next.revision}_${queue.length + 1}`, reason: "dirty_set", nodeIds: dirtySet, createdAt: now(clock) });
    next.taskQueues[domain] = queue;
  }
  next.dirtySet = dirtySet;
  next.updatedAt = now(clock);
  return next;
}

function scopedNodes(state: DynamicRecord, targetNodeId: string, neighborhoodNodeIds: string[]): DynamicRecord[] {
  const ids = new Set([targetNodeId, ...asArray(neighborhoodNodeIds)]);
  return state.nodes.filter((node: DynamicRecord) => ids.has(node.nodeId));
}

export function buildTravelContextPack(state: DynamicRecord, {
  workUnitId,
  targetNodeId,
  neighborhoodNodeIds = [],
  travelerIds = [],
  successCriteria = [],
  evidenceBudget = 20,
  clock,
}: DynamicRecord = {}): DynamicRecord {
  requireId(workUnitId, "work_unit_id");
  requireId(targetNodeId, "target_node_id");
  const nodes = scopedNodes(state, targetNodeId, neighborhoodNodeIds);
  if (!nodes.some((node) => node.nodeId === targetNodeId)) throw new Error("context_target_node_not_found");
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const relevantClaims = state.evidence.claims.filter((claim: DynamicRecord) => nodeIds.has(claim.nodeId)).slice(0, evidenceBudget);
  const selectedTravelerIds = travelerIds.length ? new Set(travelerIds) : new Set(nodes.flatMap((node) => node.travelerIds));
  const travelers = state.travelers.filter((traveler: DynamicRecord) => selectedTravelerIds.size === 0 || selectedTravelerIds.has(traveler.travelerId));
  const pack = {
    schemaVersion: "travel-context-pack-v2",
    contextPackId: `pack_${stableHash({ tripId: state.tripId, revision: state.revision, workUnitId, targetNodeId, neighborhoodNodeIds }).slice(0, 16)}`,
    tripId: state.tripId,
    baseRevision: state.revision,
    workUnit: { workUnitId, targetNodeId, successCriteria },
    travelerSlice: travelers,
    decisionNeighborhood: { nodeIds: [...nodeIds], nodes, edges: state.edges.filter((edge: DynamicRecord) => nodeIds.has(edge.fromNodeId) || nodeIds.has(edge.toNodeId)) },
    evidenceBundle: relevantClaims,
    budgetSlice: clone(state.budgetLedger),
    environmentSlice: clone(state.environment ?? { weather: null, updatedAt: null }),
    fulfillmentAnchors: state.fulfillmentLedger.filter((item: DynamicRecord) => nodeIds.has(item.nodeId)),
    readSet: nodes.map((node) => ({ nodeId: node.nodeId, version: node.version })),
    writeContract: { allowedNodeIds: [...nodeIds], prohibitedLocks: ["booked", "hard", "user"] },
    artifactPointers: [],
    createdAt: now(clock),
  };
  return { ...pack, contextHash: stableHash(pack) };
}

export function needsContext({ missing, reason, suggestedRetrieval }: DynamicRecord): DynamicRecord {
  return {
    schemaVersion: "needs-context-v1",
    status: "needs_context",
    missing: asArray(missing),
    reason: reason ?? "required_context_missing",
    suggestedRetrieval: asArray(suggestedRetrieval),
  };
}

function validateFreshOffers(state: DynamicRecord, proposal: DynamicRecord, at: Date): DynamicRecord {
  const byId = new Map<string, DynamicRecord>(state.fulfillmentLedger.map((offer: DynamicRecord) => [offer.offerId, offer]));
  for (const offerId of asArray(proposal.offerRefs)) {
    const offer = byId.get(offerId);
    if (!offer) return { ok: false, reason: "offer_not_found", offerId };
    if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= at.getTime()) return { ok: false, reason: "offer_stale", offerId };
  }
  return { ok: true };
}

function validatePatch(state: DynamicRecord, proposal: DynamicRecord, { at = new Date() }: { at?: Date } = {}): DynamicRecord {
  if (!proposal || typeof proposal !== "object") return { ok: false, reason: "invalid_patch" };
  if (proposal.schemaVersion !== "trip-patch-proposal-v1") return { ok: false, reason: "invalid_patch_schema" };
  if (proposal.tripId !== state.tripId) return { ok: false, reason: "patch_trip_mismatch" };
  if (proposal.baseRevision !== state.revision) return { ok: false, reason: "needs_rebase" };
  const nodes = indexNodes(state.nodes);
  const writeSet = unique(asArray(proposal.writeSet));
  const allowed = new Set(asArray(proposal.writeContract?.allowedNodeIds));
  const operationNodeIds = unique(asArray(proposal.operations).map((operation) => operation?.nodeId));
  if (operationNodeIds.some((nodeId) => typeof nodeId !== "string" || !writeSet.includes(nodeId))) {
    return { ok: false, reason: "operation_outside_write_set" };
  }
  const candidateNodeIds = new Set(
    asArray(proposal.operations)
      .filter((operation) => operation?.kind === "add_candidate")
      .map((operation) => operation.nodeId),
  );
  for (const nodeId of writeSet) {
    const node = nodes.get(nodeId);
    if (!node && !candidateNodeIds.has(nodeId)) return { ok: false, reason: "write_node_not_found", nodeId };
    if (allowed.size && !allowed.has(nodeId)) return { ok: false, reason: "write_set_out_of_contract", nodeId };
    if (node && immutablePatchTarget(node) && proposal.overrideLock !== true) return { ok: false, reason: "locked_node_mutation_blocked", nodeId };
  }
  for (const operation of asArray(proposal.operations)) {
    if (operation.kind === "add_candidate") {
      if (nodes.has(operation.nodeId)) return { ok: false, reason: "candidate_node_already_exists", nodeId: operation.nodeId };
      try {
        createDecisionNodeRecord({ ...operation.node, nodeId: operation.nodeId }, at.toISOString());
      } catch (error: unknown) {
        return { ok: false, reason: error instanceof Error ? error.message : "invalid_candidate", nodeId: operation.nodeId };
      }
      for (const impactedNodeId of asArray(operation.node?.impactsNodeIds)) {
        if (!nodes.has(impactedNodeId) && !candidateNodeIds.has(impactedNodeId)) {
          return { ok: false, reason: "impact_node_not_found", nodeId: impactedNodeId };
        }
      }
    } else if (!["select", "reject", "update"].includes(operation.kind)) {
      return { ok: false, reason: "unsupported_patch_operation", nodeId: operation.nodeId };
    }
  }
  for (const expected of asArray(proposal.readSet)) {
    const node = nodes.get(expected.nodeId);
    if (!node || node.version !== expected.version) return { ok: false, reason: "read_set_stale", nodeId: expected.nodeId };
  }
  const offers = validateFreshOffers(state, proposal, at);
  if (!offers.ok) return offers;
  if (!Array.isArray(proposal.operations) || proposal.operations.length === 0) return { ok: false, reason: "patch_operations_missing" };
  return { ok: true };
}

export function validateTripPatch(state: DynamicRecord, proposal: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  return validatePatch(state, proposal, { at: new Date(now(clock)) });
}

function applyOperation(next: DynamicRecord, operation: DynamicRecord, timestamp: string): void {
  if (operation.kind === "add_candidate") {
    if (next.nodes.some((item: DynamicRecord) => item.nodeId === operation.nodeId)) throw new Error("decision_node_already_exists");
    const candidate = createDecisionNodeRecord({ ...operation.node, nodeId: operation.nodeId }, timestamp);
    next.nodes.push(candidate);
    const decision = next.openDecisions.find((item: DynamicRecord) => item.domain === candidate.domain);
    if (decision) {
      decision.candidateNodeIds = unique([...decision.candidateNodeIds, candidate.nodeId]);
      if (candidate.selected) {
        decision.selectedNodeIds = unique([...decision.selectedNodeIds, candidate.nodeId]);
        decision.status = "resolved";
      }
    }
    return;
  }
  const node = next.nodes.find((item: DynamicRecord) => item.nodeId === operation.nodeId);
  if (!node) throw new Error("operation_node_not_found");
  if (operation.kind === "select") {
    node.selected = true;
    node.status = "selected";
    const decision = next.openDecisions.find((item: DynamicRecord) => item.domain === node.domain);
    if (decision) {
      decision.status = "resolved";
      decision.selectedNodeIds = unique([...decision.selectedNodeIds, node.nodeId]);
    }
  } else if (operation.kind === "reject") {
    node.selected = false;
    node.status = "rejected";
    const decision = next.openDecisions.find((item: DynamicRecord) => item.domain === node.domain);
    if (decision) {
      decision.selectedNodeIds = decision.selectedNodeIds.filter((nodeId: string) => nodeId !== node.nodeId);
      decision.status = decision.selectedNodeIds.length ? "resolved" : "open";
    }
  } else if (operation.kind === "update") {
    const allowedChanges = [
      "title", "summary", "offerRef", "claimRefs", "sourceRefs", "sourceStatus", "time", "location", "cost",
      "foreignGuestEligible", "operability", "spoilerLevel", "impactsNodeIds", "media",
    ];
    for (const [key, value] of Object.entries(operation.changes ?? {})) {
      if (!allowedChanges.includes(key)) throw new Error("unsupported_patch_change");
      node[key] = clone(value);
    }
  } else {
    throw new Error("unsupported_patch_operation");
  }
  node.version += 1;
  node.updatedAt = timestamp;
}

function linkCandidateImpacts(next: DynamicRecord, operations: DynamicRecord[]): void {
  for (const operation of operations.filter((item) => item.kind === "add_candidate")) {
    for (const impactedNodeId of unique(asArray(operation.node?.impactsNodeIds))) {
      const edgeId = `${operation.nodeId}->${impactedNodeId}:impacts`;
      if (!next.edges.some((edge: DynamicRecord) => edge.edgeId === edgeId)) {
        next.edges.push({ edgeId, fromNodeId: operation.nodeId, toNodeId: impactedNodeId, type: "impacts" });
      }
    }
  }
}

function mergeProposalEvidence(next: DynamicRecord, evidenceBundle: DynamicRecord | undefined): void {
  if (!evidenceBundle) return;
  const contentItems = asArray(evidenceBundle.contentItems);
  const entities = asArray(evidenceBundle.entities);
  const claims = asArray(evidenceBundle.claims);
  const nodeIds = new Set(next.nodes.map((node: DynamicRecord) => node.nodeId));
  for (const item of contentItems) {
    const contentItemId = requireId(item.contentItemId, "content_item_id");
    if (next.evidence.contentItems.some((current: DynamicRecord) => current.contentItemId === contentItemId)) continue;
    next.evidence.contentItems.push({
      contentItemId,
      provider: String(item.provider ?? "unknown").slice(0, 120),
      sourceType: String(item.sourceType ?? "provider").slice(0, 120),
      providerRef: String(item.providerRef ?? "").slice(0, 200),
      checkedAt: item.checkedAt ?? null,
      documentationUrl: item.documentationUrl ?? null,
      independenceGroup: String(item.independenceGroup ?? contentItemId).slice(0, 200),
      commercialBias: String(item.commercialBias ?? "unknown").slice(0, 120),
    });
  }
  for (const entity of entities) {
    const entityId = requireId(entity.entityId, "entity_id");
    if (next.evidence.entities.some((current: DynamicRecord) => current.entityId === entityId)) continue;
    next.evidence.entities.push({
      entityId,
      kind: String(entity.kind ?? "place").slice(0, 120),
      canonicalName: String(entity.canonicalName ?? "").slice(0, 300),
      providerRefs: unique(asArray(entity.providerRefs)),
    });
  }
  for (const claim of claims) {
    const claimId = requireId(claim.claimId, "claim_id");
    const entityId = requireId(claim.entityId, "entity_id");
    const nodeId = requireId(claim.nodeId, "node_id");
    if (!nodeIds.has(nodeId)) throw new Error("claim_decision_node_not_found");
    if (!next.evidence.entities.some((entity: DynamicRecord) => entity.entityId === entityId)) throw new Error("claim_entity_not_found");
    if (next.evidence.claims.some((current: DynamicRecord) => current.claimId === claimId)) continue;
    next.evidence.claims.push({
      claimId,
      entityId,
      nodeId,
      kind: String(claim.kind ?? "provider_fact").slice(0, 120),
      statement: String(claim.statement ?? "").slice(0, 1000),
      sourceRefs: unique(asArray(claim.sourceRefs)),
      sourceIndependence: String(claim.sourceIndependence ?? "unknown").slice(0, 120),
      commercialBias: String(claim.commercialBias ?? "unknown").slice(0, 120),
      confidence: Math.max(0, Math.min(1, Number(claim.confidence ?? 0))),
      observedAt: claim.observedAt ?? null,
    });
  }
}

function applyProposalSelections(proposal: DynamicRecord, selections: DynamicRecord | undefined): DynamicRecord {
  if (!selections || typeof selections !== "object" || Array.isArray(selections)) return clone(proposal);
  const next = clone(proposal);
  const candidates = next.operations.filter((operation: DynamicRecord) => operation.kind === "add_candidate");
  for (const [domain, selectedNodeId] of Object.entries(selections)) {
    requireDomain(domain);
    const domainCandidates = candidates.filter((operation: DynamicRecord) => operation.node?.domain === domain);
    if (!domainCandidates.some((operation: DynamicRecord) => operation.nodeId === selectedNodeId)) throw new Error("proposal_selection_not_found");
    for (const operation of domainCandidates) operation.node.selected = operation.nodeId === selectedNodeId;
  }
  return next;
}

function recalculateCommittedBudget(state: DynamicRecord): void {
  state.budgetLedger.committed = state.nodes
    .filter((node: DynamicRecord) => node.selected)
    .reduce((total: number, node: DynamicRecord) => total + Number(node.cost ?? 0), 0);
}

export function validateTripCoherence(state: DynamicRecord): DynamicRecord {
  const selectedDomains = new Set(state.nodes.filter((node: DynamicRecord) => node.selected).map((node: DynamicRecord) => node.domain));
  const missingDomains = FOUR_DOMAINS.filter((domain) => !selectedDomains.has(domain));
  const hardConstraintViolations = [];
  const operabilityGaps = [];
  for (const traveler of state.travelers) {
    for (const constraint of traveler.hardConstraints) {
      if (constraint?.type === "foreign_guest_required") {
        const selectedStays = state.nodes.filter((node: DynamicRecord) => node.selected && node.domain === "stay");
        if (selectedStays.some((stay: DynamicRecord) => stay.foreignGuestEligible === false)) {
          hardConstraintViolations.push({ travelerId: traveler.travelerId, code: "foreign_guest_stay_ineligible" });
        } else if (selectedStays.some((stay: DynamicRecord) => stay.foreignGuestEligible !== true)) {
          hardConstraintViolations.push({ travelerId: traveler.travelerId, code: "foreign_guest_stay_unverified" });
        }
      }
    }
  }
  const routeablePlaces = state.nodes.filter((node: DynamicRecord) => node.selected && ["stay", "play", "food"].includes(node.domain));
  const mobility = state.environment?.mobility ?? null;
  if (routeablePlaces.length >= 2 && !["completed", "partial"].includes(mobility?.status)) {
    operabilityGaps.push({ domain: "transport", code: "city_mobility_unverified" });
  } else if (routeablePlaces.length >= 2 && mobility?.status === "partial") {
    operabilityGaps.push({ domain: "transport", code: "city_mobility_partial" });
  }
  const selectedNodes = state.nodes.filter((node: DynamicRecord) => node.selected);
  const recommendedMobility = asArray(mobility?.legs).map((leg) => asArray(leg.alternatives).find((alternative) => alternative.mode === leg.recommendedMode)).filter(Boolean);
  const recommendedIncludesStairs = recommendedMobility.some((alternative) => alternative.accessibilityAssessment?.hasStairs === true
    || asArray(alternative.steps).some((step) => step.walkType?.kind === "stairs" || asArray(step.accessibilityFeatures).some((feature) => feature.kind === "stairs")));
  for (const traveler of state.travelers) {
    const careNeeds = traveler.careNeeds ?? {};
    const mobilityNeeds = careNeeds.mobility ?? {};
    if (recommendedMobility.some((alternative) => Number.isFinite(mobilityNeeds.maxContinuousWalkMeters) && Number(alternative.walkingMeters ?? 0) > mobilityNeeds.maxContinuousWalkMeters)) {
      hardConstraintViolations.push({ travelerId: traveler.travelerId, code: "traveler_walk_limit_exceeded", limit: mobilityNeeds.maxContinuousWalkMeters });
    }
    if (recommendedMobility.some((alternative) => Number.isFinite(mobilityNeeds.maxTransfers) && Number(alternative.transfers ?? 0) > mobilityNeeds.maxTransfers)) {
      hardConstraintViolations.push({ travelerId: traveler.travelerId, code: "traveler_transfer_limit_exceeded", limit: mobilityNeeds.maxTransfers });
    }
    if ((mobilityNeeds.stepFreeRequired || mobilityNeeds.avoidStairs) && recommendedIncludesStairs) {
      hardConstraintViolations.push({ travelerId: traveler.travelerId, code: "traveler_stairs_route_conflict" });
    }
    if ((mobilityNeeds.stepFreeRequired || mobilityNeeds.avoidStairs) && mobility?.travelerFit?.accessibilityEvidence !== "verified") {
      operabilityGaps.push({ travelerId: traveler.travelerId, domain: "transport", code: "traveler_step_free_route_unverified" });
    }
    const facilities = careNeeds.facilities ?? {};
    if (facilities.accessibleToiletRequired && selectedNodes.length && !selectedNodes.some((node: DynamicRecord) => node.operability?.accessibleToiletVerified === true)) {
      operabilityGaps.push({ travelerId: traveler.travelerId, domain: "play", code: "traveler_accessible_toilet_unverified" });
    }
    if ((careNeeds.stamina?.needsFrequentRest || Number.isFinite(careNeeds.stamina?.maxActiveMinutesPerBlock)) && selectedNodes.length && selectedNodes.some((node: DynamicRecord) => !node.time)) {
      operabilityGaps.push({ travelerId: traveler.travelerId, domain: "play", code: "traveler_pacing_unverified" });
    }
    if (careNeeds.schedule?.latestDinnerTime && selectedNodes.some((node: DynamicRecord) => node.domain === "food" && !node.time)) {
      operabilityGaps.push({ travelerId: traveler.travelerId, domain: "food", code: "traveler_meal_timing_unverified" });
    }
    if (asArray(careNeeds.food?.exclusions).length && selectedNodes.some((node: DynamicRecord) => node.domain === "food" && node.operability?.foodExclusionsVerified !== true)) {
      operabilityGaps.push({ travelerId: traveler.travelerId, domain: "food", code: "traveler_food_exclusions_unverified" });
    }
    if ((careNeeds.sensory?.avoidCrowds || careNeeds.sensory?.avoidStrongSensoryStimuli) && selectedNodes.some((node: DynamicRecord) => node.domain === "play" && node.operability?.sensoryFitVerified !== true)) {
      operabilityGaps.push({ travelerId: traveler.travelerId, domain: "play", code: "traveler_sensory_fit_unverified" });
    }
  }
  const weather = state.environment?.weather ?? null;
  if (weather?.planningImpact?.severity === "high" && state.nodes.some((node: DynamicRecord) => node.selected && node.domain === "play" && node.operability?.weatherFit === "caution")) {
    operabilityGaps.push({ domain: "play", code: "weather_mitigation_required" });
  }
  const selectedCost = state.nodes
    .filter((node: DynamicRecord) => node.selected)
    .reduce((total: number, node: DynamicRecord) => total + Number(node.cost ?? 0), 0);
  const exceedsBudget = state.budgetLedger.totalBudget != null && selectedCost > state.budgetLedger.totalBudget;
  return {
    schemaVersion: "travel-qa-v1",
    status: missingDomains.length || hardConstraintViolations.length || operabilityGaps.length || exceedsBudget ? "needs_fix" : "pass",
    missingDomains,
    hardConstraintViolations,
    operabilityGaps,
    mobility: mobility ? { status: mobility.status, checkedAt: mobility.checkedAt ?? null, legCount: mobility.legs?.length ?? 0 } : { status: "not_checked", checkedAt: null, legCount: 0 },
    weather: weather ? { status: "verified", coverage: weather.coverage, severity: weather.planningImpact?.severity ?? "none", checkedAt: weather.checkedAt } : { status: "not_checked" },
    budget: { ...state.budgetLedger, committed: selectedCost, exceedsBudget },
  };
}

export function commitTripPatch(state: DynamicRecord, proposal: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  const timestamp = now(clock);
  const validation = validatePatch(state, proposal, { at: new Date(timestamp) });
  if (!validation.ok) {
    return { schemaVersion: "trip-commit-result-v1", status: validation.reason === "needs_rebase" ? "needs_rebase" : "rejected", validation, state };
  }
  const next = clone(state);
  try {
    for (const operation of proposal.operations) applyOperation(next, operation, timestamp);
    linkCandidateImpacts(next, proposal.operations);
    mergeProposalEvidence(next, proposal.evidenceBundle);
  } catch (error: unknown) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: error instanceof Error ? error.message : "patch_application_failed" }, state };
  }
  const changedNodeIds = unique<string>(proposal.operations.map((operation: DynamicRecord) => String(operation.nodeId)));
  if (next.environment?.mobility) {
    next.environment.mobility = {
      ...next.environment.mobility,
      status: "needs_context",
      reason: "selected_places_changed",
      legs: [],
      coverage: { routedNodeIds: [], unresolvedNodeIds: changedNodeIds, unscheduled: true },
      invalidatedAt: timestamp,
    };
  }
  recalculateCommittedBudget(next);
  const dirty = enqueueAffectedTaskChains(next, changedNodeIds, { clock: () => new Date(timestamp) });
  const candidate: DynamicRecord = { ...dirty, revision: state.revision + 1, updatedAt: timestamp };
  const qa = validateTripCoherence(candidate);
  candidate.changeJournal.push({
    changeId: `change_${candidate.revision}_${randomUUID().slice(0, 8)}`,
    baseRevision: state.revision,
    revision: candidate.revision,
    proposalId: proposal.proposalId,
    changedNodeIds,
    dirtySet: candidate.dirtySet,
    committedAt: timestamp,
    qa,
  });
  return { schemaVersion: "trip-commit-result-v1", status: "committed", state: candidate, qa };
}

export function stageTripPatch(state: DynamicRecord, proposal: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  const validation = validateTripPatch(state, proposal, { clock });
  if (!validation.ok) {
    return { schemaVersion: "trip-proposal-result-v1", status: validation.reason === "needs_rebase" ? "needs_rebase" : "rejected", validation, state };
  }
  if (state.pendingProposals.some((item: DynamicRecord) => item.proposalId === proposal.proposalId)) {
    return { schemaVersion: "trip-proposal-result-v1", status: "rejected", validation: { ok: false, reason: "proposal_already_exists" }, state };
  }
  const next = clone(state);
  next.pendingProposals.push({ ...clone(proposal), stagedAt: now(clock) });
  return { schemaVersion: "trip-proposal-result-v1", status: "proposed", proposal, state: next };
}

export function acceptStagedTripPatch(state: DynamicRecord, proposalId: string, { clock, selections }: DynamicRecord = {}): DynamicRecord {
  requireId(proposalId, "proposal_id");
  const proposal = state.pendingProposals.find((item: DynamicRecord) => item.proposalId === proposalId);
  if (!proposal) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "proposal_not_found" }, state };
  }
  let proposalToCommit;
  try {
    proposalToCommit = applyProposalSelections(proposal, selections);
  } catch (error: unknown) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: error instanceof Error ? error.message : "invalid_proposal_selection" }, state };
  }
  const result = commitTripPatch(state, proposalToCommit, { clock });
  if (result.status !== "committed") return result;
  result.state.pendingProposals = result.state.pendingProposals.filter((item: DynamicRecord) => item.proposalId !== proposalId);
  result.state.proposalHistory.push({ proposalId, status: "accepted", decidedAt: now(clock), revision: result.state.revision });
  return result;
}

export function rejectStagedTripPatch(state: DynamicRecord, proposalId: string, { clock }: DynamicRecord = {}): DynamicRecord {
  requireId(proposalId, "proposal_id");
  if (!state.pendingProposals.some((item: DynamicRecord) => item.proposalId === proposalId)) {
    return { schemaVersion: "trip-proposal-result-v1", status: "rejected", validation: { ok: false, reason: "proposal_not_found" }, state };
  }
  const next = clone(state);
  next.pendingProposals = next.pendingProposals.filter((item: DynamicRecord) => item.proposalId !== proposalId);
  next.proposalHistory.push({ proposalId, status: "rejected", decidedAt: now(clock), revision: next.revision });
  return { schemaVersion: "trip-proposal-result-v1", status: "rejected_by_user", state: next };
}

export function recordBookingConfirmation(state: DynamicRecord, input: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  if (input.baseRevision !== state.revision) {
    return { schemaVersion: "trip-commit-result-v1", status: "needs_rebase", validation: { ok: false, reason: "needs_rebase" }, state };
  }
  const node = state.nodes.find((item: DynamicRecord) => item.nodeId === input.nodeId);
  if (!node) return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "write_node_not_found" }, state };
  if (!node.selected) return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "booking_node_not_selected" }, state };

  const timestamp = now(clock);
  const offerId = input.offerId ?? node.offerRef;
  if (offerId) {
    const offerCheck = validateFreshOffers(state, { offerRefs: [offerId] }, new Date(timestamp));
    if (!offerCheck.ok) return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: offerCheck, state };
  }

  const next = clone(state);
  const target = next.nodes.find((item: DynamicRecord) => item.nodeId === input.nodeId);
  target.lock = { kind: "booked", confirmationRef: requireId(input.confirmationRef, "confirmation_ref") };
  target.version += 1;
  target.updatedAt = timestamp;
  next.revision += 1;
  next.updatedAt = timestamp;
  next.fulfillmentEvents.push({
    eventId: `booking_${randomUUID().slice(0, 8)}`,
    kind: "booking_confirmation_recorded",
    nodeId: input.nodeId,
    offerId: offerId ?? null,
    confirmationRef: input.confirmationRef,
    recordedAt: timestamp,
  });
  next.changeJournal.push({
    changeId: `change_${next.revision}_${randomUUID().slice(0, 8)}`,
    baseRevision: state.revision,
    revision: next.revision,
    changedNodeIds: [input.nodeId],
    event: "booking_confirmation_recorded",
    committedAt: timestamp,
  });
  return { schemaVersion: "trip-commit-result-v1", status: "committed", state: next, qa: validateTripCoherence(next) };
}

export function recordTripFeedback(state: DynamicRecord, input: DynamicRecord, { clock }: DynamicRecord = {}): DynamicRecord {
  if (input.baseRevision !== state.revision) {
    return { schemaVersion: "trip-commit-result-v1", status: "needs_rebase", validation: { ok: false, reason: "needs_rebase" }, state };
  }
  const categories = ["personal_experience", "preference_change", "fact_correction", "unverified_public_info"];
  if (!categories.includes(input.category)) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_category" }, state };
  }
  const targetNode = input.nodeId ? state.nodes.find((node: DynamicRecord) => node.nodeId === input.nodeId) : null;
  if (input.nodeId && !targetNode) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "feedback_node_not_found" }, state };
  }
  const text = String(input.text ?? "").trim();
  if (!text || text.length > 2000) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_text" }, state };
  }

  const visibility = input.visibility ?? "trip_only";
  if (!["trip_only", "anonymous_travelers"].includes(visibility)) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_visibility" }, state };
  }
  const verdict = input.verdict ?? null;
  if (verdict && !["recommend", "mixed", "not_recommend"].includes(verdict)) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_verdict" }, state };
  }
  if (visibility === "anonymous_travelers" && (!targetNode || !Array.isArray(targetNode.sourceRefs) || targetNode.sourceRefs.length === 0)) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "shared_feedback_requires_attributed_place" }, state };
  }
  if (visibility === "anonymous_travelers" && targetNode?.selected !== true) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "shared_feedback_requires_selected_place" }, state };
  }
  if (visibility === "anonymous_travelers" && input.category === "personal_experience" && !verdict) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "shared_experience_requires_verdict" }, state };
  }
  const allowedTags = new Set([
    "local_character", "worth_detour", "easy_to_reach", "low_queue", "helpful_service", "family_friendly",
    "quiet_rest", "accurate_listing", "useful_facilities", "foreigner_friendly", "good_value", "comfortable_pace",
  ]);
  const tags = [...new Set(Array.isArray(input.tags) ? input.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [])];
  if (tags.length > 8 || tags.some((tag) => !allowedTags.has(tag))) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_tags" }, state };
  }
  const spendCny = input.spendCny == null || input.spendCny === "" ? null : Number(input.spendCny);
  if (spendCny != null && (!Number.isFinite(spendCny) || spendCny < 0 || spendCny > 1_000_000)) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_spend" }, state };
  }
  const waitMinutes = input.waitMinutes == null || input.waitMinutes === "" ? null : Number(input.waitMinutes);
  if (waitMinutes != null && (!Number.isInteger(waitMinutes) || waitMinutes < 0 || waitMinutes > 1_440)) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_wait" }, state };
  }
  const visitDate = input.visitDate == null || input.visitDate === "" ? null : String(input.visitDate);
  if (visitDate && (!/^20\d{2}-\d{2}-\d{2}$/.test(visitDate) || Number.isNaN(Date.parse(`${visitDate}T00:00:00Z`)))) {
    return { schemaVersion: "trip-commit-result-v1", status: "rejected", validation: { ok: false, reason: "invalid_feedback_visit_date" }, state };
  }

  const timestamp = now(clock);
  const next = clone(state);
  next.revision += 1;
  next.updatedAt = timestamp;
  next.feedbackLedger.push({
    feedbackId: `feedback_${randomUUID().slice(0, 8)}`,
    category: input.category,
    nodeId: input.nodeId ?? null,
    text,
    memoryStatus: input.category === "unverified_public_info" || input.category === "fact_correction"
      ? "needs_review"
      : visibility === "anonymous_travelers" ? "shared_subjective_experience" : "trip_only",
    recordedAt: timestamp,
    visibility,
    ...(targetNode ? { place: {
      nodeId: targetNode.nodeId,
      domain: targetNode.domain,
      title: targetNode.title,
      sourceRefs: [...new Set(targetNode.sourceRefs ?? [])],
      ...(targetNode.location != null ? { location: targetNode.location } : {}),
    } } : {}),
    ...(verdict ? { verdict } : {}),
    ...(tags.length ? { tags } : {}),
    ...(spendCny != null ? { spendCny } : {}),
    ...(waitMinutes != null ? { waitMinutes } : {}),
    ...(visitDate ? { visitDate } : {}),
  });
  next.changeJournal.push({
    changeId: `change_${next.revision}_${randomUUID().slice(0, 8)}`,
    baseRevision: state.revision,
    revision: next.revision,
    changedNodeIds: input.nodeId ? [input.nodeId] : [],
    event: "trip_feedback_recorded",
    committedAt: timestamp,
  });
  return { schemaVersion: "trip-commit-result-v1", status: "committed", state: next, qa: validateTripCoherence(next) };
}
