import { PublicShareLinkAdapter } from "../adapters/share-link/public-share-link-adapter.mjs";
import { sanitizeSocialWorkerResponse, validateSocialWorkerRequest } from "../../travel-agent-pi-package/src/workers/social-worker-contract.mjs";

function blocked(code, reason = null) {
  return { status: "blocked", code, ...(reason ? { reason } : {}), items: [] };
}

function itemFromResolved(result) {
  return {
    sourceUrl: result.sourceUrl,
    title: result.title,
    author: result.author,
    publishedAt: result.publishedAt,
    contentType: "public_share_page",
    excerpt: result.excerpt,
    engagement: null,
  };
}

export function createSocialWorkerHandler({ adapter = new PublicShareLinkAdapter(), searchAdapter = null } = {}) {
  return async function handleSocialWorkerRequest(input) {
    const validation = validateSocialWorkerRequest(input);
    if (!validation.ok) return blocked(validation.code, validation.reason);
    const request = validation.request;
    try {
      if (request.operation === "search_social_content") {
        if (typeof searchAdapter?.search !== "function") return blocked("AUTH_REQUIRED", "dedicated_account_not_configured");
        return sanitizeSocialWorkerResponse(await searchAdapter.search({ platform: request.platform, query: request.query, limit: request.limit }));
      }
      const resolved = await adapter.resolve(request.url);
      if (resolved.status === "login_required") return blocked(resolved.code ?? "AUTH_REQUIRED", "source_requires_authenticated_worker");
      return sanitizeSocialWorkerResponse({ items: [itemFromResolved(resolved)] });
    } catch (error) {
      return blocked(error?.code ?? "SOURCE_UNAVAILABLE", error?.details?.reason ?? "worker_request_failed");
    }
  };
}
