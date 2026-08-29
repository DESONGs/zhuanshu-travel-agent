import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";

export const FOUR_DOMAINS = ["play", "food", "stay", "transport"] as const;
export const SOCIAL_ERROR_CODES = [
  "AUTH_REQUIRED",
  "CHALLENGE",
  "RATE_LIMITED",
  "SOURCE_CHANGED",
  "SOURCE_UNAVAILABLE",
  "TERMS_BLOCKED",
  "EMPTY_VERIFIED",
] as const;

export const DomainSchema = Type.Union(FOUR_DOMAINS.map((domain) => Type.Literal(domain)), { $id: "TravelDomain" });
export type TravelDomain = Static<typeof DomainSchema>;

export const PriceQualitySchema = Type.Union([
  Type.Literal("firm"),
  Type.Literal("reference"),
  Type.Literal("estimate"),
  Type.Literal("unknown"),
], { $id: "TravelPriceQuality" });
export type PriceQuality = Static<typeof PriceQualitySchema>;

export const TravelPriceSchema = Type.Object({
  amount: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  currency: Type.String({ minLength: 3, maxLength: 8 }),
  quality: PriceQualitySchema,
  basis: Type.Optional(Type.Union([Type.String({ maxLength: 240 }), Type.Null()])),
  checkedAt: Type.Optional(Type.Union([Type.String({ minLength: 10, maxLength: 40 }), Type.Null()])),
}, { $id: "TravelPrice", additionalProperties: false });
export type TravelPrice = Static<typeof TravelPriceSchema>;

export const BudgetDomainSchema = Type.Union([
  Type.Literal("stay"), Type.Literal("transport"), Type.Literal("food"), Type.Literal("play"), Type.Literal("other"),
]);

export const BudgetBucketSchema = Type.Object({
  committed: Type.Number({ minimum: 0 }),
  estimated: Type.Number({ minimum: 0 }),
  quality: PriceQualitySchema,
  basis: Type.Array(Type.String({ maxLength: 240 }), { maxItems: 12 }),
  unknownCount: Type.Integer({ minimum: 0 }),
}, { $id: "TravelBudgetBucket", additionalProperties: false });
export type BudgetBucket = Static<typeof BudgetBucketSchema>;

export const IdentifierSchema = Type.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9_.:-]+$" });
export const IsoTimestampSchema = Type.String({ minLength: 10, maxLength: 40 });
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const ExtensibleObjectSchema = Type.Object({}, { additionalProperties: true });

export const TripBriefSchema = Type.Object({
  destination: Type.Optional(NullableStringSchema),
  dates: Type.Optional(NullableStringSchema),
  origin: Type.Optional(NullableStringSchema),
  arrivalMode: Type.Optional(NullableStringSchema),
  arrivalAirport: Type.Optional(NullableStringSchema),
  arrivalTerminal: Type.Optional(NullableStringSchema),
  arrivalTime: Type.Optional(NullableStringSchema),
  arrivalConfirmed: Type.Optional(Type.Boolean()),
  intercityBooked: Type.Optional(Type.Boolean()),
  partyProfile: Type.Optional(NullableStringSchema),
  pace: Type.Optional(NullableStringSchema),
  lodgingPreference: Type.Optional(NullableStringSchema),
  currency: Type.Optional(NullableStringSchema),
  durationDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 60 })),
  totalBudget: Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  foodPreferences: Type.Optional(Type.Array(Type.String({ maxLength: 120 }), { maxItems: 12 })),
}, { $id: "TripBrief", additionalProperties: true });
export type TripBrief = Static<typeof TripBriefSchema>;

const ResearchTextListSchema = Type.Array(Type.String({ minLength: 1, maxLength: 120 }), { maxItems: 12 });
const ResearchAnchorCoordinateSchema = Type.Object({
  label: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  longitude: Type.Number({ minimum: -180, maximum: 180 }),
  latitude: Type.Number({ minimum: -90, maximum: 90 }),
}, { additionalProperties: false });

export const ResearchDomainCriteriaInputSchema = Type.Object({
  keywords: Type.Optional(ResearchTextListSchema),
  namedEntities: Type.Optional(ResearchTextListSchema),
  targetAreas: Type.Optional(ResearchTextListSchema),
  anchorCoordinates: Type.Optional(Type.Array(ResearchAnchorCoordinateSchema, { maxItems: 6 })),
  hardConstraints: Type.Optional(ResearchTextListSchema),
  preferenceHints: Type.Optional(ResearchTextListSchema),
}, { $id: "ResearchDomainCriteriaInput", additionalProperties: false });
export type ResearchDomainCriteriaInput = Static<typeof ResearchDomainCriteriaInputSchema>;

export const ResearchCriteriaInputSchema = Type.Object({
  byDomain: Type.Optional(Type.Object({
    play: Type.Optional(ResearchDomainCriteriaInputSchema),
    food: Type.Optional(ResearchDomainCriteriaInputSchema),
    stay: Type.Optional(ResearchDomainCriteriaInputSchema),
    transport: Type.Optional(ResearchDomainCriteriaInputSchema),
  }, { additionalProperties: false })),
  intercityIntent: Type.Optional(Type.Union([
    Type.Literal("flight"), Type.Literal("train"), Type.Literal("flexible"), Type.Literal("none"),
  ])),
  localMobilityIntent: Type.Optional(Type.Array(Type.Union([
    Type.Literal("transit"), Type.Literal("taxi"), Type.Literal("walk"), Type.Literal("accessible_transit"), Type.Literal("flexible"),
  ]), { maxItems: 5 })),
  arrival: Type.Optional(Type.Object({
    airport: Type.Optional(Type.String({ maxLength: 120 })),
    terminal: Type.Optional(Type.String({ maxLength: 40 })),
    time: Type.Optional(Type.String({ maxLength: 40 })),
    confirmed: Type.Optional(Type.Boolean()),
  }, { additionalProperties: false })),
}, { $id: "ResearchCriteriaInput", additionalProperties: false });
export type ResearchCriteriaInput = Static<typeof ResearchCriteriaInputSchema>;

const NormalizedResearchDomainCriteriaSchema = Type.Object({
  keywords: ResearchTextListSchema,
  namedEntities: ResearchTextListSchema,
  targetAreas: ResearchTextListSchema,
  anchorCoordinates: Type.Array(ResearchAnchorCoordinateSchema, { maxItems: 6 }),
  hardConstraints: ResearchTextListSchema,
  preferenceHints: ResearchTextListSchema,
}, { additionalProperties: false });

