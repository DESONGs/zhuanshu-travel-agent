export const TRAVEL_MCP_OPERATIONS = Object.freeze({
  create_trip: { mutation: "create", parentOnly: true, confirmation: false },
  update_trip_scope: { mutation: "update_scope", parentOnly: true, confirmation: false },
  get_trip_control_view: { mutation: "read", parentOnly: false, confirmation: false },
  get_trip_plan_view: { mutation: "read", parentOnly: false, confirmation: false },
  get_open_decisions: { mutation: "read", parentOnly: false, confirmation: false },
  research_trip_options: { mutation: "research", parentOnly: true, confirmation: false },
  propose_trip_change: { mutation: "proposal", parentOnly: false, confirmation: false },
  accept_trip_change: { mutation: "commit", parentOnly: true, confirmation: false },
  reject_trip_change: { mutation: "commit", parentOnly: true, confirmation: false },
  prepare_booking_handoff: { mutation: "fulfillment", parentOnly: true, confirmation: true },
  record_booking_confirmation: { mutation: "fulfillment", parentOnly: true, confirmation: true },
  report_trip_disruption: { mutation: "proposal", parentOnly: false, confirmation: false },
  submit_trip_feedback: { mutation: "feedback", parentOnly: false, confirmation: false },
});

export const TRANSIT_FACILITY_KINDS = Object.freeze([
  "elevator",
  "toilet",
  "locker",
  "power_bank",
  "accessible_toilet",
  "nursing_room",
]);

const SENSITIVE_KEY = /cookie|token|password|authorization|payment|passport|identity|phone|credential|secret|card/i;
const DANGEROUS_KEY = /^(?:__proto__|prototype|constructor)$/i;

function findBlockedKey(value, path = []) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) || DANGEROUS_KEY.test(key)) return [...path, key].join(".");
    const nested = findBlockedKey(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

export function validateTravelMcpRequest(request) {
  if (!request || typeof request !== "object") return { ok: false, reason: "invalid_mcp_request" };
  const operation = TRAVEL_MCP_OPERATIONS[request.operation];
  if (!operation) return { ok: false, reason: "unsupported_mcp_operation" };
  if (operation.parentOnly && request.actor !== "travel_parent_agent") return { ok: false, reason: "parent_agent_required" };
  if (operation.confirmation && request.explicitUserConfirmation !== true) return { ok: false, reason: "user_confirmation_required" };
  const blockedPath = findBlockedKey(request.payload);
  if (blockedPath) {
    return { ok: false, reason: "sensitive_payload_blocked", blockedPath };
  }
  return {
    ok: true,
    contract: {
      operation: request.operation,
      mutation: operation.mutation,
      parentOnly: operation.parentOnly,
      confirmation: operation.confirmation,
      responseEnvelope: "travel-mcp-response-v1",
    },
  };
}
