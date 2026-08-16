const TUNIU_ENDPOINTS = Object.freeze({
  train: "https://openapi.tuniu.cn/mcp/train",
  hotel: "https://openapi.tuniu.cn/mcp/hotel",
  flight: "https://openapi.tuniu.cn/mcp/flight",
  ticket: "https://openapi.tuniu.cn/mcp/ticket",
});

const TUNIU_READ_TOOLS = Object.freeze({
  train: new Set(["searchLowestPriceTrain", "queryTrainDetail"]),
  hotel: new Set(["tuniuHotelSearch", "tuniuHotelDetail"]),
  flight: new Set(["searchLowestPriceFlight", "multiCabinDetails", "getBookingRequiredInfo"]),
  ticket: new Set(["query_cheapest_tickets"]),
});

function providerError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function parseJsonOrSse(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw providerError("SOURCE_UNAVAILABLE", { reason: "empty_response" });
  try {
    return JSON.parse(raw);
  } catch {
    const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean).at(-1);
    if (!data) throw providerError("SOURCE_CHANGED", { reason: "invalid_json_or_sse" });
    try {
      return JSON.parse(data);
    } catch {
      throw providerError("SOURCE_CHANGED", { reason: "invalid_sse_json" });
    }
  }
}

function unwrapToolResult(result, depth = 0) {
  if (depth > 4) return result;
  if (result?.structuredContent && typeof result.structuredContent === "object") return unwrapToolResult(result.structuredContent, depth + 1);
  const textBlock = Array.isArray(result?.content) ? result.content.find((item) => item?.type === "text" && typeof item.text === "string") : null;
  if (textBlock) {
    try {
      return unwrapToolResult(JSON.parse(textBlock.text), depth + 1);
    } catch {
      return { text: textBlock.text };
    }
  }
  if (result && Object.hasOwn(result, "result")) {
    if (result.result && typeof result.result === "object") return unwrapToolResult(result.result, depth + 1);
    if (typeof result.result === "string") {
      try {
        return unwrapToolResult(JSON.parse(result.result), depth + 1);
      } catch {
        return { text: result.result };
      }
    }
  }
  return result;
}

export class TuniuOfficialMcpClient {
  constructor({ apiKey = "", enabled = false, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
    this.apiKey = String(apiKey ?? "").trim();
    this.enabled = enabled === true;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  get status() {
    return this.enabled && this.apiKey ? "configured" : "provider_unavailable";
  }

  async request(service, method, params = {}) {
    if (this.status !== "configured") throw providerError("AUTH_REQUIRED", { provider: "tuniu_official_mcp" });
    const endpoint = TUNIU_ENDPOINTS[service];
    if (!endpoint) throw providerError("TERMS_BLOCKED", { reason: "service_not_allowlisted" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          apiKey: this.apiKey,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw providerError("AUTH_REQUIRED", { provider: "tuniu_official_mcp", service });
      if (response.status === 429) throw providerError("RATE_LIMITED", { provider: "tuniu_official_mcp", service });
      if (!response.ok) throw providerError("SOURCE_UNAVAILABLE", { provider: "tuniu_official_mcp", service, httpStatus: response.status });
      const responseText = await response.text();
      if (responseText.length > 4 * 1024 * 1024) throw providerError("SOURCE_CHANGED", { reason: "response_too_large" });
      const payload = parseJsonOrSse(responseText);
      if (payload?.error) throw providerError("SOURCE_UNAVAILABLE", { provider: "tuniu_official_mcp", service, rpcCode: payload.error.code ?? null });
      return payload?.result;
    } catch (error) {
      if (error?.name === "AbortError") throw providerError("SOURCE_UNAVAILABLE", { provider: "tuniu_official_mcp", service, reason: "timeout" });
      if (error?.code) throw error;
      throw providerError("SOURCE_UNAVAILABLE", { provider: "tuniu_official_mcp", service });
    } finally {
      clearTimeout(timeout);
    }
  }

  async listTools(service) {
    const result = await this.request(service, "tools/list");
    return Array.isArray(result?.tools) ? result.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) : [];
  }

  async callReadTool(service, tool, args = {}) {
    if (!TUNIU_READ_TOOLS[service]?.has(tool)) throw providerError("TERMS_BLOCKED", { reason: "write_or_unknown_tool_blocked", service, tool });
    if (!args || Array.isArray(args) || typeof args !== "object") throw providerError("SOURCE_CHANGED", { reason: "invalid_tool_arguments" });
    const result = await this.request(service, "tools/call", { name: tool, arguments: args });
    return unwrapToolResult(result);
  }
}

export function createTuniuOfficialMcpClient(env = process.env, options = {}) {
  const enabled = env.TRAVEL_AGENT_TUNIU_ENABLED === "true"
    && env.TRAVEL_AGENT_TUNIU_SMOKE_STATUS === "passed_read_only_isolated"
    && Boolean(String(env.TUNIU_API_KEY ?? "").trim());
  return new TuniuOfficialMcpClient({ apiKey: env.TUNIU_API_KEY, enabled, ...options });
}

export { TUNIU_ENDPOINTS, TUNIU_READ_TOOLS, parseJsonOrSse, unwrapToolResult };
