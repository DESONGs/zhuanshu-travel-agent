---
product: Travel Agent V1
source_visual: design/reference/map-pulse-mobile.png
platforms: Web/PWA, iOS, Android, WeChat Mini Program, Alipay Mini Program
---

# Overview

Travel Agent V1 uses a conversation-first direction: the user starts by describing the trip, while the Parent Agent understands intent, asks one useful follow-up at a time, researches the linked food/stay/transport/play chains, and returns a reviewable trip draft. Desktop and large foldables keep the conversation and the evolving decision canvas in parallel. Mobile preserves the same hierarchy vertically: conversation first, draft and transport execution second.

The redesign is preserve-mode. Information architecture, Chat / Trip / Map navigation, brand mark, confirmation boundaries and map-led decisions stay stable. Design dials: variance 5, motion 3, density 5. The user is usually planning in ordinary indoor light or checking the trip outdoors on a phone, so the product keeps one high-contrast light theme and avoids decorative theme switching.

# Colors

- Ink `#17191c` for primary text and decisive controls.
- Canvas `#f7f8f9`, surface `#ffffff`, line `#e5e8eb` for clear layered space.
- Coral `#ff5a4f` remains the trip-location and brand accent. Primary buttons use the darker accessible coral `#c9443b` so white labels meet WCAG AA.
- Transit blue `#2268c7` / soft blue `#eaf2ff` anchors route steps.
- Success green `#2c8053` / soft green `#e8f6ec` denotes an explicit pass, never merely a decorative tint.
- Amber `#925b21` / soft amber `#fff7ef` denotes Provider, freshness or operability limits.

No gradients, glass effects, neon AI purple, decorative map textures, or color-only state meaning.

# Typography

- One system sans stack carries headings, controls, body and data: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `PingFang SC`, `Noto Sans CJK SC`, sans-serif. The app does not download a display font at runtime.
- Decision headings use 20–32px at 650–750 weight. Body text uses 13–15px. Essential evidence, route and facility text never renders below 11px.
- Chinese copy uses short factual clauses, then one explicit status or next step. Route steps may truncate only supporting detail, never the route title or facility status.

# Elevation

- Most hierarchy comes from spacing, one-pixel dividers and surface changes. A component does not combine a visible border with a broad decorative shadow.
- Inputs use 10px radius, grouped cards and sheets use 12–16px, and compact status/action controls may use a full pill.
- Only floating drawers and sheets use elevation. Mobile route sheets keep a sticky action bar and a compact map so the first selectable candidate remains visible.

# Components

- `ConversationPanel`: the primary working surface. It makes no promise of a research result until an authorized Provider returns evidence, and marks model/provider unavailability plainly.
- `PlanCanvas`: the secondary, shared decision canvas. It appears empty until the conversation supplies enough scope to create a trip draft; it then shows food/stay/transport/play coverage, candidate decisions and source state.
- `TransitDetails`: steps, source freshness, traveler fit and facilities grouped by physical step. It is shown only for real authorized route results, and disables navigation until a real navigable route exists.
- `ConversationPicker`: lets a user resume another travel conversation without turning the first task into a manual trip library.
- `Auth`, empty, loading and error states share the same typography and spacing and explain the recovery action.

# Do's and Don'ts

Do keep the route sheet dense enough for motion, access and facility decisions; show source, freshness and accessibility next to the related step; use generated imagery only where photography or product imagery adds genuine trip context; use Phosphor for functional icons.

Do not replace unavailable Provider data with a fixed city, coordinate, fabricated facility or mock inventory. Do not ask a user to first manually build a trip before the Agent can help. Do not put four domains into separate tabs or workflows. Do not imitate Airbnb’s listings, use generic dashboard panels, oversized metric cards or glassmorphism.