export const TravelResearchCriteriaSchema = Type.Object({
  schemaVersion: Type.Literal("travel-research-criteria-v1"),
  origin: NullableStringSchema,
  destination: Type.String({ minLength: 1, maxLength: 120 }),
  dates: NullableStringSchema,
  partySize: Type.Union([Type.Integer({ minimum: 1, maximum: 12 }), Type.Null()]),
  budgetCny: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  travelerConstraintHints: ResearchTextListSchema,
  byDomain: Type.Object({
    play: NormalizedResearchDomainCriteriaSchema,
    food: NormalizedResearchDomainCriteriaSchema,
    stay: NormalizedResearchDomainCriteriaSchema,
    transport: NormalizedResearchDomainCriteriaSchema,
  }, { additionalProperties: false }),
  intercityIntent: Type.Union([
    Type.Literal("flight"), Type.Literal("train"), Type.Literal("flexible"), Type.Literal("none"),
  ]),
  localMobilityIntent: Type.Array(Type.Union([
    Type.Literal("transit"), Type.Literal("taxi"), Type.Literal("walk"), Type.Literal("accessible_transit"), Type.Literal("flexible"),
  ]), { maxItems: 5 }),
  arrival: Type.Object({
    airport: NullableStringSchema,
    terminal: NullableStringSchema,
    time: NullableStringSchema,
    confirmed: Type.Boolean(),
  }, { additionalProperties: false }),
  fingerprint: IdentifierSchema,
  domainFingerprints: Type.Object({
    play: IdentifierSchema,
    food: IdentifierSchema,
    stay: IdentifierSchema,
    transport: IdentifierSchema,
  }, { additionalProperties: false }),
}, { $id: "TravelResearchCriteria", additionalProperties: false });
export type TravelResearchCriteria = Static<typeof TravelResearchCriteriaSchema>;

export const ReadinessSignalIdSchema = Type.Union([
  Type.Literal("travel_documents"),
  Type.Literal("mobile_access"),
  Type.Literal("cashless_access"),
  Type.Literal("china_account_continuity"),
]);
export type ReadinessSignalId = Static<typeof ReadinessSignalIdSchema>;

export const ReadinessSignalStatusSchema = Type.Union([
  Type.Literal("unknown"),
  Type.Literal("ready"),
  Type.Literal("needs_help"),
  Type.Literal("not_applicable"),
]);
export type ReadinessSignalStatus = Static<typeof ReadinessSignalStatusSchema>;

export const TripReadinessStateSchema = Type.Object({
  schemaVersion: Type.Literal("trip-readiness-state-v1"),
  version: Type.Integer({ minimum: 0 }),
  signals: Type.Object({
    travel_documents: ReadinessSignalStatusSchema,
    mobile_access: ReadinessSignalStatusSchema,
    cashless_access: ReadinessSignalStatusSchema,
    china_account_continuity: ReadinessSignalStatusSchema,
  }, { additionalProperties: false }),
  updatedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
}, { $id: "TripReadinessState", additionalProperties: false });
export type TripReadinessState = Static<typeof TripReadinessStateSchema>;

const MobilityCareSchema = Type.Object({
  reduceWalking: Type.Optional(Type.Boolean()),
  avoidStairs: Type.Optional(Type.Boolean()),
  stepFreeRequired: Type.Optional(Type.Boolean()),
  wheelchairSpaceRequired: Type.Optional(Type.Boolean()),
  luggageAssistanceRequired: Type.Optional(Type.Boolean()),
  maxContinuousWalkMeters: Type.Optional(Type.Integer({ minimum: 50, maximum: 20_000 })),
  maxTransfers: Type.Optional(Type.Integer({ minimum: 0, maximum: 8 })),
}, { additionalProperties: false });

const StaminaCareSchema = Type.Object({
  needsFrequentRest: Type.Optional(Type.Boolean()),
  restEveryMinutes: Type.Optional(Type.Integer({ minimum: 10, maximum: 240 })),
  maxActiveMinutesPerBlock: Type.Optional(Type.Integer({ minimum: 20, maximum: 720 })),
}, { additionalProperties: false });

