import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static, type TSchema } from "typebox";
import { TravelService } from "../../src/api/travel-service.mjs";
import { TripBriefSchema, TripPatchProposalSchema, TravelerSchema } from "../src/contracts/index.js";

const service = new TravelService();

const travelerProfileParameters = Type.Object({
  travelerId: Type.Optional(Type.String()),
  displayName: Type.String({ minLength: 1, maxLength: 40 }),
  relationship: Type.Optional(Type.String({ maxLength: 40 })),
  language: Type.Optional(Type.String({ maxLength: 24 })),
  careNeeds: Type.Optional(Type.Object({
    mobility: Type.Optional(Type.Object({
      reduceWalking: Type.Optional(Type.Boolean()),
      maxContinuousWalkMeters: Type.Optional(Type.Integer({ minimum: 50, maximum: 20_000 })),
      maxTransfers: Type.Optional(Type.Integer({ minimum: 0, maximum: 8 })),
      avoidStairs: Type.Optional(Type.Boolean()),
      stepFreeRequired: Type.Optional(Type.Boolean()),
      wheelchairSpaceRequired: Type.Optional(Type.Boolean()),
      luggageAssistanceRequired: Type.Optional(Type.Boolean()),
    })),
    stamina: Type.Optional(Type.Object({
      needsFrequentRest: Type.Optional(Type.Boolean()),
      restEveryMinutes: Type.Optional(Type.Integer({ minimum: 10, maximum: 240 })),
      maxActiveMinutesPerBlock: Type.Optional(Type.Integer({ minimum: 20, maximum: 720 })),
    })),
    schedule: Type.Optional(Type.Object({ earliestStartTime: Type.Optional(Type.String()), latestReturnTime: Type.Optional(Type.String()), latestDinnerTime: Type.Optional(Type.String()), regularMealTimes: Type.Optional(Type.Boolean()) })),
    facilities: Type.Optional(Type.Object({ accessibleToiletRequired: Type.Optional(Type.Boolean()), toiletAccessPriority: Type.Optional(Type.Boolean()), nursingRoomRequired: Type.Optional(Type.Boolean()), strollerFriendlyRequired: Type.Optional(Type.Boolean()), quietRetreatRequired: Type.Optional(Type.Boolean()) })),
    sensory: Type.Optional(Type.Object({ avoidCrowds: Type.Optional(Type.Boolean()), avoidStrongSensoryStimuli: Type.Optional(Type.Boolean()) })),
    food: Type.Optional(Type.Object({ exclusions: Type.Optional(Type.Array(Type.String({ maxLength: 80 }), { maxItems: 12 })) })),
  })),
});

function statusOf(details: unknown): unknown {
  return details && typeof details === "object" ? Reflect.get(details, "status") : undefined;
}

function response(details: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
    details,
    isError: statusOf(details) === "rejected" || statusOf(details) === "needs_rebase",
  };
}

function errorField(error: unknown, field: string): unknown {
  return error && typeof error === "object" ? Reflect.get(error, field) : undefined;
}

function register<const Parameters extends TSchema>(pi: ExtensionAPI, config: {
  name: string;
  label: string;
  description: string;
  parameters: Parameters;
  run: (params: Static<Parameters>) => Promise<unknown>;
}) {
  pi.registerTool({
    name: config.name,
    label: config.label,
    description: config.description,
    parameters: config.parameters,
    async execute(_id, params) {
      try {
        return response(await config.run(params));
      } catch (error: unknown) {
        return response({ status: "error", code: errorField(error, "code") ?? "internal_error", details: errorField(error, "details") ?? null });
      }
    },
  });
}

