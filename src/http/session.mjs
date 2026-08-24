import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
export const GUEST_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedDisplayName(value) {
  const displayName = String(value ?? "").trim();
  return displayName ? displayName.slice(0, 120) : null;
}

function signature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signaturesMatch(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function developmentUserId({ provider, identity }) {
  return `usr_dev_${hash(`${provider}:${String(identity).trim().toLowerCase()}`).slice(0, 16)}`;
}

export function authenticatedUserId({ provider, subject }) {
  const normalizedProvider = String(provider ?? "").trim().toLowerCase();
  const normalizedSubject = String(subject ?? "").trim();
  if (!normalizedProvider || !normalizedSubject) throw new Error("invalid_authenticated_identity");
  return `usr_${hash(`${normalizedProvider}:${normalizedSubject}`).slice(0, 24)}`;
}

export function guestUserId() {
  return `usr_guest_${randomBytes(16).toString("hex")}`;
}

export class InMemorySessionStore {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
    this.sessions = new Map();
  }

  issue({ userId, provider, displayName = null, ttlMs = SESSION_TTL_MS }) {
    const opaqueToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.clock().getTime() + ttlMs);
    this.sessions.set(hash(opaqueToken), { userId, provider, displayName: normalizedDisplayName(displayName), expiresAt: expiresAt.toISOString() });
    return { opaqueToken, expiresAt: expiresAt.toISOString() };
  }

  read(opaqueToken) {
    if (!opaqueToken) return null;
    const entry = this.sessions.get(hash(opaqueToken));
    if (!entry) return null;
    if (new Date(entry.expiresAt).getTime() <= this.clock().getTime()) {
      this.sessions.delete(hash(opaqueToken));
      return null;
    }
    return { userId: entry.userId, provider: entry.provider, displayName: entry.displayName, expiresAt: entry.expiresAt };
  }

  revoke(opaqueToken) {
    if (opaqueToken) this.sessions.delete(hash(opaqueToken));
  }
}

export class SignedSessionStore {
  constructor({ secret, clock = () => new Date(), ttlMs = SESSION_TTL_MS } = {}) {
    if (String(secret ?? "").length < 32) throw new Error("session_secret_too_short");
    this.secret = secret;
    this.clock = clock;
    this.ttlMs = ttlMs;
    this.revoked = new Map();
  }

  cleanup() {
    const now = this.clock().getTime();
    for (const [tokenHash, expiresAt] of this.revoked.entries()) {
      if (expiresAt <= now) this.revoked.delete(tokenHash);
    }
  }

  issue({ userId, provider, displayName = null, ttlMs = this.ttlMs }) {
    this.cleanup();
    const expiresAt = new Date(this.clock().getTime() + ttlMs);
    const body = Buffer.from(JSON.stringify({
      version: 1,
      userId,
      provider,
      displayName: normalizedDisplayName(displayName),
      expiresAt: expiresAt.toISOString(),
      nonce: randomBytes(16).toString("base64url"),
    })).toString("base64url");
    const opaqueToken = `${body}.${signature(body, this.secret)}`;
    return { opaqueToken, expiresAt: expiresAt.toISOString() };
  }

  read(opaqueToken) {
    this.cleanup();
    if (!opaqueToken || this.revoked.has(hash(opaqueToken))) return null;
    const [body, providedSignature, extra] = String(opaqueToken).split(".");
    if (!body || !providedSignature || extra || !signaturesMatch(providedSignature, signature(body, this.secret))) return null;
    try {
      const entry = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (entry.version !== 1 || !entry.userId || !AUTH_PROVIDERS.includes(entry.provider)) return null;
      if (new Date(entry.expiresAt).getTime() <= this.clock().getTime()) return null;
      return { userId: entry.userId, provider: entry.provider, displayName: normalizedDisplayName(entry.displayName), expiresAt: entry.expiresAt };
    } catch {
      return null;
    }
  }

  revoke(opaqueToken) {
    const session = this.read(opaqueToken);
    if (session) this.revoked.set(hash(opaqueToken), new Date(session.expiresAt).getTime());
  }
}

export const AUTH_PROVIDERS = Object.freeze(["google", "wechat", "alipay", "apple", "email_otp", "guest"]);
