export class TripStore {
  constructor(options?: { rootDir?: string });
  rootDir: string;
  initialize(): Promise<void>;
  create(state: Record<string, unknown>): Promise<Record<string, unknown>>;
  get(tripId: string): Promise<Record<string, unknown> | null>;
  save(state: Record<string, unknown>, options?: { expectedStorageVersion?: number }): Promise<Record<string, unknown>>;
}
