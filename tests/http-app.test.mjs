import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TravelService } from "../src/api/travel-service.mjs";
import { createHttpApp } from "../src/http/app.mjs";
import { FileConversationRepository } from "../src/persistence/conversation-repository.mjs";
import { InMemorySessionStore } from "../src/http/session.mjs";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

async function httpFixture({ conversationAgent } = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-http-"));
  const store = new TripStore({ rootDir });
  store.mode = "file";
  const service = new TravelService({ store, clock: () => new Date("2026-08-24T12:00:00.000Z") });
  const conversationRepository = new FileConversationRepository({ rootDir: join(rootDir, "conversations") });
  const app = createHttpApp({ travelService: service, conversationRepository, conversationAgent, sessionStore: new InMemorySessionStore({ clock: () => new Date("2026-08-24T12:00:00.000Z") }), developmentAuthEnabled: true });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const request = async (path, { method = "GET", body, token, headers = {} } = {}) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const value = response.status === 204 ? null : await response.json();
    return { response, value };
  };
  return { request, close: () => new Promise((resolveClose) => server.close(resolveClose)) };
}

function transitProposal(tripId) {
  return {
    schemaVersion: "trip-patch-proposal-v1",
    proposalId: "proposal_transit_http",
    tripId,
    baseRevision: 0,
    writeSet: ["transport_http"],
    writeContract: { allowedNodeIds: ["transport_http"] },
    readSet: [],
    operations: [{
      kind: "add_candidate",
      nodeId: "transport_http",
      node: {
        nodeId: "transport_http",
        domain: "transport",
        title: "从酒店前往外滩",
        selected: true,
        sourceStatus: "user_input",
        sourceRefs: ["amap_web_service:transport_http"],
        operability: {
          transitSegment: {
            segmentId: "segment_http",
            status: "needs_refresh",
            originLabel: "酒店",
            destinationLabel: "外滩",
            totalMinutes: 25,
            source: "user_input",
            travelerFit: { summary: "适合行李与长辈同行", tradeoff: "比最快路线慢 4 分钟", stepFree: true },
            steps: [
              { kind: "walk", title: "步行至 2 号口", durationMinutes: 8 },
              { kind: "enter_station", title: "2 号口进站", accessible: true, facilities: [{ kind: "elevator", area: "outside_station", label: "2号口电梯", source: "user_input" }] },
              { kind: "ride", title: "乘坐地铁 10 号线", durationMinutes: 8, line: "10号线", direction: "待实时核验" },
              { kind: "exit_station", title: "1 号口出站", facilities: [{ kind: "toilet", area: "paid_area", label: "站内卫生间", source: "user_input" }, { kind: "locker", area: "outside_station", label: "1号口寄存柜", source: "user_input" }] },
              { kind: "arrive", title: "步行抵达外滩", durationMinutes: 5, facilities: [{ kind: "power_bank", area: "outside_station", label: "2号口外充电宝", source: "user_input" }] },
            ],
          },
        },
      },
    }],
  };
}

