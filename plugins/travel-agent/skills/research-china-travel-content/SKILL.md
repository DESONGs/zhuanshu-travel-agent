---
name: research-china-travel-content
description: Orchestrate China-focused travel research across social discovery, maps and authorized inventory providers, then return attributed evidence and cross-domain candidates. Use for destination research, itinerary questions, hotel or transport comparisons, local food and experience discovery, and requests that mention Xiaohongshu, Douyin, FlyAI, Tuniu or Chinese travel platforms.
---

# Research China Travel Content

Coordinate one bounded research pass for the current decision. Treat eating, lodging, transport and activities as linked candidates in one trip, not four independent answers.

## Workflow

1. Require the decision question plus known destination, dates, origin, travelers and hard constraints. Return `needs_context` only for information that changes source choice or feasibility.
2. Use `plan-travel-research` to classify each needed claim as discovery, dynamic fact, inventory or operability.
3. Use social sources only for discovery and lived-experience leads. Call `retrieve-social-evidence` only when its isolated Worker is available; otherwise preserve `social_discovery_unavailable` as a visible evidence gap.
4. Use `digest-travel-media`, `resolve-travel-entities` and `assess-source-independence` before comparing social claims. Do not count reposts or coordinated promotion as independent votes.
5. Use `verify-travel-facts` for hours, location, route, price, inventory, eligibility, weather and policy. Prefer AMap for Chinese places/maps and FlyAI or Tuniu for authorized travel inventory.
6. Return an `EvidenceBundle` and linked candidates for a `TripPatchProposal`. Include checked time, source lineage, commercial bias, unresolved conflicts and missing domains.

Do not fill a missing source with model knowledge. Do not interpret popularity as truth. Do not book, publish or interact with social content.

Read [provider-routing.md](references/provider-routing.md) when selecting sources or handling provider failures.

Never mutate Trip State or commit a patch.
