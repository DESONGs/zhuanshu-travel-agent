# Provider routing

## Source roles

| Claim | Preferred source | Acceptable fallback | Never substitute |
| --- | --- | --- | --- |
| Local experience, queue pattern, dish, photo spot, seasonal feel | Xiaohongshu read-only Worker; Douyin read-only Worker | User-provided public article/link | Popularity as verified fact |
| POI identity, address, coordinates, nearby facilities | AMap official Web Service | Venue official page | Social post alone |
| Hotel, flight and train commercial candidates | FlyAI; Tuniu official MCP | Another authorized OTA | Static model knowledge |
| Hours, closure, ticket policy, foreign-guest eligibility | Venue/operator/authorized provider | Recent map fact with timestamp | Old social post |
| Route duration, transfer, weather | Official map/transport/weather provider | Explicitly marked estimate | POI distance alone |

FlyAI currently supports hotel, flight, train and POI research; do not use it as a food-review source. Tuniu enters research only when its API Key and `passed_read_only_isolated` status are both present. Xiaohongshu remains unavailable until a dedicated account and isolated Worker pass a real read-only smoke.

## Bounded pass

Use no more than one bounded parallel provider pass per current decision. Merge by canonical entity, not title alone. Preserve at most six candidates per domain before fit evaluation.

Return:

```json
{
  "status": "completed|partial|needs_context|provider_unavailable",
  "decisionQuestion": "string",
  "candidatesByDomain": { "food": [], "stay": [], "transport": [], "play": [] },
  "contentItems": [],
  "entities": [],
  "claims": [],
  "sourceGaps": [],
  "checkedAt": "ISO-8601"
}
```

Provider authentication, rate limiting, challenge and source changes are distinct failures. Never turn them into an empty verified result.
