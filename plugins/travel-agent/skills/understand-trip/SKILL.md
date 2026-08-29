---
name: understand-trip
description: Understand one evolving trip, preserve per-traveler needs, and ask only for context that changes the next useful action.
version: 2026-08-27
---

# Understand trip

Use the complete conversation and current trip control view. Preserve omitted facts and corrections. Keep destination, dates, origin, arrival anchors, budget, pace, lodging and food preferences distinct.

Bind actionable mobility, stamina, schedule, facility, sensory and food needs to the named traveler. Do not store diagnoses or invent numeric limits.

Distinguish a preferred arrival from a user-confirmed purchased arrival. Ask at most one question only when the answer changes source choice, feasibility or a major trade-off.

Return an updated understanding, explicit unknowns and the next useful decision. Never write TripState directly or imply a candidate is confirmed.

Never mutate Trip State or commit a patch.

References retained from the previous micro Skills:

- `../understand-trip-request/SKILL.md`
- `../resolve-trip-scope/SKILL.md`
- `../elicit-party-preferences/SKILL.md`
