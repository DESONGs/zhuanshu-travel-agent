import { createTripRepository } from "../persistence/trip-repository.mjs";
import { createTravelResearchProvider } from "../providers/travel-research-provider.mjs";
import { createTravelAnalysisFanout } from "../agent/travel-analysis-fanout.mjs";
import { createTravelAnalysisRunCoordinator } from "../agent/travel-analysis-run-coordinator.mjs";
import { TravelService } from "./travel-service.mjs";

export function workflowExecutionPolicy(env = process.env) {
  const configuredWorkers = Math.max(1, Number(env.TRAVEL_AGENT_INSTANCE_COUNT ?? env.WEB_CONCURRENCY ?? 1) || 1);
  const coordinatorRequested = Boolean(String(env.TRAVEL_AGENT_WORKFLOW_COORDINATOR ?? "").trim());
  const requestedMode = String(env.TRAVEL_AGENT_WORKFLOW_EXECUTION_MODE ?? "single_process").trim();
  const singleProcess = requestedMode === "single_process" && configuredWorkers === 1;
  return {
    workflowExecutionMode: "single_process",
    configuredWorkers,
    coordinatorRequested,
    coordinatorSupported: false,
    semanticFanoutEnabled: singleProcess,
    backgroundResumeSupported: false,
    crossInstanceSteerSupported: false,
    status: singleProcess ? "enabled" : "blocked_multi_instance_without_coordinator",
  };
}

export function createTravelService(env = process.env, options = {}) {
  const store = options.store ?? createTripRepository({
    databaseUrl: env.DATABASE_URL,
    rootDir: env.TRAVEL_AGENT_DATA_DIR,
  });
  const researchProvider = options.researchProvider ?? createTravelResearchProvider(env, options.providerOptions);
  const executionPolicy = workflowExecutionPolicy(env);
  const analysisRunCoordinator = options.analysisRunCoordinator ?? createTravelAnalysisRunCoordinator();
  const planningRunCoordinator = options.planningRunCoordinator ?? createTravelAnalysisRunCoordinator();
  const analysisFanout = options.analysisFanout === false || !executionPolicy.semanticFanoutEnabled
    ? null
    : options.analysisFanout ?? createTravelAnalysisFanout(env, { clock: options.clock, coordinator: analysisRunCoordinator, childConcurrency: options.analysisOptions?.childConcurrency ?? env.TRAVEL_AGENT_ANALYSIS_CHILD_CONCURRENCY, ...(options.analysisOptions ?? {}) });
  const service = new TravelService({
    store,
    researchProvider,
    clock: options.clock,
    analysisFanout,
    analysisRunCoordinator,
    planningRunCoordinator,
    analysisDegradedReason: executionPolicy.semanticFanoutEnabled ? null : executionPolicy.status,
  });
  service.workflowExecution = executionPolicy;
  return service;
}
