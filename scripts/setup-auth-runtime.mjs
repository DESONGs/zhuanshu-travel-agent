import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const envFile = resolve(process.env.TRAVEL_AGENT_ENV_FILE || resolve(process.cwd(), "env_travel.local"));
const defaults = [
  "TRAVEL_AGENT_PUBLIC_ORIGIN=",
  "TRAVEL_AGENT_SESSION_SECRET=",
  "TRAVEL_AGENT_AUTH_STATE_SECRET=",
  "GOOGLE_CLIENT_ID=",
  "GOOGLE_CLIENT_SECRET=",
  "TRAVEL_AGENT_GOOGLE_AUTH_SMOKE_STATUS=not_run",
  "WECHAT_OPEN_APP_ID=",
  "WECHAT_OPEN_APP_SECRET=",
  "TRAVEL_AGENT_WECHAT_WEB_AUTH_SMOKE_STATUS=not_run",
  "WECHAT_MINIAPP_APP_ID=",
  "WECHAT_MINIAPP_APP_SECRET=",
  "TRAVEL_AGENT_WECHAT_MINIAPP_AUTH_SMOKE_STATUS=not_run",
  "ALIPAY_WEB_APP_ID=",
  "ALIPAY_WEB_PRIVATE_KEY_PATH=",
  "ALIPAY_WEB_PUBLIC_KEY_PATH=",
  "TRAVEL_AGENT_ALIPAY_WEB_AUTH_SMOKE_STATUS=not_run",
  "ALIPAY_MINIAPP_APP_ID=",
  "ALIPAY_MINIAPP_PRIVATE_KEY_PATH=",
  "ALIPAY_MINIAPP_PUBLIC_KEY_PATH=",
  "TRAVEL_AGENT_ALIPAY_MINIAPP_AUTH_SMOKE_STATUS=not_run",
  "APPLE_CLIENT_ID=",
  "APPLE_TEAM_ID=",
  "APPLE_KEY_ID=",
  "APPLE_PRIVATE_KEY_PATH=",
  "TRAVEL_AGENT_APPLE_AUTH_SMOKE_STATUS=not_run",
];

function secret() {
  return randomBytes(48).toString("base64url");
}

function valueFor(text, key) {
  return text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function setEmptyValue(text, key, value) {
  const pattern = new RegExp(`^${key}=\\s*$`, "m");
  return pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : text;
}

let text;
try {
  text = await readFile(envFile, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  text = "# Travel Agent local runtime. Never commit this file.\n";
}

const missingLines = defaults.filter((line) => !new RegExp(`^${line.slice(0, line.indexOf("="))}=`, "m").test(text));
if (missingLines.length) {
  text = `${text.trimEnd()}\n\n# Account login runtime. Platform values remain empty until configured by the authorized owner.\n${missingLines.join("\n")}\n`;
}
const generated = [];
for (const key of ["TRAVEL_AGENT_SESSION_SECRET", "TRAVEL_AGENT_AUTH_STATE_SECRET"]) {
  if (valueFor(text, key)) continue;
  text = setEmptyValue(text, key, secret());
  generated.push(key);
}

await mkdir(dirname(envFile), { recursive: true, mode: 0o700 });
const temporary = `${envFile}.${process.pid}.tmp`;
await writeFile(temporary, `${text.trimEnd()}\n`, { encoding: "utf8", mode: 0o600 });
await rename(temporary, envFile);
if (process.platform !== "win32") await chmod(envFile, 0o600);

process.stdout.write(`${JSON.stringify({
  schemaVersion: "travel-auth-runtime-setup-v1",
  status: "local_runtime_ready",
  envFile,
  generated,
  secretValuesPrinted: false,
  next: "Fill the platform-owned fields and TRAVEL_AGENT_PUBLIC_ORIGIN, then run npm run auth:check.",
})}\n`);
