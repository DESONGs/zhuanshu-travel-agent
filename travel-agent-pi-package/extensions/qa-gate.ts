import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { validateTripCoherence } from "../src/runtime/trip-runtime.mjs";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_qa_gate",
    label: "Travel QA Gate",
    description: "Gate a plan or committed patch on four-domain coverage, budget, and declared traveler operability before user presentation.",
    parameters: Type.Object({ state: Type.Any(), stage: Type.Optional(Type.Union([Type.Literal("proposal"), Type.Literal("presentation"), Type.Literal("fulfillment")])) }),
    async execute(_id, params) {
      const qa = validateTripCoherence(params.state);
      const details = { ...qa, stage: params.stage ?? "presentation", gate: qa.status === "pass" ? "pass" : "needs_fix" };
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
    },
  });
}
