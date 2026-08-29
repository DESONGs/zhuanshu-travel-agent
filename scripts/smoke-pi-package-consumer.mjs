import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSubagentLaunchContract } from "pi-subagents/preflight";
import { createTravelService } from "../src/api/create-travel-service.mjs";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { registerTravelBusinessRuntime } from "../travel-agent-pi-package/extensions/travel-business-runtime.ts";
import { TripStore } from "../travel-agent-pi-package/src/core/index.ts";

const checkedAt = "2026-08-27T08:00:00.000Z";

function runPiConsumer(binary, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGINT"), options.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`pi_consumer_failed:code=${code ?? "null"}:signal=${signal ?? "none"}:${stderr.slice(-2_000)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function candidate(domain, title, index) {
  const sourceId = `source_${domain}_${index}`;
  const entityId = `entity_${domain}_${index}`;
  const claimId = `claim_${domain}_${index}`;
  return {
    candidateId: `candidate_${domain}_${index}`,
    domain,
    title,
    summary: `${title} fixture evidence`,
    cost: 100 + index,
    checkedAt,
    location: { name: title, address: `Fixture ${domain} address` },
    media: [],
    operability: domain === "transport"
      ? { provider: "pi_consumer_fixture", mobilityRole: "intercity_inventory", transportType: "TRAIN", serviceNumber: "G100", departureAt: "2026-10-03 09:00", arrivalAt: "2026-10-03 12:00", scheduleVerified: true, inventoryVerified: true }
      : { provider: "pi_consumer_fixture", researchDepth: "fixture" },
    sourceId,
    entityId,
    claimId,
    source: { sourceId, provider: "pi_consumer_fixture", sourceType: "contract_fixture", providerPoiId: `poi_${domain}_${index}`, checkedAt, documentationUrl: "https://example.com/pi-consumer-fixture", independenceGroup: sourceId, commercialBias: "fixture" },
    entity: { entityId, kind: domain, canonicalName: title, providerRefs: [`pi_consumer_fixture:${domain}:${index}`] },
    claim: { claimId, entityId, kind: "fixture_fact", statement: `${title} exists in the fixture`, sourceRefs: [sourceId], sourceIndependence: "fixture", commercialBias: "fixture", confidence: 0.9, observedAt: checkedAt },
  };
}

const fixtureProvider = {
  status: "configured",
  canRenderMap: false,
  async research(input) {
    return {
      schemaVersion: "travel-provider-result-v1",
      status: "completed",
      provider: "pi_consumer_fixture",
      providerLabel: "Pi consumer fixture",
      destination: input.brief.destination,
      checkedAt,
      byDomain: {
        play: [candidate("play", "Fixture museum", 1)],
        food: [candidate("food", "Fixture local restaurant", 1)],
        stay: [candidate("stay", "Fixture hotel", 1)],
        transport: [candidate("transport", "G100 Fixture rail", 1)],
      },
      partial: false,
      errors: [],
      caveats: ["fixture_only"],
      fabricatedResults: false,
      fixtureOnly: true,
    };
  },
};

const rootDir = await mkdtemp(join(tmpdir(), "travel-pi-consumer-"));
const store = new TripStore({ rootDir: join(rootDir, "trips") });
store.mode = "file";
const service = createTravelService({}, { store, researchProvider: fixtureProvider, clock: () => new Date(checkedAt) });
const tools = [];
registerTravelBusinessRuntime({ registerTool(tool) { tools.push(tool); } }, { service });

const byName = new Map(tools.map((tool) => [tool.name, tool]));
const createResult = await byName.get("create_trip").execute("create", {
  tripId: "trip_pi_consumer",
  brief: { destination: "Shanghai", dates: "2026-10-03 to 2026-10-05", origin: "Guangzhou", currency: "CNY" },
  travelers: [{ travelerId: "traveler_1", displayName: "Traveler" }],
});
assert.equal(createResult.details.tripId, "trip_pi_consumer");

const researchResult = await byName.get("research_trip_options").execute("research", {
  tripId: "trip_pi_consumer",
  domains: ["play", "food", "stay", "transport"],
  question: "Build one linked fixture-backed trip proposal",
});
if (researchResult.details.status !== "proposed") throw new Error(`pi_consumer_research_failed:${JSON.stringify(researchResult.details)}`);
assert.ok(researchResult.details.proposal?.proposalId);
assert.deepEqual(researchResult.details.candidateCounts, { play: 1, food: 1, stay: 1, transport: 1 });
assert.equal(researchResult.details.fixtureOnly, true);

