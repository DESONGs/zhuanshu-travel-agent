import assert from "node:assert/strict";
import test from "node:test";
import { TuniuOfficialMcpClient, unwrapToolResult } from "../src/providers/tuniu-official-mcp.mjs";

test("Tuniu client calls only fixed official endpoints and does not expose its key in results", async () => {
  const requests = [];
  const client = new TuniuOfficialMcpClient({
    apiKey: "tuniu-test-key",
    enabled: true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "searchLowestPriceTrain", description: "查询", inputSchema: { type: "object" } }] } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const tools = await client.listTools("train");
  assert.equal(requests[0].url, "https://openapi.tuniu.cn/mcp/train");
  assert.equal(requests[0].options.headers.apiKey, "tuniu-test-key");
  assert.deepEqual(tools.map((tool) => tool.name), ["searchLowestPriceTrain"]);
  assert.equal(JSON.stringify(tools).includes("tuniu-test-key"), false);
});

test("Tuniu client blocks booking and unknown tools before network access", async () => {
  let calls = 0;
  const client = new TuniuOfficialMcpClient({ apiKey: "key", enabled: true, fetchImpl: async () => { calls += 1; return new Response("{}"); } });
  await assert.rejects(() => client.callReadTool("train", "bookTrain", {}), { code: "TERMS_BLOCKED" });
  await assert.rejects(() => client.callReadTool("hotel", "cancelOrder", {}), { code: "TERMS_BLOCKED" });
  assert.equal(calls, 0);
});

test("Tuniu client unwraps services that return business JSON inside a result string", () => {
  assert.deepEqual(unwrapToolResult({ structuredContent: { result: { result: "{\"successCode\":true,\"data\":[{\"trainNum\":\"G1\"}]}" } } }), {
    successCode: true,
    data: [{ trainNum: "G1" }],
  });
  assert.deepEqual(unwrapToolResult({ result: "plain diagnostic" }), { text: "plain diagnostic" });
});
