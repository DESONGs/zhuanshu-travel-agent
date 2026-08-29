const app = getApp();

function message(error) {
  const code = error && error.code;
  if (code === "api_base_not_configured") return "旅行服务地址尚未配置。";
  if (code === "auth_provider_not_configured") return "支付宝登录尚未完成服务端授权。";
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
      return { ...leg, modeLabel: modeLabels[leg.recommendedMode] || leg.recommendedMode, minutes: recommended.totalMinutes, walkingMeters: recommended.walkingMeters, transfers: recommended.mode === "transit" ? recommended.transfers : null, facilities: (recommended.accessibilityFeatures || []).map((feature) => ({ ...feature, note: `${feature.label} · 非实时` })) };
    }),
  };
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
  }));
  return { proposal, proposalDomains, activeDomainKey: proposalDomains[0] ? proposalDomains[0].key : "transport", markers, accepted, mobility: mobilityModel(plan && plan.mobility), planBudget: budgetModel(plan && plan.budget) };
}

Page({
  data: { signedIn: false, loading: false, conversations: [], conversation: null, input: "", trip: null, proposal: null, proposalDomains: [], planBudget: null, markers: [], accepted: [], mobility: null, activeView: "conversation", activeDomainKey: "transport", modelOptions: [], modelIndex: 0, selectedModelId: "deepseek-v4-flash", notice: "登录后直接说出旅行想法，不需要先创建行程。" },
  signIn() {
    this.setData({ loading: true });
    my.getAuthCode({
      scopes: ["auth_user"],
      success: async ({ authCode }) => {
        try {
          const session = await app.request("/api/auth/platform-exchange", { method: "POST", data: { provider: "alipay", authorizationCode: authCode } });
          app.sessionToken = session.accessToken;
          this.setData({ signedIn: true, notice: "说出目的地、时间、同行人或一个模糊想法。" });
          await this.loadModelOptions();
          await this.loadConversations();
        } catch (error) {
          this.setData({ notice: message(error) });
        } finally {
          this.setData({ loading: false });
        }
      },
      fail: () => this.setData({ loading: false, notice: "没有取得支付宝登录授权。" }),
    });
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
  onInput(event) { this.setData({ input: event.detail.value }); },
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
    this.setData({ proposalDomains: proposalDomains.map((domainItem) => ({ ...domainItem, hasSelection: domainItem.candidates.some((candidate) => candidate.selected) })) });
  },
  async acceptProposal() {
    if (!this.data.proposal || !this.data.trip || this.data.loading) return;
    if (!this.data.proposalDomains.some((domain) => domain.candidates.some((candidate) => candidate.selected))) {
      this.setData({ notice: "请先选择一个想确认的候选；其他领域可以稍后再决定。" });
      return;
    }
    const selections = Object.fromEntries(this.data.proposalDomains.map((domain) => [domain.key, domain.candidates.find((candidate) => candidate.selected)?.nodeId]).filter((item) => item[1]));
    this.setData({ loading: true });
    try {
      await app.request(`/api/trips/${encodeURIComponent(this.data.trip.tripId)}/proposals/${encodeURIComponent(this.data.proposal.proposalId)}/accept`, { method: "POST", data: { selections, partial: true } });
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
