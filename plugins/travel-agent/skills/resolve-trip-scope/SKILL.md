---
name: resolve-trip-scope
description: Resolve ambiguity in destination, dates, arrival/departure anchors, and active trip branch without assuming a city-specific product scope.
---

# Resolve trip scope

Use the decision-scoped context and ask only questions whose answer changes feasibility or major trade-offs. Separate a user’s testing destination from product support boundaries.

Return a scope candidate, affected decisions, and `needs_context` if dates, anchors, or destination granularity remain unsafe. Do not mutate state.

Never mutate Trip State or commit a patch.
