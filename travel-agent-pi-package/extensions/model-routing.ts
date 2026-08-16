import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

function routes() {
  return JSON.parse(readFileSync(join(packageDir, "runtime", "model-routing.json"), "utf8")) as { defaultRoute: string; routes: Record<string, unknown> };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_model_route",
    label: "Route Travel Reasoning Task",
    description: "Return the configured reasoning, extraction, verification, or multimodal route. It selects no provider and returns no model credential.",
    parameters: Type.Object({ kind: Type.Union([Type.Literal("deliberation"), Type.Literal("extraction"), Type.Literal("verification"), Type.Literal("multimodal")]) }),
    async execute(_id, params) {
      const config = routes();
      const details = { schemaVersion: "travel-model-route-v1", kind: params.kind, route: config.routes[params.kind], credentialBoundary: "model credentials are runtime configuration, never tool output" };
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
    },
  });
}
