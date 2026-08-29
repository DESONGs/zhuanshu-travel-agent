import {
  ProviderResultSchema,
  assertSchema,
  type DecisionNode,
  type MobilityObservation,
  type ProviderResult as ProviderResultType,
  type Traveler,
  type TripBrief,
  type TravelResearchCriteria,
  type TravelDomain,
} from "../contracts/index.js";
export type { ProviderResult } from "../contracts/index.js";

export interface TravelResearchInput {
  tripId: string;
  brief: TripBrief;
  travelers: Traveler[];
  domains: TravelDomain[];
  question?: string;
  criteria?: TravelResearchCriteria;
  existingWeather?: object | null;
}

export interface MobilityResearchInput {
  tripId: string;
  brief: TripBrief;
  travelers: Traveler[];
  selectedNodes: DecisionNode[];
}

export interface TravelResearchProvider {
  readonly status: "configured" | "provider_unavailable";
  readonly canRenderMap?: boolean;
  research(input: TravelResearchInput): Promise<ProviderResultType>;
  planMobility?(input: MobilityResearchInput): Promise<MobilityObservation>;
  renderStaticMap?(input: object): Promise<unknown> | unknown;
}

export function normalizeProviderResult(value: unknown): ProviderResultType {
  return assertSchema(ProviderResultSchema, value, "invalid_provider_result");
}
