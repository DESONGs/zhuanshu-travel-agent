import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ACTIONS = ["research_social_read", "provider_read", "trip_patch_commit", "booking_handoff", "record_booking_confirmation", "purchase", "social_write"] as const;

function decide(params: { action: typeof ACTIONS[number]; actor?: string; explicitUserConfirmation?: boolean; containsSensitiveData?: boolean }) {
  if (params.containsSensitiveData) {
    return { status: "blocked", reason: "sensitive_identity_payment_or_cookie_data_must_not_enter_prompt_or_runtime_artifacts" };
  }
  if (params.action === "purchase" || params.action === "social_write") {
    return { status: "blocked", reason: "v1_has_no_purchase_or_social_write_capability" };
  }
  if (params.action === "trip_patch_commit" && params.actor !== "travel_parent_agent") {
    return { status: "blocked", reason: "only_travel_parent_agent_may_commit_trip_patch" };
  }
  if (["booking_handoff", "record_booking_confirmation"].includes(params.action) && !params.explicitUserConfirmation) {
    return { status: "needs_confirmation", reason: "user_confirmation_required_before_fulfillment_state_change" };
  }
  return { status: "pass", reason: "within_travel_v1_read_or_parent_commit_boundary" };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_policy_check",
    label: "Travel Policy Check",
    description: "Enforce Travel V1's read-only provider boundary, parent-only commits, sensitive-data exclusion, and fulfillment confirmation rules.",
    parameters: Type.Object({
      action: Type.Union(ACTIONS.map((action) => Type.Literal(action))),
      actor: Type.Optional(Type.String()),
      explicitUserConfirmation: Type.Optional(Type.Boolean()),
      containsSensitiveData: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params) {
      const details = { schemaVersion: "travel-policy-decision-v1", ...decide(params), action: params.action, evaluatedAt: new Date().toISOString() };
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
    },
  });
}
