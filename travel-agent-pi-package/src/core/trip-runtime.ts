import * as runtime from "../runtime/trip-runtime-implementation.js";
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
  type TripFeedbackCategory,
  type TripFeedbackVerdict,
  type TripFeedbackVisibility,
  type TripPatchProposal,
  type TripProposalResult,
  type TripQa,
  type ReadinessSignalId,
  type ReadinessSignalStatus,
  type TripState,
  type Traveler,
  type TravelContextPack,
  type TravelContextRequest,
  type TripValidation,
} from "../contracts/index.js";

export { FOUR_DOMAINS, SOCIAL_ERROR_CODES };

export type Clock = Date | string | number | (() => Date | string | number);
export interface RuntimeOptions { clock?: Clock }

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

export interface UpdateTripReadinessInput {
  signalId?: ReadinessSignalId;
  status?: ReadinessSignalStatus;
  signals?: Partial<Record<ReadinessSignalId, ReadinessSignalStatus>>;
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
  category: TripFeedbackCategory;
  nodeId?: string;
  text: string;
  visibility?: TripFeedbackVisibility;
  verdict?: TripFeedbackVerdict;
  tags?: string[];
  spendCny?: number;
  waitMinutes?: number;
  visitDate?: string;
}

export function createTripControlState(input: CreateTripControlStateInput = {}): TripState {
  return assertTripState(runtime.createTripControlState(input));
}

export function applyWeatherObservation(state: TripState, observation: object, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.applyWeatherObservation(state, observation as Record<string, unknown>, options));
}

export function applyMobilityObservation(state: TripState, observation: MobilityObservation, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.applyMobilityObservation(state, observation, options));
}

export function updateTripControlScope(state: TripState, input: UpdateTripScopeInput = {}, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.updateTripControlScope(state, input, options));
}

export function updateTripReadiness(state: TripState, input: UpdateTripReadinessInput, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.updateTripReadiness(state, input, options));
}

export function addDecisionNode(state: TripState, input: DecisionNodeInput, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.addDecisionNode(state, input, options));
}

export function addDecisionEdge(state: TripState, input: DecisionEdge): TripState {
  return assertTripState(runtime.addDecisionEdge(state, input));
}

export function addEvidenceClaim(state: TripState, input: EvidenceClaimInput, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.addEvidenceClaim(state, input, options));
}

export function recordOfferSnapshot(state: TripState, input: OfferSnapshotInput, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.recordOfferSnapshot(state, input, options));
}

export function computeDirtySet(state: TripState, changedNodeIds: string[]): string[] {
  const result = runtime.computeDirtySet(state, changedNodeIds);
  if (!Array.isArray(result) || result.some((value) => typeof value !== "string")) throw new Error("invalid_dirty_set");
  return result;
}

export function enqueueAffectedTaskChains(state: TripState, changedNodeIds: string[], options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.enqueueAffectedTaskChains(state, changedNodeIds, options));
}

export function buildTravelContextPack(state: TripState, request: TravelContextRequest): TravelContextPack {
  return assertSchema(TravelContextPackSchema, runtime.buildTravelContextPack(state, request), "invalid_travel_context_pack");
}

export function needsContext(input: NeedsContextInput): NeedsContext {
  return assertSchema(NeedsContextSchema, runtime.needsContext(input), "invalid_needs_context");
}

export function validateTripPatch(state: TripState, proposal: TripPatchProposal, options: RuntimeOptions = {}): TripValidation {
  return assertSchema(TripValidationSchema, runtime.validateTripPatch(state, proposal, options), "invalid_trip_validation");
}

export function validateTripCoherence(state: TripState): TripQa {
  return assertSchema(TripQaSchema, runtime.validateTripCoherence(state), "invalid_trip_qa");
}

export function estimateTripBudget(state: TripState): TripState["budgetLedger"] {
  return assertSchema(TripStateSchema.properties.budgetLedger, runtime.estimateTripBudget(state), "invalid_trip_budget");
}

export function commitTripPatch(state: TripState, proposal: TripPatchProposal, options: RuntimeOptions = {}): TripCommitResult {
  return assertSchema(TripCommitResultSchema, runtime.commitTripPatch(state, proposal, options), "invalid_trip_commit_result");
}

export function stageTripPatch(state: TripState, proposal: TripPatchProposal, options: RuntimeOptions = {}): TripProposalResult {
  return assertSchema(TripProposalResultSchema, runtime.stageTripPatch(state, proposal, options), "invalid_trip_proposal_result");
}

export function acceptStagedTripPatch(
  state: TripState,
  proposalId: string,
  options: RuntimeOptions & { selections?: Partial<Record<(typeof FOUR_DOMAINS)[number], string>>; partial?: boolean } = {},
): TripCommitResult {
  return assertSchema(TripCommitResultSchema, runtime.acceptStagedTripPatch(state, proposalId, options), "invalid_trip_commit_result");
}

export function rejectStagedTripPatch(state: TripState, proposalId: string, options: RuntimeOptions = {}): TripProposalResult {
  return assertSchema(TripProposalResultSchema, runtime.rejectStagedTripPatch(state, proposalId, options), "invalid_trip_proposal_result");
}

export function supersedeStagedTripPatch(state: TripState, proposalId: string, reason: string, options: RuntimeOptions = {}): TripState {
  return assertTripState(runtime.supersedeStagedTripPatch(state, proposalId, reason, options));
}

export function recordBookingConfirmation(state: TripState, input: BookingConfirmationInput, options: RuntimeOptions = {}): TripCommitResult {
  return assertSchema(TripCommitResultSchema, runtime.recordBookingConfirmation(state, input, options), "invalid_trip_commit_result");
}

export function recordTripFeedback(state: TripState, input: TripFeedbackInput, options: RuntimeOptions = {}): TripCommitResult {
  return assertSchema(TripCommitResultSchema, runtime.recordTripFeedback(state, input, options), "invalid_trip_commit_result");
}
