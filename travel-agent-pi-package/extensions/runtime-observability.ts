import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const BLOCKED_KEYS = /cookie|token|password|authorization|phone|passport|identity|payment|card/i;

type ObservableValue = string | number | boolean | null;

function cleanAttributes(input: { [key: string]: ObservableValue }) {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => !BLOCKED_KEYS.test(key) && typeof value !== "object"));
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_runtime_observe",
    label: "Observe Travel Runtime",
    description: "Create a redacted, caller-owned runtime event for a control-chain trace. It stores no identity, payment, or browser credential data.",
    parameters: Type.Object({ event: Type.String(), tripId: Type.Optional(Type.String()), revision: Type.Optional(Type.Integer()), attributes: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]))) }),
    async execute(_id, params) {
      const details = {
        schemaVersion: "travel-runtime-event-v1",
        event: params.event,
        tripId: params.tripId ?? null,
        revision: params.revision ?? null,
        attributes: cleanAttributes(params.attributes ?? {}),
        redactionApplied: Object.keys(params.attributes ?? {}).some((key) => BLOCKED_KEYS.test(key)),
        observedAt: new Date().toISOString(),
      };
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
    },
  });
}