const ScheduleCareSchema = Type.Object({
  regularMealTimes: Type.Optional(Type.Boolean()),
  earliestStartTime: Type.Optional(Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" })),
  latestReturnTime: Type.Optional(Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" })),
  latestDinnerTime: Type.Optional(Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" })),
}, { additionalProperties: false });

const FacilitiesCareSchema = Type.Object({
  accessibleToiletRequired: Type.Optional(Type.Boolean()),
  toiletAccessPriority: Type.Optional(Type.Boolean()),
  nursingRoomRequired: Type.Optional(Type.Boolean()),
  strollerFriendlyRequired: Type.Optional(Type.Boolean()),
  quietRetreatRequired: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const SensoryCareSchema = Type.Object({
  avoidCrowds: Type.Optional(Type.Boolean()),
  avoidStrongSensoryStimuli: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });

const FoodCareSchema = Type.Object({
  exclusions: Type.Optional(Type.Array(Type.String({ maxLength: 80 }), { maxItems: 12 })),
}, { additionalProperties: false });

export const TravelerCareNeedsSchema = Type.Object({
  mobility: Type.Optional(MobilityCareSchema),
  stamina: Type.Optional(StaminaCareSchema),
  schedule: Type.Optional(ScheduleCareSchema),
  facilities: Type.Optional(FacilitiesCareSchema),
  sensory: Type.Optional(SensoryCareSchema),
  food: Type.Optional(FoodCareSchema),
}, { $id: "TravelerCareNeeds", additionalProperties: false });
export type TravelerCareNeeds = Static<typeof TravelerCareNeedsSchema>;

const ConstraintSchema = Type.Object({ type: Type.Optional(Type.String({ maxLength: 120 })) }, { additionalProperties: true });
const PreferenceSchema = Type.Object({}, { additionalProperties: true });

export const TravelerSchema = Type.Object({
  travelerId: IdentifierSchema,
  displayName: Type.String({ minLength: 1, maxLength: 40 }),
  relationship: NullableStringSchema,
  role: Type.String({ minLength: 1, maxLength: 40 }),
  language: Type.String({ minLength: 1, maxLength: 24 }),
  hardConstraints: Type.Array(ConstraintSchema),
  softPreferences: Type.Array(PreferenceSchema),
  careNeeds: TravelerCareNeedsSchema,
  operability: ExtensibleObjectSchema,
}, { $id: "Traveler", additionalProperties: false });
export type Traveler = Static<typeof TravelerSchema>;

export const MediaItemSchema = Type.Object({
  url: Type.String({ minLength: 1, maxLength: 2_000 }),
  title: Type.String({ maxLength: 200 }),
  source: Type.String({ maxLength: 120 }),
}, { additionalProperties: false });

export const LocationSchema = Type.Object({
  name: Type.Optional(Type.String({ maxLength: 300 })),
  address: Type.Optional(Type.String({ maxLength: 500 })),
  coordinates: Type.Optional(Type.Object({
    longitude: Type.Number({ minimum: -180, maximum: 180 }),
    latitude: Type.Number({ minimum: -90, maximum: 90 }),
    coordinateSystem: Type.Optional(Type.Literal("GCJ-02")),
  }, { additionalProperties: false })),
}, { additionalProperties: true });
export const LocationValueSchema = Type.Union([LocationSchema, Type.String(), Type.Null()]);

export const DecisionNodeSchema = Type.Object({
  nodeId: IdentifierSchema,
  domain: DomainSchema,
  kind: Type.String({ maxLength: 120 }),
  title: Type.String({ maxLength: 200 }),
  summary: Type.String({ maxLength: 1_000 }),
  status: Type.String({ maxLength: 80 }),
  selected: Type.Boolean(),
  lock: Type.Union([Type.Object({ kind: Type.String(), confirmationRef: Type.Optional(Type.String()) }, { additionalProperties: true }), Type.Null()]),
  offerRef: NullableStringSchema,
  foreignGuestEligible: Type.Union([Type.Boolean(), Type.Null()]),
  claimRefs: Type.Array(Type.String()),
  sourceRefs: Type.Array(Type.String()),
  sourceStatus: Type.String(),
  travelerIds: Type.Array(IdentifierSchema),
  impactsNodeIds: Type.Array(IdentifierSchema),
  operability: ExtensibleObjectSchema,
  spoilerLevel: Type.String(),
  time: Type.Union([Type.String(), Type.Null()]),
  location: LocationValueSchema,
  media: Type.Array(MediaItemSchema, { maxItems: 6 }),
  price: TravelPriceSchema,
  // Numeric mirror retained for persisted v1 consumers during the migration.
  cost: Type.Number(),
  version: Type.Integer({ minimum: 1 }),
  updatedAt: IsoTimestampSchema,
}, { $id: "DecisionNode", additionalProperties: true });
export type DecisionNode = Static<typeof DecisionNodeSchema>;

export const DecisionNodeInputSchema = Type.Partial(Type.Omit(DecisionNodeSchema, ["version", "updatedAt"]), { $id: "DecisionNodeInput" });
export type DecisionNodeInput = Static<typeof DecisionNodeInputSchema>;

export const TripFeedbackCategorySchema = Type.Union([
  Type.Literal("personal_experience"),
  Type.Literal("preference_change"),
  Type.Literal("fact_correction"),
  Type.Literal("unverified_public_info"),
]);
export type TripFeedbackCategory = Static<typeof TripFeedbackCategorySchema>;

export const TripFeedbackVerdictSchema = Type.Union([
  Type.Literal("recommend"),
  Type.Literal("mixed"),
  Type.Literal("not_recommend"),
]);
export type TripFeedbackVerdict = Static<typeof TripFeedbackVerdictSchema>;

export const TripFeedbackVisibilitySchema = Type.Union([
  Type.Literal("trip_only"),
  Type.Literal("anonymous_travelers"),
]);
export type TripFeedbackVisibility = Static<typeof TripFeedbackVisibilitySchema>;

export const TripFeedbackPlaceSchema = Type.Object({
  nodeId: IdentifierSchema,
  domain: DomainSchema,
  title: Type.String({ minLength: 1, maxLength: 200 }),
  sourceRefs: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1, maxItems: 12 }),
  location: Type.Optional(LocationValueSchema),
}, { $id: "TripFeedbackPlace", additionalProperties: false });
export type TripFeedbackPlace = Static<typeof TripFeedbackPlaceSchema>;

export const TripFeedbackRecordSchema = Type.Object({
  feedbackId: IdentifierSchema,
  category: TripFeedbackCategorySchema,
  nodeId: Type.Union([IdentifierSchema, Type.Null()]),
  text: Type.String({ minLength: 1, maxLength: 2_000 }),
  memoryStatus: Type.String({ minLength: 1, maxLength: 80 }),
  recordedAt: IsoTimestampSchema,
  visibility: Type.Optional(TripFeedbackVisibilitySchema),
  place: Type.Optional(TripFeedbackPlaceSchema),
  verdict: Type.Optional(TripFeedbackVerdictSchema),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 8 })),
  spendCny: Type.Optional(Type.Number({ minimum: 0, maximum: 1_000_000 })),
  waitMinutes: Type.Optional(Type.Integer({ minimum: 0, maximum: 1_440 })),
  visitDate: Type.Optional(Type.String({ pattern: "^20\\d{2}-\\d{2}-\\d{2}$" })),
}, { $id: "TripFeedbackRecord", additionalProperties: false });
export type TripFeedbackRecord = Static<typeof TripFeedbackRecordSchema>;

