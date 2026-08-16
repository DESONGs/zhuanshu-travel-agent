const apiBaseUrl = String(import.meta.env.VITE_TRAVEL_API_BASE_URL ?? "").trim().replace(/\/$/, "");

async function request(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
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
  createDevelopmentSession: (provider, identity) => request("/api/auth/session", { method: "POST", body: { provider, identity } }),
  session: () => request("/api/session"),
  logout: () => request("/api/session", { method: "DELETE" }),
  listTrips: () => request("/api/trips"),
  providerStatus: () => request("/api/provider-status"),
  listConversations: () => request("/api/conversations"),
  createConversation: (input = {}) => request("/api/conversations", { method: "POST", body: input }),
  conversation: (conversationId) => request(`/api/conversations/${encodeURIComponent(conversationId)}`),
  sendConversationMessage: (conversationId, text, modelId) => request(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", body: { text, modelId } }),
  inspectVisualEvidence: (input) => request("/api/visual-evidence/inspect", { method: "POST", body: input }),
  createTrip: (input) => request("/api/trips", { method: "POST", body: input }),
  control: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/control`),
  plan: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/plan`),
  mapUrl: (tripId) => `${apiBaseUrl}/api/trips/${encodeURIComponent(tripId)}/map`,
  decisions: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/decisions`),
  transit: (tripId, nodeId) => request(`/api/trips/${encodeURIComponent(tripId)}/transit/${encodeURIComponent(nodeId)}`),
  refreshMobility: (tripId) => request(`/api/trips/${encodeURIComponent(tripId)}/mobility/refresh`, { method: "POST" }),
  propose: (tripId, proposal) => request(`/api/trips/${encodeURIComponent(tripId)}/proposals`, { method: "POST", body: { proposal } }),
  accept: (tripId, proposalId, selections = undefined) => request(`/api/trips/${encodeURIComponent(tripId)}/proposals/${encodeURIComponent(proposalId)}/accept`, { method: "POST", body: selections ? { selections } : {} }),
  reject: (tripId, proposalId) => request(`/api/trips/${encodeURIComponent(tripId)}/proposals/${encodeURIComponent(proposalId)}/reject`, { method: "POST" }),
};
