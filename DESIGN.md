---
product: Travel Agent V1
source_visual: design/reference/map-pulse-mobile.png
platforms: Web/PWA, iOS, Android, WeChat Mini Program, Alipay Mini Program
---

# Overview

Travel Agent V1 uses a conversation-first direction: the user starts by describing the trip, while the Parent Agent understands intent, asks one useful follow-up at a time, researches the linked food/stay/transport/play chains, and returns a reviewable trip draft. Desktop and large foldables keep the conversation and the evolving decision canvas in parallel. Mobile preserves the same hierarchy vertically: conversation first, draft and transport execution second.

# Colors

- Ink `#17191c` for primary text and decisive controls.
- Canvas `#f7f8f9`, surface `#ffffff`, line `#e5e8eb` for clear layered space.
- Coral `#ff5a4f` is the only primary action and trip-location accent.
- Transit blue `#2268c7` / soft blue `#eaf2ff` anchors route steps.
- Success green `#2c8053` / soft green `#e8f6ec` denotes an explicit pass, never merely a decorative tint.
- Amber `#925b21` / soft amber `#fff7ef` denotes Provider, freshness or operability limits.

No gradients, glass effects, neon AI purple, decorative map textures, or color-only state meaning.

# Typography

- Product UI: `Inter`, `Noto Sans SC`, `PingFang SC`, system sans-serif; compact 12–15px supporting text, 14–18px decisions.
- Display headings: `DM Serif Display`, `Noto Serif SC`, serif; low-weight editorial hierarchy for destination and trip framing.
- Chinese copy uses short factual clauses, then one explicit status or next step. Route steps may truncate only supporting detail, never the route title or facility status.

# Elevation

- Base surfaces have a one-pixel line before adding shadow.
- Cards use 12–16px radius; modal route sheet uses 16px and `0 24px 70px rgb(23 25 28 / 22%)` only while floating.
- Mobile route sheet overlaps the map by a small physical amount; its handle and sticky action bar communicate that it is a working surface, not a static card.

# Components

- `ConversationPanel`: the primary working surface. It makes no promise of a research result until an authorized Provider returns evidence, and marks model/provider unavailability plainly.
- `PlanCanvas`: the secondary, shared decision canvas. It appears empty until the conversation supplies enough scope to create a trip draft; it then shows food/stay/transport/play coverage, candidate decisions and source state.
- `TransitDetails`: steps, source freshness, traveler fit and facilities grouped by physical step. It is shown only for real authorized route results, and disables navigation until a real navigable route exists.
- `ConversationPicker`: lets a user resume another travel conversation without turning the first task into a manual trip library.
- `Auth`, empty, loading and error states share the same typography and spacing and explain the recovery action.

# Do's and Don'ts

Do keep the route sheet dense enough for motion, access and facility decisions; show source, freshness and accessibility next to the related step; use generated imagery only where photography or product imagery adds genuine trip context; use Phosphor for functional icons.

Do not replace unavailable Provider data with a fixed city, coordinate, fabricated facility or mock inventory. Do not ask a user to first manually build a trip before the Agent can help. Do not put four domains into separate tabs or workflows. Do not imitate Airbnb’s listings, use generic dashboard panels, oversized metric cards or glassmorphism.