export const PlaceVisitFeedbackSummarySchema = Type.Object({
  schemaVersion: Type.Literal("place-visit-feedback-summary-v1"),
  experienceCount: Type.Integer({ minimum: 0 }),
  recommendation: Type.Object({
    recommend: Type.Integer({ minimum: 0 }),
    mixed: Type.Integer({ minimum: 0 }),
    notRecommend: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  topTags: Type.Array(Type.Object({
    key: Type.String({ minLength: 1, maxLength: 80 }),
    count: Type.Integer({ minimum: 1 }),
  }, { additionalProperties: false }), { maxItems: 6 }),
  typicalSpendCny: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  typicalWaitMinutes: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  pendingFactCheckCount: Type.Integer({ minimum: 0 }),
  lastRecordedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  evidenceNature: Type.Literal("anonymous_structured_visit_feedback"),
}, { $id: "PlaceVisitFeedbackSummary", additionalProperties: false });
export type PlaceVisitFeedbackSummary = Static<typeof PlaceVisitFeedbackSummarySchema>;

export const DecisionEdgeSchema = Type.Object({
  edgeId: Type.String({ minLength: 1, maxLength: 300 }),
  fromNodeId: IdentifierSchema,
  toNodeId: IdentifierSchema,
  type: Type.String({ maxLength: 80 }),
}, { $id: "DecisionEdge", additionalProperties: false });
export type DecisionEdge = Static<typeof DecisionEdgeSchema>;

export const EvidenceClaimSchema = Type.Object({
  claimId: IdentifierSchema,
  entityId: IdentifierSchema,
  nodeId: IdentifierSchema,
  kind: Type.String({ maxLength: 120 }),
  statement: Type.String({ maxLength: 1_000 }),
  sourceRefs: Type.Array(Type.String()),
  sourceIndependence: Type.String({ maxLength: 120 }),
  commercialBias: Type.String({ maxLength: 120 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  observedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
}, { $id: "EvidenceClaim", additionalProperties: false });
export type EvidenceClaim = Static<typeof EvidenceClaimSchema>;
export const EvidenceClaimInputSchema = Type.Object({
  claimId: IdentifierSchema,
  entityId: IdentifierSchema,
  nodeId: IdentifierSchema,
  kind: Type.Optional(Type.String({ maxLength: 120 })),
  statement: Type.Optional(Type.String({ maxLength: 1_000 })),
  sourceRefs: Type.Optional(Type.Array(Type.String())),
  sourceIndependence: Type.Optional(Type.String({ maxLength: 120 })),
  commercialBias: Type.Optional(Type.String({ maxLength: 120 })),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  observedAt: Type.Optional(IsoTimestampSchema),
}, { $id: "EvidenceClaimInput", additionalProperties: false });
export type EvidenceClaimInput = Static<typeof EvidenceClaimInputSchema>;

const ContentItemSchema = Type.Object({
  contentItemId: IdentifierSchema,
  provider: Type.String(),
  sourceType: Type.String(),
  providerRef: Type.String(),
  checkedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  documentationUrl: NullableStringSchema,
  independenceGroup: Type.String(),
  commercialBias: Type.String(),
}, { additionalProperties: false });

const EvidenceEntitySchema = Type.Object({
  entityId: IdentifierSchema,
  kind: Type.String(),
  canonicalName: Type.String(),
  providerRefs: Type.Array(Type.String()),
}, { additionalProperties: false });

export const EvidenceGraphSchema = Type.Object({
  contentItems: Type.Array(ContentItemSchema),
  claims: Type.Array(EvidenceClaimSchema),
  entities: Type.Array(EvidenceEntitySchema),
}, { $id: "EvidenceGraph", additionalProperties: false });
export type EvidenceGraph = Static<typeof EvidenceGraphSchema>;

export const AccessibilityFeatureSchema = Type.Object({
  kind: Type.String(),
  label: Type.String(),
  status: Type.Literal("mapped_non_realtime"),
  source: Type.String(),
  realTime: Type.Literal(false),
  guidance: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const MobilityStepSchema = Type.Object({
  kind: Type.String(),
  instruction: Type.String(),
  line: Type.Union([Type.String(), Type.Null()]),
  origin: Type.Union([Type.String(), Type.Null()]),
  destination: Type.Union([Type.String(), Type.Null()]),
  distanceMeters: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  durationMinutes: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  walkType: Type.Union([Type.Object({
    code: Type.String(),
    kind: Type.String(),
    label: Type.String(),
  }, { additionalProperties: false }), Type.Null()]),
  accessibilityFeatures: Type.Array(AccessibilityFeatureSchema),
}, { additionalProperties: true });

const MobilityCoordinatesSchema = Type.Object({
  longitude: Type.Number(), latitude: Type.Number(), coordinateSystem: Type.Literal("GCJ-02"),
}, { additionalProperties: false });

export const ItineraryStopRoleSchema = Type.Union([
  Type.Literal("intercity_arrival"),
  Type.Literal("stay_check_in"),
  Type.Literal("stay_departure"),
  Type.Literal("stay_return"),
  Type.Literal("meal"),
  Type.Literal("activity"),
  Type.Literal("local_transport"),
]);
export type ItineraryStopRole = Static<typeof ItineraryStopRoleSchema>;

export const TripItineraryStopSchema = Type.Object({
  stopId: IdentifierSchema,
  nodeId: IdentifierSchema,
  domain: DomainSchema,
  title: Type.String({ minLength: 1, maxLength: 200 }),
  dayIndex: Type.Integer({ minimum: 1, maximum: 60 }),
  date: Type.String({ pattern: "^20\\d{2}-\\d{2}-\\d{2}$" }),
  role: ItineraryStopRoleSchema,
  startAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  endAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  timeSource: Type.Union([
    Type.Literal("provider_schedule"),
    Type.Literal("user_confirmed"),
    Type.Literal("agent_suggested"),
    Type.Literal("derived_route"),
  ]),
  fixed: Type.Boolean(),
  openingHours: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
}, { $id: "TripItineraryStop", additionalProperties: false });
export type TripItineraryStop = Static<typeof TripItineraryStopSchema>;

export const TripItinerarySchema = Type.Object({
  schemaVersion: Type.Literal("trip-itinerary-v1"),
  tripDates: Type.Array(Type.String({ pattern: "^20\\d{2}-\\d{2}-\\d{2}$" }), { minItems: 1, maxItems: 60 }),
  stops: Type.Array(TripItineraryStopSchema, { maxItems: 32 }),
  days: Type.Array(Type.Object({
    dayIndex: Type.Integer({ minimum: 1, maximum: 60 }),
    date: Type.String({ pattern: "^20\\d{2}-\\d{2}-\\d{2}$" }),
    stopIds: Type.Array(IdentifierSchema, { maxItems: 16 }),
  }, { additionalProperties: false }), { maxItems: 60 }),
}, { $id: "TripItinerary", additionalProperties: false });
export type TripItinerary = Static<typeof TripItinerarySchema>;

export const TripFeasibilityIssueSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 120 }),
  severity: Type.Union([Type.Literal("blocking"), Type.Literal("warning")]),
  message: Type.String({ minLength: 1, maxLength: 500 }),
  stopIds: Type.Array(IdentifierSchema, { maxItems: 8 }),
  dayIndex: Type.Union([Type.Integer({ minimum: 1, maximum: 60 }), Type.Null()]),
}, { additionalProperties: false });

export const TripFeasibilitySchema = Type.Object({
  schemaVersion: Type.Literal("trip-feasibility-v1"),
  status: Type.Union([Type.Literal("feasible"), Type.Literal("blocked"), Type.Literal("needs_context")]),
  canConfirm: Type.Boolean(),
  primaryBlocker: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
  issues: Type.Array(TripFeasibilityIssueSchema, { maxItems: 24 }),
  checkedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
}, { $id: "TripFeasibility", additionalProperties: false });
export type TripFeasibility = Static<typeof TripFeasibilitySchema>;

const MobilityPlaceSchema = Type.Object({
  nodeId: Type.Union([Type.String(), Type.Null()]),
  stopId: Type.Optional(Type.Union([IdentifierSchema, Type.Null()])),
  label: Type.String(),
  coordinates: Type.Union([MobilityCoordinatesSchema, Type.Null()]),
  dayIndex: Type.Optional(Type.Union([Type.Integer({ minimum: 1, maximum: 60 }), Type.Null()])),
  date: Type.Optional(Type.Union([Type.String({ pattern: "^20\\d{2}-\\d{2}-\\d{2}$" }), Type.Null()])),
  role: Type.Optional(Type.Union([ItineraryStopRoleSchema, Type.Null()])),
  startAt: Type.Optional(Type.Union([IsoTimestampSchema, Type.Null()])),
  endAt: Type.Optional(Type.Union([IsoTimestampSchema, Type.Null()])),
}, { additionalProperties: false });

export const MobilityAlternativeSchema = Type.Object({
  mode: Type.String(),
  totalMinutes: Type.Number({ minimum: 0 }),
  distanceMeters: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  walkingMeters: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  transfers: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  estimatedFareCny: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  scheduleBasis: Type.Union([Type.Literal("query_time_estimate"), Type.Literal("scheduled_service")]),
  realTimeArrival: Type.Literal(false),
  navigationUrl: Type.Union([Type.String(), Type.Null()]),
  polyline: Type.Array(MobilityCoordinatesSchema),
  steps: Type.Array(MobilityStepSchema),
  accessibilityFeatures: Type.Array(AccessibilityFeatureSchema),
  accessibilityAssessment: Type.Object({
    hasStairs: Type.Boolean(),
    hasElevator: Type.Boolean(),
    hasEscalator: Type.Boolean(),
    hasRamp: Type.Boolean(),
    stepFreeContinuity: Type.Literal("not_verified"),
    realTimeStatus: Type.Literal(false),
  }, { additionalProperties: false }),
}, { additionalProperties: true });

export const MobilityLegSchema = Type.Object({
  legId: Type.String(),
  origin: MobilityPlaceSchema,
  destination: MobilityPlaceSchema,
  recommendedMode: Type.String(),
  rationale: Type.String(),
  alternatives: Type.Array(MobilityAlternativeSchema),
}, { additionalProperties: true });
export type MobilityLeg = Static<typeof MobilityLegSchema>;

export const MobilityObservationSchema = Type.Object({
  schemaVersion: Type.Literal("trip-mobility-v1"),
  status: Type.Union([Type.Literal("completed"), Type.Literal("partial"), Type.Literal("needs_context"), Type.Literal("provider_unavailable")]),
  destination: NullableStringSchema,
  source: Type.String(),
  checkedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  freshUntil: Type.Union([IsoTimestampSchema, Type.Null()]),
  coverage: Type.Object({
    routedNodeIds: Type.Array(Type.String()),
    unresolvedNodeIds: Type.Array(Type.String()),
    routedStopIds: Type.Optional(Type.Array(Type.String())),
    unresolvedStopIds: Type.Optional(Type.Array(Type.String())),
    unscheduled: Type.Boolean(),
  }, { additionalProperties: false }),
  legs: Type.Array(MobilityLegSchema),
  itinerary: Type.Union([TripItinerarySchema, Type.Null()]),
  feasibility: Type.Union([TripFeasibilitySchema, Type.Null()]),
  travelerFit: ExtensibleObjectSchema,
  reason: NullableStringSchema,
  caveats: Type.Array(Type.String()),
  sourceDocumentation: NullableStringSchema,
  fabricatedResults: Type.Literal(false),
}, { $id: "TripMobility", additionalProperties: false });
export type MobilityObservation = Static<typeof MobilityObservationSchema>;

export const TransitFacilitySchema = Type.Object({
  facilityId: IdentifierSchema,
  kind: Type.Union([Type.Literal("elevator"), Type.Literal("toilet"), Type.Literal("locker"), Type.Literal("power_bank"), Type.Literal("accessible_toilet"), Type.Literal("nursing_room")]),
  area: Type.Union([Type.Literal("outside_station"), Type.Literal("unpaid_area"), Type.Literal("paid_area"), Type.Literal("platform")]),
  label: Type.String(),
  distanceMeters: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  status: Type.Union([Type.Literal("available"), Type.Literal("unavailable")]),
  source: Type.String(),
  checkedAt: NullableStringSchema,
  freshUntil: NullableStringSchema,
}, { additionalProperties: false });

export const TransitStepSchema = Type.Object({
  stepId: IdentifierSchema,
  kind: Type.Union([Type.Literal("walk"), Type.Literal("enter_station"), Type.Literal("ride"), Type.Literal("transfer"), Type.Literal("exit_station"), Type.Literal("arrive")]),
  title: Type.String(),
  detail: NullableStringSchema,
  durationMinutes: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  distanceMeters: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  line: NullableStringSchema,
  direction: NullableStringSchema,
  accessible: Type.Boolean(),
  facilities: Type.Array(TransitFacilitySchema),
}, { additionalProperties: false });

export const TransitSegmentSchema = Type.Object({
  schemaVersion: Type.Literal("transit-segment-v1"),
  segmentId: IdentifierSchema,
  status: Type.Union([Type.Literal("ready"), Type.Literal("needs_refresh"), Type.Literal("provider_unavailable")]),
  originLabel: Type.String(),
  destinationLabel: Type.String(),
  totalMinutes: Type.Number({ minimum: 0 }),
  distanceMeters: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  source: Type.String(),
  checkedAt: NullableStringSchema,
  freshUntil: NullableStringSchema,
  travelerFit: Type.Object({ summary: Type.String(), tradeoff: NullableStringSchema, stepFree: Type.Boolean() }, { additionalProperties: false }),
  steps: Type.Array(TransitStepSchema, { minItems: 1, maxItems: 12 }),
}, { $id: "TransitSegment", additionalProperties: false });
export type TransitSegment = Static<typeof TransitSegmentSchema>;

const WeatherObservationSchema = Type.Object({
  status: Type.Optional(Type.String()),
  destination: Type.Optional(NullableStringSchema),
  checkedAt: Type.Optional(NullableStringSchema),
  coverage: Type.Optional(Type.Union([Type.String(), ExtensibleObjectSchema])),
  planningImpact: Type.Optional(ExtensibleObjectSchema),
}, { additionalProperties: true });

const OfferSnapshotSchema = Type.Object({
  offerId: IdentifierSchema,
  nodeId: IdentifierSchema,
  source: Type.String(),
  handoffUrl: NullableStringSchema,
  totalPrice: Type.Number(),
  currency: Type.String(),
  expiresAt: NullableStringSchema,
  checkedAt: IsoTimestampSchema,
  status: Type.String(),
}, { additionalProperties: true });
export const OfferSnapshotInputSchema = Type.Object({
  offerId: IdentifierSchema,
  nodeId: IdentifierSchema,
  source: Type.Optional(Type.String()),
  handoffUrl: Type.Optional(NullableStringSchema),
  totalPrice: Type.Optional(Type.Number({ minimum: 0 })),
  currency: Type.Optional(Type.String()),
  expiresAt: Type.Optional(NullableStringSchema),
  checkedAt: Type.Optional(IsoTimestampSchema),
}, { $id: "OfferSnapshotInput", additionalProperties: false });

const TaskQueueItemSchema = Type.Object({
  workUnitId: Type.String(),
  reason: Type.String(),
  nodeIds: Type.Array(Type.String()),
  createdAt: IsoTimestampSchema,
}, { additionalProperties: false });

const OpenDecisionSchema = Type.Object({
  decisionId: Type.String(),
  domain: DomainSchema,
  status: Type.String(),
  candidateNodeIds: Type.Array(Type.String()),
  selectedNodeIds: Type.Array(Type.String()),
}, { additionalProperties: false });

export const PatchOperationSchema = Type.Union([
  Type.Object({ kind: Type.Literal("add_candidate"), nodeId: IdentifierSchema, node: DecisionNodeInputSchema }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("select"), nodeId: IdentifierSchema, node: Type.Optional(DecisionNodeInputSchema) }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("reject"), nodeId: IdentifierSchema }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("update"), nodeId: IdentifierSchema, changes: ExtensibleObjectSchema }, { additionalProperties: false }),
], { $id: "TripPatchOperation" });
export type PatchOperation = Static<typeof PatchOperationSchema>;

