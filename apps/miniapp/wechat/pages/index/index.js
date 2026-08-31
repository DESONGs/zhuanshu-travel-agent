const app = getApp();

function message(error) {
  const code = error && error.code;
  if (code === "api_base_not_configured") return "旅行服务地址尚未配置。";
  if (code === "auth_provider_not_configured") return "微信登录尚未完成服务端授权。";
  if (code === "agent_unavailable") return "旅行助手暂时无法回应，需求会保留。";
  return "这次请求没有完成，请稍后重试。";
}

function travelerCareModel(travelers) {
  return (travelers || []).map((traveler) => {
    const care = traveler.careNeeds || {};
    const labels = [];
    if (care.mobility && care.mobility.maxContinuousWalkMeters != null) labels.push(`单段步行不超过 ${care.mobility.maxContinuousWalkMeters} 米`);
    else if (care.mobility && care.mobility.reduceWalking) labels.push("需要少走路");
    if (care.mobility && care.mobility.maxTransfers != null) labels.push(`最多换乘 ${care.mobility.maxTransfers} 次`);
    if (care.mobility && care.mobility.stepFreeRequired) labels.push("需要连续无台阶");
    else if (care.mobility && care.mobility.avoidStairs) labels.push("尽量避开楼梯");
    if (care.stamina && care.stamina.needsFrequentRest) labels.push("需要频繁休息");
    if (care.facilities && care.facilities.toiletAccessPriority) labels.push("优先卫生间便利");
    return { travelerId: traveler.travelerId, displayName: traveler.displayName || "同行人", labels, labelText: labels.join(" · ") || "暂无额外行动要求" };
  }).filter((traveler) => traveler.labels.length);
}

function mobilityModel(mobility) {
  if (!mobility || !["completed", "partial"].includes(mobility.status)) return null;
  const modeLabels = { walk: "步行", transit: "公交 / 地铁", taxi: "打车" };
  return {
    ...mobility,
    notice: mobility.travelerFit && ["partial", "unverified"].includes(mobility.travelerFit.accessibilityEvidence)
      ? "设施来自高德路线资料，不代表当前正在运行；连续无障碍建议现场确认。"
      : "路线时间为查询时估算，不是实时到站或即时叫车结果。",
    legs: mobility.legs.map((leg) => {
      const recommended = (leg.alternatives || []).find((alternative) => alternative.mode === leg.recommendedMode) || {};
      return {
        ...leg,
        modeLabel: modeLabels[leg.recommendedMode] || leg.recommendedMode,
        minutes: recommended.totalMinutes,
        walkingMeters: recommended.walkingMeters,
        transfers: recommended.mode === "transit" ? recommended.transfers : null,
        facilities: (recommended.accessibilityFeatures || []).map((feature) => ({ ...feature, note: `${feature.label} · 非实时` })),
      };
    }),
  };
}

const ROUTE_MODE_LABELS = { walk: "步行", transit: "公交 / 地铁", taxi: "打车" };
const ROUTE_MODE_COLORS = { walk: "#2c8053", transit: "#2268c7", taxi: "#c9443b" };

