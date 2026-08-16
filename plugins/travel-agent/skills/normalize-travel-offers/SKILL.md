---
name: normalize-travel-offers
description: Normalize authorized transport, stay, ticket, and reservation offers into comparable, expiring candidates.
---

# Normalize travel offers

Capture total price, currency, inclusions, cancellation terms, eligibility, inventory timestamp, TTL, source, and handoff URL. Distinguish an offer from a social recommendation.

Return `OfferCandidate[]` with freshness and risk labels. Do not purchase or write fulfillment state.

Never mutate Trip State or commit a patch.
