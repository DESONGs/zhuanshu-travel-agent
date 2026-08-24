import assert from "node:assert/strict";
import test from "node:test";
import { DEEPSEEK_VISION_MODEL_ID, travelDeepseekProvider } from "../src/agent/travel-model-providers.mjs";

test("the fixed Pi provider catalog gains only the DeepSeek native vision model metadata", () => {
  const provider = travelDeepseekProvider();
  const vision = provider.getModels().find((model) => model.id === DEEPSEEK_VISION_MODEL_ID);
  assert.ok(vision);
  assert.equal(vision.provider, "deepseek");
  assert.equal(vision.api, "openai-completions");
  assert.deepEqual(vision.input, ["text", "image"]);
  assert.equal(provider.getModels().filter((model) => model.id === DEEPSEEK_VISION_MODEL_ID).length, 1);
});
