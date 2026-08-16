import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DOMAINS = ["transport", "stay", "play", "food"] as const;

function compileWorkUnits(focusOrder: readonly typeof DOMAINS[number][], anchorDomain?: typeof DOMAINS[number]) {
  const priority = [...new Set([...focusOrder, ...DOMAINS])];
  return priority.map((domain, index) => ({
    workUnitId: `initial_${domain}_${index + 1}`,
    domain,
    mode: anchorDomain === domain ? "research_and_shape_anchor" : "research_with_shared_constraints",
    dependsOn: anchorDomain && anchorDomain !== domain ? [`initial_${anchorDomain}_${priority.indexOf(anchorDomain) + 1}`] : [],
    output: "TripPatchProposal_or_needs_context",
  }));
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "travel_planner_plan",
    label: "Plan Linked Travel Work Units",
    description: "Plan bounded linked work units over one shared trip state; it never creates four isolated workflows.",
    parameters: Type.Object({
      goal: Type.String(),
      focusOrder: Type.Array(Type.Union(DOMAINS.map((domain) => Type.Literal(domain))), { minItems: 1, maxItems: 4 }),
      anchorDomain: Type.Optional(Type.Union(DOMAINS.map((domain) => Type.Literal(domain)))),
      currentRevision: Type.Optional(Type.Integer({ minimum: 0 })),
    }),
    async execute(_id, params) {
      const details = {
        schemaVersion: "travel-planner-envelope-v1",
        goal: params.goal,
        baseRevision: params.currentRevision ?? 0,
        controlOwner: "travel_parent_agent",
        workUnits: compileWorkUnits(params.focusOrder, params.anchorDomain),
        concurrency: { rule: "at_most_one_bounded_parallel_research_fanout", joinsAt: "evidence_and_patch_review" },
        completionRule: "each child returns evidence-backed proposal or needs_context; parent validates and commits",
      };
      return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
    },
  });
}
