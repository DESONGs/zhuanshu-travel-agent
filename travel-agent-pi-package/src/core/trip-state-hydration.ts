import { FOUR_DOMAINS, assertTripState, type TripState } from "../contracts/index.js";

type UnknownObject = { [key: string]: unknown };

function objectValue(value: unknown): UnknownObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownObject : null;
}

function optionalObject(value: unknown): UnknownObject {
  if (value === undefined) return {};
  const object = objectValue(value);
  if (!object) throw new Error("invalid_stored_trip");
  return object;
}

function optionalArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("invalid_stored_trip");
  return value;
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

  const brief = optionalObject(next.brief);
  next.brief = brief;

  next.travelers = optionalArray(next.travelers).map((travelerValue, index) => {
    const traveler = optionalObject(travelerValue);
    return {
      ...traveler,
      travelerId: traveler.travelerId ?? `traveler_${index + 1}`,
      displayName: traveler.displayName ?? `同行人 ${index + 1}`,
      relationship: traveler.relationship ?? null,
      role: traveler.role ?? "traveler",
      language: traveler.language ?? "zh-CN",
      hardConstraints: optionalArray(traveler.hardConstraints),
      softPreferences: optionalArray(traveler.softPreferences),
      careNeeds: optionalObject(traveler.careNeeds),
      operability: optionalObject(traveler.operability),
    };
  });

  next.nodes = optionalArray(next.nodes).map((nodeValue) => {
    const node = optionalObject(nodeValue);
    return { ...node, media: optionalArray(node.media) };
  });
  next.edges = optionalArray(next.edges);
  next.dirtySet = optionalArray(next.dirtySet);
  next.openDecisions = optionalArray(next.openDecisions);
  next.pendingProposals = optionalArray(next.pendingProposals);
  next.proposalHistory = optionalArray(next.proposalHistory);
  next.feedbackLedger = optionalArray(next.feedbackLedger);
  next.fulfillmentLedger = optionalArray(next.fulfillmentLedger);
  next.fulfillmentEvents = optionalArray(next.fulfillmentEvents);
  next.changeJournal = optionalArray(next.changeJournal);

  const queues = optionalObject(next.taskQueues);
  next.taskQueues = Object.fromEntries(FOUR_DOMAINS.map((domain) => [domain, optionalArray(queues[domain])]));
  const evidence = optionalObject(next.evidence);
  next.evidence = {
    contentItems: optionalArray(evidence.contentItems),
    claims: optionalArray(evidence.claims),
    entities: optionalArray(evidence.entities),
  };
  const environment = optionalObject(next.environment);
  next.environment = {
    ...environment,
    weather: environment.weather ?? null,
    mobility: environment.mobility ?? null,
    updatedAt: environment.updatedAt ?? null,
  };
  return assertTripState(next);
}
