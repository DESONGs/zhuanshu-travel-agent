---
name: propose-trip-change
description: Turn a reviewed recommendation or disruption response into a revisioned TripPatchProposal.
---

# Propose trip change

Use the supplied `readSet` and `writeContract`. Include why the patch is needed, operations, affected decision IDs, offer references, expected trade-offs, and rebase behavior.

Return only `trip-patch-proposal-v1` or `needs_context`; never mutate or bypass locks.

Never mutate Trip State or commit a patch.
