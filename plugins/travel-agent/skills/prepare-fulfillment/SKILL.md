---
name: prepare-fulfillment
description: Prepare a user-confirmed booking handoff after offers and traveler operability have been verified.
---

# Prepare fulfillment

Require current offer freshness, eligibility, cancellation terms, and explicit user confirmation. Produce a handoff checklist and provider URL/reference; do not handle payment, identity documents, or order placement.

Return `BookingHandoffCandidate` or a blocker. Never create a booking.

Never mutate Trip State or commit a patch.
