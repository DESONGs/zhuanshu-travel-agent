import assert from "node:assert/strict";
import test from "node:test";
import registerModelRouting from "../travel-agent-pi-package/extensions/model-routing.ts";

test("Pi model routing derives from the current Web model resolver instead of static JSON", async () => {
  const previous = { provider: process.env.TRAVEL_AGENT_MODEL_PROVIDER, model: process.env.TRAVEL_AGENT_MODEL, key: process.env.DEEPSEEK_API_KEY };
  process.env.TRAVEL_AGENT_MODEL_PROVIDER = "deepseek";
  process.env.TRAVEL_AGENT_MODEL = "deepseek-v4-flash";
  process.env.DEEPSEEK_API_KEY = "fixture-key";
  try {
    const tools = [];
    registerModelRouting({ registerTool(tool) { tools.push(tool); } });
    const result = await tools.find((tool) => tool.name === "travel_model_route").execute("route", { kind: "deliberation" });
    assert.equal(result.details.statusSource, "current_model_resolver");
    assert.equal(result.details.route.provider, "deepseek");
    assert.equal(result.details.route.model, "deepseek-v4-flash");
  } finally {
    if (previous.provider === undefined) delete process.env.TRAVEL_AGENT_MODEL_PROVIDER; else process.env.TRAVEL_AGENT_MODEL_PROVIDER = previous.provider;
    if (previous.model === undefined) delete process.env.TRAVEL_AGENT_MODEL; else process.env.TRAVEL_AGENT_MODEL = previous.model;
    if (previous.key === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previous.key;
  }
});
