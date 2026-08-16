export const DEFAULT_USER_MODEL_ID = "deepseek-v4-flash";
export const DEFAULT_SUBAGENT_MODEL = "moonshotai-cn/kimi-k2.6";

export const USER_MODEL_OPTIONS = Object.freeze([
  Object.freeze({
    id: "deepseek-v4-flash",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    shortLabel: "V4 Flash",
    description: "默认，适合日常规划、快速比较和连续调整。",
    thinkingLevel: "high",
  }),
  Object.freeze({
    id: "deepseek-v4-pro",
    provider: "deepseek",
    model: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    shortLabel: "V4 Pro",
    description: "适合约束较多、取舍复杂或需要更深入推理的旅行。",
    thinkingLevel: "high",
  }),
  Object.freeze({
    id: "kimi-k3",
    provider: "moonshotai-cn",
    model: "kimi-k3",
    label: "Kimi K3",
    shortLabel: "Kimi K3",
    description: "适合超长上下文、图片信息较多或需要另一种推理路径的任务。",
    thinkingLevel: "high",
  }),
]);

export function userModelOption(modelId) {
  return USER_MODEL_OPTIONS.find((option) => option.id === modelId) ?? null;
}

export function modelCredentialConfigured(option, env = process.env) {
  if (!option) return false;
  if (option.provider === "deepseek") return Boolean(String(env.DEEPSEEK_API_KEY ?? "").trim());
  if (option.provider === "moonshotai-cn") return Boolean(String(env.MOONSHOT_API_KEY ?? "").trim());
  return false;
}

export function publicModelSelection(env = process.env) {
  const options = USER_MODEL_OPTIONS.map(({ provider, model, thinkingLevel, ...option }) => ({
    ...option,
    available: modelCredentialConfigured({ provider, model }, env),
  }));
  return {
    defaultModelId: options.find((option) => option.id === DEFAULT_USER_MODEL_ID)?.available
      ? DEFAULT_USER_MODEL_ID
      : options.find((option) => option.available)?.id ?? DEFAULT_USER_MODEL_ID,
    subagentDefault: { provider: "moonshotai-cn", model: "kimi-k2.6", label: "Kimi K2.6" },
    options,
  };
}
