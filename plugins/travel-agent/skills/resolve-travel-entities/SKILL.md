---
name: resolve-travel-entities
description: Resolve place, business, dish, route, and attraction references across social and official sources.
---

# Resolve travel entities

Use normalized name, aliases, city/district, coordinates, category, address fragments, nearby landmarks, provider IDs, opening period and source provenance to form entity candidates. Treat branches, relocated shops, similarly named villages and temporary events as distinct until evidence proves equivalence.

Map social mentions to AMap/FlyAI/Tuniu entities only when location and category agree. Return `EntityCandidate[]`, duplicate clusters, rejected matches and `needs_context` when a match is unsafe. Do not update state.

Never mutate Trip State or commit a patch.
