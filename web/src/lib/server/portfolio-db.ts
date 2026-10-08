import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Building } from "@/lib/types";

const dbPath = process.env.NZOIA_DB_PATH
  ? path.resolve(process.env.NZOIA_DB_PATH)
  : path.join(process.cwd(), "data", "nzoia.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalDb = globalThis as typeof globalThis & { __nzoiaDb?: DatabaseSync };
const db = globalDb.__nzoiaDb ?? new DatabaseSync(dbPath);
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
`);

const selectAll = db.prepare(`
  SELECT payload
  FROM ingested_buildings
  ORDER BY created_at, id
`);

const insertOne = db.prepare(`
  INSERT INTO ingested_buildings (id, batch_id, payload)
  VALUES (?, ?, ?)
`);

export function readIngestedBuildings(): Building[] {
  return selectAll.all().map((row) => JSON.parse(String((row as { payload: string }).payload)) as Building);
}

/** Atomically replaces the working AI-ingested portfolio. The original 500 rows remain in portfolio.json. */
export function replaceIngestedBuildings(buildings: Building[]) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM ingested_buildings");
    for (const building of buildings) {
      insertOne.run(building.id, building.batchId!, JSON.stringify(building));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function portfolioDbPath() {
  const relative = path.relative(process.cwd(), dbPath);
  return relative && !relative.startsWith("..") ? relative.replaceAll("\\", "/") : dbPath;
}
