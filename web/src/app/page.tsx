"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ExtractedBuildings } from "@/components/desk/ExtractedBuildings";
import { OfferDecision } from "@/components/desk/OfferDecision";
import { OfferExplain } from "@/components/desk/OfferExplain";
import { OfferInput } from "@/components/desk/OfferInput";
import { OfferLosses } from "@/components/desk/OfferLosses";
import { useModel } from "@/components/ModelProvider";
import { Callout, cx } from "@/components/ui";
import { fmtKes } from "@/lib/format";
import { expandGroup } from "@/lib/geo";
import type { Building, IngestGroup, IngestResponse } from "@/lib/types";

function Step({ n, title, lead, tone = "plain", children }: { n: number; title: string; lead?: ReactNode; tone?: "plain" | "ai"; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white", tone === "ai" ? "bg-ai" : "bg-river")}>{n}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {lead && <p className="mt-0.5 text-[13px] text-slate-500">{lead}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function UnderwritingDesk() {
  const { data, hazardIndex, llm, det, ingested, addIngested } = useModel();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resp, setResp] = useState<IngestResponse | null>(null);
  const [groups, setGroups] = useState<IngestGroup[]>([]);
  const [batchId, setBatchId] = useState("");
  const [selected, setSelected] = useState(0);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function extract(forceRules: boolean) {
    setBusy(true);
    setErr(null);
    setAccepted(null);
    try {
      const r = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, forceRules }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Request failed");
      setResp(j);
      setGroups(j.groups);
      setSelected(0);
      setBatchId(Date.now().toString(36).slice(-5).toUpperCase());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const expanded = useMemo(() => {
    if (!data || !hazardIndex || !groups.length) return [];
    return groups.map((g, i) => expandGroup(g, i, batchId, hazardIndex, data.gazetteer, data.vulnerability));
  }, [data, hazardIndex, groups, batchId]);
  const preview: Building[] = useMemo(() => expanded.flatMap((e) => e.buildings), [expanded]);

  function updateGroup(i: number, patch: Partial<IngestGroup>) {
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }
  function reset() {
    setResp(null);
    setGroups([]);
  }
  async function accept() {
    setSaving(true);
    setErr(null);
    try {
      await addIngested(preview);
      setAccepted(`${preview.length} building(s), ${fmtKes(preview.reduce((a, b) => a + b.tiv, 0))} insured value, batch ${batchId}`);
      reset();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!data || !det) return null;
  const ready = resp && groups.length > 0 && preview.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <div className="mb-2 h-1 w-12 bg-river" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Underwriting desk</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
            Drop in a property offer. The AI reads it, the CAT model prices it against real JRC flood maps, and every number is explained — from
            ground-up damage through deductible, limit, quota share and Cat XL to the loss you keep.
          </p>
        </div>
        <Link href="/portfolio" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm hover:bg-slate-50">
          <span className="block text-[11px] uppercase tracking-wide text-slate-500">Current book</span>
          <span className="font-semibold text-ink">
            {det.totalTiv ? fmtKes(det.totalTiv) : "—"} · 1-in-100 net {fmtKes(det.waterfall.find((r) => r.rp === 100)?.net ?? 0)}
          </span>
          {ingested.length > 0 && <span className="block text-[11px] text-ai">incl. {ingested.length} accepted AI-ingested buildings</span>}
        </Link>
      </div>

      {!llm?.llm && llm != null && (
        <Callout tone="info" title="AI is offline — using the keyword parser">
          Add <code>GEMINI_API_KEY</code> (free from Google AI Studio) or <code>OPENAI_API_KEY</code> to <code>web/.env.local</code> and restart the dev
          server. The keyword parser handles short descriptions but not full documents.
        </Callout>
      )}

      {accepted && (
        <Callout title="Offer accepted">
          Added {accepted} to the portfolio. <Link href="/portfolio" className="font-semibold text-river underline">See the updated book →</Link>
        </Callout>
      )}

      <Step n={1} tone="ai" title="Submit the offer" lead="Paste the broker's submission or upload the Word document. Plain English, Swahili terms and full survey reports all work.">
        <OfferInput text={text} setText={setText} busy={busy} llmOn={llm ? llm.llm : null} onExtract={extract} />
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      </Step>

      {resp && (
        <Step
          n={2}
          tone="ai"
          title="What the AI read from it"
          lead="One row per building type. Quotes show the exact text each row came from; tags show which values are stated, inferred, or filled with model defaults."
        >
          <ExtractedBuildings resp={resp} groups={groups} expanded={expanded} v={data.vulnerability} selected={selected} onSelect={setSelected} onChange={updateGroup} />
        </Step>
      )}

      {ready && (
        <>
          <Step n={3} title="What it could cost" lead="Losses at each return period, from physical damage (ground-up) to what the insurer keeps after reinsurance (net).">
            <OfferLosses groups={groups} expanded={expanded} preview={preview} selected={selected} onSelect={setSelected} />
          </Step>
          <Step n={4} tone="ai" title="Why the model says so" lead="SHAP and LIME explanations of each building's damage ratio — the number every loss above is built on.">
            <OfferExplain groups={groups} expanded={expanded} selected={selected} onSelect={setSelected} />
          </Step>
          <Step n={5} title="Decide" lead="See what the offer adds to the whole book, then accept or decline and get a written briefing.">
            <OfferDecision resp={resp} groups={groups} expanded={expanded} preview={preview} saving={saving} onAccept={accept} onDiscard={reset} />
          </Step>
        </>
      )}
    </div>
  );
}