const preflightRoot = join(rootDir, "package-preflight-consumer");
const consumerRoot = join(rootDir, "runtime-consumer");
const consumerAgentDir = join(rootDir, "agent");
await mkdir(join(preflightRoot, ".pi", "npm", "node_modules"), { recursive: true });
await mkdir(join(consumerRoot, ".pi"), { recursive: true });
await mkdir(consumerAgentDir, { recursive: true });
await writeFile(join(preflightRoot, "package.json"), JSON.stringify({ name: "travel-pi-package-preflight", private: true }, null, 2));
await writeFile(join(consumerRoot, "package.json"), JSON.stringify({ name: "travel-pi-runtime-consumer", private: true }, null, 2));
await symlink(join(import.meta.dirname, "..", "travel-agent-pi-package"), join(preflightRoot, ".pi", "npm", "node_modules", "zhuanshu-travel-agent"), "dir");
await symlink(join(import.meta.dirname, "..", "plugins"), join(preflightRoot, ".pi", "npm", "node_modules", "plugins"), "dir");
await symlink(join(import.meta.dirname, "..", "travel-agent-pi-package", "agents"), join(consumerRoot, ".pi", "agents"), "dir");
await symlink(join(import.meta.dirname, "..", "plugins"), join(consumerRoot, "plugins"), "dir");
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = consumerAgentDir;
for (const agentName of ["zhuanshu-travel.inventory-budget", "zhuanshu-travel.local-discovery", "zhuanshu-travel.operability-schedule"]) {
  const preflight = await resolveSubagentLaunchContract({
    agent: agentName,
    task: "Analyze normalized fixture evidence only.",
    context: "fresh",
    cwd: preflightRoot,
    sessionRoot: join(rootDir, "subagent-session"),
    availableModels: [{ provider: "deepseek", id: "deepseek-v4-flash", reasoning: true }],
  });
  assert.equal(preflight.ok, true, preflight.message);
  assert.deepEqual(preflight.contract.tools.effectiveAllowlist, ["read"]);
  assert.equal(preflight.contract.tools.disableAmbientExtensions, true);
  assert.equal(preflight.contract.skills.resolved.length, 1);
}

const stateBeforeChild = await store.get("trip_pi_consumer");
const env = await loadTravelRuntimeEnv();
assert.ok(env.MOONSHOT_API_KEY, "MOONSHOT_API_KEY is required for the real Pi child consumer smoke");
const piBinary = fileURLToPath(new URL("../node_modules/.bin/pi", import.meta.url));
// The consumer discovers agents/skills through its isolated node_modules while
// the explicit extension entry uses the canonical package source path.
const consumerExtension = fileURLToPath(new URL("../travel-agent-pi-package/extensions/subagents-runtime.ts", import.meta.url));
const parentPrompt = [
  "Call the subagent tool exactly once.",
  "Use workflowScript: return runs.run('main',{agent:'inventory-budget',task:'Compare train total CNY 1500 and hotel CNY 600 per night against trip budget CNY 8000. Return one concise sentence. Do not call Providers or mutate state.',acceptance:false});",
  "Set async:false, mission:false, chatProgress:'off', artifacts:false.",
  "After the tool returns, reply with the child output and nothing else. Do not answer without using the tool.",
].join(" ");
const { stdout } = await runPiConsumer(piBinary, [
  "--mode", "json",
  "-p",
  "--approve",
  "--no-session",
  "--no-context-files",
  "--no-skills",
  "--no-extensions",
  "--extension", consumerExtension,
  "--tools", "subagent",
  "--model", "moonshotai-cn/kimi-k2.6:minimal",
  parentPrompt,
], {
  cwd: consumerRoot,
  env: { ...env, PI_CODING_AGENT_DIR: consumerAgentDir, PI_TELEMETRY: "0" },
  timeoutMs: 90_000,
});
const events = stdout.split(/\r?\n/).flatMap((line) => {
  if (!line.trim().startsWith("{")) return [];
  try { return [JSON.parse(line)]; } catch { return []; }
});
const toolEnd = events.find((event) => event.type === "tool_execution_end" && event.toolName === "subagent");
assert.ok(toolEnd, "real Pi parent did not execute the subagent tool");
assert.notEqual(toolEnd.result?.isError, true, JSON.stringify(toolEnd.result));
const child = toolEnd.result?.details?.results?.[0];
assert.equal(child?.agent, "zhuanshu-travel.inventory-budget");
assert.equal(child?.exitCode, 0, JSON.stringify(child));
assert.equal(child?.skills?.includes("plan-trip"), true);
assert.equal(child?.launchResolvedExtensions?.disableAmbientExtensions, true);
const childToolCalls = child?.toolCalls ?? [];
assert.equal(childToolCalls.every((call) => call.text?.startsWith("read ") && call.text.includes("plan-trip/SKILL.md")), true);
assert.equal(child?.effects?.fileMutation?.attempted, false);
assert.match(child?.model ?? "", /^moonshotai-cn\/kimi-k2\.6/);
assert.match(child?.finalOutput ?? "", /8,?000|8000/);
const stateAfterChild = await store.get("trip_pi_consumer");
assert.deepEqual(stateAfterChild, stateBeforeChild, "read-only Pi child changed TripState");
if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
else process.env.PI_CODING_AGENT_DIR = previousAgentDir;

process.stdout.write(`${JSON.stringify({
  status: "passed_live_child_consumer",
  toolCount: tools.length,
  proposalId: researchResult.details.proposal.proposalId,
  candidateCounts: researchResult.details.candidateCounts,
  subagentContracts: 3,
  child: {
    agent: child.agent,
    model: child.model,
    skillIds: child.skills,
    turns: child.usage?.turns,
    toolCalls: child.progressSummary?.toolCount,
    toolSurface: childToolCalls.length > 0 ? "read_plan_trip_skill_only" : "skill_injected_without_tool_call",
    durationMs: child.progressSummary?.durationMs,
    tripStateWrites: 0,
  },
})}\n`);
