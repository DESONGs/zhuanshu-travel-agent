function configured(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function liveState(env, key, fallback) {
  return env[key] && env[key] !== "not_run" ? env[key] : fallback;
}

function flyaiState(env) {
  if (env.TRAVEL_AGENT_FLYAI_ENABLED !== "true") return "blocked_by_configuration";
  if (!String(env.TRAVEL_AGENT_FLYAI_SMOKE_STATUS ?? "").startsWith("passed_read_only_isolated")) return "blocked_pending_read_only_smoke";
  if (configured(env.FLYAI_API_KEY)) return "available_read_only";
  return env.NODE_ENV === "production" ? "blocked_missing_api_key" : "trial_read_only";
}

function tuniuState(env) {
  if (env.TRAVEL_AGENT_TUNIU_ENABLED !== "true") return "blocked_by_configuration";
  if (!configured(env.TUNIU_API_KEY)) return "blocked_missing_api_key";
  return env.TRAVEL_AGENT_TUNIU_SMOKE_STATUS === "passed_read_only_isolated" ? "available_read_only" : "credential_configured_pending_smoke";
}

function inventoryState(flyai, tuniu) {
  if (tuniu === "available_read_only") return "available_read_only_tuniu";
  if (["available_read_only", "trial_read_only"].includes(flyai)) return flyai === "trial_read_only" ? "trial_read_only_fliggy" : "available_read_only_fliggy";
  return "blocked_pending_authorized_provider";
}

function weatherState(env) {
  if (env.TRAVEL_AGENT_AMAP_SMOKE_STATUS === "passed_live_smoke" && configured(env.AMAP_API_KEY)) return "available_amap_official";
  if (env.NODE_ENV !== "production" && env.TRAVEL_AGENT_OPEN_METEO_ENABLED !== "false") return "available_open_meteo_noncommercial_development";
  if (env.TRAVEL_AGENT_OPEN_METEO_ENABLED !== "false" && configured(env.OPEN_METEO_API_KEY)) return "available_open_meteo_commercial";
  return "blocked_pending_authorized_weather_provider";
}

function unavailableAuthState(reason) {
  if (reason === "https_required") return "blocked_https_required";
  if (reason === "secure_session_required") return "blocked_missing_secure_session";
  return "blocked_missing_credentials";
}

function authChannelStates(env) {
  const summary = createAuthService({ env }).providerSummary({ origin: env.TRAVEL_AGENT_PUBLIC_ORIGIN });
  const providers = new Map(summary.providers.map((provider) => [provider.id, provider]));
  const webState = (provider) => provider?.available === true ? "credential_configured_pending_smoke" : unavailableAuthState(provider?.unavailableReason);
  const googleWeb = providers.get("google");
  const wechatWeb = providers.get("wechat");
  const alipayWeb = providers.get("alipay");
  const appleWeb = providers.get("apple");
  const wechatMini = configured(env.WECHAT_MINIAPP_APP_ID) && configured(env.WECHAT_MINIAPP_APP_SECRET);
  const alipayMini = configured(env.ALIPAY_APP_ID)
    && configured(env.ALIPAY_PRIVATE_KEY_PATH)
    && configured(env.ALIPAY_PUBLIC_KEY_PATH)
    && String(env.TRAVEL_AGENT_SESSION_SECRET ?? "").length >= 32;
  return {
    google: webState(googleWeb),
    wechat: wechatWeb?.available && wechatMini ? "web_and_miniapp_credentials_configured_pending_smoke"
      : wechatWeb?.available ? "web_credentials_configured_pending_smoke"
        : wechatMini ? "miniapp_credentials_configured_pending_smoke" : webState(wechatWeb),
    alipay: alipayWeb?.available && alipayMini ? "web_and_miniapp_credentials_configured_pending_smoke"
      : alipayWeb?.available ? "web_credentials_configured_pending_smoke"
        : alipayMini ? "miniapp_credentials_configured_pending_smoke" : webState(alipayWeb),
    apple: webState(appleWeb),
  };
}

export function providerStatusSummary(env = process.env) {
  const fliggyFlyAi = flyaiState(env);
  const tuniuOfficialMcp = tuniuState(env);
  const authorizedInventory = inventoryState(fliggyFlyAi, tuniuOfficialMcp);
  return {
    schemaVersion: "travel-provider-configuration-v1",
    routing: {
      reasoning: {
        provider: env.TRAVEL_AGENT_MODEL_PROVIDER || null,
        model: env.TRAVEL_AGENT_MODEL || null,
      },
      multimodal: {
        provider: env.TRAVEL_AGENT_VISION_PROVIDER || null,
        model: env.TRAVEL_AGENT_VISION_MODEL || null,
      },
    },
    modelSelection: publicModelSelection(env),
    model: {
      deepseek: configured(env.DEEPSEEK_API_KEY) ? liveState(env, "TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS", "credential_configured_pending_smoke") : "blocked",
      kimiVision: configured(env.MOONSHOT_API_KEY) ? liveState(env, "TRAVEL_AGENT_KIMI_SMOKE_STATUS", "credential_configured_pending_smoke") : "blocked",
    },
    data: {
      amapOfficialMcp: configured(env.AMAP_API_KEY) ? liveState(env, "TRAVEL_AGENT_AMAP_SMOKE_STATUS", "credential_configured_pending_smoke") : "blocked",
      weather: weatherState(env),
      fliggyFlyAi,
      tuniuOfficialMcp,
      socialReadWorker: "blocked_pending_isolated_worker",
      railway: authorizedInventory,
      flightsAndHotels: authorizedInventory,
    },
    channels: authChannelStates(env),
  };
}
import { publicModelSelection } from "../agent/user-model-options.mjs";
import { createAuthService } from "../http/auth-providers.mjs";
