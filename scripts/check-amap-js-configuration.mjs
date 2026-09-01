import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { providerStatusSummary } from "../src/providers/provider-status.mjs";

const env = await loadTravelRuntimeEnv();
const summary = providerStatusSummary(env);
const configured = Boolean(env.AMAP_JS_API_KEY && env.AMAP_JS_SECURITY_CODE);
const origin = String(env.TRAVEL_AGENT_PUBLIC_ORIGIN || "").trim();
const desktopOrigin = String(env.TRAVEL_AGENT_DESKTOP_API_ORIGIN || origin).trim();
const result = {
  schemaVersion: "amap-js-configuration-check-v1",
  status: configured ? (env.TRAVEL_AGENT_AMAP_JS_SMOKE_STATUS === "passed_live_smoke" ? "passed_live_smoke" : "configured_pending_browser_smoke") : "needs_manual_configuration",
  webService: summary.data.amapOfficialMcp,
  renderer: summary.mapRenderer.amapJs.status,
  requirements: {
    publicJsKey: Boolean(env.AMAP_JS_API_KEY),
    serverSideSecurityCode: Boolean(env.AMAP_JS_SECURITY_CODE),
    webOrigin: origin || null,
    desktopCustomOrigin: "travelapp://app",
    desktopApiOrigin: desktopOrigin || null,
  },
  browserSmoke: env.TRAVEL_AGENT_AMAP_JS_SMOKE_STATUS || "not_run",
  secretsPrinted: false,
  next: configured ? "Run a real browser smoke on the registered Web/PWA origin and travelapp://app before marking passed_live_smoke." : "Create an AMap Web JS key and security code, register the Web origin, then validate the desktop custom origin with AMap support before desktop release.",
};
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.status === "passed_live_smoke" ? 0 : 2;
