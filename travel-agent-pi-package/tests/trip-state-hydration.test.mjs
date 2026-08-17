import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addDecisionNode, createTripControlState, TripStore } from "../dist/core/index.js";

test("persisted trip-control-state-v1 snapshots hydrate additive fields without changing decisions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-trip-hydration-"));
  let legacy = createTripControlState({ tripId: "trip_legacy", travelers: [{ travelerId: "traveler_1" }] });
  legacy = addDecisionNode(legacy, { nodeId: "stay_hotel", domain: "stay", title: "旧住宿", selected: true });
  legacy.brief.totalBudget = null;
  delete legacy.environment;
  delete legacy.travelers[0].displayName;
  delete legacy.travelers[0].relationship;
  delete legacy.travelers[0].careNeeds;
  delete legacy.nodes[0].media;
  await mkdir(rootDir, { recursive: true });
  await writeFile(join(rootDir, "trip_legacy.json"), JSON.stringify(legacy), "utf8");

  const loaded = await new TripStore({ rootDir }).get("trip_legacy");
  assert.equal(loaded.nodes[0].selected, true);
  assert.equal(loaded.nodes[0].title, "旧住宿");
  assert.deepEqual(loaded.nodes[0].media, []);
  assert.equal(loaded.travelers[0].displayName, "同行人 1");
  assert.equal(loaded.travelers[0].relationship, null);
  assert.deepEqual(loaded.travelers[0].careNeeds, {});
  assert.deepEqual(loaded.environment, { weather: null, mobility: null, updatedAt: null });
  assert.equal(loaded.brief.totalBudget, null);
});
