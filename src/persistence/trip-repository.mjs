import { TripStore } from "../../travel-agent-pi-package/src/runtime/trip-store.mjs";
import { PostgresTripRepository } from "./postgres-trip-repository.mjs";

export function createTripRepository({ databaseUrl = process.env.DATABASE_URL, rootDir } = {}) {
  if (databaseUrl) return new PostgresTripRepository({ databaseUrl });
  const repository = new TripStore({ rootDir });
  repository.mode = "file";
  return repository;
}
