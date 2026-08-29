import assert from "node:assert/strict";
import test from "node:test";
import { assertCompatiblePiHost, piHostCompatibility } from "../src/agent/pi-host-compatibility.mjs";

test("Pi host compatibility fails closed outside the locked 0.84 range", () => {
  assert.equal(piHostCompatibility("0.84.1").status, "compatible");
  assert.equal(piHostCompatibility("0.84.9").status, "compatible");
  assert.equal(piHostCompatibility("0.74.0").status, "incompatible");
  assert.equal(piHostCompatibility("0.85.0").status, "incompatible");
  assert.throws(() => assertCompatiblePiHost({ version: "0.74.0", allowUnknown: false }), /unsupported_pi_host_version/);
});