function miniRouteScene(mobility, { activeDay, activeLegId, routeModes = {} } = {}) {
  if (!mobility || !["completed", "partial"].includes(mobility.status)) return { activeDay: null, availableDays: [], activeLegId: null, markers: [], polylines: [], legs: [], nextLeg: null, drawable: false };
  const itinerary = mobility.itinerary || {};
  const availableDays = [...new Set([...(itinerary.days || []).map((day) => Number(day.dayIndex)), ...(mobility.legs || []).map((leg) => Number(leg.origin && leg.origin.dayIndex || leg.destination && leg.destination.dayIndex))].filter((day) => Number.isInteger(day) && day > 0))].sort((left, right) => left - right);
  const selectedDay = availableDays.includes(Number(activeDay)) ? Number(activeDay) : availableDays[0] || null;
  const visibleLegs = (mobility.legs || []).filter((leg) => selectedDay == null || Number(leg.origin && leg.origin.dayIndex || leg.destination && leg.destination.dayIndex) === selectedDay);
  const legs = visibleLegs.map((leg) => {
    const requestedMode = routeModes[leg.legId];
    const mode = (leg.alternatives || []).some((alternative) => alternative.mode === requestedMode) ? requestedMode : leg.recommendedMode;
    const alternative = (leg.alternatives || []).find((item) => item.mode === mode) || {};
    const points = (alternative.polyline || []).filter((point) => Number.isFinite(Number(point.longitude)) && Number.isFinite(Number(point.latitude))).map((point) => ({ longitude: Number(point.longitude), latitude: Number(point.latitude) }));
    return { ...leg, mode, modeLabel: ROUTE_MODE_LABELS[mode] || mode, minutes: alternative.totalMinutes, walkingMeters: alternative.walkingMeters, transfers: mode === "transit" ? alternative.transfers : null, estimatedFareCny: alternative.estimatedFareCny, points, drawable: points.length >= 2, modeOptions: (leg.alternatives || []).map((item) => ({ mode: item.mode, label: ROUTE_MODE_LABELS[item.mode] || item.mode, minutes: item.totalMinutes, walkingMeters: item.walkingMeters, transfers: item.transfers, estimatedFareCny: item.estimatedFareCny })), steps: alternative.steps || [] };
  });
  const selectedLegId = legs.some((leg) => leg.legId === activeLegId) ? activeLegId : legs[0] && legs[0].legId || null;
  const places = legs.flatMap((leg) => [leg.origin, leg.destination]).filter((place) => place && place.coordinates);
  const markers = [...new Map(places.map((place) => [place.nodeId || place.stopId || place.label, place])).values()].map((place, index) => ({ id: index + 1, longitude: Number(place.coordinates.longitude), latitude: Number(place.coordinates.latitude), title: place.label, width: 24, height: 32 }));
  const polylines = legs.filter((leg) => leg.drawable).map((leg) => ({ points: leg.points, color: leg.legId === selectedLegId ? ROUTE_MODE_COLORS[leg.mode] || "#2268c7" : "#7d8f9b", width: leg.legId === selectedLegId ? 7 : 4, dottedLine: false, arrowLine: true }));
  return { activeDay: selectedDay, availableDays, activeLegId: selectedLegId, markers, polylines, legs, nextLeg: legs.find((leg) => leg.legId === selectedLegId) || legs[0] || null, drawable: legs.length > 0 && legs.every((leg) => leg.drawable) };
}

function selectedNodeIds(proposalDomains, accepted) {
  const selected = Object.fromEntries((proposalDomains || []).map((domain) => [domain.key, domain.candidates.find((candidate) => candidate.selected)?.nodeId]).filter((entry) => entry[1]));
  if (Object.keys(selected).length) return selected;
  return Object.fromEntries((accepted || []).map((node) => [node.domain, node.nodeId]).filter((entry) => entry[0] && entry[1]));
}

function priceModel(candidate) {
  const source = candidate && candidate.price;
  const legacy = Number(candidate && candidate.cost);
  const amount = source ? source.amount : (Number.isFinite(legacy) && legacy > 0 ? legacy : null);
  const quality = source && source.quality ? source.quality : amount == null ? "unknown" : "reference";
  if (amount == null || quality === "unknown") return { priceLabel: "待核验", priceDetail: "未取得可靠价格", priceTone: "unknown" };
  const prefix = quality === "reference" ? "≈" : quality === "estimate" ? "~" : "";
  const detail = quality === "firm" ? "本次实价" : quality === "reference" ? "参考价" : "确定性估算";
  return { priceLabel: `${prefix}¥${Math.round(amount)}`, priceDetail: detail, priceTone: quality };
}

function budgetModel(budget) {
  if (!budget) return null;
  const labels = { stay: "住", transport: "行", food: "吃", play: "玩" };
  const rows = Object.keys(labels).map((domain) => {
    const bucket = budget.domains && budget.domains[domain];
    const unknown = !bucket || bucket.quality === "unknown" || (!bucket.estimated && bucket.unknownCount);
    const prefix = bucket && bucket.quality === "reference" ? "≈" : bucket && bucket.quality === "estimate" ? "~" : "";
    return { domain, label: labels[domain], amountLabel: unknown ? "待核验" : `${prefix}¥${Math.round(bucket.estimated || bucket.committed || 0)}`, basis: bucket && bucket.basis && bucket.basis[0] || "" };
  });
  return { summary: `整趟约 ¥${Math.round(budget.estimated || 0)}${budget.totalBudget != null ? ` / ¥${Math.round(budget.totalBudget)}` : ""}`, rows, exceedsBudget: budget.exceedsBudget === true };
}

