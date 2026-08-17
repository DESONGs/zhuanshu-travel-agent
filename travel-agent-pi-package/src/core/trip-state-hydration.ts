import { FOUR_DOMAINS, assertTripState, type TripState } from "../contracts/index.js";

type UnknownObject = { [key: string]: unknown };

function objectValue(value: unknown): UnknownObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownObject : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Rehydrates fields added after the first persisted trip-control-state-v1 release.
 * It never infers traveler preferences or accepted decisions; only deterministic
 * display/default containers are added before strict schema validation.
 */
export function hydrateStoredTripState(value: unknown): TripState {
  const source = objectValue(value);
  if (!source || source.schemaVersion !== "trip-control-state-v1") throw new Error("invalid_stored_trip");
  const next = structuredClone(source);

  const brief = objectValue(next.brief) ?? {};
  next.brief = brief;

  next.travelers = arrayValue(next.travelers).map((travelerValue, index) => {
    const traveler = objectValue(travelerValue) ?? {};
    return {
      ...traveler,
      travelerId: traveler.travelerId ?? `traveler_${index + 1}`,
      displayName: traveler.displayName ?? `同行人 ${index + 1}`,
      relationship: traveler.relationship ?? null,
      role: traveler.role ?? "traveler",
      language: traveler.language ?? "zh-CN",
      hardConstraints: arrayValue(traveler.hardConstraints),
      softPreferences: arrayValue(traveler.softPreferences),
      careNeeds: objectValue(traveler.careNeeds) ?? {},
      operability: objectValue(traveler.operability) ?? {},
    };
  });

  next.nodes = arrayValue(next.nodes).map((nodeValue) => {
    const node = objectValue(nodeValue) ?? {};
    return { ...node, media: arrayValue(node.media) };
  });
  next.edges = arrayValue(next.edges);
  next.dirtySet = arrayValue(next.dirtySet);
  next.openDecisions = arrayValue(next.openDecisions);
  next.pendingProposals = arrayValue(next.pendingProposals);
  next.proposalHistory = arrayValue(next.proposalHistory);
  next.feedbackLedger = arrayValue(next.feedbackLedger);
  next.fulfillmentLedger = arrayValue(next.fulfillmentLedger);
  next.fulfillmentEvents = arrayValue(next.fulfillmentEvents);
  next.changeJournal = arrayValue(next.changeJournal);

  const queues = objectValue(next.taskQueues) ?? {};
  next.taskQueues = Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, arrayValue(queues[domain])]));
  const evidence = objectValue(next.evidence) ?? {};
  next.evidence = {
    contentItems: arrayValue(evidence.contentItems),
    claims: arrayValue(evidence.claims),
    entities: arrayValue(evidence.entities),
  };
  const environment = objectValue(next.environment) ?? {};
  next.environment = {
    ...environment,
    weather: environment.weather ?? null,
    mobility: environment.mobility ?? null,
    updatedAt: environment.updatedAt ?? null,
  };
  return assertTripState(next);
}
