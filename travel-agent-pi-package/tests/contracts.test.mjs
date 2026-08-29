import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { TRAVEL_MCP_OPERATIONS, validateTravelMcpRequest } from "../src/mcp/index.ts";
import { loadTravelSkill, renderTravelSkillsForPrompt, selectParentTravelSkills } from "../../src/agent/travel-skill-loader.mjs";

test("keeps the full business-level MCP surface and its confirmation boundary", () => {
  assert.deepEqual(Object.keys(TRAVEL_MCP_OPERATIONS), [
    "create_trip", "update_trip_scope", "get_trip_control_view", "get_trip_plan_view", "get_open_decisions", "research_trip_options", "propose_trip_change", "accept_trip_change", "reject_trip_change", "prepare_booking_handoff", "record_booking_confirmation", "report_trip_disruption", "submit_trip_feedback",
  ]);
  assert.equal(validateTravelMcpRequest({ operation: "accept_trip_change", actor: "skill" }).reason, "parent_agent_required");
  assert.equal(validateTravelMcpRequest({ operation: "prepare_booking_handoff", actor: "travel_parent_agent" }).reason, "user_confirmation_required");
  assert.equal(validateTravelMcpRequest({ operation: "prepare_booking_handoff", actor: "travel_parent_agent", explicitUserConfirmation: true }).ok, true);
  assert.equal(validateTravelMcpRequest({ operation: "create_trip", actor: "travel_parent_agent", payload: { token: "no" } }).reason, "sensitive_payload_blocked");
});

test("loads composite Travel Skills into bounded Agent context while retaining the micro-Skill guidance", () => {
  const root = join(import.meta.dirname, "..", "..", "plugins", "travel-agent", "skills");
  const microSkills = [
    "understand-trip-request", "resolve-trip-scope", "elicit-party-preferences", "plan-travel-research", "research-china-travel-content", "retrieve-social-evidence", "digest-travel-media", "resolve-travel-entities", "assess-source-independence", "verify-travel-facts", "normalize-travel-offers", "assess-traveler-operability", "assess-trip-weather", "evaluate-trip-fit", "shape-trip-schedule", "compare-trip-alternatives", "propose-trip-change", "explain-trip-tradeoff", "prepare-fulfillment", "handle-trip-disruption", "review-trip-coherence", "capture-trip-feedback",
  ];
  const compositeSkills = ["understand-trip", "research-trip", "plan-trip", "recover-trip"];
  assert.deepEqual(readdirSync(root).sort(), [...microSkills, ...compositeSkills].sort());
  for (const name of [...microSkills, ...compositeSkills]) {
    const path = join(root, name, "SKILL.md");
    assert.equal(existsSync(path), true, `${name} is missing`);
    const content = readFileSync(path, "utf8");
    assert.match(content, /Never mutate Trip State or commit a patch\./, `${name} must deny direct state mutation`);
    assert.doesNotMatch(content, /\[TODO:/, `${name} must not contain scaffold placeholders`);
  }
  const selected = selectParentTravelSkills({ control: null, input: "Plan a first trip" });
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((skill) => skill.skillId), ["understand-trip", "research-trip"]);
  const prompt = renderTravelSkillsForPrompt(selected);
  assert.match(prompt, /<active-travel-skills>/);
  assert.match(prompt, /Named places and target areas belong in structured criteria/);
  assert.ok(loadTravelSkill("research-trip").digest.length >= 12);
});
