import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  CreateTripControlStateInputSchema,
  TripPatchProposalSchema,
  TripStateSchema,
  TravelContextRequestSchema,
} from "../contracts/index.js";
import {
  buildTravelContextPack,
  commitTripPatch,
  createTripControlState,
  validateTripCoherence,
  validateTripPatch,
} from "../core/trip-runtime.js";

function response(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

export function registerTravelCoreTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "travel_trip_state_create",
    label: "Create Travel Control State",
    description: "Create one shared control state for linked play, food, stay, and transport decisions.",
    parameters: CreateTripControlStateInputSchema,
    async execute(_id, params) { return response(createTripControlState(params)); },
  });

  pi.registerTool({
    name: "travel_context_build",
    label: "Build Travel Context Pack",
    description: "Build a revision-bound decision-scoped travel context pack.",
    parameters: Type.Object({ state: TripStateSchema, request: TravelContextRequestSchema }),
    async execute(_id, params) { return response(buildTravelContextPack(params.state, params.request)); },
  });

  pi.registerTool({
    name: "travel_trip_patch_validate",
    label: "Validate Trip Patch",
    description: "Validate revision, read/write contracts, locks, and offer freshness without mutation.",
    parameters: Type.Object({ state: TripStateSchema, proposal: TripPatchProposalSchema }),
    async execute(_id, params) { return response(validateTripPatch(params.state, params.proposal)); },
  });

  pi.registerTool({
    name: "travel_trip_patch_parent_commit",
    label: "Parent Commit Trip Patch",
    description: "Commit a validated patch at the parent-agent boundary.",
    parameters: Type.Object({ state: TripStateSchema, proposal: TripPatchProposalSchema }),
    async execute(_id, params) { return response(commitTripPatch(params.state, params.proposal)); },
  });

  pi.registerTool({
    name: "travel_qa_gate",
    label: "Travel QA Gate",
    description: "Check four-domain completeness, budget, mobility, weather, and traveler operability.",
    parameters: Type.Object({
      state: TripStateSchema,
      stage: Type.Optional(Type.Union([Type.Literal("proposal"), Type.Literal("presentation"), Type.Literal("fulfillment")])),
    }),
    async execute(_id, params) {
      const qa = validateTripCoherence(params.state);
      return response({ ...qa, stage: params.stage ?? "presentation", gate: qa.status === "pass" ? "pass" : "needs_fix" });
    },
  });
}

export default registerTravelCoreTools;
