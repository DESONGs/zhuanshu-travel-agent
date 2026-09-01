const desktopBridge = typeof window !== "undefined" ? window.travelDesktop : null;
const apiBaseUrl = String(desktopBridge?.runtimeConfig?.apiBaseUrl ?? import.meta.env.VITE_TRAVEL_API_BASE_URL ?? "").trim().replace(/\/$/, "");
let desktopAccessToken = null;

export function setDesktopAccessToken(token) {
  desktopAccessToken = typeof token === "string" && token.trim() ? token.trim() : null;
}

export function clearDesktopAccessToken() {
  desktopAccessToken = null;
}

export function apiPublicUrl(path) {
  if (!apiBaseUrl) return new URL(path, window.location.origin).toString();
  return new URL(path, `${apiBaseUrl}/`).toString();
}

async function request(path, { method = "GET", body, token, signal } = {}) {
  const authorizationToken = token ?? desktopAccessToken;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : {}),
      ...(desktopBridge ? { "X-Travel-Client": "desktop" } : {}),
    },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({ status: "error", code: "invalid_response" }));
  if (!response.ok) {
    const error = new Error(data.code ?? "request_failed");
    error.code = data.code;
    error.details = data.details;
    throw error;
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  authProviders: () => request("/api/auth/providers"),
  authStartUrl: (provider, returnTo = "/") => `${apiBaseUrl}/api/auth/${encodeURIComponent(provider)}/start?returnTo=${encodeURIComponent(returnTo)}${desktopBridge ? "&client=desktop" : ""}`,
  createDevelopmentSession: (provider, identity) => request("/api/auth/session", { method: "POST", body: { provider, identity } }),
  createGuestSession: () => request("/api/auth/guest-session", { method: "POST" }),
  desktopExchange: (code) => request("/api/auth/desktop-exchange", { method: "POST", body: { code } }),
  session: () => request("/api/session"),
  logout: () => request("/api/session", { method: "DELETE" }),
  listTrips: () => request("/api/trips"),
  providerStatus: () => request("/api/provider-status"),
  listConversations: (includeDeleted = false) => request(`/api/conversations${includeDeleted ? "?includeDeleted=true" : ""}`),
  createConversation: (input = {}) => request("/api/conversations", { method: "POST", body: input }),
  conversation: (conversationId) => request(`/api/conversations/${encodeURIComponent(conversationId)}`),
  deleteConversation: (conversationId) => request(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" }),
  restoreConversation: (conversationId) => request(`/api/conversations/${encodeURIComponent(conversationId)}/restore`, { method: "POST" }),
  sendConversationMessage: (conversationId, text, modelId, images = undefined, planningContext = undefined) => request(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", body: { text, modelId, ...(images?.length ? { images } : {}), ...(planningContext ? { planningContext } : {}) } }),
  inspectVisualEvidence: (input) => request("/api/visual-evidence/inspect", { method: "POST", body: input }),
  createTrip: (input) => request("/api/trips", { method: "POST", body: input }),
  control: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/control`),
  plan: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/plan`),
  evidenceForNode: (tripId, nodeId, targetLanguage = "zh-CN") => request(`/api/trips/${encodeURIComponent(tripId)}/evidence/nodes/${encodeURIComponent(nodeId)}?targetLanguage=${encodeURIComponent(targetLanguage)}`),
  resolveEvidenceShareLink: (tripId, nodeId, url, targetLanguage = "zh-CN") => request(`/api/trips/${encodeURIComponent(tripId)}/evidence/resolve`, { method: "POST", body: { nodeId, url, targetLanguage } }),
  evidenceBundle: (tripId, bundleId) => request(`/api/trips/${encodeURIComponent(tripId)}/evidence/${encodeURIComponent(bundleId)}`),
  translateEvidenceBundle: (tripId, bundleId, targetLanguage) => request(`/api/trips/${encodeURIComponent(tripId)}/evidence/${encodeURIComponent(bundleId)}/translate`, { method: "POST", body: { targetLanguage } }),
  updateReadiness: (tripId, signalId, status) => request(`/api/trips/${encodeURIComponent(tripId)}/readiness`, { method: "POST", body: { signalId, status } }),
  mapUrl: (tripId) => `${apiBaseUrl}/api/trips/${encodeURIComponent(tripId)}/map`,
  mapBlob: async (tripId, signal = undefined) => {
    const response = await fetch(`${apiBaseUrl}/api/trips/${encodeURIComponent(tripId)}/map`, {
      headers: { ...(desktopAccessToken ? { Authorization: `Bearer ${desktopAccessToken}` } : {}), ...(desktopBridge ? { "X-Travel-Client": "desktop" } : {}) },
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) throw Object.assign(new Error("map_request_failed"), { code: "map_request_failed" });
    return response.blob();
  },
  decisions: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/decisions`),
  transit: (tripId, nodeId) => request(`/api/trips/${encodeURIComponent(tripId)}/transit/${encodeURIComponent(nodeId)}`),
  refreshMobility: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/mobility/refresh`, { method: "POST" }),
  previewMobility: (tripId, baseRevision, selections, signal = undefined, previewId = undefined, routeModes = undefined) => request(`/api/trips/${encodeURIComponent(tripId)}/mobility/preview`, { method: "POST", body: { baseRevision, selections, ...(previewId ? { previewId } : {}), ...(routeModes && Object.keys(routeModes).length ? { routeModes } : {}) }, signal }),
  submitFeedback: (tripId, input) => request(`/api/trips/${encodeURIComponent(tripId)}/feedback`, { method: "POST", body: input }),
  propose: (tripId, proposal) => request(`/api/trips/${encodeURIComponent(tripId)}/proposals`, { method: "POST", body: { proposal } }),
  accept: (tripId, proposalId, selections = undefined, partial = false, previewId = undefined, baseRevision = undefined, routeModes = undefined) => request(`/api/trips/${encodeURIComponent(tripId)}/proposals/${encodeURIComponent(proposalId)}/accept`, { method: "POST", body: { ...(selections ? { selections } : {}), ...(partial ? { partial: true } : {}), ...(previewId ? { previewId } : {}), ...(baseRevision != null ? { baseRevision } : {}), ...(routeModes && Object.keys(routeModes).length ? { routeModes } : {}) } }),
  reject: (tripId, proposalId) => request(`/api/trips/${encodeURIComponent(tripId)}/proposals/${encodeURIComponent(proposalId)}/reject`, { method: "POST" }),
  discardItineraryTrial: (tripId, proposalId, baseRevision) => request(`/api/trips/${encodeURIComponent(tripId)}/itinerary-trials/${encodeURIComponent(proposalId)}/discard`, { method: "POST", body: { baseRevision } }),
};
