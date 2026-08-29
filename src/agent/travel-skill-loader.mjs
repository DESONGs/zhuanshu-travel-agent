import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillRoot = resolve(projectRoot, "plugins/travel-agent/skills");
const SKILL_IDS = Object.freeze(["understand-trip", "research-trip", "plan-trip", "recover-trip"]);
const cache = new Map();

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

export function loadTravelSkill(skillId) {
  if (!SKILL_IDS.includes(skillId)) throw Object.assign(new Error("unknown_travel_skill"), { code: "unknown_travel_skill", details: { skillId } });
  if (cache.has(skillId)) return cache.get(skillId);
  const content = readFileSync(resolve(skillRoot, skillId, "SKILL.md"), "utf8");
  const skill = Object.freeze({
    skillId,
    version: frontmatterValue(content, "version") ?? createHash("sha256").update(content).digest("hex").slice(0, 12),
    digest: createHash("sha256").update(content).digest("hex").slice(0, 16),
    content,
  });
  cache.set(skillId, skill);
  return skill;
}

export function selectParentTravelSkills({ control = null, input = "", hasVisualInput = false } = {}) {
  const text = String(input ?? "");
  if (/延误|晚点|取消|闭店|关门|下雨|暴雨|走不了|受伤|改酒店|disruption|delay|closed|cancelled/i.test(text)) {
    return [loadTravelSkill("recover-trip"), loadTravelSkill("plan-trip")];
  }
  if (!control) return [loadTravelSkill("understand-trip"), loadTravelSkill("research-trip")];
  const hasPlan = (control.pendingProposals?.length ?? 0) > 0 || (control.openDecisions ?? []).some((decision) => decision.status !== "open");
  if (hasVisualInput) return [loadTravelSkill("research-trip"), loadTravelSkill("understand-trip")];
  if (hasPlan || /比较|推荐|为什么|路线|预算|顺路|安排|日程|compare|recommend|route|budget|schedule/i.test(text)) {
    return [loadTravelSkill("plan-trip"), loadTravelSkill("research-trip")];
  }
  return [loadTravelSkill("understand-trip"), loadTravelSkill("research-trip")];
}

export function childSkillForLane(lane) {
  if (lane === "local_discovery") return loadTravelSkill("research-trip");
  return loadTravelSkill("plan-trip");
}

export function renderTravelSkillsForPrompt(skills = []) {
  if (!skills.length) return "";
  return `<active-travel-skills>\n${skills.map((skill) => `Skill ${skill.skillId} version ${skill.version}:\n${skill.content}`).join("\n\n")}\n</active-travel-skills>`;
}
