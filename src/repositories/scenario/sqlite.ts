import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ScenarioRecord, ScenarioRepository } from "./types";

export class ScenarioConflictError extends Error {
  constructor(message = "Scenario was updated by another request.") {
    super(message);
    this.name = "ScenarioConflictError";
  }
}

export interface SqliteScenarioRepositoryOptions {
  path?: string;
}

export class SqliteScenarioRepository implements ScenarioRepository {
  private readonly database: DatabaseSync;

  constructor(options: SqliteScenarioRepositoryOptions = {}) {
    const databasePath = options.path ?? process.env.CROSSPOINT_DB_PATH ?? join(process.cwd(), ".data", "crosspoint.sqlite");
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS scenarios (id TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);");
  }

  get(id: string): ScenarioRecord | null {
    const row = this.database.prepare("SELECT payload FROM scenarios WHERE id = ?").get(id) as { payload?: string } | undefined;
    if (!row?.payload) return null;
    return JSON.parse(row.payload) as ScenarioRecord;
  }

  create(record: ScenarioRecord): ScenarioRecord {
    try {
      this.database.prepare("INSERT INTO scenarios (id, version, payload, updated_at) VALUES (?, ?, ?, ?)")
        .run(record.id, record.version, JSON.stringify(record), record.updatedAt);
      return record;
    } catch (error) {
      if (error instanceof Error && /constraint|unique/i.test(error.message)) throw new ScenarioConflictError("Scenario already exists.");
      throw error;
    }
  }

  save(record: ScenarioRecord, expectedVersion: number): ScenarioRecord {
    const next = { ...record, version: expectedVersion + 1 };
    const result = this.database.prepare("UPDATE scenarios SET version = ?, payload = ?, updated_at = ? WHERE id = ? AND version = ?")
      .run(next.version, JSON.stringify(next), next.updatedAt, next.id, expectedVersion);
    if (Number(result.changes) !== 1) throw new ScenarioConflictError();
    return next;
  }

  delete(id: string): void {
    this.database.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
  }

  close(): void {
    this.database.close();
  }
}
