import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { packager } from "@electron/packager";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";

const stage = resolve(".desktop-package-stage");
const output = resolve("release/desktop");
const runtime = await loadTravelRuntimeEnv();
const apiOrigin = String(process.env.TRAVEL_AGENT_DESKTOP_API_ORIGIN || runtime.TRAVEL_AGENT_DESKTOP_API_ORIGIN || runtime.TRAVEL_AGENT_PUBLIC_ORIGIN || "").trim();
const deepLinkScheme = String(process.env.TRAVEL_AGENT_DESKTOP_DEEP_LINK_SCHEME || runtime.TRAVEL_AGENT_DESKTOP_DEEP_LINK_SCHEME || "zhuanshu-travel").trim();
await rm(stage, { recursive: true, force: true });
await mkdir(resolve(stage, "apps/desktop"), { recursive: true });
await mkdir(resolve(stage, "travel-agent-pi-package/src/workers"), { recursive: true });
await cp(resolve("apps/desktop/dist"), resolve(stage, "apps/desktop/dist"), { recursive: true });
await cp(resolve("dist"), resolve(stage, "dist"), { recursive: true });
await cp(resolve("travel-agent-pi-package/src/workers/social-worker-hosts.json"), resolve(stage, "travel-agent-pi-package/src/workers/social-worker-hosts.json"));
await writeFile(resolve(stage, "package.json"), `${JSON.stringify({ name: "zhuanshu-travel-agent-desktop", version: "0.1.0", private: true, type: "module", main: "apps/desktop/dist/main.js" }, null, 2)}\n`);
await writeFile(resolve(stage, "desktop-runtime.json"), `${JSON.stringify({ schemaVersion: "travel-desktop-runtime-v1", apiOrigin: apiOrigin || null, deepLinkScheme }, null, 2)}\n`);

const paths = await packager({
  dir: stage,
  out: output,
  overwrite: true,
  asar: true,
  name: "Zhuanshu Travel Agent",
  appVersion: "0.1.0",
  electronVersion: "44.1.0",
  ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: resolve(process.env.ELECTRON_ZIP_DIR) } : {}),
  prune: true,
});
process.stdout.write(`${JSON.stringify({ schemaVersion: "travel-desktop-package-v1", status: apiOrigin ? "packaged_unsigned" : "packaged_unsigned_unconfigured", paths, apiOriginConfigured: Boolean(apiOrigin), signing: "not_configured", notarization: "not_configured" })}\n`);
