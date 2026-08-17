import type {
  DecisionNode,
  MobilityObservation,
  TripBrief,
  TripPatchProposal,
  TripQa,
  TripState,
  Traveler,
  TravelDomain,
} from "../contracts/index.js";

export interface CreateTripInput {
  tripId?: string;
  brief?: TripBrief;
  travelers?: Array<Partial<Traveler>>;
  ownerUserId?: string;
  memberUserIds?: string[];
}

export interface UpdateTripScopeServiceInput {
  tripId: string;
  brief?: Partial<TripBrief>;
  travelerCount?: number;
  travelerProfiles?: Array<Partial<Traveler>>;
  language?: string;
  foreignGuestRequired?: boolean;
}

export interface TripControlView {
  schemaVersion: "trip-control-view-v1";
  tripId: string;
  revision: number;
  storageVersion: number;
  activeBranchId: string;
  brief: TripBrief;
  travelers: Traveler[];
  openDecisions: TripState["openDecisions"];
  dirtySet: string[];
  taskQueues: TripState["taskQueues"];
  pendingProposals: Array<Omit<TripPatchProposal, "operations"> & { operationCount: number }>;
  weather: TripState["environment"]["weather"];
  mobility: TripState["environment"]["mobility"];
  providerStatus: "configured" | "provider_unavailable";
}

export interface TripPlanView {
  schemaVersion: "trip-plan-view-v1";
  tripId: string;
  revision: number;
  byDomain: { play: DecisionNode[]; food: DecisionNode[]; stay: DecisionNode[]; transport: DecisionNode[] };
  budget: TripQa["budget"];
  qa: TripQa;
  fulfillment: TripState["fulfillmentEvents"];
  pendingProposals: object[];
  transitSegments: object[];
  mapPreviewAvailable: boolean;
  weather: TripState["environment"]["weather"];
  mobility: TripState["environment"]["mobility"];
}

export interface ResearchTripOptionsInput {
  tripId: string;
  capability?: string;
  query?: string;
  question?: string;
  domains?: TravelDomain[];
}

export type ResearchTripOptionsResult =
  | { schemaVersion: "travel-research-proposal-result-v1"; status: "proposed"; tripId: string; revision: number; proposal: object; fabricatedResults: false }
  | { schemaVersion: "travel-provider-result-v1"; status: string; tripId: string; revision: number; fabricatedResults: false };

export interface TripMutationResult {
  schemaVersion: string;
  status: string;
  tripId?: string;
  revision?: number;
  validation?: object;
  qa?: TripQa;
}

export interface TravelServicePort {
  createTrip(input?: CreateTripInput): Promise<TripControlView>;
  updateTripScope(input: UpdateTripScopeServiceInput): Promise<TripControlView>;
  listTrips(input?: { userId?: string }): Promise<object>;
  getTripControlView(tripId: string): Promise<TripControlView>;
  getTripPlanView(tripId: string): Promise<TripPlanView>;
  renderTripMap(tripId: string): Promise<unknown>;
  refreshTripMobility(input: { tripId: string }): Promise<{ schemaVersion: "trip-mobility-refresh-result-v1"; status: MobilityObservation["status"]; tripId: string; revision: number; mobility: MobilityObservation; qa: TripQa; fabricatedResults: false }>;
  getOpenDecisions(tripId: string): Promise<object>;
  researchTripOptions(input: ResearchTripOptionsInput): Promise<ResearchTripOptionsResult>;
  proposeTripChange(input: { tripId: string; proposal: TripPatchProposal }, actor?: string): Promise<TripMutationResult>;
  acceptTripChange(input: { tripId: string; proposalId: string; selections?: Partial<{ play: string; food: string; stay: string; transport: string }> }): Promise<TripMutationResult>;
  rejectTripChange(input: { tripId: string; proposalId: string }): Promise<TripMutationResult>;
  prepareBookingHandoff(input: { tripId: string; nodeId: string; offerId: string; explicitUserConfirmation: true }): Promise<object>;
  recordBookingConfirmation(input: { tripId: string; nodeId: string; offerId?: string; confirmationRef: string; baseRevision: number; explicitUserConfirmation: true }): Promise<TripMutationResult>;
  reportTripDisruption(input: { tripId: string; proposal: TripPatchProposal }, actor?: string): Promise<TripMutationResult>;
  submitTripFeedback(input: { tripId: string; baseRevision: number; category: "personal_experience" | "preference_change" | "fact_correction" | "unverified_public_info"; nodeId?: string; text: string }, actor?: string): Promise<TripMutationResult>;
}

const REQUIRED_METHODS: ReadonlyArray<keyof TravelServicePort> = [
  "createTrip", "updateTripScope", "listTrips", "getTripControlView", "getTripPlanView", "renderTripMap",
  "refreshTripMobility", "getOpenDecisions", "researchTripOptions", "proposeTripChange", "acceptTripChange",
  "rejectTripChange", "prepareBookingHandoff", "recordBookingConfirmation", "reportTripDisruption", "submitTripFeedback",
];

export function assertTravelServicePort(value: unknown): TravelServicePort {
  if (!value || typeof value !== "object" || REQUIRED_METHODS.some((method) => typeof Reflect.get(value, method) !== "function")) {
    throw new Error("invalid_travel_service_port");
  }
  return value as TravelServicePort;
}
