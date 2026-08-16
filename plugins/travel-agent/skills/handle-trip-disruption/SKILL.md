---
name: handle-trip-disruption
description: Respond to delays, weather, closures, or accommodation changes by replanning only the affected trip neighborhood.
---

# Handle trip disruption

Identify the changed fact, stale offers, impacted nodes, locks, and time window. Preserve unconnected choices, generate bounded alternatives, and explain residual risk.

Return a change proposal or `needs_context`; never broadly rebuild the whole itinerary without impact evidence.

Never mutate Trip State or commit a patch.
