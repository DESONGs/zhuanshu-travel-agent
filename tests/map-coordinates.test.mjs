import assert from "node:assert/strict";
import test from "node:test";
import { coordinatesForWebMap, gcj02ToWgs84 } from "../src/web/map-coordinates.js";

test("converts mainland GCJ-02 points for an OpenStreetMap display without changing the source state", () => {
  const source = { longitude: 113.2644, latitude: 23.1291, coordinateSystem: "GCJ-02" };
  const converted = coordinatesForWebMap(source);
  assert.notStrictEqual(converted, source);
  assert.ok(Math.abs(converted.longitude - source.longitude) > 0.001);
  assert.ok(Math.abs(converted.latitude - source.latitude) > 0.001);
  assert.deepEqual(source, { longitude: 113.2644, latitude: 23.1291, coordinateSystem: "GCJ-02" });
});

test("preserves WGS-84 and out-of-mainland coordinates", () => {
  assert.deepEqual(coordinatesForWebMap({ longitude: -3.7038, latitude: 40.4168, coordinateSystem: "WGS-84" }), { longitude: -3.7038, latitude: 40.4168 });
  assert.deepEqual(gcj02ToWgs84(-3.7038, 40.4168), { longitude: -3.7038, latitude: 40.4168 });
  assert.equal(coordinatesForWebMap({ longitude: "invalid", latitude: 20 }), null);
});
