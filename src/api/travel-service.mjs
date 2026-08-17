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
  validateTripCoherence,
} from "../../travel-agent-pi-package/src/core/index.ts";
import { createTripRepository } from "../persistence/trip-repository.mjs";
import { validateTravelMcpRequest } from "../../travel-agent-pi-package/src/mcp/index.ts";
import { normalizeTripMobility, transitSegmentFromNode } from "../../travel-agent-pi-package/src/contracts/public.ts";

const FOUR_DOMAINS = Object.freeze(["play", "food", "stay", "transport"]);
const DOMAIN_LABELS = Object.freeze({ play: "玩", food: "吃", stay: "住", transport: "行" });

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
    providerStatus,
  };
}

function proposalView(proposal) {
  const byDomain = Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, []]));
  for (const operation of proposal.operations ?? []) {
    if (operation.kind !== "add_candidate" || !FOUR_DOMAINS.includes(operation.node?.domain)) continue;
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

function planView(state, { mapPreviewAvailable = false } = {}) {
  const byDomain = Object.fromEntries(
    ["transport", "stay", "play", "food"].map((domain) => [
      domain,
      state.nodes.filter((node) => node.domain === domain).map((node) => ({
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
      })),
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
    pendingProposals: state.pendingProposals.map(proposalView),
    transitSegments: state.nodes
      .filter((node) => node.domain === "transport")
      .flatMap((node) => {
        const segment = transitSegmentFromNode(node);
        return segment ? [{ nodeId: node.nodeId, segment }] : [];
      }),
    mapPreviewAvailable,
    weather: state.environment?.weather ?? null,
    mobility: state.environment?.mobility ?? null,
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
    return [domain, candidates.slice(0, 3)];
  }));
}

function buildResearchProposal(state, providerResult) {
  const byDomain = linkedCandidates(providerResult.byDomain ?? {}, providerResult.weather);
  const proposalSuffix = randomUUID().slice(0, 8);
  const candidateEntries = FOUR_DOMAINS.flatMap((domain) => byDomain[domain].map((candidate, index) => {
    const nodeId = `${candidate.candidateId}_${proposalSuffix}_${index + 1}`.slice(0, 128);
    const claimId = `${candidate.claimId}_${proposalSuffix}_${index + 1}`.slice(0, 128);
    return { domain, candidate, nodeId, claimId, selected: false };
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
      sourceRefs: [entry.candidate.sourceId],
      claimRefs: [entry.claimId],
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
  const contentItems = [...new Map(candidateEntries.map(({ candidate }) => [candidate.sourceId, {
    contentItemId: candidate.sourceId,
    provider: candidate.source.provider,
    sourceType: candidate.source.sourceType,
    providerRef: candidate.source.providerPoiId,
    checkedAt: candidate.source.checkedAt,
    documentationUrl: candidate.source.documentationUrl,
    independenceGroup: candidate.source.independenceGroup,
    commercialBias: candidate.source.commercialBias,
  }])).values()];
  const entities = [...new Map(candidateEntries.map(({ candidate }) => [candidate.entity.entityId, candidate.entity])).values()];
  const claims = candidateEntries.map(({ candidate, claimId, nodeId }) => ({ ...candidate.claim, claimId, nodeId }));
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
      state.collaboration = {
        ownerUserId: input.ownerUserId,
        memberUserIds: [...new Set([input.ownerUserId, ...(Array.isArray(input.memberUserIds) ? input.memberUserIds : [])])],
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
        .filter((state) => !userId || state.collaboration?.memberUserIds?.includes(userId))
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
    return planView(requireTrip(await this.store.get(tripId), tripId), { mapPreviewAvailable: this.researchProvider?.canRenderMap === true });
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
    const existingResearchProposal = state.pendingProposals.find((proposal) => String(proposal.proposalId).startsWith("proposal_research_"));
    if (existingResearchProposal) {
      const existingView = proposalView(existingResearchProposal);
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
        fabricatedResults: false,
      };
    }
    if (!this.researchProvider) return { ...providerUnavailable("research_trip_options", input.capability ?? "travel_research"), tripId: state.tripId, revision: state.revision };
    let providerResult;
    try {
      providerResult = await this.researchProvider.research({
        tripId: state.tripId,
        brief: state.brief,
        travelers: state.travelers,
        domains: Array.isArray(input.domains) ? input.domains : FOUR_DOMAINS,
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
        reason: error?.code ?? "SOURCE_UNAVAILABLE",
        fabricatedResults: false,
      };
    }
    if (providerResult.status !== "completed") {
      return { ...providerResult, operation: "research_trip_options", capability: input.capability ?? "travel_research", tripId: state.tripId, revision: state.revision };
    }
    let workingState = state;
    if (providerResult.weather?.status === "completed") {
      workingState = applyWeatherObservation(state, providerResult.weather, { clock: this.clock });
    }
    const proposal = buildResearchProposal(workingState, providerResult);
    if (!proposal.operations.length) {
      if (workingState !== state) await this.store.save(workingState, { expectedStorageVersion: state.storageVersion });
      return { ...providerResult, status: "EMPTY_VERIFIED", operation: "research_trip_options", tripId: workingState.tripId, revision: workingState.revision, fabricatedResults: false };
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
