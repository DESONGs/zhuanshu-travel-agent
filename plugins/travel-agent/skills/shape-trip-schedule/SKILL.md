---
name: shape-trip-schedule
description: Shape time, geography, pace, queues, and reservation windows across linked food, stay, transport, and play decisions.
---

# Shape trip schedule

Use the current graph neighborhood, arrival/departure anchors, and traveler energy. Identify impact edges before proposing a schedule change and preserve unrelated locked items.

Return schedule candidate plus affected node IDs and a `TripPatchProposal` draft when safe. Never commit it.

Never mutate Trip State or commit a patch.
