import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.NZOIA_DB_PATH
  ? path.resolve(process.env.NZOIA_DB_PATH)
  : path.join(process.cwd(), "data", "nzoia.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalDb = globalThis as typeof globalThis & { __nzoiaDb?: DatabaseSync };
export const db = globalDb.__nzoiaDb ?? new DatabaseSync(dbPath);
if (process.env.NODE_ENV !== "production") globalDb.__nzoiaDb = db;

db.exec(`
  PRAGMA journal_mode = DELETE;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS ingested_buildings (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    payload TEXT NOT NULL CHECK (json_valid(payload)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_ingested_buildings_batch
    ON ingested_buildings(batch_id);

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    ip TEXT,
    batch_id TEXT,
    detail TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail))
  );
`);

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
