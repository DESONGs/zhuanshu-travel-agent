import { mkdir, rm, writeFile } from "node:fs/promises";
import {
  MobilityObservationSchema,
  ProviderResultSchema,
  TransitSegmentSchema,
  TravelContextPackSchema,
  TripPatchProposalSchema,
  TripStateSchema,
} from "../dist/contracts/index.js";

const output = new URL("../dist/schema/", import.meta.url);
await mkdir(output, { recursive: true });
const schemas = {
  "trip-control-state.schema.json": TripStateSchema,
  "trip-patch-proposal.schema.json": TripPatchProposalSchema,
  "travel-context-pack.schema.json": TravelContextPackSchema,
  "trip-mobility.schema.json": MobilityObservationSchema,
  "transit-segment.schema.json": TransitSegmentSchema,
  "provider-result.schema.json": ProviderResultSchema,
};
for (const [name, schema] of Object.entries(schemas)) {
  await writeFile(new URL(name, output), `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...schema }, null, 2)}\n`, "utf8");
}

// The legacy implementation is an internal, runtime-validated bridge. Its inferred
// declaration would expose `any`; public declarations come only from strict TS entrypoints.
await Promise.all([
  rm(new URL("../dist/runtime/trip-runtime.d.mts", import.meta.url), { force: true }),
  rm(new URL("../dist/runtime/trip-runtime.d.mts.map", import.meta.url), { force: true }),
]);
