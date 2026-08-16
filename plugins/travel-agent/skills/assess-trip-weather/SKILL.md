---
name: assess-trip-weather
description: Translate a Runtime-supplied, verified WeatherEnvelope or a material weather disruption into linked changes across play, transport, stay, and food. Use after the Environment Gate has resolved forecast coverage; this Skill never fetches weather or decides whether weather should be checked.
---

# Assess trip weather

Treat weather as a cross-domain planning constraint, never as a fifth independent itinerary domain.

The deterministic Runtime owns weather retrieval, freshness, destination/date invalidation, and insertion into the Context Pack. This Skill is the semantic interpretation layer. Do not use Skill recall as the mechanism that decides whether weather exists.

## Required context

Use a `travel-context-pack-v2` slice containing the trip dates, destination, relevant travelers, current decision neighborhood, locked nodes, and the Runtime-supplied `WeatherEnvelope`. Accept only observations that include source, report time, checked time, forecast dates, and coverage of the travel dates.

Return `needs_context` when the destination or usable dates are missing. When the trip lies outside the forecast window, return `outside_forecast_window`; do not substitute current weather, climate averages, or model memory for a forecast.

## Assessment

1. Compare every forecast date with the actual trip dates and mark coverage as `covered`, `partial`, `outside_forecast_window`, or `dates_unknown`.
2. Identify only supported risks such as precipitation, strong wind, extreme heat, cold, snow, thunder, or visibility limits. Preserve uncertainty and provider freshness.
3. Map material risks across all linked chains:
   - play: indoor suitability, exposure, cancellation flexibility, and alternate timing;
   - transport: walking, transfers, luggage movement, road or service disruption, and buffer time;
   - stay: proximity to transit, indoor connections, check-in resilience, and shelter;
   - food: distance from the day route, queues, reservations, and unnecessary extra travel.
4. Preserve booked, hard, and user locks. Identify only the affected decision neighborhood; do not rebuild unrelated days.
5. Prefer a verified indoor or flexible candidate under adverse weather, but never infer that a place is indoors without provider or source evidence.

## Output

Return a weather assessment with:

- `coverage`, `reportTime`, `checkedAt`, and source reference;
- normalized forecast days and explicit risk signals;
- `severity`: `none`, `watch`, or `high`;
- per-domain guidance and affected node IDs;
- candidate `weatherFit`: `preferred`, `contextual`, or `caution`;
- a `TripPatchProposal` draft only when an existing accepted plan must change.

If the Environment Gate reports that weather retrieval failed, return the supplied failure and the affected planning confidence. Do not retry the Provider from this Skill and do not silently proceed as if conditions were normal.

Never mutate Trip State or commit a patch.
