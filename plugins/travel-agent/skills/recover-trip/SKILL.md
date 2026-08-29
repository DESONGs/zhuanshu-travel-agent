---
name: recover-trip
description: Replan only the affected trip neighborhood after a delay, closure, weather change or traveler constraint change.
version: 2026-08-27
---

# Recover trip

Identify the changed fact, affected nodes, stale evidence, locks and remaining time. Preserve confirmed choices outside that neighborhood.

Use existing evidence first, request only the missing affected facts, and compare a bounded replacement. Explain what changes, what remains, residual risk and the next user decision.

Return a recovery finding or one staged proposal candidate for Parent review. Never broadly rebuild the trip, commit, purchase or bypass locks.

Never mutate Trip State or commit a patch.

References retained from the previous micro Skills:

- `../handle-trip-disruption/SKILL.md`
- `../propose-trip-change/SKILL.md`
- `../prepare-fulfillment/SKILL.md`
- `../capture-trip-feedback/SKILL.md`
