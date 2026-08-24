import { randomUUID } from "node:crypto";
import {
  acceptStagedTripPatch,
  applyMobilityObservation,
  applyWeatherObservation,
  createTripControlState,
  recordBookingConfirmation,
  recordTripFeedback,
  rejectStagedTripPatch,
  stageTripPatch,
  updateTripControlScope,
  updateTripReadiness as applyTripReadinessUpdate,
  validateTripCoherence,
} from "../../travel-agent-pi-package/src/core/index.ts";
import { createTripRepository } from "../persistence/trip-repository.mjs";
import { validateTravelMcpRequest } from "../../travel-agent-pi-package/src/mcp/index.ts";
import { normalizeTripMobility, transitSegmentFromNode } from "../../travel-agent-pi-package/src/contracts/public.ts";

const FOUR_DOMAINS = Object.freeze(["play", "food", "stay", "transport"]);
const DOMAIN_LABELS = Object.freeze({ play: "玩", food: "吃", stay: "住", transport: "行" });
const READINESS_SIGNAL_IDS = new Set(["travel_documents", "mobile_access", "cashless_access", "china_account_continuity"]);
const READINESS_SIGNAL_STATUSES = new Set(["unknown", "ready", "needs_help", "not_applicable"]);
const GUEST_TRIP_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function serviceError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function requireTrip(state, tripId) {
  if (!state) throw serviceError("trip_not_found", { tripId });
  return state;
}

function isInboundTrip(state) {
  return state.travelers.some((traveler) => !String(traveler.language ?? "zh-CN").toLowerCase().startsWith("zh")
    || traveler.hardConstraints?.some((constraint) => constraint?.type === "foreign_guest_required"));
}

function signalStatus(signal, { applicable = true } = {}) {
  if (!applicable || signal === "not_applicable") return "not_applicable";
  if (signal === "ready") return "ready";
  return signal === "needs_help" ? "action_required" : "needs_verification";
}

function readinessView(state) {
  const inbound = isInboundTrip(state);
  const signals = state.readiness?.signals ?? {};
  const selectedStay = state.nodes.find((node) => node.domain === "stay" && node.selected);
  const mobility = state.environment?.mobility;
  const guest = state.collaboration?.accessMode === "guest" || String(state.collaboration?.ownerUserId ?? "").startsWith("usr_guest_");
  const items = [
    {
      itemId: "trip_scope",
      title: "目的地与旅行日期",
      status: state.brief?.destination && state.brief?.dates ? "ready" : "action_required",
      reason: state.brief?.destination && state.brief?.dates ? "已经可以核验指定日期的路线与库存。" : "缺少目的地或日期会限制天气、库存和每日节奏核验。",
      action: "补充目的地和具体日期",
      editable: false,
      sourceNature: "traveler_input",
    },
    {
      itemId: "travel_documents",
      title: "入境与旅行证件",
      status: signalStatus(signals.travel_documents, { applicable: inbound }),
      reason: inbound ? "只记录是否已核对，不收集证件号码或影像。" : "国内旅行不需要入境准备检查。",
      action: inbound ? "按国籍与行程核对官方要求" : null,
      editable: inbound,
      sourceNature: "traveler_confirmation",
      guidanceUrl: inbound ? "https://english.www.gov.cn/2025special/bizexpatsinchina2025" : null,
    },
    {
      itemId: "mobile_access",
      title: "手机网络与可用联系方式",
      status: signalStatus(signals.mobile_access, { applicable: inbound }),
      reason: inbound ? "地图、票务、酒店沟通和账号恢复都依赖可用网络。" : "国内旅行默认沿用现有手机网络。",
      action: inbound ? "确认漫游、eSIM 或本地网络方案" : null,
      editable: inbound,
      sourceNature: "traveler_confirmation",
    },
    {
      itemId: "cashless_access",
      title: "支付与备用方式",
      status: signalStatus(signals.cashless_access, { applicable: inbound }),
      reason: inbound ? "只记录是否准备完成，不收集卡号、账户或支付凭据。" : "国内旅行不展示入境支付教育。",
      action: inbound ? "确认可用方式并保留备用方案" : null,
      editable: inbound,
      sourceNature: "traveler_confirmation",
      guidanceUrl: inbound ? "https://english.www.gov.cn/news/202404/11/content_WS6617c858c6d0868f4e8e5f4d.html" : null,
    },
    {
      itemId: "lodging_eligibility",
      title: "住宿与外宾接待资格",
      status: !inbound ? "not_applicable" : !selectedStay ? "action_required" : selectedStay.foreignGuestEligible === true ? "ready" : selectedStay.foreignGuestEligible === false ? "blocked" : "needs_verification",
      reason: !inbound ? "国内旅行不需要外宾资格检查。" : !selectedStay ? "选定住宿后才能核验指定酒店。" : selectedStay.foreignGuestEligible === true ? "当前已选住宿有外宾资格证据。" : selectedStay.foreignGuestEligible === false ? "当前资料显示该住宿不适合外宾入住。" : "当前来源尚未证明指定酒店可接待外宾。",
      action: inbound ? (selectedStay ? "在酒店或授权平台再次确认" : "先比较并选择住宿") : null,
      editable: false,
      sourceNature: selectedStay ? "selected_place_evidence" : "trip_decision",
    },
    {
      itemId: "china_account_continuity",
      title: "在中国境内继续打开旅行",
      status: guest ? "action_required" : signalStatus(signals.china_account_continuity, { applicable: inbound }),
      reason: guest ? "当前是临时旅行；登录后才能跨设备保存并在行中恢复。" : inbound ? "账号已经绑定，仍建议确认在中国境内可使用的登录方式。" : "账号已保存这趟旅行。",
      action: guest ? "登录并保存旅行" : inbound ? "确认中国境内连续方式" : null,
      editable: !guest && inbound,
      sourceNature: "account_state",
    },
    {
      itemId: "city_navigation",
      title: "市内路线与导航",
      status: mobility?.status === "completed" ? "ready" : mobility?.status === "partial" ? "needs_verification" : "action_required",
      reason: mobility?.status === "completed" ? "已取得查询时路线、步行与换乘参考。" : "确认地点后仍需核验市内移动；计划路线不等于实时到站。",
      action: "确认地点并刷新路线",
      editable: false,
      sourceNature: mobility ? "route_provider" : "trip_decision",
    },
  ];
  const counts = items.reduce((summary, item) => ({ ...summary, [item.status]: (summary[item.status] ?? 0) + 1 }), {});
  return {
    schemaVersion: "trip-readiness-view-v1",
    version: state.readiness?.version ?? 0,
    inbound,
    status: items.some((item) => item.status === "blocked") ? "blocked" : items.some((item) => ["action_required", "needs_verification"].includes(item.status)) ? "needs_attention" : "ready",
    counts,
    items,
    updatedAt: state.readiness?.updatedAt ?? state.updatedAt,
  };
}

