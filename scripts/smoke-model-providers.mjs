import { contentText, createModels } from "@earendil-works/pi-ai";
import { TRAVEL_MODEL_PROVIDERS } from "../src/agent/travel-model-providers.mjs";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";

function result(status, details = {}) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "travel-model-provider-smoke-v1", status, ...details })}\n`);
}

function safeErrorMessage(value) {
  return String(value ?? "")
    .replace(/(?:sk-|Bearer\s+)[A-Za-z0-9._-]+/gi, "[redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, 500) || null;
}

const env = await loadTravelRuntimeEnv();
const models = createModels({ authContext: { env: async (name) => env[name], fileExists: async () => false } });
for (const providerId of new Set(["deepseek", env.TRAVEL_AGENT_VISION_PROVIDER])) {
  const provider = TRAVEL_MODEL_PROVIDERS[providerId];
  if (provider) models.setProvider(provider.create());
}
const outcomes = {};
const diagnostics = {};
const visionProvider = env.TRAVEL_AGENT_VISION_PROVIDER;

try {
  const model = models.getModel("deepseek", env.TRAVEL_AGENT_MODEL);
  const response = await models.completeSimple(model, { systemPrompt: "Reply with exactly READY.", messages: [{ role: "user", content: "ping" }] }, { reasoning: "low", maxTokens: 16, timeoutMs: 30_000, maxRetries: 0 });
  diagnostics.deepseek = { stopReason: response.stopReason ?? null, errorMessage: safeErrorMessage(response.errorMessage), contentTypes: (response.content ?? []).map((item) => item.type), textLength: contentText(response.content).trim().length };
  outcomes.deepseek = contentText(response.content).trim() ? "passed_live_smoke" : "empty_response";
} catch (error) {
  outcomes.deepseek = error?.message?.includes("401") ? "authentication_failed" : "failed_live_smoke";
}

try {
  if (!TRAVEL_MODEL_PROVIDERS[visionProvider]) throw new Error("unsupported_vision_provider");
  const model = models.getModel(visionProvider, env.TRAVEL_AGENT_VISION_MODEL);
  if (!model?.input?.includes("image")) throw new Error("configured_model_does_not_support_images");
  const transparentPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const response = await models.completeSimple(model, {
    systemPrompt: "Reply with exactly VISION_READY. Do not describe the image.",
    messages: [{ role: "user", content: [{ type: "text", text: "ping" }, { type: "image", mimeType: "image/png", data: transparentPixel }] }],
  }, {
    reasoning: visionProvider === "deepseek" ? "high" : "low",
    maxTokens: 32,
    timeoutMs: 30_000,
    maxRetries: 0,
    ...(["kimi-k2.5", "kimi-k2.6"].includes(model.id) ? { onPayload: (payload) => ({ ...payload, thinking: { type: "disabled" } }) } : {}),
  });
  diagnostics.visionAgent = { provider: visionProvider, model: model.id, stopReason: response.stopReason ?? null, errorMessage: safeErrorMessage(response.errorMessage), contentTypes: (response.content ?? []).map((item) => item.type), textLength: contentText(response.content).trim().length };
  outcomes.visionAgent = /\bVISION_READY\b/i.test(contentText(response.content)) ? "passed_live_smoke" : "unexpected_response";
} catch (error) {
  outcomes.visionAgent = error?.message?.includes("401") ? "authentication_failed" : "failed_live_smoke";
}

result(outcomes.deepseek === "passed_live_smoke" && outcomes.visionAgent === "passed_live_smoke" ? "passed" : "needs_attention", { outcomes, diagnostics, routes: { reasoning: env.TRAVEL_AGENT_MODEL_PROVIDER, multimodal: visionProvider }, sensitiveDataSent: false, visualInput: "transparent_1x1_png_only" });
process.exitCode = outcomes.deepseek === "passed_live_smoke" && outcomes.visionAgent === "passed_live_smoke" ? 0 : 1;
