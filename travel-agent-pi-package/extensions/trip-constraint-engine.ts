import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { validateTripCoherence } from "../src/runtime/trip-runtime.mjs";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_trip_coherence_review",
    label: "Review Travel Coherence",
    description: "Check four-domain coverage, declared foreign-guest lodging requirements, and budget coherence for a trip state.",
    parameters: Type.Object({ state: Type.Any() }),
    async execute(_id, params) {
      const details = validateTripCoherence(params.state);
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
    },
  });
}