function nodeScheduleValue(node) {
  return node.time ?? node.operability?.departureAt ?? node.operability?.arrivalAt ?? null;
}

function todayView(state, { clock } = {}) {
  const selected = state.nodes.filter((node) => node.selected).map((node) => {
    const scheduledAt = nodeScheduleValue(node);
    const timestamp = scheduledAt ? new Date(scheduledAt).getTime() : Number.NaN;
    return {
      taskId: `task_${node.nodeId}`,
      nodeId: node.nodeId,
      domain: node.domain,
      title: node.title,
      summary: node.summary,
      scheduledAt,
      timestamp: Number.isFinite(timestamp) ? timestamp : null,
      location: node.location,
      media: node.media ?? [],
      sourceStatus: node.sourceStatus,
      foreignGuestEligible: node.foreignGuestEligible,
      operability: node.operability ?? {},
    };
  }).sort((left, right) => {
    if (left.timestamp != null && right.timestamp != null) return left.timestamp - right.timestamp;
    if (left.timestamp != null) return -1;
    if (right.timestamp != null) return 1;
    return FOUR_DOMAINS.indexOf(left.domain) - FOUR_DOMAINS.indexOf(right.domain);
  });
  const nowValue = new Date(clock?.() ?? Date.now()).getTime();
  let currentIndex = selected.findIndex((task) => task.timestamp != null && task.timestamp >= nowValue);
  if (currentIndex < 0) currentIndex = selected.length ? 0 : -1;
  const currentTask = currentIndex >= 0 ? selected[currentIndex] : null;
  const nextTask = currentIndex >= 0 ? selected[currentIndex + 1] ?? null : null;
  const route = currentTask
    ? (state.environment?.mobility?.legs ?? []).find((leg) => nextTask
      ? leg.origin?.nodeId === currentTask.nodeId && leg.destination?.nodeId === nextTask.nodeId
      : leg.origin?.nodeId === currentTask.nodeId || leg.destination?.nodeId === currentTask.nodeId) ?? null
    : null;
  const readiness = readinessView(state);
  return {
    schemaVersion: "trip-today-view-v1",
    status: !selected.length ? "planning" : selected.some((task) => task.timestamp != null) ? "ready" : "needs_schedule",
    currentTask,
    nextTask,
    route,
    tasks: selected,
    attentionItems: readiness.items.filter((item) => ["blocked", "action_required", "needs_verification"].includes(item.status)).slice(0, 3),
    routeCheckedAt: state.environment?.mobility?.checkedAt ?? null,
    routeRealTime: false,
  };
}

function controlView(state, providerStatus = "provider_unavailable") {
  return {
    schemaVersion: "trip-control-view-v1",
    tripId: state.tripId,
    revision: state.revision,
    storageVersion: state.storageVersion,
    activeBranchId: state.activeBranchId,
    brief: state.brief,
    travelers: state.travelers,
    openDecisions: state.openDecisions.filter((decision) => decision.status === "open"),
    dirtySet: state.dirtySet,
    taskQueues: state.taskQueues,
    pendingProposals: state.pendingProposals.map(({ operations, ...proposal }) => ({ ...proposal, operationCount: operations.length })),
    weather: state.environment?.weather ?? null,
    mobility: state.environment?.mobility ?? null,
    readiness: readinessView(state),
    providerStatus,
  };
}

