import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const ALLOWED_FILE_KEYS = new Set([
  "PORT",
  "NODE_ENV",
  "DATABASE_URL",
  "TRAVEL_AGENT_DATA_DIR",
  "TRAVEL_AGENT_CONVERSATION_DATA_DIR",
  "TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH",
  "TRAVEL_AGENT_PUBLIC_ORIGIN",
  "TRAVEL_AGENT_SESSION_SECRET",
  "TRAVEL_AGENT_AUTH_STATE_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "WECHAT_MINIAPP_APP_ID",
  "WECHAT_MINIAPP_APP_SECRET",
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY_PATH",
  "ALIPAY_PUBLIC_KEY_PATH",
  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY_PATH",
  "TRAVEL_AGENT_MODEL_PROVIDER",
  "TRAVEL_AGENT_MODEL",
  "TRAVEL_AGENT_VISION_PROVIDER",
  "TRAVEL_AGENT_VISION_MODEL",
  "DEEPSEEK_API_KEY",
  "MOONSHOT_API_KEY",
  "AMAP_API_KEY",
  "AMAP_API_SECRET",
  "TRAVEL_AGENT_OPEN_METEO_ENABLED",
  "OPEN_METEO_API_KEY",
  "TRAVEL_AGENT_FLYAI_ENABLED",
  "FLYAI_API_KEY",
  "TRAVEL_AGENT_FLYAI_SMOKE_STATUS",
  "TRAVEL_AGENT_TUNIU_ENABLED",
  "TUNIU_API_KEY",
  "TRAVEL_AGENT_TUNIU_SMOKE_STATUS",
  "TRAVEL_AGENT_CORS_ORIGINS",
  "VITE_TRAVEL_API_BASE_URL",
  "TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS",
  "TRAVEL_AGENT_KIMI_SMOKE_STATUS",
  "TRAVEL_AGENT_AMAP_SMOKE_STATUS",
]);

function parseValue(value) {
  const trimmed = String(value ?? "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseTravelEnvFile(text) {
  const values = {};
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    if (!ALLOWED_FILE_KEYS.has(key)) continue;
    values[key] = parseValue(normalized.slice(separator + 1));
  }
  return values;
}

export async function loadTravelRuntimeEnv({ baseEnv = process.env, envFile = baseEnv.TRAVEL_AGENT_ENV_FILE ?? resolve(process.cwd(), "env_travel.local") } = {}) {
  const env = { ...baseEnv };
  try {
    const [contents, metadata] = await Promise.all([readFile(envFile, "utf8"), stat(envFile)]);
    if ((metadata.mode & 0o077) !== 0) {
      const error = new Error("runtime_env_file_permissions_too_open");
      error.code = "runtime_env_file_permissions_too_open";
      error.details = { envFile, requiredMode: "0600" };
      throw error;
    }
    const fileValues = parseTravelEnvFile(contents);
    for (const [key, value] of Object.entries(fileValues)) {
      if (!env[key]) env[key] = value;
    }
    env.TRAVEL_AGENT_RUNTIME_ENV_FILE = envFile;
    env.TRAVEL_AGENT_RUNTIME_ENV_FILE_PERMISSIONS_SAFE = "true";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    env.TRAVEL_AGENT_RUNTIME_ENV_FILE = null;
    env.TRAVEL_AGENT_RUNTIME_ENV_FILE_PERMISSIONS_SAFE = null;
  }
  if (!env.TRAVEL_AGENT_MODEL_PROVIDER && env.DEEPSEEK_API_KEY) env.TRAVEL_AGENT_MODEL_PROVIDER = "deepseek";
  if (!env.TRAVEL_AGENT_MODEL && env.TRAVEL_AGENT_MODEL_PROVIDER === "deepseek") env.TRAVEL_AGENT_MODEL = "deepseek-v4-flash";
  if (!env.TRAVEL_AGENT_VISION_PROVIDER && env.MOONSHOT_API_KEY) env.TRAVEL_AGENT_VISION_PROVIDER = "moonshotai-cn";
  if (!env.TRAVEL_AGENT_VISION_MODEL && ["moonshotai-cn", "moonshotai"].includes(env.TRAVEL_AGENT_VISION_PROVIDER)) env.TRAVEL_AGENT_VISION_MODEL = "kimi-k2.6";
  if (!env.TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS) env.TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS = "not_run";
  if (!env.TRAVEL_AGENT_KIMI_SMOKE_STATUS) env.TRAVEL_AGENT_KIMI_SMOKE_STATUS = "not_run";
  if (!env.TRAVEL_AGENT_AMAP_SMOKE_STATUS) env.TRAVEL_AGENT_AMAP_SMOKE_STATUS = "not_run";
  if (!env.TRAVEL_AGENT_OPEN_METEO_ENABLED) env.TRAVEL_AGENT_OPEN_METEO_ENABLED = "true";
  if (!env.TRAVEL_AGENT_FLYAI_SMOKE_STATUS) env.TRAVEL_AGENT_FLYAI_SMOKE_STATUS = "not_run";
  if (!env.TRAVEL_AGENT_TUNIU_SMOKE_STATUS) env.TRAVEL_AGENT_TUNIU_SMOKE_STATUS = "not_run";
  return Object.freeze(env);
}
