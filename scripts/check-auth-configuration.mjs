import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";

const env = await loadTravelRuntimeEnv();

function configured(value) {
  return Boolean(String(value ?? "").trim());
}

function publicOrigin(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizedKey(value, kind) {
  const text = String(value ?? "").trim();
  if (text.includes("BEGIN")) return text;
  const lines = text.match(/.{1,64}/g)?.join("\n") ?? text;
  return `-----BEGIN ${kind === "private" ? "PRIVATE" : "PUBLIC"} KEY-----\n${lines}\n-----END ${kind === "private" ? "PRIVATE" : "PUBLIC"} KEY-----`;
}

async function keyFile(path, kind) {
  if (!configured(path)) return { configured: false, exists: false, safePermissions: false };
  try {
    const [metadata, contents] = await Promise.all([stat(path), readFile(path, "utf8")]);
    const mode = metadata.mode & 0o777;
    let validKey = false;
    try {
      if (kind === "private") createPrivateKey(normalizedKey(contents, kind));
      else createPublicKey(normalizedKey(contents, kind));
      validKey = true;
    } catch {
      validKey = false;
    }
    return { configured: true, exists: metadata.isFile(), safePermissions: process.platform === "win32" || (mode & 0o077) === 0, validKey, mode: mode.toString(8) };
  } catch {
    return { configured: true, exists: false, safePermissions: false, validKey: false };
  }
}

function channel({ id, fields, smokeKey, manual }) {
  const requirements = fields.map((field) => typeof field === "string" ? { name: field, value: env[field] } : field);
  const missing = requirements.filter((field) => !configured(field.value)).map((field) => field.name);
  const smoke = env[smokeKey] || "not_run";
  return {
    id,
    status: !origin ? "needs_public_https_origin" : missing.length ? "needs_manual_configuration" : smoke === "passed_live_smoke" ? "passed_live_smoke" : "credential_configured_pending_live_smoke",
    missing,
    smoke,
    manual,
  };
}

const origin = publicOrigin(env.TRAVEL_AGENT_PUBLIC_ORIGIN);
const alipayWeb = {
  appId: env.ALIPAY_WEB_APP_ID || env.ALIPAY_APP_ID,
  privateKeyPath: env.ALIPAY_WEB_PRIVATE_KEY_PATH || env.ALIPAY_PRIVATE_KEY_PATH,
  publicKeyPath: env.ALIPAY_WEB_PUBLIC_KEY_PATH || env.ALIPAY_PUBLIC_KEY_PATH,
};
const alipayMiniapp = {
  appId: env.ALIPAY_MINIAPP_APP_ID || env.ALIPAY_APP_ID,
  privateKeyPath: env.ALIPAY_MINIAPP_PRIVATE_KEY_PATH || env.ALIPAY_PRIVATE_KEY_PATH,
  publicKeyPath: env.ALIPAY_MINIAPP_PUBLIC_KEY_PATH || env.ALIPAY_PUBLIC_KEY_PATH,
};
const alipayKeyFiles = {
  web: { privateKey: await keyFile(alipayWeb.privateKeyPath, "private"), publicKey: await keyFile(alipayWeb.publicKeyPath, "public") },
  miniapp: { privateKey: await keyFile(alipayMiniapp.privateKeyPath, "private"), publicKey: await keyFile(alipayMiniapp.publicKeyPath, "public") },
};
const applePrivateKey = await keyFile(env.APPLE_PRIVATE_KEY_PATH, "private");
const sharedIssues = [];
if (!origin) sharedIssues.push("TRAVEL_AGENT_PUBLIC_ORIGIN must be the final HTTPS origin with no path.");
if (String(env.TRAVEL_AGENT_SESSION_SECRET ?? "").length < 32) sharedIssues.push("TRAVEL_AGENT_SESSION_SECRET must contain at least 32 characters.");
if (String(env.TRAVEL_AGENT_AUTH_STATE_SECRET ?? "").length < 32) sharedIssues.push("TRAVEL_AGENT_AUTH_STATE_SECRET must contain at least 32 characters.");
if (configured(env.TRAVEL_AGENT_SESSION_SECRET) && env.TRAVEL_AGENT_SESSION_SECRET === env.TRAVEL_AGENT_AUTH_STATE_SECRET) sharedIssues.push("Session and OAuth state secrets must be different.");
if (origin && env.TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH === "true") sharedIssues.push("TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH must be false before using a public login origin.");
for (const [channelId, files] of Object.entries(alipayKeyFiles)) {
  if (files.privateKey.configured && (!files.privateKey.exists || !files.privateKey.safePermissions || !files.privateKey.validKey)) sharedIssues.push(`Alipay ${channelId} private key must be a valid RSA key in a readable file protected with mode 0600.`);
  if (files.publicKey.configured && (!files.publicKey.exists || !files.publicKey.safePermissions || !files.publicKey.validKey)) sharedIssues.push(`Alipay ${channelId} public key must be a valid RSA key in a readable file protected with mode 0600.`);
}
if (applePrivateKey.configured && (!applePrivateKey.exists || !applePrivateKey.safePermissions || !applePrivateKey.validKey)) sharedIssues.push("Apple private key must be a valid private key in a readable file protected with mode 0600.");

const channels = [
  channel({ id: "google_web", fields: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], smokeKey: "TRAVEL_AGENT_GOOGLE_AUTH_SMOKE_STATUS", manual: "Create a Google Web OAuth client and register the exact callback URI." }),
  channel({ id: "wechat_web", fields: ["WECHAT_OPEN_APP_ID", "WECHAT_OPEN_APP_SECRET"], smokeKey: "TRAVEL_AGENT_WECHAT_WEB_AUTH_SMOKE_STATUS", manual: "Create and approve a WeChat Website Application and register its callback domain." }),
  channel({ id: "wechat_miniapp", fields: ["WECHAT_MINIAPP_APP_ID", "WECHAT_MINIAPP_APP_SECRET"], smokeKey: "TRAVEL_AGENT_WECHAT_MINIAPP_AUTH_SMOKE_STATUS", manual: "Create the Mini Program, bind it to the same WeChat Open Platform account, and register the HTTPS request domain." }),
  channel({ id: "alipay_web", fields: [{ name: "ALIPAY_WEB_APP_ID", value: alipayWeb.appId }, { name: "ALIPAY_WEB_PRIVATE_KEY_PATH", value: alipayWeb.privateKeyPath }, { name: "ALIPAY_WEB_PUBLIC_KEY_PATH", value: alipayWeb.publicKeyPath }], smokeKey: "TRAVEL_AGENT_ALIPAY_WEB_AUTH_SMOKE_STATUS", manual: "Create an Alipay Web/Mobile application in public-key mode and register the callback URL." }),
  channel({ id: "alipay_miniapp", fields: [{ name: "ALIPAY_MINIAPP_APP_ID", value: alipayMiniapp.appId }, { name: "ALIPAY_MINIAPP_PRIVATE_KEY_PATH", value: alipayMiniapp.privateKeyPath }, { name: "ALIPAY_MINIAPP_PUBLIC_KEY_PATH", value: alipayMiniapp.publicKeyPath }], smokeKey: "TRAVEL_AGENT_ALIPAY_MINIAPP_AUTH_SMOKE_STATUS", manual: "Associate the Alipay Mini Program with the application and register its server domain." }),
  channel({ id: "apple_web", fields: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY_PATH"], smokeKey: "TRAVEL_AGENT_APPLE_AUTH_SMOKE_STATUS", manual: "Create a Sign in with Apple Services ID and key, then register the exact callback URL." }),
];

const callbackUrls = origin ? {
  google: `${origin}/api/auth/google/callback`,
  wechat: `${origin}/api/auth/wechat/callback`,
  alipay: `${origin}/api/auth/alipay/callback`,
  apple: `${origin}/api/auth/apple/callback`,
  platformExchange: `${origin}/api/auth/platform-exchange`,
} : null;
const ready = sharedIssues.length === 0 && channels.every((item) => item.status === "passed_live_smoke");
process.stdout.write(`${JSON.stringify({
  schemaVersion: "travel-auth-configuration-check-v1",
  status: ready ? "passed" : "needs_manual_configuration",
  sharedIssues,
  channels,
  callbackUrls,
  alipayKeyFiles,
  applePrivateKey,
  secretsPrinted: false,
})}\n`);
process.exitCode = ready ? 0 : 2;
