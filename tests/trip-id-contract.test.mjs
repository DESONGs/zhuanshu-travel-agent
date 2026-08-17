import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTripControlState, TripStore } from "../travel-agent-pi-package/src/core/index.ts";

test("trip persistence keeps localized destination names in state rather than using them as filesystem identifiers", () => {
  const store = new TripStore({ rootDir: "/private/tmp/travel-agent-trip-id-contract" });
  assert.doesNotThrow(() => store.pathFor("trip_4d9919f27dc7442c908664c25a3cf9ed"));
  assert.match(store.pathFor("trip:portable"), /trip%3Aportable\.json$/);
  assert.throws(() => store.pathFor("trip_深圳"), { code: "invalid_trip_id" });
});

test("trip persistence encodes portable filenames while preserving the logical trip id", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "travel-agent-portable-id-"));
  const store = new TripStore({ rootDir });
  await store.create(createTripControlState({ tripId: "trip:portable" }));
  assert.equal((await store.get("trip:portable")).tripId, "trip:portable");
  assert.deepEqual((await store.list()).map((trip) => trip.tripId), ["trip:portable"]);
});
