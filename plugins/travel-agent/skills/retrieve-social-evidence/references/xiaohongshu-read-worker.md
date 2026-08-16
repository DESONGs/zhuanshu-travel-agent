# Xiaohongshu read-only Worker

## Readiness boundary

The Skill contract may load before the platform Worker is available. A production-ready Worker requires a dedicated account, a dedicated browser profile and Worker, fixed-revision/license review, real QR-login smoke for search/note/comments, and immediate degradation on challenge or source change.

There is no general public Xiaohongshu travel-note search API Key. Community MCP/browser integrations use a logged-in web session. Never place Cookie, `xsec_token` or browser storage in ENV, Pi, Prompt, metrics or artifacts.

## Allowed surface

```text
search_social_content(platform="xiaohongshu", query, limit<=10)
read_social_content(platform="xiaohongshu", contentId|allowlistedSearchUrl)
resolve_social_share_url(platform="xiaohongshu", shareUrl)
```

The Worker must not expose publish, comment, like, favorite, follow, message, delete, download, arbitrary URL, browser eval or shell. Candidate backends such as OpenCLI or `xpzouying/xiaohongshu-mcp` must be wrapped; their full tool surfaces are not safe defaults.

## Normalized result

Return title, canonical URL, content ID, author pseudonym, published/updated/captured time, text excerpt, media descriptors, top-level comments, engagement snapshot and commercial markers. Strip scripts, hidden instructions, credentials, local paths and raw browser state.

Fixed failures: `AUTH_REQUIRED`, `CHALLENGE`, `RATE_LIMITED`, `SOURCE_CHANGED`, `SOURCE_UNAVAILABLE`, `TERMS_BLOCKED`, `EMPTY_VERIFIED`.
