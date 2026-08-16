export const FOUR_DOMAINS: readonly string[];
export const SOCIAL_ERROR_CODES: readonly string[];

export type TripState = Record<string, unknown>;
export type TripPatchProposal = Record<string, unknown>;

export function createTripControlState(input?: Record<string, unknown>): TripState;
export function updateTripControlScope(state: TripState, input?: Record<string, unknown>, options?: Record<string, unknown>): TripState;
export function addDecisionNode(state: TripState, input: Record<string, unknown>, options?: Record<string, unknown>): TripState;
export function addDecisionEdge(state: TripState, input: Record<string, unknown>): TripState;
export function addEvidenceClaim(state: TripState, input: Record<string, unknown>, options?: Record<string, unknown>): TripState;
export function recordOfferSnapshot(state: TripState, input: Record<string, unknown>, options?: Record<string, unknown>): TripState;
export function computeDirtySet(state: TripState, changedNodeIds: string[]): string[];
export function enqueueAffectedTaskChains(state: TripState, changedNodeIds: string[], options?: Record<string, unknown>): TripState;
export function buildTravelContextPack(state: TripState, input?: Record<string, unknown>): Record<string, unknown>;
export function needsContext(input: Record<string, unknown>): Record<string, unknown>;
export function validateTripPatch(state: TripState, proposal: TripPatchProposal, options?: Record<string, unknown>): Record<string, unknown>;
export function validateTripCoherence(state: TripState): Record<string, unknown>;
export function commitTripPatch(state: TripState, proposal: TripPatchProposal, options?: Record<string, unknown>): Record<string, unknown>;
export function stageTripPatch(state: TripState, proposal: TripPatchProposal, options?: Record<string, unknown>): Record<string, unknown>;
export function acceptStagedTripPatch(state: TripState, proposalId: string, options?: Record<string, unknown>): Record<string, unknown>;
export function rejectStagedTripPatch(state: TripState, proposalId: string, options?: Record<string, unknown>): Record<string, unknown>;
export function recordBookingConfirmation(state: TripState, input: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
export function recordTripFeedback(state: TripState, input: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
