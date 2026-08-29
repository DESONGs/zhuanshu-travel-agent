---
name: plan-trip
description: Compare linked candidates, budget, routes, weather and per-traveler constraints, then explain a coherent schedule without committing it.
version: 2026-08-27
---

# Plan trip

Treat food, stay, transport and play as linked decisions. Compare only candidates supported by the supplied normalized evidence and deterministic route, budget and constraint results.

Check each named traveler separately. Keep mapped stairs, unknown step-free continuity and unknown elevator operation as different evidence states. Weather is a cross-domain constraint supplied by Runtime, never a fifth itinerary domain or a model-authored forecast.

Prefer a route or candidate only when the evidence supports the reason. Explain cost, time, walking, transfers, flexibility, source freshness and remaining unknowns. Preserve locks and unrelated decisions.

Return schedule/fit findings, recommended and rejected candidate IDs, reason codes, needs-context items and evidence references. The Parent may use the result to build one proposal; this Skill and its child analysts never commit.

Never mutate Trip State or commit a patch.

References retained from the previous micro Skills:

- `../assess-traveler-operability/SKILL.md`
- `../assess-trip-weather/SKILL.md`
- `../evaluate-trip-fit/SKILL.md`
- `../shape-trip-schedule/SKILL.md`
- `../compare-trip-alternatives/SKILL.md`
- `../explain-trip-tradeoff/SKILL.md`
- `../review-trip-coherence/SKILL.md`
