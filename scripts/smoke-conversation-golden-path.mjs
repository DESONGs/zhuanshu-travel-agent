import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TravelConversationAgent } from "../src/agent/travel-conversation-agent.mjs";
import { TravelService } from "../src/api/travel-service.mjs";
import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { FileConversationRepository } from "../src/persistence/conversation-repository.mjs";
import { createTravelResearchProvider } from "../src/providers/travel-research-provider.mjs";
import { TripStore } from "zhuanshu-travel-agent/core";

const env = await loadTravelRuntimeEnv();
assert.equal(env.TRAVEL_AGENT_MODEL_PROVIDER, "deepseek", "DeepSeek reasoning route is not configured");
assert.ok(env.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY is not configured");
const tripStart = new Date();
tripStart.setUTCDate(tripStart.getUTCDate() + 14);
const tripEnd = new Date(tripStart);
tripEnd.setUTCDate(tripEnd.getUTCDate() + 4);
const tripDates = `${tripStart.toISOString().slice(0, 10)} 至 ${tripEnd.toISOString().slice(0, 10)}`;

const rootDir = await mkdtemp(join(tmpdir(), "travel-agent-live-conversation-"));
const travelService = new TravelService({
  store: new TripStore({ rootDir: join(rootDir, "trips") }),
  researchProvider: createTravelResearchProvider(env),
});
const conversationRepository = new FileConversationRepository({ rootDir: join(rootDir, "conversations") });
const agent = new TravelConversationAgent({ travelService, conversationRepository, env });
const userId = "live_smoke_traveler";
const conversation = await agent.createConversation({ userId });

const first = await agent.reply({
  conversationId: conversation.conversationId,
  userId,
  text: `${tripDates} 和父母去上海 5 天，轻松一点，住得方便，想吃本地菜。父亲需要少走路并避开楼梯，总预算 12000 元。`,
});
assert.equal(first.status, "completed", JSON.stringify({ code: first.code ?? null, activities: first.activities }));
assert.ok(first.tripId, "The first natural-language request did not create a trip understanding");
assert.ok(first.activities.some((activity) => activity.toolName === "save_trip_understanding"), "The model did not save the first request");

const second = await agent.reply({
  conversationId: conversation.conversationId,
  userId,
  text: "北京出发，飞机。还没决定住宿位置，需要你帮忙设计。",
});
assert.equal(second.status, "completed", JSON.stringify({ code: second.code ?? null, activities: second.activities }));
assert.equal(second.tripId, first.tripId);
assert.ok(second.activities.some((activity) => activity.toolName === "save_trip_understanding"), "The model did not merge the short follow-up");
assert.ok(second.activities.some((activity) => activity.toolName === "research_trip_options"), "The model did not continue linked trip research");

const control = await travelService.getTripControlView(first.tripId);
assert.equal(control.brief.destination, "上海");
assert.equal(control.brief.durationDays, 5);
assert.equal(control.brief.origin, "北京");
assert.match(String(control.brief.arrivalMode), /飞/);
assert.ok(String(control.brief.lodgingPreference ?? "").trim(), "The lodging preference from the conversation was not preserved");
assert.equal(control.brief.totalBudget, 12_000, "The model did not preserve the total budget");
const father = control.travelers.find((traveler) => traveler.displayName === "父亲" || traveler.relationship === "父亲");
assert.ok(father, "The model did not preserve the father as an individual traveler");
assert.equal(father.careNeeds?.mobility?.reduceWalking, true, "The father's reduced-walking need was not bound to him");
assert.equal(father.careNeeds?.mobility?.avoidStairs, true, "The father's avoid-stairs need was not bound to him");

const stagedPlan = await travelService.getTripPlanView(first.tripId);
assert.equal(stagedPlan.pendingProposals.length, 1, "Live providers did not stage a proposal for user comparison");
assert.equal(stagedPlan.weather?.status, "completed", "The linked trip proposal did not persist verified weather into shared trip state");
assert.ok(["covered", "partial"].includes(stagedPlan.weather.coverage), `Trip weather does not cover the travel dates: ${stagedPlan.weather.coverage}`);
const proposal = stagedPlan.pendingProposals[0];
const candidateCounts = Object.fromEntries(Object.entries(proposal.byDomain).map(([domain, candidates]) => [domain, candidates.length]));
assert.ok(candidateCounts.stay > 0, "Live providers returned no hotel candidate");
assert.ok(candidateCounts.transport > 0, "Live providers returned no transport candidate");
assert.ok(Object.values(candidateCounts).some((count) => count > 0), "Live providers returned no candidate in any domain");
const selections = Object.fromEntries(Object.entries(proposal.byDomain).filter(([, candidates]) => candidates.length).map(([domain, candidates]) => [domain, candidates[0].nodeId]));
const accepted = await travelService.acceptTripChange({ tripId: first.tripId, proposalId: proposal.proposalId, selections });
assert.equal(accepted.status, "committed", "User selections did not commit through the Parent Agent service boundary");
const acceptedPlan = await travelService.getTripPlanView(first.tripId);
const acceptedDomains = Object.entries(acceptedPlan.byDomain).filter(([, candidates]) => candidates.some((candidate) => candidate.selected)).map(([domain]) => domain).sort();
const missingDomains = Object.entries(candidateCounts).filter(([, count]) => count === 0).map(([domain]) => domain).sort();

const visibleText = second.conversation.messages.map((message) => message.text).join("\n");
assert.doesNotMatch(visibleText, /Schema|Runtime|Provider|Smoke|TripState|Evidence|TripPatch|revision|write set|weatherFit|preferred|caution|contextual/i);
if (stagedPlan.weather.provider === "open_meteo") {
  assert.doesNotMatch(visibleText, /官方(?:预报|天气)/, "The Agent mislabeled Open-Meteo as an official forecast source");
}

console.log(JSON.stringify({
  status: "passed_live_smoke",
  model: `${env.TRAVEL_AGENT_MODEL_PROVIDER}/${env.TRAVEL_AGENT_MODEL}`,
  turns: 2,
  tripUnderstanding: {
    destination: control.brief.destination,
    durationDays: control.brief.durationDays,
    origin: control.brief.origin,
    arrivalMode: control.brief.arrivalMode,
    travelerCount: control.travelers.length,
    totalBudget: control.brief.totalBudget,
    constrainedTraveler: { displayName: father.displayName, mobility: father.careNeeds.mobility },
  },
  secondTurnActivities: second.activities.map(({ toolName, status }) => ({ toolName, status })),
  weather: {
    provider: stagedPlan.weather.provider,
    coverage: stagedPlan.weather.coverage,
    severity: stagedPlan.weather.planningImpact.severity,
    affectedDomains: stagedPlan.weather.planningImpact.affectedDomains,
  },
  liveProposal: { candidateCounts, acceptedDomains, missingDomains },
  note: missingDomains.length ? "Live model, provider, proposal and commit path passed for available domains; missing domains remain visible instead of being fabricated." : "Live model, provider, proposal and commit path passed for all domains.",
}, null, 2));
