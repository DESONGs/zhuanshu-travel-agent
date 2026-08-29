import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveConfiguredModel } from "../../src/agent/travel-conversation-agent.mjs";

function currentRoute(kind: "deliberation" | "extraction" | "verification" | "multimodal") {
  if (kind === "verification") {
    const fallback = resolveConfiguredModel(process.env, { role: "reasoning" });
    return { purpose: "Verify dynamic facts with official providers first.", providerRole: "official_provider_first", modelFallback: fallback };
  }
  const role = kind === "multimodal" || kind === "extraction" ? "vision" : "reasoning";
  return { purpose: kind === "deliberation" ? "Parent travel reasoning and tool use." : kind === "extraction" ? "Read-only evidence extraction." : "Multimodal parent travel reasoning.", ...resolveConfiguredModel(process.env, { role }) };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_model_route",
    label: "Route Travel Reasoning Task",
    description: "Return the configured reasoning, extraction, verification, or multimodal route. It selects no provider and returns no model credential.",
    parameters: Type.Object({ kind: Type.Union([Type.Literal("deliberation"), Type.Literal("extraction"), Type.Literal("verification"), Type.Literal("multimodal")]) }),
    async execute(_id, params) {
      const details = { schemaVersion: "travel-model-route-v1", kind: params.kind, route: currentRoute(params.kind), statusSource: "current_model_resolver", credentialBoundary: "model credentials are runtime configuration, never tool output" };
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
    },
  });
}
