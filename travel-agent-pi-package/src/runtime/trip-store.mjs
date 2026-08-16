import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

function storageError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateStoredState(state, expectedTripId) {
  if (!state || state.schemaVersion !== "trip-control-state-v1" || state.tripId !== expectedTripId) {
    throw storageError("invalid_stored_trip");
  }
  if (!Number.isInteger(state.storageVersion) || state.storageVersion < 0) {
    throw storageError("invalid_storage_version");
  }
  return state;
}

export class TripStore {
  constructor({ rootDir = process.env.TRAVEL_AGENT_DATA_DIR ?? resolve(process.cwd(), "runtime-data", "trips") } = {}) {
    this.rootDir = resolve(rootDir);
    this.writeQueues = new Map();
  }

  pathFor(tripId) {
    if (typeof tripId !== "string" || !SAFE_ID.test(tripId)) throw storageError("invalid_trip_id");
    return join(this.rootDir, `${tripId}.json`);
  }

  async initialize() {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
  }

  async withWriteQueue(tripId, task) {
    const previous = this.writeQueues.get(tripId) ?? Promise.resolve();
    let release;
    const current = new Promise((resolveQueue) => { release = resolveQueue; });
    const queued = previous.then(() => current);
    this.writeQueues.set(tripId, queued);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.writeQueues.get(tripId) === queued) this.writeQueues.delete(tripId);
    }
  }

  async create(state) {
    const tripId = state?.tripId;
    const path = this.pathFor(tripId);
    await this.initialize();
    return this.withWriteQueue(tripId, async () => {
      const persisted = structuredClone(state);
      persisted.storageVersion = 0;
      let handle;
      try {
        handle = await open(path, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify(persisted, null, 2)}\n`, "utf8");
      } catch (error) {
        if (error?.code === "EEXIST") throw storageError("trip_already_exists");
        throw error;
      } finally {
        await handle?.close();
      }
      return persisted;
    });
  }

  async get(tripId) {
    const path = this.pathFor(tripId);
    try {
      const state = JSON.parse(await readFile(path, "utf8"));
      return validateStoredState(state, tripId);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      if (error instanceof SyntaxError) throw storageError("invalid_stored_trip");
      throw error;
    }
  }

  async list() {
    await this.initialize();
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const states = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && SAFE_ID.test(entry.name.slice(0, -5)))
      .map((entry) => this.get(entry.name.slice(0, -5))));
    return states.filter(Boolean).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async save(state, { expectedStorageVersion } = {}) {
    const tripId = state?.tripId;
    const path = this.pathFor(tripId);
    await this.initialize();
    return this.withWriteQueue(tripId, async () => {
      const current = await this.get(tripId);
      if (!current) throw storageError("trip_not_found");
      if (current.storageVersion !== expectedStorageVersion) throw storageError("storage_conflict");

      const persisted = structuredClone(state);
      persisted.storageVersion = current.storageVersion + 1;
      const tempPath = join(this.rootDir, `.${tripId}.${randomUUID()}.tmp`);
      let handle;
      try {
        handle = await open(tempPath, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify(persisted, null, 2)}\n`, "utf8");
        await handle.close();
        handle = null;
        await rename(tempPath, path);
      } catch (error) {
        await handle?.close();
        await unlink(tempPath).catch(() => {});
        throw error;
      }
      return persisted;
    });
  }
}