export const TripPatchProposalSchema = Type.Object({
  schemaVersion: Type.Literal("trip-patch-proposal-v1"),
  proposalId: IdentifierSchema,
  tripId: IdentifierSchema,
  baseRevision: Type.Integer({ minimum: 0 }),
  title: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  provider: Type.Optional(NullableStringSchema),
  providerLabel: Type.Optional(NullableStringSchema),
  checkedAt: Type.Optional(NullableStringSchema),
  sourceDocumentation: Type.Optional(NullableStringSchema),
  partial: Type.Optional(Type.Boolean()),
  fixtureOnly: Type.Optional(Type.Boolean()),
  stagedAt: Type.Optional(IsoTimestampSchema),
  caveats: Type.Optional(Type.Array(Type.String())),
  writeSet: Type.Array(IdentifierSchema, { minItems: 1 }),
  writeContract: Type.Object({ allowedNodeIds: Type.Array(IdentifierSchema) }, { additionalProperties: false }),
  readSet: Type.Array(Type.Object({ nodeId: IdentifierSchema, version: Type.Integer({ minimum: 1 }) }, { additionalProperties: false })),
  offerRefs: Type.Optional(Type.Array(IdentifierSchema)),
  overrideLock: Type.Optional(Type.Boolean()),
  operations: Type.Array(PatchOperationSchema, { minItems: 1 }),
  evidenceBundle: Type.Optional(Type.Object({
    contentItems: Type.Array(ContentItemSchema),
    entities: Type.Array(EvidenceEntitySchema),
    claims: Type.Array(EvidenceClaimInputSchema),
  }, { additionalProperties: false })),
  weatherSnapshot: Type.Optional(Type.Union([WeatherObservationSchema, Type.Null()])),
}, { $id: "TripPatchProposal", additionalProperties: true });
export type TripPatchProposal = Static<typeof TripPatchProposalSchema>;

