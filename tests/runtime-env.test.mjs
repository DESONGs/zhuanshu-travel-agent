import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { visualCompletionOptions } from "../src/agent/travel-conversation-agent.mjs";
import { loadTravelRuntimeEnv, parseTravelEnvFile } from "../src/http/runtime-env.mjs";

test("runtime env loader accepts only explicit Travel Agent keys and preserves key values out of its public surface", () => {
  const values = parseTravelEnvFile([
    "DEEPSEEK_API_KEY=example-deepseek-key",
    "MOONSHOT_API_KEY=example-kimi-key",
    "AMAP_API_KEY=example-amap-key",
    "AMAP_API_SECRET=example-amap-secret",
    "TRAVEL_AGENT_FLYAI_ENABLED=true",
    "FLYAI_API_KEY=example-flyai-key",
    "TRAVEL_AGENT_FLYAI_SMOKE_STATUS=passed_read_only_isolated",
    "TRAVEL_AGENT_TUNIU_ENABLED=true",
    "TUNIU_API_KEY=example-tuniu-key",
    "TRAVEL_AGENT_TUNIU_SMOKE_STATUS=passed_read_only_isolated",
    "TRAVEL_AGENT_PUBLIC_ORIGIN=https://travel.example.com",
    "TRAVEL_AGENT_SESSION_SECRET=example-session-secret-at-least-32-chars",
    "GOOGLE_CLIENT_ID=example-google-client",
    "GOOGLE_CLIENT_SECRET=example-google-secret",
    "WECHAT_MINIAPP_APP_ID=example-wechat-miniapp",
    "ALIPAY_PRIVATE_KEY_PATH=/secure/alipay-private.pem",
    "APPLE_PRIVATE_KEY_PATH=/secure/AuthKey_TEST.p8",
    "FEISHU_APP_SECRET=must-not-load",
    "PI_MODEL=must-not-load",
    "UNRELATED_SECRET=must-not-load",
    "MALFORMED",
  ].join("\n"));
  assert.equal(values.DEEPSEEK_API_KEY, "example-deepseek-key");
  assert.equal(values.MOONSHOT_API_KEY, "example-kimi-key");
  assert.equal(values.AMAP_API_KEY, "example-amap-key");
  assert.equal(values.AMAP_API_SECRET, "example-amap-secret");
  assert.equal(values.FLYAI_API_KEY, "example-flyai-key");
  assert.equal(values.TUNIU_API_KEY, "example-tuniu-key");
  assert.equal(values.TRAVEL_AGENT_PUBLIC_ORIGIN, "https://travel.example.com");
  assert.equal(values.GOOGLE_CLIENT_ID, "example-google-client");
  assert.equal(values.WECHAT_MINIAPP_APP_ID, "example-wechat-miniapp");
  assert.equal(values.ALIPAY_PRIVATE_KEY_PATH, "/secure/alipay-private.pem");
  assert.equal(values.APPLE_PRIVATE_KEY_PATH, "/secure/AuthKey_TEST.p8");
  assert.equal(Object.hasOwn(values, "UNRELATED_SECRET"), false);
  assert.equal(Object.hasOwn(values, "FEISHU_APP_SECRET"), false);
  assert.equal(Object.hasOwn(values, "PI_MODEL"), false);
});

test("runtime env maps the canonical DeepSeek and Kimi keys to their Travel Agent roles", async () => {
  const runtime = await loadTravelRuntimeEnv({
    baseEnv: { DEEPSEEK_API_KEY: "deepseek-key", MOONSHOT_API_KEY: "kimi-key" },
    envFile: "/private/tmp/does-not-exist-travel-env",
  });
  assert.equal(runtime.TRAVEL_AGENT_MODEL_PROVIDER, "deepseek");
  assert.equal(runtime.TRAVEL_AGENT_MODEL, "deepseek-v4-flash");
  assert.equal(runtime.MOONSHOT_API_KEY, "kimi-key");
  assert.equal(runtime.TRAVEL_AGENT_VISION_PROVIDER, "moonshotai-cn");
  assert.equal(runtime.TRAVEL_AGENT_VISION_MODEL, "kimi-k2.6");
});

test("runtime env loads an ignored local file on Windows without interpreting POSIX mode bits", async () => {
  const root = await mkdtemp(join(tmpdir(), "travel-env-win32-"));
  const envFile = join(root, "env_travel.local");
  await writeFile(envFile, "DEEPSEEK_API_KEY=windows-local-key\n", "utf8");
  const runtime = await loadTravelRuntimeEnv({ baseEnv: {}, envFile, platform: "win32" });
  assert.equal(runtime.DEEPSEEK_API_KEY, "windows-local-key");
  assert.equal(runtime.TRAVEL_AGENT_RUNTIME_ENV_FILE_PERMISSIONS_SAFE, "true");
});

test("runtime env does not map legacy meeting and Kimi alias keys into Travel Agent roles", async () => {
  const runtime = await loadTravelRuntimeEnv({
    baseEnv: { PI_PROVIDER: "deepseek", PI_MODEL: "deepseek-v4-pro", KIMI_API_KEY: "legacy-key", FEISHU_APP_SECRET: "legacy-secret" },
    envFile: "/private/tmp/does-not-exist-travel-env",
  });
  assert.equal(runtime.TRAVEL_AGENT_MODEL_PROVIDER, undefined);
  assert.equal(runtime.MOONSHOT_API_KEY, undefined);
  assert.equal(runtime.FEISHU_APP_SECRET, "legacy-secret");
});

test("runtime env preserves an explicitly selected international Kimi provider", async () => {
  const runtime = await loadTravelRuntimeEnv({
    baseEnv: { MOONSHOT_API_KEY: "kimi-key", TRAVEL_AGENT_VISION_PROVIDER: "moonshotai", TRAVEL_AGENT_VISION_MODEL: "kimi-k3" },
    envFile: "/private/tmp/does-not-exist-travel-env",
  });
  assert.equal(runtime.TRAVEL_AGENT_VISION_PROVIDER, "moonshotai");
  assert.equal(runtime.TRAVEL_AGENT_VISION_MODEL, "kimi-k3");
});

test("Kimi K2.6 visual extraction disables long thinking while K3 keeps native routing", () => {
  const k26 = visualCompletionOptions("kimi-k2.6", { maxTokens: 1200 });
  assert.deepEqual(k26.onPayload({ model: "kimi-k2.6" }).thinking, { type: "disabled" });
  assert.equal(Object.hasOwn(visualCompletionOptions("kimi-k3", { maxTokens: 1200 }), "onPayload"), false);
});
