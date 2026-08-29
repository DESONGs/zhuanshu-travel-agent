import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";
import { assertCompatiblePiHost } from "../../src/agent/pi-host-compatibility.mjs";

assertCompatiblePiHost({ allowUnknown: true });
const jiti = createJiti(import.meta.url);
const loadedSubagents: unknown = await jiti.import("pi-subagents", { default: true });
if (typeof loadedSubagents !== "function") throw new Error("pi_subagents_extension_entrypoint_missing");
const registerSubagents = loadedSubagents as (pi: ExtensionAPI) => unknown;

export default function (pi: ExtensionAPI) {
  return registerSubagents(pi);
}
