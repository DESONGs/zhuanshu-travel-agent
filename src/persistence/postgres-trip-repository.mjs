import { Pool } from "pg";
import { hydrateStoredTripState } from "zhuanshu-travel-agent/core";

function repositoryError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function validateState(state, expectedTripId) {
  let validated;
  try {
    validated = hydrateStoredTripState(state);
  } catch {
    throw repositoryError("invalid_stored_trip");
  }
  if (validated.tripId !== expectedTripId) throw repositoryError("invalid_stored_trip");
  return validated;
}

export const POSTGRES_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS trip_states (
  trip_id TEXT PRIMARY KEY,
  storage_version INTEGER NOT NULL CHECK (storage_version >= 0),
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_states_updated_at_idx ON trip_states (updated_at DESC);
CREATE TABLE IF NOT EXISTS travel_conversations (
  conversation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trip_id TEXT NULL,
  storage_version INTEGER NOT NULL CHECK (storage_version >= 0),
  record_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS travel_conversations_user_updated_at_idx ON travel_conversations (user_id, updated_at DESC);
`;

export class PostgresTripRepository {
  constructor({ databaseUrl, pool } = {}) {
    if (!pool && !databaseUrl) throw repositoryError("database_url_required");
    this.pool = pool ?? new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 10_000 });
    this.mode = "postgres";
  }

  async migrate() {
    await this.pool.query(POSTGRES_MIGRATION_SQL);
  }

  async create(state) {
    await this.migrate();
    const persisted = structuredClone(state);
    persisted.storageVersion = 0;
    try {
      await this.pool.query(
        "INSERT INTO trip_states (trip_id, storage_version, state_json) VALUES ($1, $2, $3::jsonb)",
        [persisted.tripId, persisted.storageVersion, JSON.stringify(persisted)],
      );
      return persisted;
    } catch (error) {
      if (error?.code === "23505") throw repositoryError("trip_already_exists", { tripId: persisted.tripId });
      throw error;
    }
  }

  async get(tripId) {
    const result = await this.pool.query("SELECT state_json FROM trip_states WHERE trip_id = $1", [tripId]);
    if (!result.rowCount) return null;
    return validateState(result.rows[0].state_json, tripId);
  }

  async list() {
    const result = await this.pool.query("SELECT state_json FROM trip_states ORDER BY updated_at DESC");
    return result.rows.map((row) => validateState(row.state_json, row.state_json.tripId));
  }

  async save(state, { expectedStorageVersion } = {}) {
    const persisted = structuredClone(state);
    const nextVersion = Number(expectedStorageVersion) + 1;
    persisted.storageVersion = nextVersion;
    const result = await this.pool.query(
      `UPDATE trip_states
       SET storage_version = $3, state_json = $4::jsonb, updated_at = now()
       WHERE trip_id = $1 AND storage_version = $2`,
      [persisted.tripId, expectedStorageVersion, nextVersion, JSON.stringify(persisted)],
    );
    if (!result.rowCount) {
      const exists = await this.pool.query("SELECT 1 FROM trip_states WHERE trip_id = $1", [persisted.tripId]);
      throw repositoryError(exists.rowCount ? "storage_conflict" : "trip_not_found", { tripId: persisted.tripId });
    }
    return persisted;
  }

  async close() {
    await this.pool.end();
  }
}