test("HTTP API authenticates development sessions, enforces trip membership, and serves accepted transit details", async () => {
  const { request, close } = await httpFixture();
  try {
    const firstSession = await request("/api/auth/session", { method: "POST", body: { provider: "email_otp", identity: "owner@example.com" } });
    assert.equal(firstSession.response.status, 201);
    const ownerToken = firstSession.value.accessToken;

    const created = await request("/api/trips", { method: "POST", token: ownerToken, body: { tripId: "trip_http", brief: { destination: "上海", dates: "2026-10-02–06" }, travelers: [{ travelerId: "traveler_1" }] } });
    assert.equal(created.response.status, 201);
    assert.equal(created.value.tripId, "trip_http");

    const proposal = transitProposal("trip_http");
    const staged = await request("/api/trips/trip_http/proposals", { method: "POST", token: ownerToken, body: { proposal } });
    assert.equal(staged.value.status, "proposed");
    const accepted = await request("/api/trips/trip_http/proposals/proposal_transit_http/accept", { method: "POST", token: ownerToken });
    assert.equal(accepted.value.status, "committed");

    const transit = await request("/api/trips/trip_http/transit/transport_http", { token: ownerToken });
    assert.equal(transit.response.status, 200);
    assert.equal(transit.value.segment.destinationLabel, "外滩");
    assert.equal(transit.value.segment.steps[1].facilities[0].label, "2号口电梯");
    assert.equal(transit.value.segment.steps[3].facilities[0].area, "paid_area");
    const plan = await request("/api/trips/trip_http/plan", { token: ownerToken });
    assert.equal(plan.response.status, 200);
    assert.equal(plan.value.transitSegments[0].nodeId, "transport_http");
    assert.equal(plan.value.transitSegments[0].segment.segmentId, "segment_http");
    assert.equal(plan.value.transitSegments[0].segment.steps[0].detail, null);
    const mobility = await request("/api/trips/trip_http/mobility/refresh", { method: "POST", token: ownerToken });
    assert.equal(mobility.response.status, 200);
    assert.equal(mobility.value.status, "provider_unavailable");
    assert.equal(mobility.value.fabricatedResults, false);
    const currentPlan = await request("/api/trips/trip_http/plan", { token: ownerToken });
    const feedback = await request("/api/trips/trip_http/feedback", { method: "POST", token: ownerToken, body: { baseRevision: currentPlan.value.revision, category: "personal_experience", nodeId: "transport_http", text: "换乘指引清楚，带行李也比较从容。", visibility: "anonymous_travelers", verdict: "recommend", tags: ["comfortable_pace"] } });
    assert.equal(feedback.response.status, 201);
    assert.equal(feedback.value.status, "committed");
    const planWithFeedback = await request("/api/trips/trip_http/plan", { token: ownerToken });
    assert.equal(planWithFeedback.value.byDomain.transport[0].visitFeedback.experienceCount, 1);
    assert.equal(planWithFeedback.value.byDomain.transport[0].visitFeedback.topTags[0].key, "comfortable_pace");

    const secondSession = await request("/api/auth/session", { method: "POST", body: { provider: "email_otp", identity: "other@example.com" } });
    const strangerTrips = await request("/api/trips", { token: secondSession.value.accessToken });
    assert.deepEqual(strangerTrips.value.trips, []);
    const denied = await request("/api/trips/trip_http/plan", { token: secondSession.value.accessToken });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.value.code, "trip_access_denied");
  } finally {
    await close();
  }
});

test("HTTP conversation entrypoint preserves the user request but never fabricates an Agent reply without a configured model", async () => {
  const { request, close } = await httpFixture();
  try {
    const session = await request("/api/auth/session", { method: "POST", body: { provider: "email_otp", identity: "chat@example.com" } });
    const token = session.value.accessToken;
    const conversation = await request("/api/conversations", { method: "POST", token, body: { modelId: "kimi-k3" } });
    assert.equal(conversation.response.status, 201);
    assert.equal(conversation.value.modelId, "kimi-k3");

    const turn = await request(`/api/conversations/${conversation.value.conversationId}/messages`, { method: "POST", token, body: { text: "国庆和父母去大理五天，轻松一点", modelId: "kimi-k3" } });
    assert.equal(turn.response.status, 200);
    assert.equal(turn.value.status, "agent_unavailable");
    assert.equal(turn.value.configuration.code, "model_credentials_not_configured");
    assert.equal(turn.value.conversation.modelId, "kimi-k3");
    assert.equal(turn.value.conversation.tripId, null);
    assert.equal(turn.value.conversation.messages[0].role, "user");
    assert.equal(turn.value.conversation.messages[1].role, "status");
    assert.match(turn.value.conversation.messages[1].text, /服务恢复后可以从这里继续/);

    const unsupported = await request("/api/conversations", { method: "POST", token, body: { modelId: "kimi-k2.7-code" } });
    assert.equal(unsupported.response.status, 400);
    assert.equal(unsupported.value.code, "model_selection_unsupported");

    const other = await request("/api/auth/session", { method: "POST", body: { provider: "email_otp", identity: "chat-other@example.com" } });
    const denied = await request(`/api/conversations/${conversation.value.conversationId}`, { token: other.value.accessToken });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.value.code, "conversation_access_denied");
  } finally {
    await close();
  }
});

