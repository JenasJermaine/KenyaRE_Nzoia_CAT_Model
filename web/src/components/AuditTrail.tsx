"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtKes } from "@/lib/format";
import type { AuditAction, AuditEvent } from "@/lib/types";
import { useModel } from "./ModelProvider";
import { Card, CardHeader, cx, Spinner, Td, Th } from "./ui";

const LABELS: Record<AuditAction, string> = {
  sign_in: "Signed in",
  sign_in_failed: "Sign-in refused",
  sign_out: "Signed out",
  ingest: "Offer read",
  offer_accepted: "Offer accepted",
  batch_removed: "Batch removed",
  portfolio_reset: "Portfolio reset",
  briefing: "Briefing written",
};

const WARNING_ACTIONS = new Set<AuditAction>(["sign_in_failed", "batch_removed", "portfolio_reset"]);

const num = (v: unknown) => (typeof v === "number" ? v : 0);

function describe(e: AuditEvent) {
  const d = e.detail;
  const via = d.mode === "llm" ? `AI (${String(d.model)})` : "keyword parser";
  const failed = d.failure ? ` after the AI failed (${String(d.failure).replace(/_/g, " ")})` : "";
  const flagged = num(d.injectionFlags) ? ` · ${num(d.injectionFlags)} instruction-like phrase(s) flagged` : "";
  switch (e.action) {
    case "ingest":
      return `${num(d.groups)} building group(s) by ${via}${failed} · ${num(d.chars).toLocaleString()} characters, ${num(d.photos)} photo(s)${flagged}`;
    case "offer_accepted":
      return `${num(d.buildings)} building(s), ${fmtKes(num(d.tivKes))} insured value`;
    case "batch_removed":
    case "portfolio_reset":
      return `${num(d.removed)} building(s) removed`;
    case "briefing":
      return `${d.offer ? "Offer briefing" : "Portfolio briefing"} by ${d.mode === "llm" ? `AI (${String(d.model)})` : "template"}${failed}${flagged}`;
    default:
      return "";
  }
}

const hash = (v: unknown) => (typeof v === "string" ? `${v.slice(0, 10)}…` : null);

export function AuditTrail() {
  const { revision } = useModel();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ events: AuditEvent[] }>("/api/audit")
      .then((r) => live && (setEvents(r.events), setErr(null)))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [revision]);

  return (
    <Card>
      <CardHeader
        title="Audit trail"
        subtitle="Who read, accepted or removed which offer, and when. Stored in the server database; the latest 100 events are shown."
      />
      {err ? (
        <p className="px-5 py-4 text-sm text-ai">{err}</p>
      ) : !events ? (
        <div className="px-5 py-4">
          <Spinner label="Loading audit trail…" />
        </div>
      ) : !events.length ? (
        <p className="px-5 py-4 text-sm text-grey">Nothing recorded yet.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th>Batch</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-grey">{new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Td>
                  <Td className="font-medium">{e.actor}</Td>
                  <Td className={cx("whitespace-nowrap font-medium", WARNING_ACTIONS.has(e.action) ? "text-ai" : "text-ink")}>{LABELS[e.action] ?? e.action}</Td>
                  <Td>{e.batchId ?? "—"}</Td>
                  <Td className="text-xs text-grey">
                    {describe(e)}
                    {hash(e.detail.sourceHash) && <span className="ml-1 font-mono" title={`SHA-256 of the submitted document and photos: ${String(e.detail.sourceHash)}`}>· source {hash(e.detail.sourceHash)}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
