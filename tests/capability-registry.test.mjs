import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import registerCapabilityRegistry from "../travel-agent-pi-package/extensions/capability-registry.ts";

test("capability registry keeps static requirements separate from current Provider status", async () => {
  const registryText = await readFile(new URL("../travel-agent-pi-package/runtime/capability-registry.json", import.meta.url), "utf8");
  assert.doesNotMatch(registryText, /10044|passed_live_smoke|"status"\s*:/);

  const previous = {
    AMAP_API_KEY: process.env.AMAP_API_KEY,
    TRAVEL_AGENT_AMAP_SMOKE_STATUS: process.env.TRAVEL_AGENT_AMAP_SMOKE_STATUS,
  };
  process.env.AMAP_API_KEY = "fixture-key";
  process.env.TRAVEL_AGENT_AMAP_SMOKE_STATUS = "passed_live_smoke";
  try {
    const tools = [];
    registerCapabilityRegistry({ registerTool(tool) { tools.push(tool); } });
    const list = await tools.find((tool) => tool.name === "travel_capability_registry_list").execute("list", {});
    const amap = list.details.capabilities.find((capability) => capability.capabilityId === "amap_official");
    assert.equal(list.details.statusSource, "current_provider_status");
    assert.equal(amap.runtimeStatus, "passed_live_smoke");
    const plan = await tools.find((tool) => tool.name === "travel_capability_registry_plan").execute("plan", { capabilityIds: ["amap_official"] });
    assert.equal(plan.details.selected.find((capability) => capability.capabilityId === "amap_official").enabled, true);
  } finally {
    if (previous.AMAP_API_KEY === undefined) delete process.env.AMAP_API_KEY; else process.env.AMAP_API_KEY = previous.AMAP_API_KEY;
    if (previous.TRAVEL_AGENT_AMAP_SMOKE_STATUS === undefined) delete process.env.TRAVEL_AGENT_AMAP_SMOKE_STATUS; else process.env.TRAVEL_AGENT_AMAP_SMOKE_STATUS = previous.TRAVEL_AGENT_AMAP_SMOKE_STATUS;
  }
});