function matchingVisitFeedback(node, sharedFeedback = []) {
  const sourceRefs = new Set(Array.isArray(node?.sourceRefs) ? node.sourceRefs : []);
  if (!sourceRefs.size) return [];
  const latest = new Map();
  for (const entry of sharedFeedback) {
    const feedback = entry?.feedback;
    if (feedback?.visibility !== "anonymous_travelers" || !feedback.place?.sourceRefs?.some((sourceRef) => sourceRefs.has(sourceRef))) continue;
    const key = `${entry.contributorKey ?? entry.tripId}:${feedback.category}`;
    const previous = latest.get(key);
    if (!previous || String(previous.feedback.recordedAt).localeCompare(String(feedback.recordedAt)) < 0) latest.set(key, entry);
  }
  return [...latest.values()];
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function visitFeedbackSummary(node, sharedFeedback = []) {
  const matches = matchingVisitFeedback(node, sharedFeedback);
  const experiences = matches.map((entry) => entry.feedback).filter((feedback) => feedback.category === "personal_experience" && feedback.verdict);
  const pendingFactChecks = matches.filter((entry) => ["fact_correction", "unverified_public_info"].includes(entry.feedback.category));
  if (!experiences.length && !pendingFactChecks.length) return null;
  const tagCounts = new Map();
  for (const feedback of experiences) {
    for (const tag of feedback.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const timestamps = matches.map((entry) => entry.feedback.recordedAt).filter(Boolean).sort().reverse();
  return {
    schemaVersion: "place-visit-feedback-summary-v1",
    experienceCount: experiences.length,
    recommendation: {
      recommend: experiences.filter((feedback) => feedback.verdict === "recommend").length,
      mixed: experiences.filter((feedback) => feedback.verdict === "mixed").length,
      notRecommend: experiences.filter((feedback) => feedback.verdict === "not_recommend").length,
    },
    topTags: [...tagCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 6).map(([key, count]) => ({ key, count })),
    typicalSpendCny: median(experiences.map((feedback) => feedback.spendCny)),
    typicalWaitMinutes: median(experiences.map((feedback) => feedback.waitMinutes)),
    pendingFactCheckCount: pendingFactChecks.length,
    lastRecordedAt: timestamps[0] ?? null,
    evidenceNature: "anonymous_structured_visit_feedback",
  };
}

function proposalView(proposal, sharedFeedback = []) {
  const byDomain = Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, []]));
  for (const operation of proposal.operations ?? []) {
    if (operation.kind !== "add_candidate" || !FOUR_DOMAINS.includes(operation.node?.domain)) continue;
    const feedback = visitFeedbackSummary(operation.node, sharedFeedback);
    byDomain[operation.node.domain].push({
      nodeId: operation.nodeId,
      domain: operation.node.domain,
      title: operation.node.title,
      summary: operation.node.summary,
      selected: operation.node.selected === true,
      sourceStatus: operation.node.sourceStatus ?? "unverified",
      sourceRefs: operation.node.sourceRefs ?? [],
      claimRefs: operation.node.claimRefs ?? [],
      location: operation.node.location ?? null,
      cost: Number(operation.node.cost ?? 0),
      foreignGuestEligible: operation.node.foreignGuestEligible ?? null,
      spoilerLevel: operation.node.spoilerLevel ?? "low",
      media: operation.node.media ?? [],
      operability: operation.node.operability ?? {},
      ...(feedback ? { visitFeedback: feedback } : {}),
    });
  }
  return {
    schemaVersion: "trip-proposal-view-v1",
    proposalId: proposal.proposalId,
    baseRevision: proposal.baseRevision,
    title: proposal.title ?? "待确认旅行方案",
    summary: proposal.summary ?? "",
    provider: proposal.provider ?? null,
    providerLabel: proposal.providerLabel ?? null,
    checkedAt: proposal.checkedAt ?? null,
    sourceDocumentation: proposal.sourceDocumentation ?? null,
    caveats: proposal.caveats ?? [],
    partial: proposal.partial === true,
    fixtureOnly: proposal.fixtureOnly === true,
    stagedAt: proposal.stagedAt ?? null,
    byDomain,
  };
}

function planView(state, { mapPreviewAvailable = false, sharedFeedback = [], clock } = {}) {
  const nodeView = (node) => {
    const feedback = visitFeedbackSummary(node, sharedFeedback);
    return {
      nodeId: node.nodeId,
      title: node.title,
      summary: node.summary,
      selected: node.selected,
      status: node.status,
      cost: node.cost,
      time: node.time,
      location: node.location,
      lock: node.lock,
      sourceStatus: node.sourceStatus,
      foreignGuestEligible: node.foreignGuestEligible,
      spoilerLevel: node.spoilerLevel,
      media: node.media ?? [],
      sourceRefs: node.sourceRefs,
      claimRefs: node.claimRefs,
      operability: node.operability,
      ...(feedback ? { visitFeedback: feedback } : {}),
    };
  };
  const byDomain = Object.fromEntries(
    ["transport", "stay", "play", "food"].map((domain) => [
      domain,
      state.nodes.filter((node) => node.domain === domain).map(nodeView),
    ]),
  );
  return {
    schemaVersion: "trip-plan-view-v1",
    tripId: state.tripId,
    revision: state.revision,
    byDomain,
    budget: validateTripCoherence(state).budget,
    qa: validateTripCoherence(state),
    fulfillment: state.fulfillmentEvents,
    pendingProposals: state.pendingProposals.map((proposal) => proposalView(proposal, sharedFeedback)),
    transitSegments: state.nodes
      .filter((node) => node.domain === "transport")
      .flatMap((node) => {
        const segment = transitSegmentFromNode(node);
        return segment ? [{ nodeId: node.nodeId, segment }] : [];
      }),
    mapPreviewAvailable,
    weather: state.environment?.weather ?? null,
    mobility: state.environment?.mobility ?? null,
    readiness: readinessView(state),
    today: todayView(state, { clock }),
  };
}

