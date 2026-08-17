import * as runtime from "../runtime/trip-runtime.mjs";
import {
  FOUR_DOMAINS,
  SOCIAL_ERROR_CODES,
  TripCommitResultSchema,
  TripProposalResultSchema,
  TripQaSchema,
  TripStateSchema,
  TravelContextPackSchema,
  NeedsContextSchema,
  TripValidationSchema,
  assertSchema,
  assertTripState,
  type DecisionEdge,
  type DecisionNodeInput,
  type EvidenceClaimInput,
  type MobilityObservation,
  type NeedsContext,
  type TripBrief,
  type TripCommitResult,
  type TripPatchProposal,
  type TripProposalResult,
  type TripQa,
  type TripState,
  type Traveler,
  type TravelContextPack,
  type TravelContextRequest,
  type TripValidation,
} from "../contracts/index.js";

export { FOUR_DOMAINS, SOCIAL_ERROR_CODES };

export type Clock = Date | string | number | (() => Date | string | number);
export interface RuntimeOptions { clock?: Clock }

function invoke(name: string, ...args: unknown[]): unknown {
  const implementation: unknown = Reflect.get(runtime, name);
  if (typeof implementation !== "function") throw new Error(`missing_trip_runtime_export:${name}`);
  return Reflect.apply(implementation, undefined, args);
}

export interface CreateTripControlStateInput {
  tripId?: string;
  brief?: TripBrief;
  travelers?: Array<Partial<Traveler>>;
  clock?: Clock;
}

export interface UpdateTripScopeInput extends Partial<TripBrief> {
  brief?: Partial<TripBrief>;
  travelerCount?: number;
  travelerProfiles?: Array<Partial<Traveler>>;
  language?: string;
  foreignGuestRequired?: boolean;
}

export interface OfferSnapshotInput {
  offerId: string;
  nodeId: string;
  source?: string;
  handoffUrl?: string | null;
  totalPrice?: number;
  currency?: string;
  expiresAt?: string | null;
  checkedAt?: string;
}

export interface NeedsContextInput {
  missing: string[];
  reason?: string;
  suggestedRetrieval?: string[];
}

export interface BookingConfirmationInput {
  baseRevision: number;
  nodeId: string;
  offerId?: string;
  confirmationRef: string;
}

export interface TripFeedbackInput {
  baseRevision: number;
  category: "personal_experience" | "preference_change" | "fact_correction" | "unverified_public_info";
  nodeId?: string;
  text: string;
}

export function createTripControlState(input: CreateTripControlStateInput = {}): TripState {
  return assertTripState(invoke("createTripControlState", input));
}

export function applyWeatherObservation(state: TripState, observation: object, options: RuntimeOptions = {}): TripState {
  return assertTripState(invoke("applyWeatherObservation", state, observation, options));
}

export function applyMobilityObservation(state: TripState, observation: MobilityObservation, options: RuntimeOptions = {}): TripState {
  return assertTripState(invoke("applyMobilityObservation", state, observation, options));
}

export function updateTripControlScope(state: TripState, input: UpdateTripScopeInput = {}, options: RuntimeOptions = {}): TripState {
  return assertTripState(invoke("updateTripControlScope", state, input, options));
}

export function addDecisionNode(state: TripState, input: DecisionNodeInput, options: RuntimeOptions = {}): TripState {
  return assertTripState(invoke("addDecisionNode", state, input, options));
}

export function addDecisionEdge(state: TripState, input: DecisionEdge): TripState {
  return assertTripState(invoke("addDecisionEdge", state, input));
}

export function addEvidenceClaim(state: TripState, input: EvidenceClaimInput, options: RuntimeOptions = {}): TripState {
  return assertTripState(invoke("addEvidenceClaim", state, input, options));
}

export function recordOfferSnapshot(state: TripState, input: OfferSnapshotInput, options: RuntimeOptions = {}): TripState {
  return assertTripState(invoke("recordOfferSnapshot", state, input, options));
}

export function computeDirtySet(state: TripState, changedNodeIds: string[]): string[] {
  const result = invoke("computeDirtySet", state, changedNodeIds);
  if (!Array.isArray(result) || result.some((value) => typeof value !== "string")) throw new Error("invalid_dirty_set");
  return result;
}

export function enqueueAffectedTaskChains(state: TripState, changedNodeIds: string[], options: RuntimeOptions = {}): TripState {
  return assertTripState(invoke("enqueueAffectedTaskChains", state, changedNodeIds, options));
}

export function buildTravelContextPack(state: TripState, request: TravelContextRequest): TravelContextPack {
  return assertSchema(TravelContextPackSchema, invoke("buildTravelContextPack", state, request), "invalid_travel_context_pack");
}

export function needsContext(input: NeedsContextInput): NeedsContext {
  return assertSchema(NeedsContextSchema, invoke("needsContext", input), "invalid_needs_context");
}

export function validateTripPatch(state: TripState, proposal: TripPatchProposal, options: RuntimeOptions = {}): TripValidation {
  return assertSchema(TripValidationSchema, invoke("validateTripPatch", state, proposal, options), "invalid_trip_validation");
}

export function validateTripCoherence(state: TripState): TripQa {
  return assertSchema(TripQaSchema, invoke("validateTripCoherence", state), "invalid_trip_qa");
}

export function commitTripPatch(state: TripState, proposal: TripPatchProposal, options: RuntimeOptions = {}): TripCommitResult {
  return assertSchema(TripCommitResultSchema, invoke("commitTripPatch", state, proposal, options), "invalid_trip_commit_result");
}

export function stageTripPatch(state: TripState, proposal: TripPatchProposal, options: RuntimeOptions = {}): TripProposalResult {
  return assertSchema(TripProposalResultSchema, invoke("stageTripPatch", state, proposal, options), "invalid_trip_proposal_result");
}

export function acceptStagedTripPatch(
  state: TripState,
  proposalId: string,
  options: RuntimeOptions & { selections?: Partial<Record<(typeof FOUR_DOMAINS)[number], string>> } = {},
): TripCommitResult {
  return assertSchema(TripCommitResultSchema, invoke("acceptStagedTripPatch", state, proposalId, options), "invalid_trip_commit_result");
}

export function rejectStagedTripPatch(state: TripState, proposalId: string, options: RuntimeOptions = {}): TripProposalResult {
  return assertSchema(TripProposalResultSchema, invoke("rejectStagedTripPatch", state, proposalId, options), "invalid_trip_proposal_result");
}

export function recordBookingConfirmation(state: TripState, input: BookingConfirmationInput, options: RuntimeOptions = {}): TripCommitResult {
  return assertSchema(TripCommitResultSchema, invoke("recordBookingConfirmation", state, input, options), "invalid_trip_commit_result");
}

export function recordTripFeedback(state: TripState, input: TripFeedbackInput, options: RuntimeOptions = {}): TripCommitResult {
  return assertSchema(TripCommitResultSchema, invoke("recordTripFeedback", state, input, options), "invalid_trip_commit_result");
}
