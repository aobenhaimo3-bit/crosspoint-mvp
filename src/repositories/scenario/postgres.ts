import type { ScenarioRecord, ScenarioRepository } from "./types";

/** Port-preserving placeholder for the future Supabase/Postgres implementation. */
export class PostgresScenarioRepository implements ScenarioRepository {
  constructor(connectionString: string) { void connectionString; }
  private unavailable(): never { throw new Error("PostgresScenarioRepository is not configured in this MVP."); }
  get(id: string): ScenarioRecord | null { void id; return this.unavailable(); }
  create(record: ScenarioRecord): ScenarioRecord { void record; return this.unavailable(); }
  save(record: ScenarioRecord, expectedVersion: number): ScenarioRecord { void record; void expectedVersion; return this.unavailable(); }
  delete(id: string): void { void id; this.unavailable(); }
}
