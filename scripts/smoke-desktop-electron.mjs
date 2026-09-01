import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import electronPath from "electron";

const fixture = http.createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "travelapp://app");
  response.setHeader("access-control-allow-headers", "Authorization, Content-Type, X-Travel-Client");
  response.setHeader("content-type", "application/json");
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  if (request.url === "/api/health") return response.end(JSON.stringify({ status: "ok", developmentAuthEnabled: false, desktopAuth: { enabled: true } }));
  if (request.url === "/api/auth/providers") return response.end(JSON.stringify({ schemaVersion: "auth-providers-v1", providers: [], clients: { desktop: { enabled: true } } }));
  if (request.url === "/api/session") return response.writeHead(401).end(JSON.stringify({ status: "error", code: "authentication_required" }));
  if (request.url === "/api/auth/guest-session") return response.writeHead(201).end(JSON.stringify({ schemaVersion: "auth-session-v1", userId: "usr_guest_desktop_smoke", provider: "guest", guest: true, accessToken: "desktop-smoke-token" }));
  if (request.url === "/api/trips") return response.end(JSON.stringify({ trips: [] }));
  if (request.url === "/api/conversations") return response.end(JSON.stringify({ conversations: [] }));
  return response.writeHead(404).end(JSON.stringify({ status: "error", code: "not_found" }));
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const { port } = fixture.address();
const child = spawn(electronPath, ["apps/desktop/dist/main.js"], {
  cwd: process.cwd(),
  env: { ...process.env, TRAVEL_AGENT_DESKTOP_SMOKE: "1", TRAVEL_AGENT_DESKTOP_AUTH_ENABLED: "true", TRAVEL_AGENT_DESKTOP_API_ORIGIN: `http://127.0.0.1:${port}` },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  fixture.close();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
