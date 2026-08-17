import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { TravelService } from "../src/api/travel-service.mjs";
import { createAuthService } from "../src/http/auth-providers.mjs";
import { createHttpApp } from "../src/http/app.mjs";
import { authenticatedUserId, SignedSessionStore } from "../src/http/session.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

const fixedClock = () => new Date("2026-08-17T08:00:00.000Z");
const sessionSecret = "session-secret-for-tests-only-1234567890";
const stateSecret = "state-secret-for-tests-only-123456789012";

function googleEnv(overrides = {}) {
  return {
    NODE_ENV: "development",
    TRAVEL_AGENT_SESSION_SECRET: sessionSecret,
    TRAVEL_AGENT_AUTH_STATE_SECRET: stateSecret,
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-client-secret-for-test",
    ...overrides,
  };
}

function signedGoogleToken({ privateKey, kid, nonce }) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: "google-client-id.apps.googleusercontent.com",
    sub: "google-subject-123",
    name: "旅行者 Google",
    nonce,
    iat: Math.floor(fixedClock().getTime() / 1000),
    exp: Math.floor(fixedClock().getTime() / 1000) + 600,
  })).toString("base64url");
  const content = `${header}.${payload}`;
  return `${content}.${sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url")}`;
}

test("auth provider summary exposes usable login choices without exposing credentials", () => {
  const service = createAuthService({ env: googleEnv(), clock: fixedClock });
  const summary = service.providerSummary({ origin: "http://127.0.0.1:8797" });
  assert.equal(summary.primaryProvider, "google");
  assert.equal(summary.providers.find((provider) => provider.id === "google").available, true);
  assert.equal(summary.providers.find((provider) => provider.id === "wechat").available, false);
  assert.equal(summary.providers.find((provider) => provider.id === "wechat").unavailableReason, "https_required");
  assert.equal(JSON.stringify(summary).includes("google-client-secret-for-test"), false);
});

test("Google authorization uses signed state and verifies the returned identity token", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = "google-test-key";
  jwk.alg = "RS256";
  const calls = [];
  let idToken;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url) === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
    if (String(url) === "https://www.googleapis.com/oauth2/v3/certs") return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    return new Response("not found", { status: 404 });
  };
  const service = createAuthService({ env: googleEnv(), fetchImpl, clock: fixedClock });
  const authorization = service.beginWeb({ provider: "google", origin: "http://127.0.0.1:8797", returnTo: "/?from=login" });
  const url = new URL(authorization.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:8797/api/auth/google/callback");
  assert.equal(authorization.authorizationUrl.includes("google-client-secret-for-test"), false);
  idToken = signedGoogleToken({ privateKey, kid: jwk.kid, nonce: authorization.nonce });
  const completed = await service.completeWeb({ provider: "google", code: "single-use-code", state: authorization.state, nonce: authorization.nonce });
  assert.equal(completed.identity.provider, "google");
  assert.equal(completed.identity.subject, "google-subject-123");
  assert.equal(completed.identity.displayName, "旅行者 Google");
  assert.equal(completed.returnTo, "/?from=login");
  assert.deepEqual(calls.map((call) => call.url), ["https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v3/certs"]);
  await assert.rejects(
    service.completeWeb({ provider: "google", code: "code", state: `${authorization.state}tampered`, nonce: authorization.nonce }),
    (error) => error.code === "auth_state_invalid",
  );
});

test("WeChat Mini Program authorization code is exchanged server-side", async () => {
  const env = googleEnv({ WECHAT_MINIAPP_APP_ID: "wx-mini-app", WECHAT_MINIAPP_APP_SECRET: "wx-mini-secret" });
  let requestedUrl;
  const service = createAuthService({
    env,
    clock: fixedClock,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return new Response(JSON.stringify({ openid: "wechat-open-id", unionid: "wechat-union-id" }), { status: 200 });
    },
  });
  const identity = await service.exchangePlatform({ provider: "wechat", authorizationCode: "wx-one-time-code" });
  assert.equal(identity.subject, "wechat-union-id");
  assert.equal(requestedUrl.origin, "https://api.weixin.qq.com");
  assert.equal(requestedUrl.searchParams.get("js_code"), "wx-one-time-code");
});

test("signed production sessions survive store recreation and reject tampering or logout reuse", () => {
  const first = new SignedSessionStore({ secret: sessionSecret, clock: fixedClock });
  const userId = authenticatedUserId({ provider: "google", subject: "subject-1" });
  const issued = first.issue({ userId, provider: "google", displayName: "旅行者" });
  const second = new SignedSessionStore({ secret: sessionSecret, clock: fixedClock });
  assert.equal(second.read(issued.opaqueToken).userId, userId);
  assert.equal(second.read(issued.opaqueToken).displayName, "旅行者");
  assert.equal(second.read(`${issued.opaqueToken}x`), null);
  second.revoke(issued.opaqueToken);
  assert.equal(second.read(issued.opaqueToken), null);
});

test("HTTP auth routes expose providers, redirect to login, issue Web cookies and return Mini Program bearer sessions", async () => {
  const sessionStore = new SignedSessionStore({ secret: sessionSecret, clock: fixedClock });
  const authService = {
    providerSummary: () => ({ schemaVersion: "auth-providers-v1", primaryProvider: "google", providers: [{ id: "google", label: "Google", available: true, startPath: "/api/auth/google/start" }] }),
    beginWeb: () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test", nonce: "nonce-1", cookieSameSite: "lax", cookieSecure: false, cookieMaxAge: 600_000 }),
    completeWeb: async () => ({ identity: { provider: "google", subject: "subject-http", displayName: "HTTP User" }, returnTo: "/" }),
    exchangePlatform: async ({ provider }) => ({ provider, subject: "miniapp-subject", displayName: null }),
  };
  const store = new TripStore();
  store.mode = "memory";
  const app = createHttpApp({
    travelService: new TravelService({ store }),
    sessionStore,
    authService,
    runtimeEnv: { NODE_ENV: "development", TRAVEL_AGENT_SESSION_SECRET: sessionSecret },
  });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const providers = await fetch(`${origin}/api/auth/providers`).then((response) => response.json());
    assert.equal(providers.primaryProvider, "google");
    const start = await fetch(`${origin}/api/auth/google/start`, { redirect: "manual" });
    assert.equal(start.status, 302);
    assert.match(start.headers.get("location"), /^https:\/\/accounts\.google\.com/);
    assert.match(start.headers.get("set-cookie"), /travel_oauth_nonce_google=nonce-1/);

    const callback = await fetch(`${origin}/api/auth/google/callback?code=code&state=state`, { headers: { cookie: "travel_oauth_nonce_google=nonce-1" }, redirect: "manual" });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/?auth=success");
    assert.match(callback.headers.get("set-cookie"), /travel_session=/);

    const platform = await fetch(`${origin}/api/auth/platform-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "wechat", authorizationCode: "code" }),
    });
    const platformSession = await platform.json();
    assert.equal(platform.status, 201);
    assert.equal(platformSession.provider, "wechat");
    assert.ok(sessionStore.read(platformSession.accessToken));
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
