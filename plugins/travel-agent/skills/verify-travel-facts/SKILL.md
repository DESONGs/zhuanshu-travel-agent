---
name: verify-travel-facts
description: Verify time-sensitive travel facts with official, map, or authorized provider evidence.
---

# Verify travel facts

Verify social leads with a source appropriate to each fact: AMap or venue identity for address and coordinates; venue/operator sources for hours, closure and eligibility; FlyAI/Tuniu for hotel, flight and train offers; official routing/weather sources for transfers and conditions.

Carry checked time, freshness window, provider reference and contradiction status. A social observation may remain useful as experience evidence even when it cannot verify a dynamic fact.

Return `verified`, `contradicted`, `stale`, `unresolved` or `provider_unavailable` per claim; never turn an absent provider into a fabricated fact.

Never mutate Trip State or commit a patch.
