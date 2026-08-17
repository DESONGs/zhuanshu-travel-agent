import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  addDecisionEdge,
  addDecisionNode,
  addEvidenceClaim,
  createTripControlState,
  recordOfferSnapshot,
} from "../src/core/trip-runtime.js";
import {
  CreateTripControlStateInputSchema,
  DecisionEdgeSchema,
  DecisionNodeInputSchema,
  EvidenceClaimInputSchema,
  OfferSnapshotInputSchema,
  TripStateSchema,
} from "../src/contracts/index.js";

function response(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_trip_create_control_state",
    label: "Create Travel Trip State",
    description: "Create the shared Travel Agent control state. Eating, lodging, transport, and play remain linked decisions in this one state.",
    parameters: CreateTripControlStateInputSchema,
    async execute(_id, params) {
      return response(createTripControlState(params));
    },
  });

  pi.registerTool({
    name: "travel_trip_add_decision_node",
    label: "Add Travel Decision Node",
    description: "Add a food, stay, transport, or play candidate to a caller-owned trip state; it does not commit a user-facing decision.",
    parameters: Type.Object({ state: TripStateSchema, node: DecisionNodeInputSchema }),
    async execute(_id, params) {
      return response(addDecisionNode(params.state, params.node));
    },
  });

  pi.registerTool({
    name: "travel_trip_add_decision_edge",
    label: "Link Travel Decisions",
    description: "Record a dependency or impact edge between two trip decisions so later changes only replan the affected neighborhood.",
    parameters: Type.Object({ state: TripStateSchema, edge: DecisionEdgeSchema }),
    async execute(_id, params) {
      return response(addDecisionEdge(params.state, params.edge));
    },
  });

  pi.registerTool({
    name: "travel_trip_add_evidence_claim",
    label: "Add Attributed Evidence Claim",
    description: "Attach an attributed, non-authoritative travel claim to a decision node for later review and context selection.",
    parameters: Type.Object({ state: TripStateSchema, claim: EvidenceClaimInputSchema }),
    async execute(_id, params) {
      return response(addEvidenceClaim(params.state, params.claim));
    },
  });

  pi.registerTool({
    name: "travel_trip_record_offer_snapshot",
    label: "Record Offer Snapshot",
    description: "Record a normalized offer with source, total, and expiry for freshness checks; it never purchases or reserves.",
    parameters: Type.Object({ state: TripStateSchema, offer: OfferSnapshotInputSchema }),
    async execute(_id, params) {
      return response(recordOfferSnapshot(params.state, params.offer));
    },
  });
}
