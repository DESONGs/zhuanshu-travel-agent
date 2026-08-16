import { loadTravelRuntimeEnv } from "../src/http/runtime-env.mjs";
import { createFlyaiTravelResearchProvider } from "../src/providers/flyai-travel-research.mjs";
import { TuniuOfficialMcpClient, TUNIU_READ_TOOLS } from "../src/providers/tuniu-official-mcp.mjs";
import { TuniuTravelResearchProvider } from "../src/providers/tuniu-travel-research.mjs";

const env = await loadTravelRuntimeEnv();
const results = [];
let failed = false;
const travelStart = new Date();
travelStart.setUTCDate(travelStart.getUTCDate() + 14);
const travelEnd = new Date(travelStart);
travelEnd.setUTCDate(travelEnd.getUTCDate() + 4);
const startDate = travelStart.toISOString().slice(0, 10);
const endDate = travelEnd.toISOString().slice(0, 10);

if (env.TRAVEL_AGENT_FLYAI_ENABLED !== "true") {
  results.push({ provider: "fliggy_flyai", status: "blocked_by_configuration" });
} else {
  try {
    const provider = createFlyaiTravelResearchProvider(env);
    const result = await provider.research({
      brief: { origin: "广州", destination: "大理", dates: `${startDate} 至 ${endDate}`, arrivalMode: "火车" },
      domains: ["stay", "play", "transport"],
    });
    const counts = Object.fromEntries(Object.entries(result.byDomain ?? {}).map(([domain, items]) => [domain, items.length]));
    const passed = result.status === "completed" && ["stay", "play", "transport"].every((domain) => counts[domain] > 0);
    results.push({ provider: "fliggy_flyai", status: passed ? "passed_read_only_isolated" : result.status, counts, partial: result.partial ?? null, fabricatedResults: result.fabricatedResults === true, sensitiveOutput: false });
    if (!passed) failed = true;
  } catch (error) {
    results.push({ provider: "fliggy_flyai", status: error.code ?? "SOURCE_UNAVAILABLE", sensitiveOutput: false });
    failed = true;
  }
}

if (env.TRAVEL_AGENT_TUNIU_ENABLED !== "true" || !env.TUNIU_API_KEY) {
  results.push({ provider: "tuniu_official_mcp", status: "blocked_pending_api_key", applyAt: "https://open.tuniu.com/mcp" });
} else {
  try {
    const client = new TuniuOfficialMcpClient({ apiKey: env.TUNIU_API_KEY, enabled: true });
    const tools = await client.listTools("train");
    const allowed = tools.filter((tool) => TUNIU_READ_TOOLS.train.has(tool.name)).map((tool) => tool.name);
    const provider = new TuniuTravelResearchProvider({ client });
    const hotel = await provider.research({
      brief: { destination: "北京", dates: `${startDate} 至 ${endDate}` },
      domains: ["stay"],
    });
    const train = await provider.research({
      brief: { origin: "南京", destination: "上海", dates: `${startDate} 至 ${endDate}`, arrivalMode: "火车" },
      domains: ["transport"],
    });
    const flight = await provider.research({
      brief: { origin: "北京", destination: "上海", dates: `${startDate} 至 ${endDate}`, arrivalMode: "飞机" },
      domains: ["transport"],
    });
    const counts = {
      stay: hotel.byDomain?.stay?.length ?? 0,
      train: train.byDomain?.transport?.length ?? 0,
      flight: flight.byDomain?.transport?.length ?? 0,
    };
    const passed = allowed.includes("searchLowestPriceTrain") && Object.values(counts).every((count) => count > 0);
    results.push({ provider: "tuniu_official_mcp", status: passed ? "passed_read_only_isolated" : "EMPTY_VERIFIED", travelDate: startDate, readOnlyTrainTools: allowed, counts, diagnostics: { hotelStatus: hotel.status, trainStatus: train.status, trainErrors: train.errors?.map(({ code }) => code) ?? [], flightStatus: flight.status, flightErrors: flight.errors?.map(({ code }) => code) ?? [] }, fabricatedResults: false, sensitiveOutput: false });
    if (!passed) failed = true;
  } catch (error) {
    results.push({ provider: "tuniu_official_mcp", status: error.code ?? "SOURCE_UNAVAILABLE", sensitiveOutput: false });
    failed = true;
  }
}

process.stdout.write(`${JSON.stringify({ schemaVersion: "travel-inventory-smoke-v1", results, sensitiveOutput: false }, null, 2)}\n`);
if (failed) process.exitCode = 1;
