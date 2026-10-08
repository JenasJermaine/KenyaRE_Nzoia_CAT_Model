import "server-only";

import type { Building } from "@/lib/types";
import { db, transaction } from "./db";

const selectAll = db.prepare(`
  SELECT payload
  FROM ingested_buildings
  ORDER BY created_at, id
`);

const insertOne = db.prepare(`
  INSERT INTO ingested_buildings (id, batch_id, payload)
  VALUES (?, ?, ?)
`);

const countAll = db.prepare("SELECT COUNT(*) AS n FROM ingested_buildings");
const countBatch = db.prepare("SELECT COUNT(*) AS n FROM ingested_buildings WHERE batch_id = ?");
const deleteBatch = db.prepare("DELETE FROM ingested_buildings WHERE batch_id = ?");
const deleteAll = db.prepare("DELETE FROM ingested_buildings");

const count = (stmt: ReturnType<typeof db.prepare>, ...args: string[]) => Number((stmt.get(...args) as { n: number }).n);

export function readIngestedBuildings(): Building[] {
  return selectAll.all().map((row) => JSON.parse(String((row as { payload: string }).payload)) as Building);
}

export function ingestedCount() {
  return count(countAll);
}

export function batchExists(batchId: string) {
  return count(countBatch, batchId) > 0;
}

/** Adds one accepted offer. The original 500 rows stay in portfolio.json and are never written here. */
export function insertBatch(buildings: Building[]) {
  transaction(() => {
    for (const building of buildings) insertOne.run(building.id, building.batchId!, JSON.stringify(building));
  });
}

/** Returns the number of buildings removed. */
export function removeBatch(batchId: string) {
  return Number(deleteBatch.run(batchId).changes);
}

export function removeAllIngested() {
  return Number(deleteAll.run().changes);
}