export const TripStateSchema = Type.Object({
  schemaVersion: Type.Literal("trip-control-state-v1"),
  tripId: IdentifierSchema,
  revision: Type.Integer({ minimum: 0 }),
  storageVersion: Type.Integer({ minimum: 0 }),
  activeBranchId: Type.String(),
  brief: TripBriefSchema,
  travelers: Type.Array(TravelerSchema, { maxItems: 12 }),
  nodes: Type.Array(DecisionNodeSchema),
  edges: Type.Array(DecisionEdgeSchema),
  taskQueues: Type.Object({
    play: Type.Array(TaskQueueItemSchema),
    food: Type.Array(TaskQueueItemSchema),
    stay: Type.Array(TaskQueueItemSchema),
    transport: Type.Array(TaskQueueItemSchema),
  }, { additionalProperties: false }),
  openDecisions: Type.Array(OpenDecisionSchema),
  dirtySet: Type.Array(IdentifierSchema),
  budgetLedger: Type.Object({
    currency: Type.String(),
    totalBudget: Type.Union([Type.Number(), Type.Null()]),
    domains: Type.Object({
      stay: BudgetBucketSchema,
      transport: BudgetBucketSchema,
      food: BudgetBucketSchema,
      play: BudgetBucketSchema,
      other: BudgetBucketSchema,
    }, { additionalProperties: false }),
    committed: Type.Number(),
    estimated: Type.Number(),
    exceedsBudget: Type.Boolean(),
  }, { additionalProperties: false }),
  environment: Type.Object({
    weather: Type.Union([WeatherObservationSchema, Type.Null()]),
    mobility: Type.Union([MobilityObservationSchema, Type.Null()]),
    updatedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  }, { additionalProperties: true }),
  readiness: TripReadinessStateSchema,
  fulfillmentLedger: Type.Array(OfferSnapshotSchema),
  evidence: EvidenceGraphSchema,
  pendingProposals: Type.Array(TripPatchProposalSchema),
  proposalHistory: Type.Array(ExtensibleObjectSchema),
  feedbackLedger: Type.Array(TripFeedbackRecordSchema),
  fulfillmentEvents: Type.Array(ExtensibleObjectSchema),
  changeJournal: Type.Array(ExtensibleObjectSchema),
  collaboration: Type.Optional(Type.Object({
    ownerUserId: Type.String(),
    memberUserIds: Type.Array(Type.String()),
    accessMode: Type.Optional(Type.Union([Type.Literal("guest"), Type.Literal("account")])),
    guestExpiresAt: Type.Optional(Type.Union([IsoTimestampSchema, Type.Null()])),
  }, { additionalProperties: false })),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
}, { $id: "TripControlState", additionalProperties: false });
export type TripState = Static<typeof TripStateSchema>;

export const CreateTripControlStateInputSchema = Type.Object({
  tripId: Type.Optional(IdentifierSchema),
  brief: Type.Optional(TripBriefSchema),
  travelers: Type.Optional(Type.Array(Type.Partial(TravelerSchema), { maxItems: 12 })),
}, { $id: "CreateTripControlStateInput", additionalProperties: false });

export const TravelContextRequestSchema = Type.Object({
  workUnitId: IdentifierSchema,
  targetNodeId: IdentifierSchema,
  neighborhoodNodeIds: Type.Optional(Type.Array(IdentifierSchema)),
  travelerIds: Type.Optional(Type.Array(IdentifierSchema)),
  successCriteria: Type.Optional(Type.Array(Type.String())),
  evidenceBudget: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
}, { $id: "TravelContextRequest", additionalProperties: false });
export type TravelContextRequest = Static<typeof TravelContextRequestSchema>;

export const TravelContextPackSchema = Type.Object({
  schemaVersion: Type.Literal("travel-context-pack-v2"),
  contextPackId: Type.String(),
  tripId: IdentifierSchema,
  baseRevision: Type.Integer({ minimum: 0 }),
  workUnit: Type.Object({ workUnitId: IdentifierSchema, targetNodeId: IdentifierSchema, successCriteria: Type.Array(Type.String()) }),
  travelerSlice: Type.Array(TravelerSchema),
  decisionNeighborhood: Type.Object({ nodeIds: Type.Array(IdentifierSchema), nodes: Type.Array(DecisionNodeSchema), edges: Type.Array(DecisionEdgeSchema) }),
  evidenceBundle: Type.Array(EvidenceClaimSchema),
  budgetSlice: TripStateSchema.properties.budgetLedger,
  environmentSlice: TripStateSchema.properties.environment,
  fulfillmentAnchors: Type.Array(OfferSnapshotSchema),
  readSet: Type.Array(Type.Object({ nodeId: IdentifierSchema, version: Type.Integer() })),
  writeContract: Type.Object({ allowedNodeIds: Type.Array(IdentifierSchema), prohibitedLocks: Type.Array(Type.String()) }),
  artifactPointers: Type.Array(Type.String()),
  createdAt: IsoTimestampSchema,
  contextHash: Type.String({ minLength: 64, maxLength: 64 }),
}, { $id: "TravelContextPack", additionalProperties: false });
export type TravelContextPack = Static<typeof TravelContextPackSchema>;

export const NeedsContextSchema = Type.Object({
  schemaVersion: Type.Literal("needs-context-v1"),
  status: Type.Literal("needs_context"),
  missing: Type.Array(Type.String()),
  reason: Type.String(),
  suggestedRetrieval: Type.Array(Type.String()),
}, { $id: "NeedsContext", additionalProperties: false });
export type NeedsContext = Static<typeof NeedsContextSchema>;

