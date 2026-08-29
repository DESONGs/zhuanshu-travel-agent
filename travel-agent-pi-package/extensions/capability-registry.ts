import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { providerStatusSummary } from "../../src/providers/provider-status.mjs";

type Capability = {
  capabilityId: string;
  description: string;
  toolPackage?: string;
  securityRequirements?: string[];
};

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const registryPath = join(packageDir, "runtime", "capability-registry.json");

function loadRegistry(): { schemaVersion: string; defaults: { alwaysOn: string[]; loadPolicy: string }; capabilities: Capability[] } {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

function runtimeStatus(capabilityId: string, summary: ReturnType<typeof providerStatusSummary>): string {
  if (["trip_control", "travel_context", "trip_patch", "policy", "travel_qa", "observability"].includes(capabilityId)) return "available_local";
  if (capabilityId === "social_read_worker") return summary.data.socialReadWorker;
  if (capabilityId === "amap_official") return summary.data.amapOfficialMcp;
  if (capabilityId === "fliggy_flyai_search") return summary.data.fliggyFlyAi;
  if (capabilityId === "tuniu_official_mcp") return summary.data.tuniuOfficialMcp;
  if (capabilityId === "transport_query") return summary.data.railway;
  if (capabilityId === "china_travel_content_research") {
    return summary.data.amapOfficialMcp === "passed_live_smoke" ? "available_without_social_discovery" : "limited_by_current_provider_status";
  }
  return "unknown_capability";
}

function runtimeEnabled(status: string): boolean {
  return /^(?:available|passed|trial)/.test(status);
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
      const status = providerStatusSummary(process.env);
      return response({
        ...registry,
        capabilities: registry.capabilities.map((capability) => ({ ...capability, runtimeStatus: runtimeStatus(capability.capabilityId, status) })),
        statusSource: "current_provider_status",
        registryPath,
        rawSecretsReturned: false,
      });
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
      const current = providerStatusSummary(process.env);
      const selected = registry.capabilities.filter((item) => required.has(item.capabilityId)).map((item) => {
        const status = runtimeStatus(item.capabilityId, current);
        return {
          capabilityId: item.capabilityId,
          runtimeStatus: status,
          enabled: runtimeEnabled(status),
          securityRequirements: item.securityRequirements ?? [],
        };
      });
      return response({ schemaVersion: "travel-capability-plan-v1", taskDescription: params.taskDescription ?? null, loadPolicy: registry.defaults.loadPolicy, selected, unknownCapabilityIds });
    },
  });
}
