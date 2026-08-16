import assert from "node:assert/strict";
import test from "node:test";
import { modelStatus } from "../src/agent/travel-conversation-agent.mjs";
import { createConversationRecord, validateConversation } from "../src/persistence/conversation-repository.mjs";

test("conversation model selection resolves only the approved parent-agent models", () => {
  const env = { DEEPSEEK_API_KEY: "deepseek", MOONSHOT_API_KEY: "kimi", TRAVEL_AGENT_VISION_PROVIDER: "moonshotai-cn", TRAVEL_AGENT_VISION_MODEL: "kimi-k2.6" };
  const flash = modelStatus(env, { modelId: "deepseek-v4-flash" });
  assert.equal(flash.provider, "deepseek");
  assert.equal(flash.model, "deepseek-v4-flash");
  const k3 = modelStatus(env, { modelId: "kimi-k3" });
  assert.equal(k3.provider, "moonshotai-cn");
  assert.equal(k3.model, "kimi-k3");
  const unsupported = modelStatus(env, { modelId: "kimi-k2.7-code" });
  assert.equal(unsupported.code, "model_selection_unsupported");
});

test("new and legacy conversations normalize to DeepSeek V4 Flash and persist a valid choice", () => {
  const created = createConversationRecord({ userId: "user_model", modelId: "deepseek-v4-pro" });
  assert.equal(created.modelId, "deepseek-v4-pro");
  const legacy = structuredClone(created);
  delete legacy.modelId;
  assert.equal(validateConversation(legacy).modelId, "deepseek-v4-flash");
});
