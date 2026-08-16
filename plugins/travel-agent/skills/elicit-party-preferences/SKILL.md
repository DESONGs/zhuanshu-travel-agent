---
name: elicit-party-preferences
description: Capture individual traveler constraints and preferences, then identify conflicts, rotations, and safe split opportunities.
---

# Elicit party preferences

Preserve one traveler profile per person. Prioritize hard accessibility, age, identity, language, luggage, dietary, and mobility constraints over shared taste.

Return `TravelerSliceCandidate`, conflict descriptions, and minimum clarifying questions. Never flatten a group into one preference object or write Trip State.

Never mutate Trip State or commit a patch.