export const TripValidationSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true) }, { additionalProperties: true }),
  Type.Object({ ok: Type.Literal(false), reason: Type.String() }, { additionalProperties: true }),
], { $id: "TripValidation" });
export type TripValidation = Static<typeof TripValidationSchema>;

export const TripQaSchema = Type.Object({
  schemaVersion: Type.Literal("travel-qa-v1"),
  status: Type.Union([Type.Literal("pass"), Type.Literal("needs_fix")]),
  missingDomains: Type.Array(DomainSchema),
  hardConstraintViolations: Type.Array(ExtensibleObjectSchema),
  operabilityGaps: Type.Array(ExtensibleObjectSchema),
  mobility: ExtensibleObjectSchema,
  weather: ExtensibleObjectSchema,
  budget: ExtensibleObjectSchema,
}, { $id: "TravelQa", additionalProperties: false });
export type TripQa = Static<typeof TripQaSchema>;

export const TripCommitResultSchema = Type.Object({
  schemaVersion: Type.Literal("trip-commit-result-v1"),
  status: Type.Union([Type.Literal("committed"), Type.Literal("rejected"), Type.Literal("needs_rebase")]),
  state: TripStateSchema,
  validation: Type.Optional(TripValidationSchema),
  qa: Type.Optional(TripQaSchema),
}, { $id: "TripCommitResult", additionalProperties: false });
export type TripCommitResult = Static<typeof TripCommitResultSchema>;

export const TripProposalResultSchema = Type.Object({
  schemaVersion: Type.Literal("trip-proposal-result-v1"),
  status: Type.Union([Type.Literal("proposed"), Type.Literal("rejected"), Type.Literal("rejected_by_user"), Type.Literal("needs_rebase")]),
  state: TripStateSchema,
  validation: Type.Optional(TripValidationSchema),
  proposal: Type.Optional(TripPatchProposalSchema),
}, { $id: "TripProposalResult", additionalProperties: false });
export type TripProposalResult = Static<typeof TripProposalResultSchema>;

export const ProviderCandidateSchema = Type.Object({
  candidateId: Type.Optional(IdentifierSchema),
  claimId: Type.Optional(IdentifierSchema),
  domain: DomainSchema,
  title: Type.String(),
  summary: Type.Optional(Type.String()),
  cost: Type.Optional(Type.Number()),
  price: Type.Optional(TravelPriceSchema),
  location: Type.Optional(LocationValueSchema),
  media: Type.Optional(Type.Array(MediaItemSchema)),
  operability: Type.Optional(ExtensibleObjectSchema),
  checkedAt: Type.Optional(NullableStringSchema),
  sourceId: Type.Optional(IdentifierSchema),
  source: Type.Optional(ExtensibleObjectSchema),
  entity: Type.Optional(ExtensibleObjectSchema),
  claim: Type.Optional(ExtensibleObjectSchema),
}, { $id: "ProviderCandidate", additionalProperties: true });
export type ProviderCandidate = Static<typeof ProviderCandidateSchema>;

export const TravelAnalysisLaneSchema = Type.Union([
  Type.Literal("inventory_budget"),
  Type.Literal("local_discovery"),
  Type.Literal("operability_schedule"),
]);
export type TravelAnalysisLane = Static<typeof TravelAnalysisLaneSchema>;

export const TravelAnalysisCandidateSchema = Type.Object({
  candidateId: IdentifierSchema,
  domain: DomainSchema,
  title: Type.String({ maxLength: 200 }),
  summary: Type.Optional(Type.String({ maxLength: 1_000 })),
  cost: Type.Optional(Type.Number()),
  price: Type.Optional(TravelPriceSchema),
  operability: Type.Optional(ExtensibleObjectSchema),
  evidenceRefs: Type.Array(Type.String({ maxLength: 300 }), { maxItems: 16 }),
}, { additionalProperties: false });
export type TravelAnalysisCandidate = Static<typeof TravelAnalysisCandidateSchema>;

export const TravelAnalysisInputSchema = Type.Object({
  analysisId: IdentifierSchema,
  runId: IdentifierSchema,
  tripId: IdentifierSchema,
  baseRevision: Type.Integer({ minimum: 0 }),
  criteriaFingerprint: Type.String({ minLength: 1, maxLength: 128 }),
  objective: Type.String({ minLength: 1, maxLength: 1_000 }),
  brief: ExtensibleObjectSchema,
  travelers: Type.Array(ExtensibleObjectSchema, { maxItems: 12 }),
  candidates: Type.Array(TravelAnalysisCandidateSchema, { maxItems: 36 }),
  weather: Type.Optional(Type.Union([WeatherObservationSchema, Type.Null()])),
  locks: Type.Array(IdentifierSchema, { maxItems: 36 }),
}, { additionalProperties: false });
export type TravelAnalysisInput = Static<typeof TravelAnalysisInputSchema>;

export const TravelAnalysisFindingSchema = Type.Object({
  findingId: IdentifierSchema,
  summary: Type.String({ minLength: 1, maxLength: 800 }),
  reasonCode: Type.String({ minLength: 1, maxLength: 120 }),
  candidateIds: Type.Array(IdentifierSchema, { maxItems: 16 }),
  evidenceRefs: Type.Array(Type.String({ maxLength: 300 }), { maxItems: 24 }),
}, { additionalProperties: false });
export type TravelAnalysisFinding = Static<typeof TravelAnalysisFindingSchema>;

export const TravelAnalysisLaneResultSchema = Type.Object({
  schemaVersion: Type.Literal("travel-analysis-lane-v1"),
  analysisId: IdentifierSchema,
  runId: IdentifierSchema,
  tripId: IdentifierSchema,
  baseRevision: Type.Integer({ minimum: 0 }),
  criteriaFingerprint: Type.String({ minLength: 1, maxLength: 128 }),
  lane: TravelAnalysisLaneSchema,
  attempt: Type.Integer({ minimum: 1, maximum: 2 }),
  queuedAt: IsoTimestampSchema,
  startedAt: IsoTimestampSchema,
  completedAt: IsoTimestampSchema,
  status: Type.Union([Type.Literal("completed"), Type.Literal("failed"), Type.Literal("timed_out")]),
  model: Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
  queueDurationMs: Type.Number({ minimum: 0 }),
  executionDurationMs: Type.Number({ minimum: 0 }),
  tokenUsage: Type.Union([Type.Object({ input: Type.Number({ minimum: 0 }), output: Type.Number({ minimum: 0 }), total: Type.Number({ minimum: 0 }) }, { additionalProperties: false }), Type.Null()]),
  findings: Type.Array(TravelAnalysisFindingSchema, { maxItems: 20 }),
  recommendedCandidateIds: Type.Array(IdentifierSchema, { maxItems: 24 }),
  rejectedCandidateIds: Type.Array(IdentifierSchema, { maxItems: 24 }),
  reasonCodes: Type.Array(Type.String({ maxLength: 120 }), { maxItems: 24 }),
  unknowns: Type.Array(Type.String({ maxLength: 500 }), { maxItems: 20 }),
  needsContext: Type.Array(Type.String({ maxLength: 300 }), { maxItems: 12 }),
  evidenceRefs: Type.Array(Type.String({ maxLength: 300 }), { maxItems: 48 }),
  skillId: Type.String({ minLength: 1, maxLength: 80 }),
  skillVersion: Type.String({ minLength: 1, maxLength: 80 }),
}, { additionalProperties: false });
export type TravelAnalysisLaneResult = Static<typeof TravelAnalysisLaneResultSchema>;

