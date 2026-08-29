import assert from "node:assert/strict";
import { createTravelAnalysisFanout } from "../src/agent/travel-analysis-fanout.mjs";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";

const env = await loadTravelRuntimeEnv();
assert.ok(env.MOONSHOT_API_KEY, "MOONSHOT_API_KEY is not configured");
const candidate = (domain) => ({ candidateId: `${domain}_1`, domain, title: `${domain} fixture`, summary: `Normalized ${domain} evidence`, cost: 100, sourceId: `source_${domain}`, claimId: `claim_${domain}`, operability: {} });
const fanout = createTravelAnalysisFanout(env, { childConcurrency: 2, analysisRunnerOptions: { forceRoute: { status: "checking", provider: "moonshotai-cn", model: "kimi-k2.6" } } });
const result = await fanout({ runId: "run_kimi_child_smoke", tripId: "trip_kimi_child_smoke", baseRevision: 0, criteriaFingerprint: "kimi_child_smoke_v1", requiredLanes: ["inventory_budget", "local_discovery"], brief: { destination: "上海", totalBudget: 8000 }, travelers: [], providerResult: { status: "completed", byDomain: { play: [candidate("play")], food: [candidate("food")], stay: [candidate("stay")], transport: [candidate("transport")] } }, objective: "Validate Kimi as a read-only structured Travel Skill child" });
if (result.coverage !== "complete") {
  process.stdout.write(`${JSON.stringify({ status: "failed_structured_child_smoke", model: "moonshotai-cn/kimi-k2.6", coverage: result.coverage, completedLanes: result.completedLanes, failedLanes: result.failedLanes, timedOutLanes: result.timedOutLanes, degradedReasons: result.degradedReasons, nextConfiguration: "TRAVEL_AGENT_KIMI_CHILD_SMOKE_STATUS=failed_latest_smoke" })}\n`);
  process.exitCode = 1;
} else {
assert.deepEqual([...result.completedLanes].sort(), ["inventory_budget", "local_discovery"]);
assert.equal(result.lanes.every((lane) => lane.model === "moonshotai-cn/kimi-k2.6" && ["plan-trip", "research-trip"].includes(lane.skillId)), true);
process.stdout.write(`${JSON.stringify({ status: "passed_live_smoke", model: "moonshotai-cn/kimi-k2.6", lanes: result.completedLanes, joinCount: result.joinCount, tripStateWrites: 0, nextConfiguration: "TRAVEL_AGENT_KIMI_CHILD_SMOKE_STATUS=passed_live_smoke" })}\n`);
}
