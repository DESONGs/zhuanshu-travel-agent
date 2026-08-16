import assert from "node:assert/strict";
import test from "node:test";
import { TripStore } from "../travel-agent-pi-package/src/runtime/trip-store.mjs";

test("trip persistence keeps localized destination names in state rather than using them as filesystem identifiers", () => {
  const store = new TripStore({ rootDir: "/private/tmp/travel-agent-trip-id-contract" });
  assert.doesNotThrow(() => store.pathFor("trip_4d9919f27dc7442c908664c25a3cf9ed"));
  assert.throws(() => store.pathFor("trip_深圳"), { code: "invalid_trip_id" });
});