function planModel(plan) {
  const proposal = plan && plan.pendingProposals && plan.pendingProposals[0];
  const labels = { play: "玩", food: "吃", stay: "住", transport: "行" };
  const proposalDomains = proposal ? ["transport", "stay", "food", "play"].map((key) => ({
    key,
    label: labels[key],
    candidates: (proposal.byDomain[key] || []).map((candidate) => ({ ...candidate, ...priceModel(candidate), selected: candidate.selected === true, photo: candidate.media && candidate.media[0] ? candidate.media[0].url : "", facilityText: candidate.operability && candidate.operability.mappedFacilities && candidate.operability.mappedFacilities.length ? `设施参考：${candidate.operability.mappedFacilities.map((facility) => facility.label).join("、")} · 非实时` : "" })),
  })).filter((domain) => domain.candidates.length).map((domain) => ({ ...domain, hasSelection: domain.candidates.some((candidate) => candidate.selected) })) : [];
  const accepted = plan ? Object.values(plan.byDomain || {}).flatMap((items) => items.filter((item) => item.selected)).map((item) => ({
    ...item,
    scheduleLabel: item.time || (item.operability && (item.operability.departureAt || item.operability.arrivalAt)) || "待排入日程",
    facilities: ((item.operability && item.operability.mappedFacilities) || []).map((facility) => ({ ...facility, note: `${facility.label} · 非实时` })),
  })) : [];
  const mapNodes = proposalDomains.length ? proposalDomains.flatMap((domain) => domain.candidates) : accepted;
  const markers = mapNodes.filter((candidate) => candidate.location && candidate.location.coordinates).map((candidate, index) => ({
    id: index + 1,
    longitude: candidate.location.coordinates.longitude,
    latitude: candidate.location.coordinates.latitude,
    title: candidate.title,
    width: 24,
    height: 32,
  }));
  const mobility = mobilityModel(plan && plan.mobility);
  const routeScene = miniRouteScene(mobility);
  return { proposal, proposalDomains, activeDomainKey: proposalDomains[0] ? proposalDomains[0].key : "transport", markers: routeScene.markers.length ? routeScene.markers : markers, polylines: routeScene.polylines, accepted, mobility, routeLegs: routeScene.legs, nextLeg: routeScene.nextLeg, activeLegId: routeScene.activeLegId, activeDay: routeScene.activeDay, routeDays: routeScene.availableDays, routeDrawable: routeScene.drawable, routePreviewId: null, routeModes: {}, routeSwitchBlocked: false, planRevision: plan && plan.revision, planBudget: budgetModel(plan && plan.budget) };
}

