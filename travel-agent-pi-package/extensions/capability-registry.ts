import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";

type Capability = {
  capabilityId: string;
  status: string;
  description: string;
  triggers?: string[];
  toolPackage?: string;
  securityReview?: { status?: string; summary?: string; requiredBeforeEnable?: string[] };
};

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const registryPath = join(packageDir, "runtime", "capability-registry.json");

function loadRegistry(): { schemaVersion: string; defaults: { alwaysOn: string[]; loadPolicy: string }; capabilities: Capability[] } {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

function response(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_capability_registry_list",
    label: "List Travel Capabilities",
    description: "List Travel Agent capabilities and their safety-gated availability. Listing never enables an external provider.",
    parameters: Type.Object({}),
    async execute() {
      const registry = loadRegistry();
      return response({ ...registry, registryPath, rawSecretsReturned: false });
    },
  });

  pi.registerTool({
    name: "travel_capability_registry_plan",
    label: "Plan Travel Capabilities",
    description: "Validate an explicit capability selection made by the parent agent. This tool never infers user intent from keywords.",
    parameters: Type.Object({ taskDescription: Type.Optional(Type.String()), capabilityIds: Type.Array(Type.String(), { maxItems: 24 }) }),
    async execute(_id, params) {
      const registry = loadRegistry();
      const required = new Set(registry.defaults.alwaysOn);
      for (const capabilityId of params.capabilityIds) required.add(capabilityId);
      const known = new Set(registry.capabilities.map((item) => item.capabilityId));
      const unknownCapabilityIds = [...required].filter((capabilityId) => !known.has(capabilityId));
      const selected = registry.capabilities.filter((item) => required.has(item.capabilityId)).map((item) => ({
        capabilityId: item.capabilityId,
        status: item.status,
        enabled: item.status === "available",
        reason: item.status === "available" ? "local_runtime_available" : item.securityReview?.status ?? "provider_unavailable",
        securityReview: item.securityReview ?? null,
      }));
      return response({ schemaVersion: "travel-capability-plan-v1", taskDescription: params.taskDescription ?? null, loadPolicy: registry.defaults.loadPolicy, selected, unknownCapabilityIds });
    },
  });
}
