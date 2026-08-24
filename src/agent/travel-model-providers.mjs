import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { moonshotaiCnProvider } from "@earendil-works/pi-ai/providers/moonshotai-cn";
import { moonshotaiProvider } from "@earendil-works/pi-ai/providers/moonshotai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { xiaomiTokenPlanSgpProvider } from "@earendil-works/pi-ai/providers/xiaomi-token-plan-sgp";

export const DEEPSEEK_VISION_MODEL_ID = "deepseek-v4-flash-vision-exp";

/**
 * Pi 0.84.1 predates DeepSeek's experimental V4 vision catalog entry. Keep the
 * fixed Pi runtime and add only the missing model metadata; the existing
 * DeepSeek transport still owns authentication, reasoning passback and tool
 * calling. Images use Pi's bounded inline image request path and are never
 * persisted by Travel Agent.
 */
export function travelDeepseekProvider() {
  const provider = deepseekProvider();
  const models = provider.getModels();
  if (models.some((model) => model.id === DEEPSEEK_VISION_MODEL_ID)) return provider;
  const flash = models.find((model) => model.id === "deepseek-v4-flash");
  if (!flash) return provider;
  const vision = {
    ...flash,
    id: DEEPSEEK_VISION_MODEL_ID,
    name: "DeepSeek V4 Flash Vision Exp",
    input: ["text", "image"],
  };
  return { ...provider, getModels: () => [...models, vision] };
}

export const TRAVEL_MODEL_PROVIDERS = Object.freeze({
  deepseek: Object.freeze({ create: travelDeepseekProvider, defaultModel: "deepseek-v4-flash", defaultVisionModel: DEEPSEEK_VISION_MODEL_ID }),
  "moonshotai-cn": Object.freeze({ create: moonshotaiCnProvider, defaultModel: "kimi-k2.6", defaultVisionModel: "kimi-k2.6" }),
  moonshotai: Object.freeze({ create: moonshotaiProvider, defaultModel: "kimi-k2.6", defaultVisionModel: "kimi-k2.6" }),
  openai: Object.freeze({ create: openaiProvider, defaultModel: "gpt-4.1-mini" }),
  "xiaomi-token-plan-sgp": Object.freeze({ create: xiaomiTokenPlanSgpProvider, defaultModel: "mimo-v2.5", defaultVisionModel: "mimo-v2.5" }),
});
