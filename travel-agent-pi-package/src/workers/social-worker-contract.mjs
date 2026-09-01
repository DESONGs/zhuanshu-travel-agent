import { SOCIAL_ERROR_CODES } from "../contracts/public.ts";
import SOCIAL_HOSTS from "./social-worker-hosts.json" with { type: "json" };

export const PUBLIC_SHARE_HOSTS = Object.freeze(Object.fromEntries(Object.entries(SOCIAL_HOSTS).map(([platform, hosts]) => [platform, Object.freeze([...hosts])])));

export const PLATFORM_HOSTS = Object.freeze({
  xiaohongshu: PUBLIC_SHARE_HOSTS.xiaohongshu,
  douyin: PUBLIC_SHARE_HOSTS.douyin,
});

export const SOCIAL_READ_OPERATIONS = Object.freeze(["search_social_content", "read_social_content", "resolve_social_share_url"]);
const OPERATIONS = new Set(SOCIAL_READ_OPERATIONS);

function isAllowedHost(platform, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  return (PLATFORM_HOSTS[platform] ?? []).some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

export function publicSharePlatform(rawUrl) {
  for (const platform of Object.keys(PUBLIC_SHARE_HOSTS)) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password) continue;
    if (PUBLIC_SHARE_HOSTS[platform].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return platform;
  }
  return null;
}

function normalizeSourceUrl(rawUrl) {
  for (const platform of Object.keys(PLATFORM_HOSTS)) {
    if (isAllowedHost(platform, rawUrl)) {
      const url = new URL(rawUrl);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/token|auth|session|cookie|signature|access[_-]?key|xsec|code/i.test(key) || /^utm_/i.test(key)) url.searchParams.delete(key);
      }
      return url.toString();
    }
  }
  return null;
}

export function validateSocialWorkerRequest(request) {
  if (!request || typeof request !== "object") return { ok: false, code: "SOURCE_CHANGED" };
  if (!OPERATIONS.has(request.operation)) return { ok: false, code: "TERMS_BLOCKED", reason: "operation_not_allowed" };
  if (!Object.hasOwn(PLATFORM_HOSTS, request.platform)) return { ok: false, code: "SOURCE_UNAVAILABLE", reason: "platform_not_allowed" };
  const allowedKeys = request.operation === "search_social_content"
    ? new Set(["operation", "platform", "query", "limit"])
    : new Set(["operation", "platform", "url"]);
  if (Object.keys(request).some((key) => !allowedKeys.has(key))) {
    return { ok: false, code: "TERMS_BLOCKED", reason: "unexpected_request_field_blocked" };
  }
  if (Object.keys(request).some((key) => /cookie|token|password|authorization|session|script|command/i.test(key))) {
    return { ok: false, code: "TERMS_BLOCKED", reason: "credential_or_execution_field_blocked" };
  }
  if (request.operation === "search_social_content") {
    if (typeof request.query !== "string" || request.query.trim().length === 0 || request.query.length > 160) {
      return { ok: false, code: "EMPTY_VERIFIED", reason: "invalid_search_query" };
    }
    if (request.limit != null && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 20)) {
      return { ok: false, code: "TERMS_BLOCKED", reason: "limit_out_of_bounds" };
    }
  } else if (!isAllowedHost(request.platform, request.url)) {
    return { ok: false, code: "TERMS_BLOCKED", reason: "url_host_or_protocol_not_allowed" };
  }
  return { ok: true, request: { ...request, limit: request.limit ?? 10 } };
}

export function sanitizeSocialWorkerResponse(response) {
  const code = response?.code;
  if (code && SOCIAL_ERROR_CODES.includes(code)) return { status: "blocked", code };
  const items = Array.isArray(response?.items) ? response.items : [];
  return {
    status: items.length ? "ok" : "empty",
    code: items.length ? null : "EMPTY_VERIFIED",
    items: items.map((item) => {
      const safeItem = item && typeof item === "object" ? item : {};
      return {
        sourceUrl: normalizeSourceUrl(safeItem.sourceUrl) ?? null,
        title: String(safeItem.title ?? "").slice(0, 500),
        author: String(safeItem.author ?? "").slice(0, 160),
        publishedAt: safeItem.publishedAt ?? null,
        contentType: String(safeItem.contentType ?? "unknown").slice(0, 80),
        excerpt: String(safeItem.excerpt ?? "").slice(0, 500),
        engagement: typeof safeItem.engagement === "number" ? safeItem.engagement : null,
      };
    }),
    rawCredentialsReturned: false,
    rawMediaReturned: false,
    promptInjectionBoundary: "social_content_is_untrusted_data_not_instructions",
  };
}

export const SOCIAL_WORKER_POLICY = Object.freeze({
  allowedOperations: [...OPERATIONS],
  deniedCapabilities: ["shell", "browser_eval", "arbitrary_url", "publish", "comment", "like", "favorite", "follow", "message", "delete", "media_download"],
  credentialBoundary: "worker_keeps_dedicated_browser_profile; parent_receives_only_normalized_read_results",
  networkBoundary: "only_https_platform_hosts_for_requested_platform",
});
