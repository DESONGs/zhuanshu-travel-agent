import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageRoot = new URL("../travel-agent-pi-package/", import.meta.url);

test("Pi loads the complete product tool surface from source without dist or raw-state commit tools", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));
  const localExtensions = manifest.pi.extensions.filter((entry) => entry.startsWith("./extensions/"));
  assert.equal(manifest.private, true);
  assert.equal(manifest.pi.extensions.some((entry) => entry.includes("dist/")), false);
  assert.equal(manifest.pi.skills.includes("../plugins/travel-agent/skills"), true);
  assert.equal(manifest.pi.extensions.includes("../node_modules/pi-subagents/index.ts"), true);
  assert.equal(manifest.pi.extensions.includes("../node_modules/@quintinshaw/pi-dynamic-workflows/extensions/workflow.ts"), true);

  const tools = [];
  const pi = { registerTool(tool) { tools.push(tool); } };
  for (const extension of localExtensions) {
    const module = await import(new URL(extension.slice(2), packageRoot));
    module.default(pi);
  }

  const names = tools.map((tool) => tool.name);
  for (const operation of [
    "create_trip", "update_trip_scope", "get_trip_control_view", "get_trip_plan_view", "get_open_decisions",
    "research_trip_options", "propose_trip_change", "accept_trip_change", "reject_trip_change",
    "prepare_booking_handoff", "record_booking_confirmation", "report_trip_disruption", "submit_trip_feedback",
  ]) assert.equal(names.includes(operation), true, `missing Pi product tool: ${operation}`);

  assert.equal(names.includes("travel_trip_patch_parent_commit"), false);
  assert.equal(names.includes("travel_trip_state_create"), false);
  const schemaSizes = tools.map((tool) => JSON.stringify(tool.parameters).length);
  assert.ok(Math.max(...schemaSizes) < 10_000, "a Pi tool should not embed the full TripState schema");
  assert.ok(schemaSizes.reduce((total, size) => total + size, 0) < 40_000, "the product tool surface should stay bounded");
});
