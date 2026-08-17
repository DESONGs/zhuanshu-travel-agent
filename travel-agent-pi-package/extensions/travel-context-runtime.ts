import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { buildTravelContextPack, needsContext } from "../src/core/trip-runtime.js";
import { TripStateSchema, TravelContextRequestSchema } from "../src/contracts/index.js";

function response(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_context_build",
    label: "Build Travel Context Pack",
    description: "Build a revision-bound travel-context-pack-v2 for one decision neighborhood, without copying the entire trip into a prompt.",
    parameters: Type.Object({ state: TripStateSchema, request: TravelContextRequestSchema }),
    async execute(_id, params) {
      return response(buildTravelContextPack(params.state, params.request));
    },
  });

  pi.registerTool({
    name: "travel_context_needs_context",
    label: "Declare Missing Travel Context",
    description: "Produce a structured needs_context result when a skill cannot safely make a recommendation from its decision-scoped inputs.",
    parameters: Type.Object({ missing: Type.Array(Type.String()), reason: Type.Optional(Type.String()), suggestedRetrieval: Type.Optional(Type.Array(Type.String())) }),
    async execute(_id, params) {
      return response(needsContext(params));
    },
  });
}