export default function (pi: ExtensionAPI) {
  register(pi, {
    name: "create_trip", label: "Create Trip", description: "Create the persistent shared state for one complete Travel V1 trip.",
    parameters: Type.Object({ tripId: Type.Optional(Type.String()), brief: Type.Optional(TripBriefSchema), travelers: Type.Optional(Type.Array(Type.Partial(TravelerSchema))) }),
    run: (params) => service.createTrip(params),
  });
  register(pi, {
    name: "update_trip_scope", label: "Update Trip Scope", description: "Save newly understood traveler facts without inferring them from keywords or overwriting omitted facts.",
    parameters: Type.Object({
      tripId: Type.String(),
      brief: Type.Optional(Type.Partial(TripBriefSchema)),
      travelerCount: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
      language: Type.Optional(Type.String()),
      foreignGuestRequired: Type.Optional(Type.Boolean()),
      travelerProfiles: Type.Optional(Type.Array(travelerProfileParameters, { maxItems: 12 })),
    }),
    run: (params) => service.updateTripScope(params),
  });
  register(pi, {
    name: "get_trip_control_view", label: "Get Trip Control View", description: "Read trip revision, open decisions, dirty set, queues, and pending proposals.",
    parameters: Type.Object({ tripId: Type.String() }), run: ({ tripId }) => service.getTripControlView(tripId),
  });
  register(pi, {
    name: "get_trip_plan_view", label: "Get Trip Plan View", description: "Read the linked food, stay, transport, and play plan with QA.",
    parameters: Type.Object({ tripId: Type.String() }), run: ({ tripId }) => service.getTripPlanView(tripId),
  });
  register(pi, {
    name: "get_open_decisions", label: "Get Open Decisions", description: "Read unresolved decisions and staged proposals.",
    parameters: Type.Object({ tripId: Type.String() }), run: ({ tripId }) => service.getOpenDecisions(tripId),
  });
  register(pi, {
    name: "research_trip_options", label: "Research Trip Options", description: "Request provider-backed research; reports provider_unavailable until an audited provider is enabled.",
    parameters: Type.Object({ tripId: Type.String(), capability: Type.Optional(Type.String()), query: Type.Optional(Type.String()) }),
    run: (params) => service.researchTripOptions(params),
  });
  register(pi, {
    name: "propose_trip_change", label: "Propose Trip Change", description: "Stage a revisioned TripPatchProposal without changing the accepted plan.",
    parameters: Type.Object({ tripId: Type.String(), proposal: TripPatchProposalSchema }), run: (params) => service.proposeTripChange(params),
  });
  register(pi, {
    name: "accept_trip_change", label: "Accept Trip Change", description: "Parent-only atomic commit of one staged proposal.",
    parameters: Type.Object({ tripId: Type.String(), proposalId: Type.String() }), run: (params) => service.acceptTripChange(params),
  });
  register(pi, {
    name: "reject_trip_change", label: "Reject Trip Change", description: "Reject one staged proposal without changing the accepted plan.",
    parameters: Type.Object({ tripId: Type.String(), proposalId: Type.String() }), run: (params) => service.rejectTripChange(params),
  });
  register(pi, {
    name: "prepare_booking_handoff", label: "Prepare Booking Handoff", description: "Prepare an external handoff for a selected fresh offer; never purchases.",
    parameters: Type.Object({ tripId: Type.String(), nodeId: Type.String(), offerId: Type.String(), explicitUserConfirmation: Type.Boolean() }),
    run: (params) => service.prepareBookingHandoff(params),
  });
  register(pi, {
    name: "record_booking_confirmation", label: "Record Booking Confirmation", description: "Record a user-provided external confirmation and lock its decision.",
    parameters: Type.Object({ tripId: Type.String(), nodeId: Type.String(), offerId: Type.Optional(Type.String()), confirmationRef: Type.String(), baseRevision: Type.Integer(), explicitUserConfirmation: Type.Boolean() }),
    run: (params) => service.recordBookingConfirmation(params),
  });
  register(pi, {
    name: "report_trip_disruption", label: "Report Trip Disruption", description: "Stage a bounded disruption patch for the affected neighborhood.",
    parameters: Type.Object({ tripId: Type.String(), proposal: TripPatchProposalSchema }), run: (params) => service.reportTripDisruption(params),
  });
  register(pi, {
    name: "submit_trip_feedback", label: "Submit Trip Feedback", description: "Record classified feedback without promoting it directly to public memory.",
    parameters: Type.Object({ tripId: Type.String(), baseRevision: Type.Integer(), category: Type.Union([Type.Literal("personal_experience"), Type.Literal("preference_change"), Type.Literal("fact_correction"), Type.Literal("unverified_public_info")]), nodeId: Type.Optional(Type.String()), text: Type.String() }),
    run: (params) => service.submitTripFeedback(params),
  });
}
