#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { createTravelService } from "../api/create-travel-service.mjs";
import { loadTravelRuntimeEnv } from "../http/runtime-env.mjs";

const runtimeEnv = await loadTravelRuntimeEnv();
const service = createTravelService(runtimeEnv);
const server = new McpServer({
  name: "travel-agent-v1",
  version: "0.1.0",
}, {
  capabilities: { tools: {} },
  instructions: "Travel V1 business API. All mutations are revisioned; external providers remain unavailable until audited and enabled.",
});

const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const record = z.record(z.string(), z.unknown());
const tripIdInput = { tripId: id };
const nullableBoolean = z.boolean().nullable().optional();
const travelerProfile = z.object({
  travelerId: id.optional(),
  displayName: z.string().min(1).max(40),
  relationship: z.string().max(40).optional(),
  language: z.string().max(24).optional(),
  careNeeds: z.object({
    mobility: z.object({ reduceWalking: nullableBoolean, maxContinuousWalkMeters: z.number().int().min(50).max(20_000).nullable().optional(), maxTransfers: z.number().int().min(0).max(8).nullable().optional(), avoidStairs: nullableBoolean, stepFreeRequired: nullableBoolean, wheelchairSpaceRequired: nullableBoolean, luggageAssistanceRequired: nullableBoolean }).optional(),
    stamina: z.object({ needsFrequentRest: nullableBoolean, restEveryMinutes: z.number().int().min(10).max(240).nullable().optional(), maxActiveMinutesPerBlock: z.number().int().min(20).max(720).nullable().optional() }).optional(),
    schedule: z.object({ earliestStartTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), latestReturnTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), latestDinnerTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), regularMealTimes: nullableBoolean }).optional(),
    facilities: z.object({ accessibleToiletRequired: nullableBoolean, toiletAccessPriority: nullableBoolean, nursingRoomRequired: nullableBoolean, strollerFriendlyRequired: nullableBoolean, quietRetreatRequired: nullableBoolean }).optional(),
    sensory: z.object({ avoidCrowds: nullableBoolean, avoidStrongSensoryStimuli: nullableBoolean }).optional(),
    food: z.object({ exclusions: z.array(z.string().max(80)).max(12).optional() }).optional(),
  }).optional(),
});
const researchDomainCriteria = z.object({
  keywords: z.array(z.string().min(1).max(120)).max(12).optional(),
  namedEntities: z.array(z.string().min(1).max(120)).max(12).optional(),
  targetAreas: z.array(z.string().min(1).max(120)).max(12).optional(),
  anchorCoordinates: z.array(z.object({ label: z.string().min(1).max(120).optional(), longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) })).max(6).optional(),
  hardConstraints: z.array(z.string().min(1).max(120)).max(12).optional(),
  preferenceHints: z.array(z.string().min(1).max(120)).max(12).optional(),
});
const researchCriteria = z.object({
  byDomain: z.object({ play: researchDomainCriteria.optional(), food: researchDomainCriteria.optional(), stay: researchDomainCriteria.optional(), transport: researchDomainCriteria.optional() }).optional(),
  intercityIntent: z.enum(["flight", "train", "flexible", "none"]).optional(),
  localMobilityIntent: z.array(z.enum(["transit", "taxi", "walk", "accessible_transit", "flexible"])).max(5).optional(),
  arrival: z.object({ airport: z.string().max(120).optional(), terminal: z.string().max(40).optional(), time: z.string().max(40).optional() }).optional(),
});

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: value?.status === "rejected" || value?.status === "needs_rebase",
  };
}

function register(name, config, handler) {
  server.registerTool(name, config, async (input) => {
    try {
      return toolResult(await handler(input));
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ status: "error", code: error?.code ?? "internal_error", details: error?.details ?? null }) }],
        isError: true,
      };
    }
  });
}