function likelyIndoor(candidate) {
  return candidate?.operability?.indoorMap === true || /博物馆|美术馆|科技馆|剧院|影院|室内|商场|展览|艺术中心/.test(`${candidate?.title ?? ""} ${candidate?.summary ?? ""}`);
}

function weatherAwareCandidate(candidate, domain, weather) {
  const impact = weather?.planningImpact;
  if (!impact?.active || !impact.affectedDomains?.includes(domain)) return candidate;
  let weatherFit = "contextual";
  if (domain === "play") weatherFit = likelyIndoor(candidate) ? "preferred" : "caution";
  else if (domain === "transport") weatherFit = "caution";
  return {
    ...candidate,
    operability: {
      ...(candidate.operability ?? {}),
      weatherFit,
      weatherSeverity: impact.severity,
      weatherGuidance: impact.guidance?.[domain] ?? null,
      weatherCheckedAt: weather.checkedAt,
    },
  };
}

function linkedCandidates(byDomain, weather) {
  return Object.fromEntries(FOUR_DOMAINS.map((domain) => {
    const candidates = [...(byDomain[domain] ?? [])].map((candidate) => weatherAwareCandidate(candidate, domain, weather));
    if (domain === "play" && weather?.planningImpact?.active) {
      candidates.sort((left, right) => Number(right.operability?.weatherFit === "preferred") - Number(left.operability?.weatherFit === "preferred"));
    }
    if (domain === "transport") {
      const ordered = [...candidates].sort((left, right) => {
        const leftCost = Number(left.cost) > 0 ? Number(left.cost) : Number.POSITIVE_INFINITY;
        const rightCost = Number(right.cost) > 0 ? Number(right.cost) : Number.POSITIVE_INFINITY;
        return leftCost - rightCost;
      });
      const representative = ["FLIGHT", "TRAIN"].flatMap((type) => ordered.find((candidate) => candidate.operability?.transportType === type) ?? []);
      const balanced = [...representative, ...ordered.filter((candidate) => !representative.includes(candidate))]
        .filter((candidate, index, items) => items.indexOf(candidate) === index);
      return [domain, balanced.slice(0, 3)];
    }
    return [domain, candidates.slice(0, 3)];
  }));
}

