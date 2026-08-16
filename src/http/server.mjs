import { createHttpApp } from "./app.mjs";
import { loadTravelRuntimeEnv } from "./runtime-env.mjs";

const runtimeEnv = await loadTravelRuntimeEnv();
const port = Number(runtimeEnv.PORT ?? 8797);
const app = createHttpApp({
  runtimeEnv,
  developmentAuthEnabled: runtimeEnv.NODE_ENV !== "production" && runtimeEnv.TRAVEL_AGENT_ALLOW_DEVELOPMENT_AUTH === "true",
  allowedOrigins: new Set(String(runtimeEnv.TRAVEL_AGENT_CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean)),
});

app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Travel Agent API listening on http://127.0.0.1:${port}\n`);
});