register("create_trip", {
  title: "Create trip",
  description: "Create one shared Travel V1 trip state for food, stay, transport, and play.",
  inputSchema: {
    tripId: id.optional(),
    brief: record.optional(),
    travelers: z.array(record).max(20).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, (input) => service.createTrip(input));

register("update_trip_scope", {
  title: "Update trip understanding",
  description: "Merge newly understood traveler facts into an existing trip. Omitted fields are preserved.",
  inputSchema: {
    tripId: id,
    brief: record.optional(),
    travelerCount: z.number().int().min(1).max(12).optional(),
    language: z.string().max(24).optional(),
    foreignGuestRequired: z.boolean().optional(),
    travelerProfiles: z.array(travelerProfile).max(12).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, (input) => service.updateTripScope(input));

register("get_trip_control_view", {
  description: "Read revision, open decisions, dirty set, task queues, and pending proposals.",
  inputSchema: tripIdInput,
  annotations: { readOnlyHint: true, openWorldHint: false },
}, ({ tripId }) => service.getTripControlView(tripId));

register("get_trip_plan_view", {
  description: "Read the user-facing linked food, stay, transport, and play plan plus QA.",
  inputSchema: tripIdInput,
  annotations: { readOnlyHint: true, openWorldHint: false },
}, ({ tripId }) => service.getTripPlanView(tripId));

register("get_open_decisions", {
  description: "Read unresolved decisions and staged proposals for a trip.",
  inputSchema: tripIdInput,
  annotations: { readOnlyHint: true, openWorldHint: false },
}, ({ tripId }) => service.getOpenDecisions(tripId));

register("research_trip_options", {
  description: "Run one bounded linked research pass and stage a source-backed four-domain proposal for user confirmation.",
  inputSchema: { tripId: id, capability: z.string().max(100).optional(), domains: z.array(z.enum(["play", "food", "stay", "transport"])).min(1).max(4).optional(), question: z.string().max(800).optional(), criteria: researchCriteria.optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, (input) => service.researchTripOptions(input));

register("propose_trip_change", {
  description: "Stage a revisioned TripPatchProposal. Staging never changes the accepted plan.",
  inputSchema: { tripId: id, proposal: record },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, (input) => service.proposeTripChange(input));

register("accept_trip_change", {
  description: "Accept and atomically commit one staged TripPatchProposal as the parent Travel Agent.",
  inputSchema: { tripId: id, proposalId: id, selections: z.record(z.enum(["play", "food", "stay", "transport"]), id).optional(), partial: z.boolean().optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, (input) => service.acceptTripChange(input));

register("reject_trip_change", {
  description: "Reject one staged TripPatchProposal without changing the accepted plan.",
  inputSchema: { tripId: id, proposalId: id },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, (input) => service.rejectTripChange(input));

register("prepare_booking_handoff", {
  description: "Prepare an external booking handoff for a selected fresh offer. Never purchases automatically.",
  inputSchema: { tripId: id, nodeId: id, offerId: id, explicitUserConfirmation: z.literal(true) },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, (input) => service.prepareBookingHandoff(input));

register("record_booking_confirmation", {
  description: "Record a user-provided external booking confirmation and lock the selected decision.",
  inputSchema: {
    tripId: id,
    nodeId: id,
    offerId: id.optional(),
    confirmationRef: id,
    baseRevision: z.number().int().nonnegative(),
    explicitUserConfirmation: z.literal(true),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, (input) => service.recordBookingConfirmation(input));

register("report_trip_disruption", {
  description: "Stage a disruption patch that changes only the affected decision neighborhood.",
  inputSchema: { tripId: id, proposal: record },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, (input) => service.reportTripDisruption(input));

register("submit_trip_feedback", {
  description: "Record a trip-linked visit experience or fact correction. Anonymous structured feedback may inform later travelers but never becomes an authoritative place fact.",
  inputSchema: {
    tripId: id,
    baseRevision: z.number().int().nonnegative(),
    category: z.enum(["personal_experience", "preference_change", "fact_correction", "unverified_public_info"]),
    nodeId: id.optional(),
    text: z.string().min(1).max(2000),
    visibility: z.enum(["trip_only", "anonymous_travelers"]).optional(),
    verdict: z.enum(["recommend", "mixed", "not_recommend"]).optional(),
    tags: z.array(z.enum(["local_character", "worth_detour", "easy_to_reach", "low_queue", "helpful_service", "family_friendly", "quiet_rest", "accurate_listing", "useful_facilities", "foreigner_friendly", "good_value", "comfortable_pace"])).max(8).optional(),
    spendCny: z.number().min(0).max(1_000_000).optional(),
    waitMinutes: z.number().int().min(0).max(1_440).optional(),
    visitDate: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, (input) => service.submitTripFeedback(input));

const transport = new StdioServerTransport();
await server.connect(transport);