function buildResearchProposal(state, providerResult) {
  const byDomain = linkedCandidates(providerResult.byDomain ?? {}, providerResult.weather);
  const proposalSuffix = randomUUID().slice(0, 8);
  const candidateEntries = FOUR_DOMAINS.flatMap((domain) => byDomain[domain].map((candidate, index) => {
    const nodeId = `${candidate.candidateId}_${proposalSuffix}_${index + 1}`.slice(0, 128);
    const evidenceItems = [
      { sourceId: candidate.sourceId, claimId: candidate.claimId, entityId: candidate.entityId, source: candidate.source, entity: candidate.entity, claim: candidate.claim },
      ...(candidate.additionalEvidence ?? []),
    ].filter((item) => item?.sourceId && item?.source && item?.entity && item?.claim)
      .filter((item, evidenceIndex, items) => items.findIndex((other) => other.sourceId === item.sourceId) === evidenceIndex)
      .map((item, evidenceIndex) => ({ ...item, proposalClaimId: `${item.claimId}_${proposalSuffix}_${index + 1}_${evidenceIndex + 1}`.slice(0, 128) }));
    return { domain, candidate, nodeId, evidenceItems, selected: false };
  }));
  const operations = candidateEntries.map((entry) => ({
    kind: "add_candidate",
    nodeId: entry.nodeId,
    node: {
      nodeId: entry.nodeId,
      domain: entry.domain,
      title: entry.candidate.title,
      summary: entry.candidate.summary,
      selected: entry.selected,
      status: "candidate",
      sourceStatus: providerResult.fixtureOnly ? "contract_fixture" : "verified_provider",
      sourceRefs: entry.evidenceItems.map((item) => item.sourceId),
      claimRefs: entry.evidenceItems.map((item) => item.proposalClaimId),
      location: entry.candidate.location,
      media: entry.candidate.media ?? [],
      cost: Number(entry.candidate.cost ?? 0),
      foreignGuestEligible: null,
      spoilerLevel: "low",
      impactsNodeIds: [],
      operability: {
        ...entry.candidate.operability,
        checkedAt: entry.candidate.checkedAt,
        sourceLabel: providerResult.providerLabel,
        researchDepth: entry.candidate.operability?.researchDepth ?? "provider_search",
        ...(entry.domain === "transport" && entry.candidate.operability?.routeVerified == null ? { routeVerified: false } : {}),
      },
    },
  }));
  const contentItems = [...new Map(candidateEntries.flatMap(({ evidenceItems }) => evidenceItems.map((item) => [item.sourceId, {
    contentItemId: item.sourceId,
    provider: item.source.provider,
    sourceType: item.source.sourceType,
    providerRef: item.source.providerPoiId,
    checkedAt: item.source.checkedAt,
    documentationUrl: item.source.documentationUrl,
    independenceGroup: item.source.independenceGroup,
    commercialBias: item.source.commercialBias,
  }]))).values()];
  const entities = [...new Map(candidateEntries.flatMap(({ evidenceItems }) => evidenceItems.map((item) => [item.entity.entityId, item.entity]))).values()];
  const claims = candidateEntries.flatMap(({ evidenceItems, nodeId }) => evidenceItems.map((item) => ({ ...item.claim, claimId: item.proposalClaimId, nodeId })));
  const writeSet = operations.map((operation) => operation.nodeId);
  const destination = state.brief?.destination ?? providerResult.destination ?? "本次目的地";
  const weatherVerified = providerResult.weather?.status === "completed";
  return {
    schemaVersion: "trip-patch-proposal-v1",
    proposalId: `proposal_research_${proposalSuffix}`,
    tripId: state.tripId,
    baseRevision: state.revision,
    title: `${destination}吃住行玩候选`,
    summary: !weatherVerified
      ? "地点候选已经整理，但旅行日期对应的天气资料暂时不可用；这是一版可比较的暂定候选，不是已经排好的完整日程。"
      : providerResult.weather?.planningImpact?.active
      ? "已先根据旅行日期核验天气，再联动整理吃、住、行、玩候选；受影响的户外体验、换乘缓冲、住宿衔接和餐饮动线已标出。"
      : "已按同一目的地范围整理吃、住、行、玩候选。住宿不会被系统擅自选作锚点，你可以先比较位置、节奏和取舍，再确认每一类选择。",
    provider: providerResult.provider,
    providerLabel: providerResult.providerLabel,
    checkedAt: providerResult.checkedAt,
    sourceDocumentation: providerResult.sourceDocumentation,
    partial: providerResult.partial || !weatherVerified,
    fixtureOnly: providerResult.fixtureOnly === true,
    weatherSnapshot: providerResult.weather?.status === "completed" ? providerResult.weather : null,
    caveats: [
      ...(providerResult.fixtureOnly ? ["这是界面与合同 QA Fixture，不代表真实 Provider 已接线。"] : []),
      ...(providerResult.caveats ?? []),
      ...(!weatherVerified ? ["天气尚未核验完成；户外项目、步行换乘、住宿衔接和餐饮动线都需要在取得对应日期预报后再确认。"] : []),
      ...(providerResult.weather?.planningImpact?.active ? ["当前方案已把天气作为跨吃住行玩的约束；预报更新后需要重新核验受影响部分。"] : []),
      "价格、房态、班次、排队和营业状态仍需在预订或出发前再次核验。",
      ...(providerResult.partial ? ["部分任务链暂未返回候选，接受后仍会保持为开放决定。"] : []),
    ],
    writeSet,
    writeContract: { allowedNodeIds: writeSet },
    readSet: [],
    operations,
    evidenceBundle: { contentItems, entities, claims },
  };
}

function validateRequest(operation, payload, actor = "travel_parent_agent", explicitUserConfirmation = false) {
  const validation = validateTravelMcpRequest({ operation, actor, explicitUserConfirmation, payload });
  if (!validation.ok) throw serviceError(validation.reason, validation);
}

function providerUnavailable(operation, capability) {
  return {
    schemaVersion: "travel-provider-result-v1",
    status: "provider_unavailable",
    operation,
    capability,
    reason: "no_provider_has_passed_read_only_isolated_or_official_smoke",
    fabricatedResults: false,
  };
}

function placeSourceRefs(state) {
  const nodes = [
    ...state.nodes,
    ...state.pendingProposals.flatMap((proposal) => (proposal.operations ?? [])
      .filter((operation) => operation.kind === "add_candidate")
      .map((operation) => operation.node)),
  ];
  return [...new Set(nodes.flatMap((node) => Array.isArray(node?.sourceRefs) ? node.sourceRefs : []).filter(Boolean))];
}

export class TravelService {
  constructor({ store = createTripRepository(), clock, researchProvider = null } = {}) {
    this.store = store;
    this.clock = clock;
    this.researchProvider = researchProvider;
  }

  providerStatus() {
    return this.researchProvider?.status === "configured" ? "configured" : "provider_unavailable";
  }

  async createTrip(input = {}) {
    validateRequest("create_trip", input);
    const state = createTripControlState({
      tripId: input.tripId ?? `trip_${randomUUID().slice(0, 8)}`,
      brief: input.brief ?? {},
      travelers: input.travelers ?? [],
      clock: this.clock,
    });
    if (input.ownerUserId) {
      const guest = String(input.ownerUserId).startsWith("usr_guest_");
      const nowValue = new Date(this.clock?.() ?? Date.now()).getTime();
      state.collaboration = {
        ownerUserId: input.ownerUserId,
        memberUserIds: [...new Set([input.ownerUserId, ...(Array.isArray(input.memberUserIds) ? input.memberUserIds : [])])],
        accessMode: guest ? "guest" : "account",
        guestExpiresAt: guest ? new Date(nowValue + GUEST_TRIP_TTL_MS).toISOString() : null,
      };
    }
    return controlView(await this.store.create(state), this.providerStatus());
  }

