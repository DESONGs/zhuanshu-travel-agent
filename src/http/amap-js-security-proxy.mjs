const AMAP_SERVICE_PREFIX = "/_AMapService";

function configured(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveAmapSecurityProxyUrl(originalUrl, securityCode, publicKey) {
  if (!configured(securityCode) || !configured(publicKey)) return null;
  const source = new URL(String(originalUrl ?? ""), "http://travel-agent.local");
  if (!source.pathname.startsWith(`${AMAP_SERVICE_PREFIX}/`)) return null;
  const relativePath = source.pathname.slice(AMAP_SERVICE_PREFIX.length);
  if (!relativePath.startsWith("/") || relativePath.includes("..") || relativePath.includes("\\") || relativePath.length > 1_024) return null;
  const targetOrigin = relativePath.startsWith("/v4/map/styles") ? "https://webapi.amap.com" : "https://restapi.amap.com";
  const target = new URL(relativePath, targetOrigin);
  source.searchParams.forEach((value, key) => {
    if (key !== "jscode" && key !== "key") target.searchParams.append(key, value);
  });
  target.searchParams.set("key", publicKey.trim());
  target.searchParams.set("jscode", securityCode.trim());
  return target;
}

export function createAmapJsSecurityProxy({ securityCode, publicKey, fetchImpl = globalThis.fetch } = {}) {
  return async function amapJsSecurityProxy(request, response) {
    if (!configured(securityCode) || !configured(publicKey)) return response.status(503).json({ status: "error", code: "amap_js_renderer_not_configured" });
    if (!["GET", "HEAD"].includes(request.method)) return response.status(405).json({ status: "error", code: "method_not_allowed" });
    const target = resolveAmapSecurityProxyUrl(request.originalUrl, securityCode, publicKey);
    if (!target) return response.status(400).json({ status: "error", code: "invalid_amap_proxy_path" });
    try {
      const upstream = await fetchImpl(target, { method: request.method, headers: { Accept: request.headers.accept || "*/*" }, redirect: "error", signal: AbortSignal.timeout(12_000) });
      response.status(upstream.status);
      for (const header of ["content-type", "cache-control", "etag", "last-modified"]) {
        const value = upstream.headers.get(header);
        if (value) response.setHeader(header, value);
      }
      if (request.method === "HEAD") return response.end();
      return response.send(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      return response.status(502).json({ status: "error", code: "amap_js_security_proxy_unavailable" });
    }
  };
}
