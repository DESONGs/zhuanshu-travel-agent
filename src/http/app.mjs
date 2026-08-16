import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { TravelService } from "../api/travel-service.mjs";
import { TravelConversationAgent } from "../agent/travel-conversation-agent.mjs";
import { createConversationRepository } from "../persistence/conversation-repository.mjs";
import { providerStatusSummary } from "../providers/provider-status.mjs";
import { createTravelResearchProvider } from "../providers/travel-research-provider.mjs";
import { createTripRepository } from "../persistence/trip-repository.mjs";
import { AUTH_PROVIDERS, developmentUserId, InMemorySessionStore } from "./session.mjs";
import { httpError, sendError } from "./http-errors.mjs";

function cookieValue(request, name) {
  const values = String(request.headers.cookie ?? "").split(";").map((item) => item.trim());
  const encoded = values.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  return encoded ? decodeURIComponent(encoded) : null;
}

function asyncRoute(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      sendError(response, error);
    }
  };
}

function parseAllowedOrigins(value) {
  return new Set(String(value ?? "").split(",").map((origin) => origin.trim()).filter(Boolean));
}

function isLocalDevelopmentOrigin(origin) {
  return /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin);
}

export function createHttpApp({
  travelService,
  conversationRepository,
  conversationAgent,
  sessionStore = new InMemorySessionStore(),
  webRoot = resolve(process.cwd(), "dist"),
  developmentAuthEnabled = process.env.NODE_ENV !== "production" && process.env.TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH === "true",
  allowedOrigins = parseAllowedOrigins(process.env.TRAVEL_AGENT_CORS_ORIGINS),
  runtimeEnv = process.env,
} = {}) {
  travelService ??= new TravelService({
    store: createTripRepository({ databaseUrl: runtimeEnv.DATABASE_URL, rootDir: runtimeEnv.TRAVEL_AGENT_DATA_DIR }),
    researchProvider: createTravelResearchProvider(runtimeEnv),
  });
  conversationRepository ??= createConversationRepository({
    databaseUrl: runtimeEnv.DATABASE_URL,
    rootDir: runtimeEnv.TRAVEL_AGENT_CONVERSATION_DATA_DIR
      ?? (runtimeEnv.TRAVEL_AGENT_DATA_DIR ? resolve(runtimeEnv.TRAVEL_AGENT_DATA_DIR, "conversations") : undefined),
  });
  const travelConversationAgent = conversationAgent ?? new TravelConversationAgent({ travelService, conversationRepository, env: runtimeEnv });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "6mb", type: "application/json" }));
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (!origin) return next();
    if (!allowedOrigins.has(origin) && !(developmentAuthEnabled && isLocalDevelopmentOrigin(origin))) {
      return sendError(response, httpError("cors_origin_not_allowed", 403));
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (request.method === "OPTIONS") return response.status(204).end();
    return next();
  });

  const currentSession = (request) => {
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : null;
    return sessionStore.read(bearer ?? cookieValue(request, "travel_session"));
  };
  const requireSession = (request) => {
    const session = currentSession(request);
    if (!session) throw httpError("authentication_required", 401);
    return session;
  };
  const requireTripMember = async (request, tripId) => {
    const session = requireSession(request);
    const state = await travelService.store.get(tripId);
    if (!state) throw httpError("trip_not_found", 404, { tripId });
    const members = state.collaboration?.memberUserIds;
    if (members && !members.includes(session.userId)) throw httpError("trip_access_denied", 403, { tripId });
    return session;
  };
  const requireConversationOwner = async (request, conversationId) => {
    const session = requireSession(request);
    try {
      await travelConversationAgent.getConversation({ conversationId, userId: session.userId });
    } catch (error) {
      if (error?.code === "conversation_not_found") throw httpError("conversation_not_found", 404, { conversationId });
      if (error?.code === "conversation_access_denied") throw httpError("conversation_access_denied", 403, { conversationId });
      throw error;
    }
    return session;
  };

  app.get("/api/health", asyncRoute(async (_request, response) => {
    response.json({ status: "ok", developmentAuthEnabled, storageMode: travelService.store.mode ?? "unknown" });
  }));
  app.get("/api/provider-status", asyncRoute(async (request, response) => {
    requireSession(request);
    response.json(providerStatusSummary(runtimeEnv));
  }));
  app.post("/api/auth/session", asyncRoute(async (request, response) => {
    const provider = request.body?.provider;
    if (!AUTH_PROVIDERS.includes(provider)) throw httpError("unsupported_auth_provider", 400, { provider });
    if (!developmentAuthEnabled) throw httpError("auth_provider_not_configured", 503, { provider, message: "Configure this provider callback before issuing a production session." });
    const identity = String(request.body?.identity ?? "").trim();
    if (!identity || identity.length > 256) throw httpError("invalid_auth_identity");
    const userId = developmentUserId({ provider, identity });
    const issued = sessionStore.issue({ userId, provider });
    response.cookie("travel_session", issued.opaqueToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1000 * 60 * 60 * 24 * 14 });
    response.status(201).json({ schemaVersion: "auth-session-v1", userId, provider, expiresAt: issued.expiresAt, accessToken: issued.opaqueToken, developmentOnly: true });
  }));
  app.post("/api/auth/platform-exchange", asyncRoute(async (request, _response) => {
    const provider = request.body?.provider;
    if (!AUTH_PROVIDERS.includes(provider) || !["wechat", "alipay", "apple"].includes(provider)) {
      throw httpError("unsupported_auth_provider", 400, { provider });
    }
    const authorizationCode = String(request.body?.authorizationCode ?? "").trim();
    if (!authorizationCode || authorizationCode.length > 4096) throw httpError("invalid_authorization_code", 400);
    throw httpError("auth_provider_not_configured", 503, {
      provider,
      message: "Configure and verify the platform authorization-code exchange before issuing production sessions.",
    });
  }));
  app.get("/api/session", asyncRoute(async (request, response) => {
    response.json({ schemaVersion: "auth-session-v1", ...requireSession(request) });
  }));
  app.delete("/api/session", asyncRoute(async (request, response) => {
    sessionStore.revoke(cookieValue(request, "travel_session"));
    response.clearCookie("travel_session", { path: "/" });
    response.status(204).end();
  }));
  app.get("/api/trips", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    response.json(await travelService.listTrips({ userId: session.userId }));
  }));
  app.get("/api/conversations", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    response.json(await travelConversationAgent.listConversations({ userId: session.userId }));
  }));
  app.post("/api/conversations", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    const tripId = request.body?.tripId ?? null;
    if (tripId) await requireTripMember(request, tripId);
    response.status(201).json(await travelConversationAgent.createConversation({ userId: session.userId, tripId, modelId: request.body?.modelId }));
  }));
  app.get("/api/conversations/:conversationId", asyncRoute(async (request, response) => {
    const session = await requireConversationOwner(request, request.params.conversationId);
    response.json(await travelConversationAgent.getConversation({ conversationId: request.params.conversationId, userId: session.userId }));
  }));
  app.post("/api/conversations/:conversationId/messages", asyncRoute(async (request, response) => {
    const session = await requireConversationOwner(request, request.params.conversationId);
    response.json(await travelConversationAgent.reply({ conversationId: request.params.conversationId, userId: session.userId, text: request.body?.text, modelId: request.body?.modelId }));
  }));
  app.post("/api/visual-evidence/inspect", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    response.json(await travelConversationAgent.inspectVisualEvidence({ userId: session.userId, text: request.body?.text, images: request.body?.images }));
  }));
  app.post("/api/trips", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    response.status(201).json(await travelService.createTrip({ ...request.body, ownerUserId: session.userId }));
  }));
  app.get("/api/trips/:tripId/control", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.getTripControlView(request.params.tripId));
  }));
  app.get("/api/trips/:tripId/plan", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.getTripPlanView(request.params.tripId));
  }));
  app.get("/api/trips/:tripId/map", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    const map = await travelService.renderTripMap(request.params.tripId);
    response.setHeader("Content-Type", map.contentType);
    response.setHeader("Content-Length", String(map.body.length));
    response.status(200).send(map.body);
  }));
  app.get("/api/trips/:tripId/decisions", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.getOpenDecisions(request.params.tripId));
  }));
  app.post("/api/trips/:tripId/proposals", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.status(201).json(await travelService.proposeTripChange({ tripId: request.params.tripId, proposal: request.body?.proposal }));
  }));
  app.post("/api/trips/:tripId/proposals/:proposalId/accept", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.acceptTripChange({ tripId: request.params.tripId, proposalId: request.params.proposalId, selections: request.body?.selections }));
  }));
  app.post("/api/trips/:tripId/proposals/:proposalId/reject", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.rejectTripChange({ tripId: request.params.tripId, proposalId: request.params.proposalId }));
  }));
  app.post("/api/trips/:tripId/mobility/refresh", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.refreshTripMobility({ tripId: request.params.tripId }));
  }));
  app.get("/api/trips/:tripId/transit/:nodeId", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    const plan = await travelService.getTripPlanView(request.params.tripId);
    const match = plan.transitSegments.find((item) => item.nodeId === request.params.nodeId);
    if (!match) throw httpError("transit_segment_not_found", 404);
    response.json({ schemaVersion: "transit-segment-view-v1", tripId: request.params.tripId, revision: plan.revision, ...match });
  }));
  app.post("/api/trips/:tripId/feedback", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.status(201).json(await travelService.submitTripFeedback({ tripId: request.params.tripId, ...request.body }));
  }));
  app.use(express.static(webRoot, { index: false, fallthrough: true, maxAge: 0 }));
  app.use(asyncRoute(async (request, response) => {
    if (request.path.startsWith("/api/")) throw httpError("api_route_not_found", 404);
    try {
      response.type("html").send(await readFile(resolve(webRoot, "index.html"), "utf8"));
    } catch {
      response.status(503).json({ status: "error", code: "web_build_unavailable", message: "Run npm run web:build before starting the production server." });
    }
  }));
  return app;
}
