import { spawn } from "node:child_process";
import electronPath from "electron";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";

const runtime = await loadTravelRuntimeEnv();
const child = spawn(electronPath, ["apps/desktop/dist/main.js"], { cwd: process.cwd(), env: {
  ...process.env,
  TRAVEL_AGENT_DESKTOP_API_ORIGIN: runtime.TRAVEL_AGENT_DESKTOP_API_ORIGIN || runtime.TRAVEL_AGENT_PUBLIC_ORIGIN || "",
  TRAVEL_AGENT_DESKTOP_DEEP_LINK_SCHEME: runtime.TRAVEL_AGENT_DESKTOP_DEEP_LINK_SCHEME || "zhuanshu-travel",
}, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
