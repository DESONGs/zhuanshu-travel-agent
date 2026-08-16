import assert from "node:assert/strict";
import test from "node:test";
import { transitSegmentFromNode } from "../src/contracts/transit-contract.mjs";

test("stored transit contract rehydrates normalized optional fields", () => {
  const segment = transitSegmentFromNode({
    operability: { transitSegment: {
      segmentId: "segment_rehydrate", status: "needs_refresh", originLabel: "Hotel", destinationLabel: "Station", totalMinutes: 20, distanceMeters: null, source: "user_input", checkedAt: null, freshUntil: null,
      travelerFit: { summary: "Needs verification", tradeoff: null, stepFree: true },
      steps: [
        { kind: "walk", title: "Walk", detail: null, durationMinutes: null, distanceMeters: null },
        { kind: "enter_station", title: "Enter", detail: null, accessible: true, facilities: [{ facilityId: "facility_lift", kind: "elevator", area: "outside_station", label: "Lift", distanceMeters: null, status: "available", source: "user_input", checkedAt: null, freshUntil: null }] },
      ],
    } },
  });
  assert.equal(segment.distanceMeters, null);
  assert.equal(segment.travelerFit.tradeoff, null);
  assert.equal(segment.steps[0].detail, null);
  assert.equal(segment.steps[1].facilities[0].checkedAt, null);
});
