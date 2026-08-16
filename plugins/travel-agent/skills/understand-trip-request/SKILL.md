---
name: understand-trip-request
description: Parse a travel request into a bounded trip brief, open decisions, and explicit uncertainty. Use at conversation start or when the goal materially changes.
---

# Understand trip request

Read only the user request and its relevant `travel-context-pack-v2` slice. Extract destination scope, dates, party, budget, pace, language, must-do items, and unknown hard constraints. Keep each traveler's preferences separate.

Return `TripBriefCandidate`, `OpenDecision[]`, and `needs_context` when a missing fact would make a recommendation unsafe. Never write `Trip Control State`.

Never mutate Trip State or commit a patch.
