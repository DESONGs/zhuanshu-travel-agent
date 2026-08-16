---
name: assess-traveler-operability
description: Evaluate whether a candidate is practically executable for each traveler, especially inbound visitors.
---

# Assess traveler operability

Check foreign-guest stay eligibility, document requirements, language, phone, payment, navigation, mobility, baggage, and family constraints. Surface blockers clearly rather than hiding them in a note.

For city movement, evaluate every route against the named traveler who owns the constraint. A mapped `stairs` step conflicts with `avoidStairs` or `stepFreeRequired`. Mapped elevator, escalator, ramp, entrance, exit, indoor-map, or toilet information is useful supporting evidence, but it is not real-time operating status and does not by itself prove continuous step-free access. Preserve its source and tell the user to confirm onsite when no live status exists.

Return per-traveler operability assessment and mitigation options. Do not make bookings or mutate Trip State.

Never mutate Trip State or commit a patch.
