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
  assert.equal(status.model.deepseekVision, "blocked");
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

test("provider status reports DeepSeek visual readiness independently from text-model smoke", () => {
  const status = providerStatusSummary({
    DEEPSEEK_API_KEY: "must-not-appear",
    TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS: "passed_live_smoke",
    TRAVEL_AGENT_DEEPSEEK_VISION_SMOKE_STATUS: "credential_configured_pending_smoke",
    TRAVEL_AGENT_VISION_PROVIDER: "deepseek",
    TRAVEL_AGENT_VISION_MODEL: "deepseek-v4-flash-vision-exp",
  });
  assert.equal(status.model.deepseek, "passed_live_smoke");
  assert.equal(status.model.deepseekVision, "credential_configured_pending_smoke");
  assert.equal(JSON.stringify(status).includes("must-not-appear"), false);
});

test("user model choices prioritize DeepSeek V4 Flash, then Pro, then Kimi K3", () => {
  const status = providerStatusSummary({ DEEPSEEK_API_KEY: "deepseek", MOONSHOT_API_KEY: "kimi" });
  assert.equal(status.modelSelection.defaultModelId, "deepseek-v4-flash");
  assert.deepEqual(status.modelSelection.options.map((option) => option.id), ["deepseek-v4-flash", "deepseek-v4-pro", "kimi-k3"]);
  assert.deepEqual(status.modelSelection.subagentDefault, { provider: "moonshotai-cn", model: "kimi-k2.6", label: "Kimi K2.6" });
  assert.equal(status.modelSelection.options.every((option) => option.available), true);
});

test("channel status is derived from the implemented auth contract without exposing legacy credentials", () => {
  const status = providerStatusSummary({
    WECHAT_APP_ID: "legacy-app",
    WECHAT_APP_SECRET: "legacy-secret",
    ALIPAY_APP_ID: "legacy-app",
    APPLE_CLIENT_ID: "legacy-app",
    TRAVEL_SOCIAL_WORKER_URL: "https://legacy.example",
  });
  assert.deepEqual(status.channels, {
    google: "blocked_missing_secure_session",
    wechat: "blocked_missing_secure_session",
    alipay: "blocked_missing_secure_session",
    apple: "blocked_missing_secure_session",
  });
  assert.equal(status.data.socialReadWorker, "blocked_pending_isolated_worker");
});

test("configured login adapters remain pending until a real account smoke passes", () => {
  const common = {
    TRAVEL_AGENT_PUBLIC_ORIGIN: "https://travel.example.com",
    TRAVEL_AGENT_SESSION_SECRET: "s".repeat(32),
    TRAVEL_AGENT_AUTH_STATE_SECRET: "a".repeat(32),
  };
  const status = providerStatusSummary({
    ...common,
    WECHAT_OPEN_APP_ID: "wechat-web",
    WECHAT_OPEN_APP_SECRET: "wechat-secret",
    WECHAT_MINIAPP_APP_ID: "wechat-mini",
    WECHAT_MINIAPP_APP_SECRET: "wechat-mini-secret",
    ALIPAY_WEB_APP_ID: "alipay-web-app",
    ALIPAY_WEB_PRIVATE_KEY_PATH: "/run/secrets/alipay-web-private.pem",
    ALIPAY_WEB_PUBLIC_KEY_PATH: "/run/secrets/alipay-web-public.pem",
    ALIPAY_MINIAPP_APP_ID: "alipay-mini-app",
    ALIPAY_MINIAPP_PRIVATE_KEY_PATH: "/run/secrets/alipay-mini-private.pem",
    ALIPAY_MINIAPP_PUBLIC_KEY_PATH: "/run/secrets/alipay-mini-public.pem",
    APPLE_CLIENT_ID: "com.example.travel.web",
    APPLE_TEAM_ID: "TEAM123",
    APPLE_KEY_ID: "KEY123",
    APPLE_PRIVATE_KEY_PATH: "/run/secrets/apple.p8",
  });
  assert.deepEqual(status.channels, {
    google: "blocked_missing_credentials",
    wechat: "web_and_miniapp_credentials_configured_pending_smoke",
    alipay: "web_and_miniapp_credentials_configured_pending_smoke",
    apple: "credential_configured_pending_smoke",
  });
  assert.equal(JSON.stringify(status).includes("wechat-secret"), false);
});

test("login channel status promotes Web and Mini Program routes only after their own live smokes", () => {
  const status = providerStatusSummary({
    TRAVEL_AGENT_PUBLIC_ORIGIN: "https://travel.example.com",
    TRAVEL_AGENT_SESSION_SECRET: "s".repeat(32),
    TRAVEL_AGENT_AUTH_STATE_SECRET: "a".repeat(32),
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    TRAVEL_AGENT_GOOGLE_AUTH_SMOKE_STATUS: "passed_live_smoke",
    WECHAT_OPEN_APP_ID: "wechat-web",
    WECHAT_OPEN_APP_SECRET: "wechat-web-secret",
    WECHAT_MINIAPP_APP_ID: "wechat-mini",
    WECHAT_MINIAPP_APP_SECRET: "wechat-mini-secret",
    TRAVEL_AGENT_WECHAT_WEB_AUTH_SMOKE_STATUS: "passed_live_smoke",
    TRAVEL_AGENT_WECHAT_MINIAPP_AUTH_SMOKE_STATUS: "passed_live_smoke",
    ALIPAY_WEB_APP_ID: "alipay-web-app",
    ALIPAY_WEB_PRIVATE_KEY_PATH: "/run/secrets/alipay-web-private.pem",
    ALIPAY_WEB_PUBLIC_KEY_PATH: "/run/secrets/alipay-web-public.pem",
    ALIPAY_MINIAPP_APP_ID: "alipay-mini-app",
    ALIPAY_MINIAPP_PRIVATE_KEY_PATH: "/run/secrets/alipay-mini-private.pem",
    ALIPAY_MINIAPP_PUBLIC_KEY_PATH: "/run/secrets/alipay-mini-public.pem",
    TRAVEL_AGENT_ALIPAY_WEB_AUTH_SMOKE_STATUS: "passed_live_smoke",
    TRAVEL_AGENT_ALIPAY_MINIAPP_AUTH_SMOKE_STATUS: "passed_live_smoke",
    APPLE_CLIENT_ID: "com.example.travel.web",
    APPLE_TEAM_ID: "TEAM123",
    APPLE_KEY_ID: "KEY123",
    APPLE_PRIVATE_KEY_PATH: "/run/secrets/apple.p8",
    TRAVEL_AGENT_APPLE_AUTH_SMOKE_STATUS: "passed_live_smoke",
  });
  assert.equal(status.channels.google, "passed_live_smoke");
  assert.equal(status.channels.wechat, "web_and_miniapp_passed_live_smoke");
  assert.equal(status.channels.alipay, "web_and_miniapp_passed_live_smoke");
  assert.equal(status.channels.apple, "passed_live_smoke");
  assert.equal(JSON.stringify(status).includes("google-secret"), false);
  assert.equal(JSON.stringify(status).includes("wechat-web-secret"), false);
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
