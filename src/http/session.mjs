import { randomBytes, createHash } from "node:crypto";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function developmentUserId({ provider, identity }) {
  return `usr_dev_${hash(`${provider}:${String(identity).trim().toLowerCase()}`).slice(0, 16)}`;
}

export class InMemorySessionStore {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
    this.sessions = new Map();
  }

  issue({ userId, provider }) {
    const opaqueToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.clock().getTime() + SESSION_TTL_MS);
    this.sessions.set(hash(opaqueToken), { userId, provider, expiresAt: expiresAt.toISOString() });
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
    return { userId: entry.userId, provider: entry.provider, expiresAt: entry.expiresAt };
  }

  revoke(opaqueToken) {
    if (opaqueToken) this.sessions.delete(hash(opaqueToken));
  }
}

export const AUTH_PROVIDERS = Object.freeze(["wechat", "alipay", "apple", "email_otp"]);
