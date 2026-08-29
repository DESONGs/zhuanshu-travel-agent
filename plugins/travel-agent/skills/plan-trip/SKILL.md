---
name: plan-trip
description: Compare linked candidates, budget, routes, weather and per-traveler constraints, then explain a coherent schedule without committing it.
version: 2026-08-30
---

# Plan trip

Treat food, stay, transport and play as linked decisions. Compare only candidates supported by the supplied normalized evidence and deterministic route, budget and constraint results. You own preference-sensitive planning order; deterministic tools own route facts and arithmetic.

For itinerary planning, produce one primary `ItineraryPlan` from the current trip plan view. A second alternative is allowed only when it represents a material user-facing choice, such as bag drop before sightseeing versus immediate check-in and rest. Never create a new place in prose: every stop must reference a current candidate or selected `nodeId`, and every evidence reference must come from that candidate.

Plan in this order:

1. Preserve fixed arrival, reservation, lock and traveler-specific limits.
2. Decide Day, stop order, time window, duration and role from the user's priorities. `intercity_arrival`, `bag_drop`, `stay_check_in`, `stay_departure`, `stay_return`, `meal`, `activity` and `local_transport` are distinct roles. Do not assume check-in must precede all activities.
3. Prefer hard-constraint satisfaction before optimizing time, walking, transfers, estimated cost, weather exposure and local experience.
4. Give each stop a short rationale that explains the cross-domain choice. Do not put route minutes, prices, opening hours, facilities or accessibility claims in the rationale unless they already appear in supplied evidence.
5. Call `plan_itinerary_trial`. The tool checks real routes, chronology, trip dates, opening evidence, walking, transfers, stairs, fixed anchors, locks and freshness.

For an “optimize the current route” request, plan only the stops in `currentOrder`; do not add a return journey, fill every empty day, or reopen candidate research. Put an item in `needsContext` only when the missing fact prevents these current stops from being routed or timed at all. Unknown prices, future-day gaps, booking policies and unselected return inventory are assumptions or follow-up notes, not blockers for the current route Trial.

If the first check returns `needs_repair`, repair exactly once using its `issueCode`, affected stops, observed facts and allowed repair directions. Keep the same run ID, use attempt 2, preserve unrelated fixed/locked stops, and change only what the issue justifies. Examples: shift a flexible stop later, move an optional activity to the next day, change a route mode, or reorder two flexible stops. Never retry with the same plan, start a new run, or remove a hard requirement to make the check pass.

If attempt 2 still fails, stop and return the blocker or `needs_context`. A failed or partial check is not an optimized itinerary. A successful Trial is still unconfirmed and must remain reversible until the user adopts it.

Check each named traveler separately. Keep mapped stairs, unknown step-free continuity and unknown elevator operation as different evidence states. Weather is a cross-domain constraint supplied by Runtime, never a fifth itinerary domain or a model-authored forecast.

Prefer a route or candidate only when the evidence supports the reason. Explain cost, time, walking, transfers, flexibility, source freshness and remaining unknowns. Preserve locks and unrelated decisions.

Outside a direct itinerary-planning turn, return schedule/fit findings, recommended and rejected candidate IDs, reason codes, needs-context items and evidence references. The Parent may use the result to build one proposal; this Skill and its child analysts never commit.

Never mutate Trip State or commit a patch.

References retained from the previous micro Skills:

- `../assess-traveler-operability/SKILL.md`
- `../assess-trip-weather/SKILL.md`
- `../evaluate-trip-fit/SKILL.md`
- `../shape-trip-schedule/SKILL.md`
- `../compare-trip-alternatives/SKILL.md`
- `../explain-trip-tradeoff/SKILL.md`
- `../review-trip-coherence/SKILL.md`
