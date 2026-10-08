import "server-only";

import type { AuditAction, AuditEvent } from "@/lib/types";
import { db } from "./db";

/** Older rows are pruned so the table cannot grow without bound. */
const KEEP_EVENTS = 5000;

const insertEvent = db.prepare(`
  INSERT INTO audit_events (action, actor, ip, batch_id, detail)
  VALUES (?, ?, ?, ?, ?)
`);
const pruneEvents = db.prepare(`
  DELETE FROM audit_events
  WHERE id <= (SELECT id FROM audit_events ORDER BY id DESC LIMIT 1 OFFSET ?)
`);
const selectRecent = db.prepare(`
  SELECT id, at, action, actor, batch_id, detail
  FROM audit_events
  ORDER BY id DESC
  LIMIT ?
`);

export function audit(action: AuditAction, actor: string, ip: string, detail: Record<string, unknown> = {}, batchId: string | null = null) {
  try {
    insertEvent.run(action, actor, ip, batchId, JSON.stringify(detail));
    pruneEvents.run(KEEP_EVENTS);
  } catch (error) {
    // The audit trail must never take the request down with it.
    console.error("Could not write audit event", action, error);
  }
}

export function recentAuditEvents(limit = 100): AuditEvent[] {
  return selectRecent.all(limit).map((row) => {
    const r = row as { id: number; at: string; action: AuditAction; actor: string; batch_id: string | null; detail: string };
    return { id: r.id, at: r.at, action: r.action, actor: r.actor, batchId: r.batch_id, detail: JSON.parse(r.detail) as Record<string, unknown> };
  });
}
