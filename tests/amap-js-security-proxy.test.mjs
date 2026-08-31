import assert from "node:assert/strict";
import test from "node:test";
import { resolveAmapSecurityProxyUrl } from "../src/http/amap-js-security-proxy.mjs";
import { providerStatusSummary } from "../src/providers/provider-status.mjs";

test("AMap security proxy uses fixed official upstreams and replaces client jscode", () => {
  const webService = resolveAmapSecurityProxyUrl("http://local/_AMapService/v3/geocode/regeo?key=attacker-key&jscode=attacker", "server-secret", "configured-public-key");
  assert.equal(webService.origin, "https://restapi.amap.com");
  assert.equal(webService.pathname, "/v3/geocode/regeo");
  assert.equal(webService.searchParams.get("key"), "configured-public-key");
  assert.equal(webService.searchParams.get("jscode"), "server-secret");
  const style = resolveAmapSecurityProxyUrl("/_AMapService/v4/map/styles?styleid=test", "server-secret", "configured-public-key");
  assert.equal(style.origin, "https://webapi.amap.com");
  assert.equal(resolveAmapSecurityProxyUrl("/_AMapService/../evil", "server-secret", "configured-public-key"), null);
  assert.equal(resolveAmapSecurityProxyUrl("/_AMapService/v3/place/text", "", "configured-public-key"), null);
  assert.equal(resolveAmapSecurityProxyUrl("/_AMapService/v3/place/text", "server-secret", ""), null);
});

test("renderer status exposes only the browser key and never the security code", () => {
  const pending = providerStatusSummary({ AMAP_JS_API_KEY: "public-js-key", AMAP_JS_SECURITY_CODE: "server-secret" });
  assert.equal(pending.mapRenderer.preferred, "amap_js");
  assert.equal(pending.mapRenderer.amapJs.status, "configured_pending_browser_smoke");
  assert.equal(pending.mapRenderer.amapJs.publicKey, "public-js-key");
  assert.equal(JSON.stringify(pending).includes("server-secret"), false);
  const unconfigured = providerStatusSummary({});
  assert.equal(unconfigured.mapRenderer.amapJs.status, "amap_js_renderer_not_configured");
  const disabled = providerStatusSummary({ AMAP_JS_API_KEY: "public-js-key", AMAP_JS_SECURITY_CODE: "server-secret", TRAVEL_AGENT_AMAP_JS_RENDERER_ENABLED: "false" });
  assert.equal(disabled.mapRenderer.preferred, "leaflet");
  assert.equal(disabled.mapRenderer.amapJs.status, "amap_js_renderer_disabled");
  assert.equal(disabled.mapRenderer.amapJs.publicKey, null);
});
