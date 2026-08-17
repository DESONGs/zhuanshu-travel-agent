import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const packageRoot = join(projectRoot, "travel-agent-pi-package");
const consumerRoot = await mkdtemp(join(tmpdir(), "zhuanshu-travel-agent-consumer-"));
const npmEnvironment = { ...process.env, npm_config_cache: join(projectRoot, ".npm-cache") };

const packed = await execute("npm", ["pack", packageRoot, "--pack-destination", consumerRoot, "--json"], {
  cwd: projectRoot,
  env: npmEnvironment,
  maxBuffer: 10 * 1024 * 1024,
});
const packResult = JSON.parse(packed.stdout);
const filename = packResult[0]?.filename;
if (!filename) throw new Error("npm_pack_did_not_return_tarball");
const tarball = join(consumerRoot, filename);

await writeFile(join(consumerRoot, "package.json"), `${JSON.stringify({
  name: "zhuanshu-travel-agent-consumer-smoke",
  version: "1.0.0",
  private: true,
  type: "module",
  dependencies: {
    "zhuanshu-travel-agent": `file:${tarball}`,
    "@earendil-works/pi-agent-core": "0.84.1",
    "@earendil-works/pi-ai": "0.84.1",
    "@earendil-works/pi-coding-agent": "0.84.1",
    "@earendil-works/pi-tui": "0.84.1",
    "@types/node": "24.12.4",
    "typescript": "5.9.3"
  }
}, null, 2)}\n`, "utf8");

await writeFile(join(consumerRoot, "tsconfig.json"), `${JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    skipLibCheck: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    types: ["node"]
  },
  include: ["consumer.ts"]
}, null, 2)}\n`, "utf8");

await writeFile(join(consumerRoot, "consumer.ts"), `
import { createTripControlState, type TripState } from "zhuanshu-travel-agent/core";
import { TripStateSchema, isSchema } from "zhuanshu-travel-agent/contracts";
import { TRAVEL_MCP_OPERATIONS } from "zhuanshu-travel-agent/mcp";
import registerTravelCoreTools from "zhuanshu-travel-agent/pi";
import type { ProviderResult, TravelResearchProvider } from "zhuanshu-travel-agent/providers";

const state: TripState = createTripControlState({ tripId: "trip_consumer" });
if (!isSchema(TripStateSchema, state)) throw new Error("consumer_contract_failed");
if (!TRAVEL_MCP_OPERATIONS.create_trip.parentOnly) throw new Error("mcp_contract_failed");
const provider: TravelResearchProvider | null = null;
const result: ProviderResult | null = null;
void provider; void result; void registerTravelCoreTools;
`, "utf8");

await writeFile(join(consumerRoot, "consumer.mjs"), `
import { DefaultResourceLoader, SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import { getModels, getProviders } from "@earendil-works/pi-ai/compat";
import { createTripControlState } from "zhuanshu-travel-agent/core";
import registerTravelCoreTools from "zhuanshu-travel-agent/pi";

const state = createTripControlState({ tripId: "trip_pi_consumer" });
if (state.schemaVersion !== "trip-control-state-v1") throw new Error("core_runtime_not_loaded");
const loader = new DefaultResourceLoader({
  cwd: ${JSON.stringify(consumerRoot)},
  agentDir: ${JSON.stringify(join(consumerRoot, ".pi"))},
  extensionFactories: [registerTravelCoreTools],
});
await loader.reload();
const provider = getProviders()[0];
const model = provider ? getModels(provider)[0] : null;
if (!model) throw new Error("pi_model_catalog_empty");
const { session } = await createAgentSession({
  cwd: ${JSON.stringify(consumerRoot)},
  agentDir: ${JSON.stringify(join(consumerRoot, ".pi"))},
  model,
  noTools: "builtin",
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(${JSON.stringify(consumerRoot)}),
});
try {
  const tools = new Set(session.getAllTools().map((tool) => tool.name));
  for (const expected of ["travel_trip_state_create", "travel_context_build", "travel_trip_patch_validate", "travel_qa_gate"]) {
    if (!tools.has(expected)) throw new Error(\`pi_tool_missing:\${expected}\`);
  }
} finally {
  session.dispose();
}
`, "utf8");

await execute("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: consumerRoot, env: npmEnvironment, maxBuffer: 10 * 1024 * 1024 });
await execute("npm", ["audit", "--omit=dev", "--audit-level=high"], { cwd: consumerRoot, env: npmEnvironment, maxBuffer: 10 * 1024 * 1024 });
await execute("npx", ["--no-install", "tsc", "-p", "tsconfig.json"], { cwd: consumerRoot, maxBuffer: 10 * 1024 * 1024 });
await execute("node", ["consumer.mjs"], { cwd: consumerRoot, maxBuffer: 10 * 1024 * 1024 });

const packageJson = JSON.parse(await readFile(join(consumerRoot, "node_modules", "zhuanshu-travel-agent", "package.json"), "utf8"));
process.stdout.write(`${JSON.stringify({
  status: "passed",
  package: `${packageJson.name}@${packageJson.version}`,
  tarball: filename,
  consumerRoot,
  piVersion: "0.84.1",
}, null, 2)}\n`);