test("HTTP API does not issue a development session when provider callbacks are not configured", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-http-auth-"));
  const store = new TripStore({ rootDir });
  store.mode = "file";
  const app = createHttpApp({ travelService: new TravelService({ store }), developmentAuthEnabled: false });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "email_otp", identity: "ignored" }) });
    const value = await response.json();
    assert.equal(response.status, 503);
    assert.equal(value.code, "auth_provider_not_configured");
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("default file repositories keep trips and conversations under the configured data root", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-http-shared-root-"));
  const app = createHttpApp({
    developmentAuthEnabled: true,
    runtimeEnv: {
      NODE_ENV: "development",
      TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH: "true",
      TRAVEL_AGENT_DATA_DIR: rootDir,
    },
  });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "email_otp", identity: "shared-root@example.com" }) });
    const session = await sessionResponse.json();
    const headers = { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" };
    const tripResponse = await fetch(`http://127.0.0.1:${port}/api/trips`, { method: "POST", headers, body: JSON.stringify({ tripId: "trip_shared_root", brief: { destination: "大理" } }) });
    assert.equal(tripResponse.status, 201);
    const conversationResponse = await fetch(`http://127.0.0.1:${port}/api/conversations`, { method: "POST", headers, body: "{}" });
    assert.equal(conversationResponse.status, 201);
    assert.deepEqual((await readdir(rootDir)).sort(), ["conversations", "trip_shared_root.json"]);
    assert.equal((await readdir(join(rootDir, "conversations"))).length, 1);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("HTTP API permits a local development Web origin but rejects an unknown origin", async () => {
  const { request, close } = await httpFixture();
  try {
    const local = await request("/api/health", { headers: { origin: "http://127.0.0.1:5173" } });
    assert.equal(local.response.status, 200);
    assert.equal(local.response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
    const foreign = await request("/api/health", { headers: { origin: "https://untrusted.example" } });
    assert.equal(foreign.response.status, 403);
    assert.equal(foreign.value.code, "cors_origin_not_allowed");
  } finally {
    await close();
  }
});

test("provider status exposes configuration readiness without exposing keys", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-http-provider-"));
  const store = new TripStore({ rootDir });
  store.mode = "file";
  const sessionStore = new InMemorySessionStore();
  const app = createHttpApp({
    travelService: new TravelService({ store }),
    sessionStore,
    developmentAuthEnabled: true,
    runtimeEnv: {
      NODE_ENV: "development",
      TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH: "true",
      DEEPSEEK_API_KEY: "deepseek-test-key",
      MOONSHOT_API_KEY: "moonshot-test-key",
      AMAP_API_KEY: "amap-test-key",
      TRAVEL_AGENT_DEEPSEEK_SMOKE_STATUS: "not_run",
      TRAVEL_AGENT_KIMI_SMOKE_STATUS: "not_run",
    },
  });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    const session = await fetch(`http://127.0.0.1:${port}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "email_otp", identity: "providers@example.com" }) });
    const token = (await session.json()).accessToken;
    const response = await fetch(`http://127.0.0.1:${port}/api/provider-status`, { headers: { authorization: `Bearer ${token}` } });
    const status = await response.json();
    assert.equal(status.model.deepseek, "credential_configured_pending_smoke");
    assert.equal(status.model.kimiVision, "credential_configured_pending_smoke");
    assert.equal(status.data.amapOfficialMcp, "credential_configured_pending_smoke");
    assert.equal(JSON.stringify(status).includes("test-key"), false);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("visual evidence endpoint rejects unsupported media before any model request", async () => {
  const { request, close } = await httpFixture();
  try {
    const session = await request("/api/auth/session", { method: "POST", body: { provider: "email_otp", identity: "vision@example.com" } });
    const response = await request("/api/visual-evidence/inspect", {
      method: "POST",
      token: session.value.accessToken,
      body: { text: "看看这张图的旅行信息", images: [{ mimeType: "image/gif", data: "not-supported" }] },
    });
    assert.equal(response.response.status, 400);
    assert.equal(response.value.code, "invalid_visual_evidence");
  } finally {
    await close();
  }
});

test("conversation message HTTP contract forwards image and text into one Agent turn", async () => {
  let received = null;
  const conversation = { schemaVersion: "travel-conversation-view-v1", conversationId: "conversation_visual_http", tripId: null, modelId: "deepseek-v4-flash", messages: [], updatedAt: "2026-08-24T08:00:00.000Z" };
  const conversationAgent = {
    getConversation: async () => conversation,
    reply: async (input) => {
      received = input;
      return { schemaVersion: "travel-conversation-turn-v1", status: "completed", conversation, activities: [{ toolName: "interpret_visual_context", status: "completed" }], multimodal: { status: "completed", persistence: "none" } };
    },
  };
  const { request, close } = await httpFixture({ conversationAgent });
  try {
    const session = await request("/api/auth/session", { method: "POST", body: { provider: "email_otp", identity: "visual-turn@example.com" } });
    const image = { mimeType: "image/png", data: "iVBORw0KGgo=" };
    const response = await request("/api/conversations/conversation_visual_http/messages", {
      method: "POST",
      token: session.value.accessToken,
      body: { text: "请结合这张菜单继续规划", modelId: "deepseek-v4-flash", images: [image] },
    });
    assert.equal(response.response.status, 200);
    assert.equal(response.value.multimodal.persistence, "none");
    assert.equal(received.text, "请结合这张菜单继续规划");
    assert.deepEqual(received.images, [image]);
  } finally {
    await close();
  }
});

test("guest travelers can plan before login and claim trips and conversations after authentication", async () => {
  const { request, close } = await httpFixture();
  try {
    const guest = await request("/api/auth/guest-session", { method: "POST" });
    assert.equal(guest.response.status, 201);
    assert.equal(guest.value.guest, true);
    assert.equal(guest.value.accessToken, undefined);
    const guestCookie = guest.response.headers.get("set-cookie").split(";")[0];

    const conversation = await request("/api/conversations", { method: "POST", headers: { cookie: guestCookie }, body: {} });
    assert.equal(conversation.response.status, 201);
    const trip = await request("/api/trips", {
      method: "POST",
      headers: { cookie: guestCookie },
      body: { tripId: "trip_guest_claim", brief: { destination: "上海", dates: "2026-09-20 至 2026-09-23" }, travelers: [{ travelerId: "traveler_1", language: "en", hardConstraints: [{ type: "foreign_guest_required" }] }] },
    });
    assert.equal(trip.response.status, 201);
    assert.equal(trip.value.readiness.status, "needs_attention");

    const readiness = await request("/api/trips/trip_guest_claim/readiness", { method: "POST", headers: { cookie: guestCookie }, body: { signalId: "mobile_access", status: "ready" } });
    assert.equal(readiness.response.status, 200);
    assert.equal(readiness.value.readiness.items.find((item) => item.itemId === "mobile_access").status, "ready");

    const authenticated = await request("/api/auth/session", { method: "POST", headers: { cookie: guestCookie }, body: { provider: "email_otp", identity: "claimed@example.com" } });
    assert.equal(authenticated.response.status, 201);
    assert.equal(authenticated.value.guest, false);
    assert.equal(authenticated.value.claim.transferredTrips, 1);
    assert.equal(authenticated.value.claim.transferredConversations, 1);

    const claimedTrips = await request("/api/trips", { token: authenticated.value.accessToken });
    assert.deepEqual(claimedTrips.value.trips.map((item) => item.tripId), ["trip_guest_claim"]);
    const claimedConversations = await request("/api/conversations", { token: authenticated.value.accessToken });
    assert.equal(claimedConversations.value.conversations[0].conversationId, conversation.value.conversationId);
    const claimedPlan = await request("/api/trips/trip_guest_claim/plan", { token: authenticated.value.accessToken });
    assert.equal(claimedPlan.value.readiness.items.find((item) => item.itemId === "china_account_continuity").status, "needs_verification");

    const oldGuestAccess = await request("/api/trips/trip_guest_claim/plan", { headers: { cookie: guestCookie } });
    assert.equal(oldGuestAccess.response.status, 403);
    assert.equal(oldGuestAccess.value.code, "trip_access_denied");
  } finally {
    await close();
  }
});
