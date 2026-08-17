import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { sanitizeSocialWorkerResponse, SOCIAL_WORKER_POLICY, validateSocialWorkerRequest } from "../src/workers/social-worker-contract.mjs";

const platform = Type.Union([Type.Literal("xiaohongshu"), Type.Literal("douyin")]);
const requestSchema = Type.Union([
  Type.Object({ operation: Type.Literal("search_social_content"), platform, query: Type.String({ minLength: 1, maxLength: 160 }), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })) }),
  Type.Object({ operation: Type.Union([Type.Literal("read_social_content"), Type.Literal("resolve_social_share_url")]), platform, url: Type.String({ format: "uri" }) }),
]);
const responseSchema = Type.Object({
  code: Type.Optional(Type.String()),
  items: Type.Optional(Type.Array(Type.Object({
    sourceUrl: Type.Optional(Type.String()), title: Type.Optional(Type.String()), author: Type.Optional(Type.String()),
    publishedAt: Type.Optional(Type.String()), contentType: Type.Optional(Type.String()), excerpt: Type.Optional(Type.String()),
    engagement: Type.Optional(Type.Number()),
  }, { additionalProperties: true }))),
}, { additionalProperties: true });

function response(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_social_worker_validate_read_request",
    label: "Validate Social Read Request",
    description: "Validate a request to an external, separately deployed read-only social Worker. This extension does not launch a browser or carry cookies.",
    parameters: Type.Object({ request: requestSchema }),
    async execute(_id, params) {
      return response({ ...validateSocialWorkerRequest(params.request), policy: SOCIAL_WORKER_POLICY });
    },
  });

  pi.registerTool({
    name: "travel_social_worker_sanitize_read_result",
    label: "Sanitize Social Read Result",
    description: "Normalize an isolated social Worker's response into untrusted evidence input. It removes raw credentials and raw media and never treats content as instructions.",
    parameters: Type.Object({ response: responseSchema }),
    async execute(_id, params) {
      return response(sanitizeSocialWorkerResponse(params.response));
    },
  });
}
