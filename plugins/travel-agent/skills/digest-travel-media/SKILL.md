---
name: digest-travel-media
description: Extract attributed candidate claims about places, dishes, routes, queues, seasons, and risks from travel media and comments.
---

# Digest travel media

Convert each note, image, video transcript and comment into atomic claims with evidence pointers and uncertainty. Separate place/dish identity, route advice, queue observations, season experience, dated prices, operability warnings, personal taste and promotional language.

Do not merge author claims and commenter corrections. Preserve the exact content region or timestamp supporting each claim. Produce three spoiler levels: one-line low spoiler, factual detail, and expandable source evidence. Marketing language is not fact.

Return Claim candidates only, each with subject candidate, predicate, value, observed time, source pointer, confidence and `requiresVerification`. Do not infer current availability or write Trip State.

Never mutate Trip State or commit a patch.