export const TravelAnalysisFanoutResultSchema = Type.Object({
  schemaVersion: Type.Literal("travel-analysis-fanout-v1"),
  analysisId: IdentifierSchema,
  runId: IdentifierSchema,
  tripId: IdentifierSchema,
  baseRevision: Type.Integer({ minimum: 0 }),
  criteriaFingerprint: Type.String({ minLength: 1, maxLength: 128 }),
  status: Type.Union([Type.Literal("completed"), Type.Literal("partial"), Type.Literal("failed"), Type.Literal("skipped"), Type.Literal("stale_discarded")]),
  engine: Type.Union([Type.Literal("dynamic_workflow"), Type.Literal("pi_subagents"), Type.Literal("fixture")]),
  lanes: Type.Array(TravelAnalysisLaneResultSchema, { maxItems: 3 }),
  requiredLanes: Type.Array(TravelAnalysisLaneSchema, { maxItems: 3 }),
  startedLanes: Type.Array(TravelAnalysisLaneSchema, { maxItems: 3 }),
  completedLanes: Type.Array(TravelAnalysisLaneSchema, { maxItems: 3 }),
  failedLanes: Type.Array(TravelAnalysisLaneSchema, { maxItems: 3 }),
  timedOutLanes: Type.Array(TravelAnalysisLaneSchema, { maxItems: 3 }),
  coverage: Type.Union([Type.Literal("complete"), Type.Literal("partial"), Type.Literal("failed")]),
  degradedReasons: Type.Array(Type.String({ maxLength: 300 }), { maxItems: 12 }),
  joinCount: Type.Union([Type.Literal(0), Type.Literal(1)]),
  joinArtifactId: Type.Union([IdentifierSchema, Type.Null()]),
  taskCount: Type.Integer({ minimum: 0, maximum: 3 }),
  childConcurrency: Type.Integer({ minimum: 1, maximum: 3 }),
  modelFallback: Type.Object({
    primaryStatus: Type.String({ maxLength: 80 }),
    fallbackStatus: Type.String({ maxLength: 80 }),
    fallbackModel: Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
  }, { additionalProperties: false }),
  startedAt: IsoTimestampSchema,
  completedAt: IsoTimestampSchema,
  deadlineAt: IsoTimestampSchema,
  conditionRevision: Type.Object({
    status: Type.Union([Type.Literal("not_needed"), Type.Literal("recommended")]),
    reasonCodes: Type.Array(Type.String({ maxLength: 120 }), { maxItems: 12 }),
  }, { additionalProperties: false }),
  events: Type.Optional(Type.Array(Type.Object({
    type: Type.String({ maxLength: 80 }),
    lane: Type.String({ maxLength: 80 }),
    at: IsoTimestampSchema,
    error: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    attempt: Type.Optional(Type.Integer({ minimum: 1, maximum: 2 })),
    queuedAt: Type.Optional(IsoTimestampSchema),
    queueDurationMs: Type.Optional(Type.Number({ minimum: 0 })),
    executionDurationMs: Type.Optional(Type.Number({ minimum: 0 })),
    model: Type.Optional(Type.Union([Type.String({ maxLength: 160 }), Type.Null()])),
  }, { additionalProperties: false }), { maxItems: 12 })),
}, { additionalProperties: false });
export type TravelAnalysisFanoutResult = Static<typeof TravelAnalysisFanoutResultSchema>;

const ProviderFailureStatusSchema = Type.Union([
  Type.Literal("provider_unavailable"), Type.Literal("AUTH_REQUIRED"), Type.Literal("ACCOUNT_LIMITED"),
  Type.Literal("RATE_LIMITED"), Type.Literal("EMPTY_VERIFIED"), Type.Literal("SOURCE_UNAVAILABLE"),
]);

export const ProviderResultSchema = Type.Union([
  Type.Object({
    schemaVersion: Type.Literal("travel-provider-result-v1"),
    status: Type.Union([Type.Literal("completed"), Type.Literal("partial")]),
    provider: Type.String(),
    providerLabel: Type.Optional(Type.String()),
    destination: Type.Optional(NullableStringSchema),
    checkedAt: Type.Optional(NullableStringSchema),
    byDomain: Type.Object({
      play: Type.Array(ProviderCandidateSchema), food: Type.Array(ProviderCandidateSchema),
      stay: Type.Array(ProviderCandidateSchema), transport: Type.Array(ProviderCandidateSchema),
    }, { additionalProperties: false }),
    partial: Type.Optional(Type.Boolean()),
    fixtureOnly: Type.Optional(Type.Boolean()),
    caveats: Type.Optional(Type.Array(Type.String())),
    errors: Type.Optional(Type.Array(ExtensibleObjectSchema)),
    weather: Type.Optional(Type.Union([WeatherObservationSchema, Type.Null()])),
    sourceDocumentation: Type.Optional(NullableStringSchema),
    fabricatedResults: Type.Literal(false),
  }, { additionalProperties: true }),
  Type.Object({
    schemaVersion: Type.Literal("travel-provider-result-v1"),
    status: ProviderFailureStatusSchema,
    provider: Type.Optional(Type.String()),
    reason: Type.Optional(Type.String()),
    errors: Type.Optional(Type.Array(ExtensibleObjectSchema)),
    fabricatedResults: Type.Literal(false),
  }, { additionalProperties: true }),
], { $id: "ProviderResult" });
export type ProviderResult = Static<typeof ProviderResultSchema>;

export function isSchema<const Schema extends TSchema>(schema: Schema, value: unknown): value is Static<Schema> {
  return Value.Check(schema, value);
}

export function assertSchema<const Schema extends TSchema>(schema: Schema, value: unknown, code: string): Static<Schema> {
  if (!Value.Check(schema, value)) {
    const issues = [...Value.Errors(schema, value)].slice(0, 8).map((issue) => ({ path: issue.instancePath, message: issue.message }));
    throw Object.assign(new Error(code), { code, issues });
  }
  return value;
}

export function assertTripState(value: unknown): TripState {
  return assertSchema(TripStateSchema, value, "invalid_trip_state");
}

export function assertTripPatchProposal(value: unknown): TripPatchProposal {
  return assertSchema(TripPatchProposalSchema, value, "invalid_trip_patch_proposal");
}

export function assertProviderResult(value: unknown): ProviderResult {
  return assertSchema(ProviderResultSchema, value, "invalid_provider_result");
}