  async updateTripScope(input = {}) {
    validateRequest("update_trip_scope", input);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const next = updateTripControlScope(state, input, { clock: this.clock });
    const saved = await this.store.save(next, { expectedStorageVersion: state.storageVersion });
    return controlView(saved, this.providerStatus());
  }

  async listTrips({ userId } = {}) {
    if (typeof this.store.list !== "function") throw serviceError("trip_listing_unavailable");
    const states = await this.store.list();
    return {
      schemaVersion: "trip-list-view-v1",
      storageMode: this.store.mode ?? "unknown",
      trips: states
        .filter((state) => {
          if (userId && !state.collaboration?.memberUserIds?.includes(userId)) return false;
          if (String(userId ?? "").startsWith("usr_guest_") && state.collaboration?.guestExpiresAt && new Date(state.collaboration.guestExpiresAt).getTime() <= Date.now()) return false;
          return true;
        })
        .map((state) => ({
        tripId: state.tripId,
        revision: state.revision,
        destination: state.brief?.destination ?? null,
        dates: state.brief?.dates ?? null,
        travelerCount: state.travelers.length,
        updatedAt: state.updatedAt,
        openDecisionCount: state.openDecisions.filter((decision) => decision.status === "open").length,
        collaboration: state.collaboration ? { memberCount: state.collaboration.memberUserIds.length } : null,
        })),
    };
  }

  async getTripControlView(tripId) {
    validateRequest("get_trip_control_view", { tripId }, "mcp_client");
    return controlView(requireTrip(await this.store.get(tripId), tripId), this.providerStatus());
  }

  async getTripPlanView(tripId) {
    validateRequest("get_trip_plan_view", { tripId }, "mcp_client");
    const state = requireTrip(await this.store.get(tripId), tripId);
    const sourceRefs = placeSourceRefs(state);
    const sharedFeedback = typeof this.store.listSharedPlaceFeedback === "function"
      ? await this.store.listSharedPlaceFeedback(sourceRefs)
      : [];
    return planView(state, { mapPreviewAvailable: this.researchProvider?.canRenderMap === true, sharedFeedback, clock: this.clock });
  }

  async updateTripReadiness({ tripId, signalId, status } = {}) {
    if (!READINESS_SIGNAL_IDS.has(signalId)) throw serviceError("invalid_readiness_signal", { signalId });
    if (!READINESS_SIGNAL_STATUSES.has(status)) throw serviceError("invalid_readiness_status", { status });
    const state = requireTrip(await this.store.get(tripId), tripId);
    const next = applyTripReadinessUpdate(state, { signalId, status }, { clock: this.clock });
    if (next.readiness.version === state.readiness.version) {
      return { schemaVersion: "trip-readiness-update-result-v1", status: "unchanged", tripId, revision: state.revision, readiness: readinessView(state) };
    }
    const saved = await this.store.save(next, { expectedStorageVersion: state.storageVersion });
    return { schemaVersion: "trip-readiness-update-result-v1", status: "updated", tripId, revision: saved.revision, readiness: readinessView(saved) };
  }

  async transferUserOwnership({ fromUserId, toUserId } = {}) {
    if (!fromUserId || !toUserId || fromUserId === toUserId) return { transferredTrips: 0 };
    if (typeof this.store.list !== "function") throw serviceError("trip_listing_unavailable");
    const states = await this.store.list();
    let transferredTrips = 0;
    for (const state of states) {
      if (!state.collaboration?.memberUserIds?.includes(fromUserId)) continue;
      const next = structuredClone(state);
      next.collaboration = {
        ownerUserId: next.collaboration.ownerUserId === fromUserId ? toUserId : next.collaboration.ownerUserId,
        memberUserIds: [...new Set(next.collaboration.memberUserIds.map((userId) => userId === fromUserId ? toUserId : userId))],
        accessMode: "account",
        guestExpiresAt: null,
      };
      next.updatedAt = new Date(this.clock?.() ?? Date.now()).toISOString();
      next.changeJournal.push({
        changeId: `ownership_${randomUUID().slice(0, 8)}`,
        baseRevision: state.revision,
        revision: state.revision,
        event: "guest_trip_claimed",
        committedAt: next.updatedAt,
      });
      await this.store.save(next, { expectedStorageVersion: state.storageVersion });
      transferredTrips += 1;
    }
    return { transferredTrips };
  }

  async renderTripMap(tripId) {
    const state = requireTrip(await this.store.get(tripId), tripId);
    if (!this.researchProvider?.canRenderMap || typeof this.researchProvider.renderStaticMap !== "function") {
      throw serviceError("trip_map_unavailable");
    }
    const proposalNodes = state.pendingProposals.flatMap((proposal) => (proposal.operations ?? [])
      .filter((operation) => operation.kind === "add_candidate")
      .map((operation) => operation.node));
    const nodes = proposalNodes.length ? proposalNodes : state.nodes.filter((node) => node.selected);
    const points = nodes.map((node) => ({
      label: node.title,
      domain: node.domain,
      coordinates: node.location?.coordinates,
    })).filter((point) => Number.isFinite(point.coordinates?.longitude) && Number.isFinite(point.coordinates?.latitude)).slice(0, 12);
    if (!points.length) throw serviceError("trip_map_points_unavailable");
    const paths = (state.environment?.mobility?.legs ?? []).map((leg) => {
      const recommended = leg.alternatives?.find((alternative) => alternative.mode === leg.recommendedMode);
      return recommended?.polyline ?? [];
    }).filter((path) => path.length >= 2);
    return this.researchProvider.renderStaticMap({ points, paths });
  }

