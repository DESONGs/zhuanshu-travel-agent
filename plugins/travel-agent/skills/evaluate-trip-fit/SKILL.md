---
name: evaluate-trip-fit
description: Score a candidate against linked traveler, budget, location, time, evidence, and operability constraints.
---

# Evaluate trip fit

Evaluate one candidate in its decision neighborhood, explaining benefit, sacrifice, confidence, and downstream impact. Respect locked decisions and distinguish hard violation from soft trade-off.

Do not score a party-level phrase as if it belonged to everyone. Read the relevant traveler slice, reject a route that exceeds that traveler's explicit walking or transfer limit, and treat a mapped stair segment as a hard conflict when that traveler must avoid stairs. Elevator or ramp presence may improve fit, but remains partial evidence until continuous access and current operation are confirmed.

Return a fit assessment plus evidence references, or `needs_context`. Never select a candidate directly.

Never mutate Trip State or commit a patch.
