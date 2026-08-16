import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { commitTripPatch, validateTripPatch } from "../src/runtime/trip-runtime.mjs";

function response(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_trip_patch_validate",
    label: "Validate Trip Patch",
    description: "Validate a TripPatchProposal against revision, read/write contracts, locks, and offer freshness. No mutation occurs.",
    parameters: Type.Object({ state: Type.Any(), proposal: Type.Any() }),
    async execute(_id, params) {
      return response(validateTripPatch(params.state, params.proposal));
    },
  });

  pi.registerTool({
    name: "travel_trip_patch_parent_commit",
    label: "Parent Commit Trip Patch",
    description: "Commit a validated TripPatchProposal. This tool is for the parent travel agent only; skills return proposals and never call it.",
    parameters: Type.Object({ state: Type.Any(), proposal: Type.Any() }),
    async execute(_id, params) {
      return response(commitTripPatch(params.state, params.proposal));
    },
  });
}