  async refreshTripMobility(input) {
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    let observation;
    if (!this.researchProvider || typeof this.researchProvider.planMobility !== "function") {
      observation = {
        schemaVersion: "trip-mobility-v1",
        status: "provider_unavailable",
        destination: state.brief?.destination ?? null,
        source: "amap_routes_v5",
        reason: "amap_routes_provider_not_configured",
        fabricatedResults: false,
      };
    } else {
      try {
        observation = await this.researchProvider.planMobility({
          tripId: state.tripId,
          brief: state.brief,
          travelers: state.travelers,
          selectedNodes: state.nodes.filter((node) => node.selected),
        });
      } catch (error) {
        observation = {
          schemaVersion: "trip-mobility-v1",
          status: "provider_unavailable",
          destination: state.brief?.destination ?? null,
          source: "amap_routes_v5",
          reason: error?.code ?? "SOURCE_UNAVAILABLE",
          fabricatedResults: false,
        };
      }
    }
    const normalized = normalizeTripMobility({
      ...observation,
      status: ["completed", "partial", "needs_context", "provider_unavailable"].includes(observation?.status) ? observation.status : "provider_unavailable",
      reason: ["completed", "partial"].includes(observation?.status) ? observation.reason : observation?.reason ?? observation?.status ?? "SOURCE_UNAVAILABLE",
    });
    const next = applyMobilityObservation(state, normalized, { clock: this.clock });
    const saved = await this.store.save(next, { expectedStorageVersion: state.storageVersion });
    return {
      schemaVersion: "trip-mobility-refresh-result-v1",
      status: normalized.status,
      tripId: saved.tripId,
      revision: saved.revision,
      mobility: saved.environment?.mobility ?? normalized,
      qa: validateTripCoherence(saved),
      fabricatedResults: false,
    };
  }

  async getOpenDecisions(tripId) {
    validateRequest("get_open_decisions", { tripId }, "mcp_client");
    const state = requireTrip(await this.store.get(tripId), tripId);
    return { schemaVersion: "open-decisions-v1", tripId, revision: state.revision, decisions: state.openDecisions.filter((decision) => decision.status === "open"), pendingProposals: state.pendingProposals };
  }

