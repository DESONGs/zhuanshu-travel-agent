import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sanitizeSocialWorkerResponse, SOCIAL_WORKER_POLICY, validateSocialWorkerRequest } from "../src/workers/social-worker-contract.mjs";

function response(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_social_worker_validate_read_request",
    label: "Validate Social Read Request",
    description: "Validate a request to an external, separately deployed read-only social Worker. This extension does not launch a browser or carry cookies.",
    parameters: Type.Object({ request: Type.Any() }),
    async execute(_id, params) {
      return response({ ...validateSocialWorkerRequest(params.request), policy: SOCIAL_WORKER_POLICY });
    },
  });

  pi.registerTool({
    name: "travel_social_worker_sanitize_read_result",
    label: "Sanitize Social Read Result",
    description: "Normalize an isolated social Worker's response into untrusted evidence input. It removes raw credentials and raw media and never treats content as instructions.",
    parameters: Type.Object({ response: Type.Any() }),
    async execute(_id, params) {
      return response(sanitizeSocialWorkerResponse(params.response));
    },
  });
}