Page({
  data: {
    signedIn: false,
    loading: false,
    conversations: [],
    conversation: null,
    input: "",
    trip: null,
    proposal: null,
    proposalDomains: [],
    planBudget: null,
    markers: [],
    polylines: [],
    accepted: [],
    mobility: null,
    routeLegs: [],
    nextLeg: null,
    activeLegId: null,
    activeDay: null,
    routeDays: [],
    routeDrawable: false,
    routePreviewId: null,
    routeModes: {},
    routeSwitching: false,
    routeSwitchBlocked: false,
    planRevision: null,
    activeView: "conversation",
    activeDomainKey: "play",
    modelOptions: [],
    modelIndex: 0,
    selectedModelId: "deepseek-v4-flash",
    notice: "登录后直接说出旅行想法，不需要先创建行程。",
  },
  async signIn() {
    this.setData({ loading: true });
    try {
      const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
      const session = await app.request("/api/auth/platform-exchange", { method: "POST", data: { provider: "wechat", authorizationCode: login.code } });
      app.globalData.sessionToken = session.accessToken;
      this.setData({ signedIn: true, notice: "说出目的地、时间、同行人或一个模糊想法。" });
      await this.loadModelOptions();
      await this.loadConversations();
    } catch (error) {
      this.setData({ notice: message(error) });
    } finally {
      this.setData({ loading: false });
    }
  },
  async loadModelOptions() {
    const status = await app.request("/api/provider-status");
    const selection = status.modelSelection || {};
    const modelOptions = (selection.options || []).filter((option) => option.available);
    const selectedModelId = modelOptions.some((option) => option.id === selection.defaultModelId) ? selection.defaultModelId : (modelOptions[0] && modelOptions[0].id) || "deepseek-v4-flash";
    this.setData({ modelOptions, selectedModelId, modelIndex: Math.max(0, modelOptions.findIndex((option) => option.id === selectedModelId)) });
  },
  async loadConversations() {
    const result = await app.request("/api/conversations");
    let conversations = result.conversations || [];
    let conversation = conversations[0];
    if (!conversation) {
      conversation = await app.request("/api/conversations", { method: "POST", data: { modelId: this.data.selectedModelId } });
      conversations = [conversation];
    } else {
      conversation = await app.request(`/api/conversations/${encodeURIComponent(conversation.conversationId)}`);
    }
    const modelIndex = Math.max(0, this.data.modelOptions.findIndex((option) => option.id === conversation.modelId));
    this.setData({ conversations, conversation, selectedModelId: conversation.modelId, modelIndex });
    if (conversation.tripId) await this.loadTrip(conversation.tripId);
  },
  onInput(event) {
    this.setData({ input: event.detail.value });
  },
  switchView(event) {
    const activeView = event.currentTarget.dataset.view;
    if (activeView && (activeView === "conversation" || this.data.trip)) this.setData({ activeView });
  },
  switchDecisionDomain(event) {
    const activeDomainKey = event.currentTarget.dataset.domain;
    if (activeDomainKey) this.setData({ activeDomainKey });
  },
  onModelChange(event) {
    const modelIndex = Number(event.detail.value);
    const selectedModelId = this.data.modelOptions[modelIndex] && this.data.modelOptions[modelIndex].id;
    if (selectedModelId) this.setData({ modelIndex, selectedModelId });
  },
  async sendMessage() {
    const text = String(this.data.input || "").trim();
    if (!text || this.data.loading || !this.data.conversation) return;
    this.setData({ loading: true, input: "" });
    try {
      const result = await app.request(`/api/conversations/${encodeURIComponent(this.data.conversation.conversationId)}/messages`, { method: "POST", data: { text, modelId: this.data.selectedModelId } });
      this.setData({ conversation: result.conversation, notice: "" });
      if (result.tripId || result.conversation.tripId) {
        await this.loadTrip(result.tripId || result.conversation.tripId);
        this.setData({ activeView: "itinerary" });
      }
    } catch (error) {
      this.setData({ input: text, notice: message(error) });
    } finally {
      this.setData({ loading: false });
    }
  },
  async loadTrip(tripId) {
    const [control, plan] = await Promise.all([
      app.request(`/api/trips/${encodeURIComponent(tripId)}/control`),
      app.request(`/api/trips/${encodeURIComponent(tripId)}/plan`),
    ]);
    this.setData({ trip: { tripId, ...control.brief, timeLabel: control.brief.dates || (control.brief.durationDays ? `${control.brief.durationDays} 天` : "时间待确认"), travelerCount: control.travelers.length, travelerCare: travelerCareModel(control.travelers), budgetLabel: control.brief.totalBudget != null ? `总预算 ¥${control.brief.totalBudget}` : "", paceLabel: control.brief.pace ? `整体节奏：${control.brief.pace}` : "" }, ...planModel(plan) });
  },
  selectCandidate(event) {
    const { domain, nodeId } = event.currentTarget.dataset;
    const proposalDomains = this.data.proposalDomains.map((item) => item.key === domain ? { ...item, candidates: item.candidates.map((candidate) => ({ ...candidate, selected: candidate.nodeId === nodeId })) } : item);
    this.setData({ proposalDomains: proposalDomains.map((domainItem) => ({ ...domainItem, hasSelection: domainItem.candidates.some((candidate) => candidate.selected) })), routePreviewId: null, routeModes: {}, routeSwitchBlocked: false });
  },
  selectRouteDay(event) {
    const scene = miniRouteScene(this.data.mobility, { activeDay: Number(event.currentTarget.dataset.day), activeLegId: null, routeModes: this.data.routeModes });
    this.setData({ activeDay: scene.activeDay, activeLegId: scene.activeLegId, routeLegs: scene.legs, nextLeg: scene.nextLeg, markers: scene.markers, polylines: scene.polylines, routeDrawable: scene.drawable });
  },
  selectRouteLeg(event) {
    const scene = miniRouteScene(this.data.mobility, { activeDay: this.data.activeDay, activeLegId: event.currentTarget.dataset.legId, routeModes: this.data.routeModes });
    this.setData({ activeLegId: scene.activeLegId, routeLegs: scene.legs, nextLeg: scene.nextLeg, polylines: scene.polylines });
  },
  async selectRouteMode(event) {
    if (!this.data.trip || this.data.routeSwitching) return;
    const { legId, mode } = event.currentTarget.dataset;
    const selections = selectedNodeIds(this.data.proposalDomains, this.data.accepted);
    if (!Object.keys(selections).length) return this.setData({ notice: "先选择或确认地点，才能比较真实路线。" });
    const nextModes = { ...this.data.routeModes, [legId]: mode };
    this.setData({ routeSwitching: true, routeSwitchBlocked: false });
    try {
      let previewId = this.data.routePreviewId;
      if (!previewId) {
        const initial = await app.request(`/api/trips/${encodeURIComponent(this.data.trip.tripId)}/mobility/preview`, { method: "POST", data: { baseRevision: this.data.planRevision, selections } });
        if (!initial.previewId) throw { code: initial.reason || "route_preview_unavailable" };
        previewId = initial.previewId;
      }
      const result = await app.request(`/api/trips/${encodeURIComponent(this.data.trip.tripId)}/mobility/preview`, { method: "POST", data: { baseRevision: this.data.planRevision, previewId, routeModes: nextModes } });
      const mobility = mobilityModel(result.mobility);
      const scene = miniRouteScene(mobility, { activeDay: this.data.activeDay, activeLegId: legId, routeModes: nextModes });
      if (result.feasibility && result.feasibility.canConfirm !== true) throw { code: "route_infeasible", details: result.feasibility.primaryBlocker };
      if (!scene.nextLeg || !scene.nextLeg.drawable || !scene.drawable) throw { code: "route_geometry_unavailable" };
      this.setData({ mobility, routePreviewId: result.previewId, routeModes: nextModes, activeLegId: scene.activeLegId, routeLegs: scene.legs, nextLeg: scene.nextLeg, markers: scene.markers, polylines: scene.polylines, routeDrawable: scene.drawable, routeSwitchBlocked: false, notice: `已核验${scene.nextLeg.modeLabel}方案；时间、步行、换乘和费用已同步。` });
    } catch (error) {
      this.setData({ routeSwitchBlocked: true, notice: error && error.details || (error && error.code === "route_geometry_unavailable" ? "这条方式没有返回可绘制路线，已保留上一条路线。" : "这条方式没有通过核验，已保留上一条路线。") });
    } finally {
      this.setData({ routeSwitching: false });
    }
  },
  async acceptProposal() {
    if (!this.data.proposal || !this.data.trip || this.data.loading) return;
    if (!this.data.proposalDomains.some((domain) => domain.candidates.some((candidate) => candidate.selected))) {
      this.setData({ notice: "请先选择一个想确认的候选；其他领域可以稍后再决定。" });
      return;
    }
    if (this.data.routeSwitchBlocked) {
      this.setData({ notice: "当前路线切换没有通过核验，请保留上一条路线或重新选择。" });
      return;
    }
    if (this.data.routePreviewId && !this.data.routeDrawable) {
      this.setData({ notice: "当前日仍有路段缺少真实折线，暂不能确认这次路线调整。" });
      return;
    }
    const selections = Object.fromEntries(this.data.proposalDomains.map((domain) => [domain.key, domain.candidates.find((candidate) => candidate.selected)?.nodeId]).filter((item) => item[1]));
    this.setData({ loading: true });
    try {
      await app.request(`/api/trips/${encodeURIComponent(this.data.trip.tripId)}/proposals/${encodeURIComponent(this.data.proposal.proposalId)}/accept`, { method: "POST", data: { selections, partial: true, ...(this.data.routePreviewId ? { previewId: this.data.routePreviewId, baseRevision: this.data.planRevision, routeModes: this.data.routeModes } : {}) } });
      await app.request(`/api/trips/${encodeURIComponent(this.data.trip.tripId)}/mobility/refresh`, { method: "POST" });
      await this.loadTrip(this.data.trip.tripId);
      this.setData({ notice: "已确认所选候选；其他领域仍可继续比较。", activeView: "itinerary" });
    } catch (error) {
      this.setData({ notice: message(error) });
    } finally {
      this.setData({ loading: false });
    }
  },
});