  async researchTripOptions(input) {
    validateRequest("research_trip_options", input);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const requestedDomains = Array.isArray(input.domains) && input.domains.length ? input.domains : FOUR_DOMAINS;
    const existingResearchProposal = state.pendingProposals.find((proposal) => String(proposal.proposalId).startsWith("proposal_research_"));
    const existingProposalView = existingResearchProposal ? proposalView(existingResearchProposal) : null;
    const existingCoveredDomains = existingProposalView ? FOUR_DOMAINS.filter((domain) => existingProposalView.byDomain[domain]?.length > 0) : [];
    const existingProposalCoversRequest = existingProposalView
      && existingCoveredDomains.length === requestedDomains.length
      && requestedDomains.every((domain) => existingProposalView.byDomain[domain]?.length > 0);
    if (existingProposalCoversRequest) {
      const existingView = existingProposalView;
      return {
        schemaVersion: "travel-research-proposal-result-v1",
        status: "proposed",
        tripId: state.tripId,
        revision: state.revision,
        proposal: existingView,
        candidateCounts: Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, existingView.byDomain[domain].length])),
        provider: existingResearchProposal.provider ?? null,
        providerLabel: existingResearchProposal.providerLabel ?? null,
        checkedAt: existingResearchProposal.checkedAt ?? null,
        partial: existingResearchProposal.partial === true,
        fixtureOnly: existingResearchProposal.fixtureOnly === true,
        reusedPendingProposal: true,
        requestedDomains,
        fabricatedResults: false,
      };
    }
    if (!this.researchProvider) return { ...providerUnavailable("research_trip_options", input.capability ?? "travel_research"), tripId: state.tripId, revision: state.revision, requestedDomains };
    let providerResult;
    try {
      providerResult = await this.researchProvider.research({
        tripId: state.tripId,
        brief: state.brief,
        travelers: state.travelers,
        domains: requestedDomains,
        question: input.question ?? input.query ?? "",
        existingWeather: state.environment?.weather ?? null,
      });
    } catch (error) {
      return {
        schemaVersion: "travel-provider-result-v1",
        status: error?.code ?? "SOURCE_UNAVAILABLE",
        operation: "research_trip_options",
        capability: input.capability ?? "travel_research",
        tripId: state.tripId,
        revision: state.revision,
        requestedDomains,
        reason: error?.code ?? "SOURCE_UNAVAILABLE",
        fabricatedResults: false,
      };
    }
    if (providerResult.status !== "completed") {
      return { ...providerResult, operation: "research_trip_options", capability: input.capability ?? "travel_research", tripId: state.tripId, revision: state.revision, requestedDomains };
    }
    let workingState = state;
    if (providerResult.weather?.status === "completed") {
      workingState = applyWeatherObservation(state, providerResult.weather, { clock: this.clock });
    }
    const proposal = buildResearchProposal(workingState, providerResult);
    if (!proposal.operations.length) {
      if (workingState !== state) await this.store.save(workingState, { expectedStorageVersion: state.storageVersion });
      return { ...providerResult, status: "EMPTY_VERIFIED", operation: "research_trip_options", tripId: workingState.tripId, revision: workingState.revision, requestedDomains, fabricatedResults: false };
    }
    const staged = stageTripPatch(workingState, proposal, { clock: this.clock });
    if (staged.status !== "proposed") return staged;
    const saved = await this.store.save(staged.state, { expectedStorageVersion: state.storageVersion });
    const stagedProposalView = proposalView({ ...proposal, stagedAt: saved.pendingProposals.find((item) => item.proposalId === proposal.proposalId)?.stagedAt });
    return {
      schemaVersion: "travel-research-proposal-result-v1",
      status: "proposed",
      tripId: saved.tripId,
      revision: saved.revision,
      proposal: stagedProposalView,
      candidateCounts: Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, stagedProposalView.byDomain[domain].length])),
      provider: providerResult.provider,
      providerLabel: providerResult.providerLabel,
      checkedAt: providerResult.checkedAt,
      weather: providerResult.weather ?? null,
      partial: proposal.partial,
      fixtureOnly: providerResult.fixtureOnly === true,
      requestedDomains,
      fabricatedResults: false,
    };
  }

  async proposeTripChange(input, actor = "skill") {
    validateRequest("propose_trip_change", input, actor);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const result = stageTripPatch(state, input.proposal, { clock: this.clock });
    if (result.status !== "proposed") return result;
    const saved = await this.store.save(result.state, { expectedStorageVersion: state.storageVersion });
    return { ...result, state: undefined, tripId: saved.tripId, revision: saved.revision, storageVersion: saved.storageVersion };
  }

  async acceptTripChange(input) {
    validateRequest("accept_trip_change", input);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const result = acceptStagedTripPatch(state, input.proposalId, { clock: this.clock, selections: input.selections });
    if (result.status !== "committed") return result;
    const saved = await this.store.save(result.state, { expectedStorageVersion: state.storageVersion });
    return { schemaVersion: result.schemaVersion, status: result.status, tripId: saved.tripId, revision: saved.revision, storageVersion: saved.storageVersion, qa: result.qa };
  }

  async rejectTripChange(input) {
    validateRequest("reject_trip_change", input);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const result = rejectStagedTripPatch(state, input.proposalId, { clock: this.clock });
    if (result.status !== "rejected_by_user") return result;
    const saved = await this.store.save(result.state, { expectedStorageVersion: state.storageVersion });
    return { schemaVersion: result.schemaVersion, status: result.status, tripId: saved.tripId, revision: saved.revision, storageVersion: saved.storageVersion };
  }

  async prepareBookingHandoff(input) {
    validateRequest("prepare_booking_handoff", input, "travel_parent_agent", input.explicitUserConfirmation === true);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const node = state.nodes.find((item) => item.nodeId === input.nodeId);
    if (!node) throw serviceError("booking_node_not_found");
    if (!node.selected) throw serviceError("booking_node_not_selected");
    const offer = input.offerId
      ? state.fulfillmentLedger.find((item) => item.offerId === input.offerId)
      : state.fulfillmentLedger.find((item) => item.offerId === node.offerRef);
    if (!offer) throw serviceError("offer_not_found");
    if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= new Date(this.clock?.() ?? Date.now()).getTime()) throw serviceError("offer_stale");
    return {
      schemaVersion: "booking-handoff-v1",
      status: "ready",
      tripId: state.tripId,
      revision: state.revision,
      nodeId: node.nodeId,
      offerId: offer.offerId,
      source: offer.source,
      handoffUrl: offer.handoffUrl,
      totalPrice: offer.totalPrice,
      currency: offer.currency,
      automaticPurchase: false,
      sensitiveDataHandled: false,
    };
  }

  async recordBookingConfirmation(input) {
    validateRequest("record_booking_confirmation", input, "travel_parent_agent", input.explicitUserConfirmation === true);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const result = recordBookingConfirmation(state, input, { clock: this.clock });
    if (result.status !== "committed") return result;
    const saved = await this.store.save(result.state, { expectedStorageVersion: state.storageVersion });
    return { schemaVersion: result.schemaVersion, status: result.status, tripId: saved.tripId, revision: saved.revision, storageVersion: saved.storageVersion, qa: result.qa };
  }

  async reportTripDisruption(input, actor = "skill") {
    validateRequest("report_trip_disruption", input, actor);
    return this.proposeTripChange({ tripId: input.tripId, proposal: input.proposal }, actor);
  }

  async submitTripFeedback(input, actor = "mcp_client") {
    validateRequest("submit_trip_feedback", input, actor);
    const state = requireTrip(await this.store.get(input.tripId), input.tripId);
    const result = recordTripFeedback(state, input, { clock: this.clock });
    if (result.status !== "committed") return result;
    const saved = await this.store.save(result.state, { expectedStorageVersion: state.storageVersion });
    return { schemaVersion: result.schemaVersion, status: result.status, tripId: saved.tripId, revision: saved.revision, storageVersion: saved.storageVersion };
  }
}

export { controlView, planView };
