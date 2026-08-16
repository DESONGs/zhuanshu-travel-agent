import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("real stdio MCP server exposes and executes the Travel V1 business contract", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "travel-mcp-"));
  const client = new Client({ name: "travel-mcp-test", version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("src/mcp/server.mjs")],
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRAVEL_AGENT_DATA_DIR: dataDir,
      TRAVEL_AGENT_ENV_FILE: join(dataDir, "isolated-test.env"),
      AMAP_API_KEY: "",
      AMAP_API_SECRET: "",
      TRAVEL_AGENT_OPEN_METEO_ENABLED: "false",
    },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), [
      "create_trip", "update_trip_scope", "get_trip_control_view", "get_trip_plan_view", "get_open_decisions", "research_trip_options", "propose_trip_change", "accept_trip_change", "reject_trip_change", "prepare_booking_handoff", "record_booking_confirmation", "report_trip_disruption", "submit_trip_feedback",
    ]);

    const created = await client.callTool({ name: "create_trip", arguments: { tripId: "trip_mcp", brief: { destination: "北京" } } });
    assert.equal(created.isError, false);
    assert.equal(created.structuredContent.tripId, "trip_mcp");

    const view = await client.callTool({ name: "get_trip_control_view", arguments: { tripId: "trip_mcp" } });
    assert.equal(view.structuredContent.revision, 0);

    const research = await client.callTool({ name: "research_trip_options", arguments: { tripId: "trip_mcp", capability: "amap_official" } });
    assert.equal(research.structuredContent.status, "provider_unavailable");
  } finally {
    await client.close();
  }
});
