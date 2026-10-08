"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { termsSummary } from "@/components/finance";
import { MapView } from "@/components/MapView";
import { useModel } from "@/components/ModelProvider";
import { Callout, Spinner, Td, Th } from "@/components/ui";
import type { BriefingPayload } from "@/lib/briefing";
import { sendJson } from "@/lib/api";
import { buildingLossAtRp, epCurve, waterfallAtRp } from "@/lib/engine";
import { fmtKes, fmtPct } from "@/lib/format";
import type { ExpandedGroup } from "@/lib/geo";
import { offerBriefing } from "@/lib/offer";
import { buildBriefingPayload } from "@/lib/payload";
import type { Building, IngestGroup, IngestResponse } from "@/lib/types";

export function OfferDecision({
  resp,
  groups,
  expanded,
  preview,
  saving,
  onAccept,
  onDiscard,
}: {
  resp: IngestResponse;
  groups: IngestGroup[];
  expanded: ExpandedGroup[];
  preview: Building[];
  saving: boolean;
  onAccept: () => Promise<void>;
  onDiscard: () => void;
}) {
  const m = useModel();
  const { data, portfolio, settings, det, llm } = m;
  const [briefBusy, setBriefBusy] = useState(false);
  const [brief, setBrief] = useState<{ markdown: string; mode: string; model: string | null; warning?: string } | null>(null);
  const [briefPayload, setBriefPayload] = useState<BriefingPayload | null>(null);
  const [briefErr, setBriefErr] = useState<string | null>(null);

  const impact = useMemo(() => {
    if (!data || !det) return null;
    const v = data.vulnerability;
    const after = [...portfolio, ...preview];
    const w0 = waterfallAtRp(portfolio, 100, v, settings);
    const w1 = waterfallAtRp(after, 100, v, settings);
    const offerAal = epCurve(preview, v, settings, 200).aalGross;
    return [
      { label: "Total insured value", before: det.totalTiv, after: det.totalTiv + preview.reduce((a, b) => a + b.tiv, 0) },
      { label: "1-in-100 ground-up loss", before: w0.groundUp, after: w1.groundUp },
      { label: "1-in-100 gross loss", before: w0.gross, after: w1.gross },
      { label: "1-in-100 net loss (kept)", before: w0.net, after: w1.net },
      { label: "Average annual ground-up loss", before: det.ep.aalGross, after: det.ep.aalGross + offerAal },
    ];
  }, [data, det, portfolio, preview, settings]);

  async function generateBriefing(forceTemplate = false) {
    if (!data || !det) return;
    const extractedBy = resp.mode === "llm" ? `LLM (${resp.model})` : "rule-based keyword parser";
    const offer = offerBriefing(groups, expanded, preview, portfolio, det.ep.aalGross, extractedBy, data, settings, termsSummary(settings));
    const payload = buildBriefingPayload(m, offer);
    if (!payload) return;
    setBriefPayload(payload);
    setBriefBusy(true);
    setBriefErr(null);
    try {
      setBrief(await sendJson<NonNullable<typeof brief>>("/api/briefing", { payload, forceTemplate }));
    } catch (e) {
      setBriefErr((e as Error).message);
    } finally {
      setBriefBusy(false);
    }
  }

  if (!data || !impact) return null;
  const v = data.vulnerability;
  const maxTiv = Math.max(...preview.map((b) => b.tiv), 1);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <div>
          <h3 className="mb-2 text-sm font-semibold">What accepting this offer does to the book</h3>
          <table className="w-full overflow-hidden border border-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <Th>Metric</Th>
                <Th right>Book today</Th>
                <Th right>With this offer</Th>
                <Th right>Change</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {impact.map((r) => (
                <tr key={r.label}>
                  <Td>{r.label}</Td>
                  <Td right>{fmtKes(r.before)}</Td>
                  <Td right className="font-semibold">{fmtKes(r.after)}</Td>
                  <Td right className={r.after > r.before ? "text-ai" : "text-slate-500"}>
                    {r.before ? `+${fmtPct(r.after / r.before - 1)}` : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">
            Quota share and Cat XL apply to the whole book&apos;s event loss, so the net change here is the offer&apos;s true marginal cost after
            reinsurance — usually different from its stand-alone net loss above.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={() => void onAccept()} className="bg-river px-4 py-2 text-sm font-semibold text-white hover:bg-lake disabled:opacity-50">
              {saving ? "Saving to SQLite…" : `Accept — add ${preview.length} building(s) to the portfolio`}
            </button>
            <button type="button" onClick={onDiscard} className="border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Decline / discard
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Accepted buildings are stored as synthetic, AI-ingested rows in the exposure-file shape and appear on the Portfolio page.
          </p>
        </div>
        <div className="overflow-hidden border border-slate-200">
          <MapView
            buildings={preview.map((b) => ({ b, ...buildingLossAtRp(b, 100, v, settings) }))}
            overlay="depth"
            rp={100}
            colorBy="loss"
            classColors={v.classColors}
            classLabels={v.classLabels}
            maxTiv={maxTiv}
            height={300}
          />
        </div>
      </div>

      <div className="border border-river-100 bg-navy-50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Underwriter briefing</h3>
            <p className="text-xs text-slate-500">
              A one-page summary drafted from the numbers above (losses, terms, SHAP drivers, book impact). The AI only sees that data and is told not to
              invent figures.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={briefBusy} onClick={() => generateBriefing(false)} className="rounded-[10px] bg-river px-4 py-2 text-sm font-semibold text-white hover:bg-lake disabled:opacity-50">
              {briefBusy ? "Writing…" : brief ? "Regenerate" : llm?.llm ? "Write briefing with AI" : "Write briefing (template)"}
            </button>
            {llm?.llm && (
              <button type="button" disabled={briefBusy} onClick={() => generateBriefing(true)} className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Template version
              </button>
            )}
          </div>
        </div>
        {briefBusy && <Spinner label="Drafting briefing…" />}
        {briefErr && <Callout tone="warn">{briefErr}</Callout>}
        {brief && (
          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-0.5 font-medium text-ai ring-1 ring-river-100">
                  {brief.mode === "llm" ? `Written by ${brief.model}` : "Deterministic template (no AI)"}
                </span>
                <button type="button" onClick={() => navigator.clipboard.writeText(brief.markdown)} className="text-river hover:underline">
                  Copy markdown
                </button>
              </div>
              {brief.warning && <Callout tone="warn">{brief.warning}</Callout>}
              <article className="prose-briefing border border-slate-200 bg-white p-5 text-[14px] text-slate-800">
                <ReactMarkdown disallowedElements={["img"]} unwrapDisallowed>
                  {brief.markdown}
                </ReactMarkdown>
              </article>
            </div>
            <details className="border border-slate-200 bg-white p-4 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">Exactly what the AI was given</summary>
              <pre className="mt-2 max-h-[520px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-600">
                {JSON.stringify(briefPayload, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
