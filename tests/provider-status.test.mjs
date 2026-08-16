import assert from "node:assert/strict";
import test from "node:test";
import { providerStatusSummary } from "../src/providers/provider-status.mjs";

test("a stale passed-smoke flag cannot make a missing credential appear available", () => {
  const status = providerStatusSummary({
    TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS: "passed_live_smoke",
    TRAVEL_AGENT_KIMI_SMOKE_STATUS: "passed_live_smoke",
    TRAVEL_AGENT_AMAP_SMOKE_STATUS: "passed_live_smoke",
  });
  assert.equal(status.model.deepseek, "blocked");
  assert.equal(status.model.kimiVision, "blocked");
  assert.equal(status.data.amapOfficialMcp, "blocked");
});

test("provider status exposes active model choices without exposing endpoint credentials", () => {
  const status = providerStatusSummary({
    TRAVEL_AGENT_MODEL_PROVIDER: "deepseek",
    TRAVEL_AGENT_MODEL: "deepseek-v4-pro",
    TRAVEL_AGENT_VISION_PROVIDER: "moonshotai-cn",
    TRAVEL_AGENT_VISION_MODEL: "kimi-k3",
    MOONSHOT_API_KEY: "must-not-appear",
  });
  assert.deepEqual(status.routing.multimodal, { provider: "moonshotai-cn", model: "kimi-k3" });
  assert.equal(JSON.stringify(status).includes("must-not-appear"), false);
});

test("user model choices prioritize DeepSeek V4 Flash, then Pro, then Kimi K3", () => {
  const status = providerStatusSummary({ DEEPSEEK_API_KEY: "deepseek", MOONSHOT_API_KEY: "kimi" });
  assert.equal(status.modelSelection.defaultModelId, "deepseek-v4-flash");
  assert.deepEqual(status.modelSelection.options.map((option) => option.id), ["deepseek-v4-flash", "deepseek-v4-pro", "kimi-k3"]);
  assert.deepEqual(status.modelSelection.subagentDefault, { provider: "moonshotai-cn", model: "kimi-k2.6", label: "Kimi K2.6" });
  assert.equal(status.modelSelection.options.every((option) => option.available), true);
});

test("unimplemented channel credentials cannot make an adapter appear connected", () => {
  const status = providerStatusSummary({
    WECHAT_APP_ID: "legacy-app",
    WECHAT_APP_SECRET: "legacy-secret",
    ALIPAY_APP_ID: "legacy-app",
    APPLE_CLIENT_ID: "legacy-app",
    TRAVEL_SOCIAL_WORKER_URL: "https://legacy.example",
  });
  assert.deepEqual(status.channels, {
    wechat: "blocked_pending_auth_adapter",
    alipay: "blocked_pending_auth_adapter",
    apple: "blocked_pending_auth_adapter",
  });
  assert.equal(status.data.socialReadWorker, "blocked_pending_isolated_worker");
});

test("inventory status distinguishes audited FlyAI trial access from production authorization", () => {
  const development = providerStatusSummary({
    NODE_ENV: "development",
    TRAVEL_AGENT_FLYAI_ENABLED: "true",
    TRAVEL_AGENT_FLYAI_SMOKE_STATUS: "passed_read_only_isolated_guest",
  });
  assert.equal(development.data.fliggyFlyAi, "trial_read_only");
  assert.equal(development.data.railway, "trial_read_only_fliggy");
  assert.equal(development.data.flightsAndHotels, "trial_read_only_fliggy");

  const production = providerStatusSummary({
    NODE_ENV: "production",
    TRAVEL_AGENT_FLYAI_ENABLED: "true",
    TRAVEL_AGENT_FLYAI_SMOKE_STATUS: "passed_read_only_isolated_guest",
  });
  assert.equal(production.data.fliggyFlyAi, "blocked_missing_api_key");
  assert.equal(production.data.railway, "blocked_pending_authorized_provider");
});

test("Tuniu MCP remains blocked until key and isolated smoke are both present", () => {
  const pending = providerStatusSummary({ TRAVEL_AGENT_TUNIU_ENABLED: "true", TUNIU_API_KEY: "secret" });
  assert.equal(pending.data.tuniuOfficialMcp, "credential_configured_pending_smoke");
  const passed = providerStatusSummary({
    TRAVEL_AGENT_TUNIU_ENABLED: "true",
    TUNIU_API_KEY: "secret",
    TRAVEL_AGENT_TUNIU_SMOKE_STATUS: "passed_read_only_isolated",
  });
  assert.equal(passed.data.tuniuOfficialMcp, "available_read_only");
  assert.equal(JSON.stringify(passed).includes("secret"), false);
});
