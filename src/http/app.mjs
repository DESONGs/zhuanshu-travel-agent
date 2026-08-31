import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { assertTravelServicePort } from "../../travel-agent-pi-package/src/core/index.ts";
import { createTravelService } from "../api/create-travel-service.mjs";
import { EvidenceCompanionService } from "../api/evidence-companion-service.mjs";
import { TravelConversationAgent } from "../agent/travel-conversation-agent.mjs";
import { createConversationRepository } from "../persistence/conversation-repository.mjs";
import { providerStatusSummary } from "../providers/provider-status.mjs";
import { authenticatedUserId, developmentUserId, guestUserId, GUEST_SESSION_TTL_MS, InMemorySessionStore, SignedSessionStore } from "./session.mjs";
import { createAuthService, oauthNonceCookieName } from "./auth-providers.mjs";
import { createAmapJsSecurityProxy } from "./amap-js-security-proxy.mjs";
import { httpError, sendError } from "./http-errors.mjs";

function cookieValue(request, name) {
  const values = String(request.headers.cookie ?? "").split(";").map((item) => item.trim());
  const encoded = values.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  try {
    return encoded ? decodeURIComponent(encoded) : null;
  } catch {
    return null;
  }
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

function requestPublicOrigin(request, runtimeEnv) {
  const configured = String(runtimeEnv.TRAVEL_AGENT_PUBLIC_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const inferred = `${request.protocol}://${request.get("host")}`;
  return runtimeEnv.NODE_ENV !== "production" && isLocalDevelopmentOrigin(inferred) ? inferred : null;
}

function sessionTokenFromRequest(request) {
  const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : null;
  return bearer ?? cookieValue(request, "travel_session");
}

function sessionCookieOptions(runtimeEnv, expiresAt) {
  const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: runtimeEnv.NODE_ENV === "production" || String(runtimeEnv.TRAVEL_AGENT_PUBLIC_ORIGIN ?? "").startsWith("https://"),
    path: "/",
    maxAge,
  };
}

function authResultLocation(returnTo, key, value) {
  const url = new URL(returnTo || "/", "http://travel-agent.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function publicAuthError(error) {
  return ["auth_authorization_denied", "auth_state_invalid", "auth_state_expired", "auth_provider_not_configured", "auth_provider_unavailable"].includes(error?.code)
    ? error.code
    : "auth_login_failed";
}

export function createHttpApp({
  travelService,
  conversationRepository,
  conversationAgent,
  sessionStore,
  authService,
  evidenceCompanionService,
  webRoot = resolve(process.cwd(), "dist"),
  developmentAuthEnabled = process.env.NODE_ENV !== "production" && process.env.TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH === "true",
  allowedOrigins = parseAllowedOrigins(process.env.TRAVEL_AGENT_CORS_ORIGINS),
  runtimeEnv = process.env,
  clock = () => new Date(),
} = {}) {
  travelService = assertTravelServicePort(travelService ?? createTravelService(runtimeEnv));
  conversationRepository ??= createConversationRepository({
    databaseUrl: runtimeEnv.DATABASE_URL,
    rootDir: runtimeEnv.TRAVEL_AGENT_CONVERSATION_DATA_DIR
      ?? (runtimeEnv.TRAVEL_AGENT_DATA_DIR ? resolve(runtimeEnv.TRAVEL_AGENT_DATA_DIR, "conversations") : undefined),
  });
  sessionStore ??= String(runtimeEnv.TRAVEL_AGENT_SESSION_SECRET ?? "").length >= 32
    ? new SignedSessionStore({ secret: runtimeEnv.TRAVEL_AGENT_SESSION_SECRET })
    : new InMemorySessionStore();
  authService ??= createAuthService({ env: runtimeEnv });
  evidenceCompanionService ??= new EvidenceCompanionService({ travelService, env: runtimeEnv, clock });
  const travelConversationAgent = conversationAgent ?? new TravelConversationAgent({ travelService, conversationRepository, env: runtimeEnv });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "6mb", type: "application/json" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
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
  app.use("/_AMapService", createAmapJsSecurityProxy({
    publicKey: String(runtimeEnv.TRAVEL_AGENT_AMAP_JS_RENDERER_ENABLED ?? "true").trim().toLowerCase() === "false" ? undefined : runtimeEnv.AMAP_JS_API_KEY,
    securityCode: String(runtimeEnv.TRAVEL_AGENT_AMAP_JS_RENDERER_ENABLED ?? "true").trim().toLowerCase() === "false" ? undefined : runtimeEnv.AMAP_JS_SECURITY_CODE,
  }));

  const currentSession = (request) => sessionStore.read(sessionTokenFromRequest(request));
  const publicSession = (session, extra = {}) => ({
    schemaVersion: "auth-session-v1",
    ...session,
    guest: session.provider === "guest",
    ...extra,
  });
  const claimGuestData = async (session, userId) => {
    if (session?.provider !== "guest" || !session.userId || session.userId === userId) return { transferredTrips: 0, transferredConversations: 0 };
    const tripResult = await travelService.transferUserOwnership({ fromUserId: session.userId, toUserId: userId });
    const conversationResult = typeof conversationRepository.transferUserOwnership === "function"
      ? await conversationRepository.transferUserOwnership(session.userId, userId)
      : { transferredConversations: 0 };
    return { ...tripResult, ...conversationResult };
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
    if (session.provider === "guest" && state.collaboration?.guestExpiresAt && new Date(state.collaboration.guestExpiresAt).getTime() <= clock().getTime()) {
      throw httpError("guest_trip_expired", 410, { tripId });
    }
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
    response.json({ status: "ok", developmentAuthEnabled, storageMode: travelService.store.mode ?? "unknown", workflowExecution: travelService.workflowExecution ?? { workflowExecutionMode: "injected_service_unknown", semanticFanoutEnabled: Boolean(travelService.analysisFanout), backgroundResumeSupported: false, crossInstanceSteerSupported: false } });
  }));
  app.get("/api/auth/providers", asyncRoute(async (request, response) => {
    response.json({ ...authService.providerSummary({ origin: requestPublicOrigin(request, runtimeEnv) }), developmentAuthEnabled });
  }));
  app.get("/api/auth/:provider/start", asyncRoute(async (request, response) => {
    const provider = String(request.params.provider ?? "");
    const authorization = authService.beginWeb({
      provider,
      origin: requestPublicOrigin(request, runtimeEnv),
      returnTo: request.query.returnTo,
    });
    response.cookie(oauthNonceCookieName(provider), authorization.nonce, {
      httpOnly: true,
      sameSite: authorization.cookieSameSite,
      secure: authorization.cookieSecure,
      path: `/api/auth/${provider}/callback`,
      maxAge: authorization.cookieMaxAge,
    });
    response.redirect(302, authorization.authorizationUrl);
  }));
  const completeWebAuthorization = async (request, response) => {
    const provider = String(request.params.provider ?? "");
    const previousSession = currentSession(request);
    const state = request.body?.state ?? request.query.state;
    const nonceCookie = oauthNonceCookieName(provider);
    const cookieOptions = { path: `/api/auth/${provider}/callback`, sameSite: provider === "apple" ? "none" : "lax", secure: provider === "apple" || runtimeEnv.NODE_ENV === "production" };
    let returnTo = "/";
    try {
      if (request.body?.error || request.query.error) throw httpError("auth_authorization_denied", 400);
      const code = request.body?.code ?? request.query.code ?? request.query.auth_code;
      const completed = await authService.completeWeb({ provider, code, state, nonce: cookieValue(request, nonceCookie) });
      returnTo = completed.returnTo;
      const userId = authenticatedUserId(completed.identity);
      const claim = await claimGuestData(previousSession, userId);
      const issued = sessionStore.issue({
        userId,
        provider: completed.identity.provider,
        displayName: completed.identity.displayName,
      });
      response.cookie("travel_session", issued.opaqueToken, sessionCookieOptions(runtimeEnv, issued.expiresAt));
      response.clearCookie(nonceCookie, cookieOptions);
      response.redirect(303, authResultLocation(returnTo, "auth", "success"));
    } catch (error) {
      response.clearCookie(nonceCookie, cookieOptions);
      response.redirect(303, authResultLocation(returnTo, "auth_error", publicAuthError(error)));
    }
  };
  app.get("/api/auth/:provider/callback", completeWebAuthorization);
  app.post("/api/auth/:provider/callback", completeWebAuthorization);
  app.get("/api/provider-status", asyncRoute(async (request, response) => {
    requireSession(request);
    response.json(providerStatusSummary(runtimeEnv));
  }));
  app.post("/api/auth/session", asyncRoute(async (request, response) => {
    const previousSession = currentSession(request);
    const provider = request.body?.provider;
    if (provider !== "email_otp") throw httpError("unsupported_auth_provider", 400, { provider });
    if (!developmentAuthEnabled) throw httpError("auth_provider_not_configured", 503, { provider, message: "Configure this provider callback before issuing a production session." });
    const identity = String(request.body?.identity ?? "").trim();
    if (!identity || identity.length > 256) throw httpError("invalid_auth_identity");
    const userId = developmentUserId({ provider, identity });
    const claim = await claimGuestData(previousSession, userId);
    const issued = sessionStore.issue({ userId, provider, displayName: identity });
    response.cookie("travel_session", issued.opaqueToken, sessionCookieOptions(runtimeEnv, issued.expiresAt));
    response.status(201).json(publicSession({ userId, provider, displayName: identity, expiresAt: issued.expiresAt }, { accessToken: issued.opaqueToken, developmentOnly: true, claim }));
  }));
  app.post("/api/auth/guest-session", asyncRoute(async (request, response) => {
    const existing = currentSession(request);
    if (existing) return response.status(200).json(publicSession(existing));
    const userId = guestUserId();
    const issued = sessionStore.issue({ userId, provider: "guest", displayName: null, ttlMs: GUEST_SESSION_TTL_MS });
    response.cookie("travel_session", issued.opaqueToken, sessionCookieOptions(runtimeEnv, issued.expiresAt));
    return response.status(201).json(publicSession({ userId, provider: "guest", displayName: null, expiresAt: issued.expiresAt }, { developmentOnly: false }));
  }));
  app.post("/api/auth/platform-exchange", asyncRoute(async (request, response) => {
    const previousSession = currentSession(request);
    const provider = request.body?.provider;
    if (!["wechat", "alipay"].includes(provider)) throw httpError("unsupported_auth_provider", 400, { provider });
    const authorizationCode = String(request.body?.authorizationCode ?? "").trim();
    if (!authorizationCode || authorizationCode.length > 4096) throw httpError("invalid_authorization_code", 400);
    const identity = await authService.exchangePlatform({ provider, authorizationCode });
    const userId = authenticatedUserId(identity);
    const claim = await claimGuestData(previousSession, userId);
    const issued = sessionStore.issue({ userId, provider: identity.provider, displayName: identity.displayName });
    response.status(201).json(publicSession({ userId, provider: identity.provider, displayName: identity.displayName, expiresAt: issued.expiresAt }, { accessToken: issued.opaqueToken, developmentOnly: false, claim }));
  }));
  app.get("/api/session", asyncRoute(async (request, response) => {
    response.json(publicSession(requireSession(request)));
  }));
  app.delete("/api/session", asyncRoute(async (request, response) => {
    sessionStore.revoke(sessionTokenFromRequest(request));
    response.clearCookie("travel_session", { path: "/" });
    response.status(204).end();
  }));
  app.get("/api/trips", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    response.json(await travelService.listTrips({ userId: session.userId }));
  }));
  app.get("/api/conversations", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    response.json(await travelConversationAgent.listConversations({ userId: session.userId, includeDeleted: request.query.includeDeleted === "true" }));
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
  app.delete("/api/conversations/:conversationId", asyncRoute(async (request, response) => {
    const session = await requireConversationOwner(request, request.params.conversationId);
    response.json(await travelConversationAgent.deleteConversation({ conversationId: request.params.conversationId, userId: session.userId }));
  }));
  app.post("/api/conversations/:conversationId/restore", asyncRoute(async (request, response) => {
    const session = requireSession(request);
    try {
      response.json(await travelConversationAgent.restoreConversation({ conversationId: request.params.conversationId, userId: session.userId }));
    } catch (error) {
      if (error?.code === "conversation_not_found") throw httpError("conversation_not_found", 404, { conversationId: request.params.conversationId });
      if (error?.code === "conversation_access_denied") throw httpError("conversation_access_denied", 403, { conversationId: request.params.conversationId });
      throw error;
    }
  }));
  app.post("/api/conversations/:conversationId/messages", asyncRoute(async (request, response) => {
    const session = await requireConversationOwner(request, request.params.conversationId);
    response.json(await travelConversationAgent.reply({ conversationId: request.params.conversationId, userId: session.userId, text: request.body?.text, images: request.body?.images, modelId: request.body?.modelId, planningContext: request.body?.planningContext }));
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
  app.get("/api/trips/:tripId/evidence/nodes/:nodeId", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await evidenceCompanionService.presentationForNode({ tripId: request.params.tripId, nodeId: request.params.nodeId, targetLanguage: request.query.targetLanguage }));
  }));
  app.post("/api/trips/:tripId/evidence/resolve", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.status(201).json(await evidenceCompanionService.resolveShareLink({ tripId: request.params.tripId, nodeId: request.body?.nodeId ?? null, url: request.body?.url, targetLanguage: request.body?.targetLanguage }));
  }));
  app.get("/api/trips/:tripId/evidence/:bundleId", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await evidenceCompanionService.getBundle({ tripId: request.params.tripId, bundleId: request.params.bundleId }));
  }));
  app.post("/api/trips/:tripId/evidence/:bundleId/translate", asyncRoute(async (request, response) => {
    const session = await requireTripMember(request, request.params.tripId);
    response.json(await evidenceCompanionService.translateBundle({ tripId: request.params.tripId, bundleId: request.params.bundleId, targetLanguage: request.body?.targetLanguage, userId: session.userId }));
  }));
  app.post("/api/trips/:tripId/readiness", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.updateTripReadiness({ tripId: request.params.tripId, signalId: request.body?.signalId, status: request.body?.status }));
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
    response.json(await travelService.acceptTripChange({ tripId: request.params.tripId, proposalId: request.params.proposalId, selections: request.body?.selections, partial: request.body?.partial === true, previewId: request.body?.previewId, baseRevision: request.body?.baseRevision, routeModes: request.body?.routeModes }));
  }));
  app.post("/api/trips/:tripId/proposals/:proposalId/reject", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.rejectTripChange({ tripId: request.params.tripId, proposalId: request.params.proposalId }));
  }));
  app.post("/api/trips/:tripId/itinerary-trials/:proposalId/discard", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.discardItineraryTrial({ tripId: request.params.tripId, proposalId: request.params.proposalId, baseRevision: request.body?.baseRevision }));
  }));
  app.post("/api/trips/:tripId/mobility/refresh", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    response.json(await travelService.refreshTripMobility({ tripId: request.params.tripId }));
  }));
  app.post("/api/trips/:tripId/mobility/preview", asyncRoute(async (request, response) => {
    await requireTripMember(request, request.params.tripId);
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once("aborted", abort);
    try {
      response.json(await travelService.previewTripMobility({ tripId: request.params.tripId, baseRevision: request.body?.baseRevision, selections: request.body?.selections, previewId: request.body?.previewId, routeModes: request.body?.routeModes, signal: controller.signal }));
    } finally {
      request.off("aborted", abort);
    }
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
