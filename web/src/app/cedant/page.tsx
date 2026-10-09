"use client";

import { useMemo, useState } from "react";
import { OfferInput } from "@/components/desk/OfferInput";
import { MapView } from "@/components/MapView";
import { useModel } from "@/components/ModelProvider";
import { Badge, Callout, Kpi, PageHeader } from "@/components/ui";
import { RPS } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import { sendJson } from "@/lib/api";
import type { PhotoItem } from "@/lib/photos";
import type { Building, HousingClass, IngestResponse } from "@/lib/types";

interface CedantRiskSummary {
  properties: number;
  totalTiv: number;
  areas: string[];
  risk: "Low" | "Medium" | "High";
  riskRatio: number;
  floodProneTiv: number;
  byRp: { rp: number; loss: number }[];
  drivers: string[];
  riskPoints: { b: Building; depth: number; dr: number; gross: number }[];
  classColors: Record<HousingClass, string>;
  classLabels: Record<HousingClass, string>;
}

export default function CedantPage() {
  const { llm } = useModel();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<IngestResponse | null>(null);
  const [riskSummary, setRiskSummary] = useState<CedantRiskSummary | null>(null);
  const [aiFailureDismissed, setAiFailureDismissed] = useState(false);
  const [rp, setRp] = useState(100);
  const submissionId = useMemo(() => response ? `SUB-${response.sourceHash?.slice(0, 8).toUpperCase() ?? "DEMO"}` : null, [response]);
  const processingNotes = response?.warnings.filter((warning) => !warning.startsWith("The AI extractor could not be used.")) ?? [];
  const aiFallback = !aiFailureDismissed && response?.mode === "rules" && response.warnings.some((warning) => warning.startsWith("The AI extractor could not be used."));

  async function analyze(forceRules: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await sendJson<IngestResponse>("/api/ingest", { text, forceRules, images: forceRules ? [] : photos.map(({ name, mimeType, data: image }) => ({ name, mimeType, data: image })) });
      if (result.mode === "llm") setAiFailureDismissed(false);
      setResponse(result);
      setRiskSummary(await sendJson<CedantRiskSummary>("/api/cedant-risk", { groups: result.groups }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function generateSummary() {
    if (!riskSummary || !submissionId) return;
    const report = [
      "Nzoia Flood Risk Summary",
      `Submission: ${submissionId}`,
      `Properties: ${riskSummary.properties}`,
      `Total insured value: ${fmtKes(riskSummary.totalTiv)}`,
      `General area: ${riskSummary.areas.join(", ") || "Not resolved"}`,
      `Status: Analysis only; not submitted to Kenya Re's portfolio`,
      `Overall modeled risk: ${riskSummary.risk}`,
      `Key drivers: ${riskSummary.drivers.join(" ")}`,
      "Scenario loss estimates (ground-up, before policy terms or reinsurance):",
      ...riskSummary.byRp.map((row) => `${rpLabel(row.rp)}: ${fmtKes(row.loss)}`),
      "",
      "Prototype estimate based on synthetic exposure and documented model assumptions. Not an offer, quote, or production pricing result.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${submissionId}-risk-summary.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Cedant" lead="Review flood risk for your submission only. This view does not include internal vulnerability methodology or other insurers’ portfolios." right={<Badge kind="assumption">Demo · not a quote</Badge>} />
      <section className="border border-slate-200 bg-white"><header className="border-b border-slate-200 px-5 py-3"><h2 className="text-sm font-semibold">Submit a portfolio for risk analysis</h2><p className="text-xs text-slate-500">Paste offer details or upload a document/photos, then analyze. The preview is held in this browser and is not accepted into the insurer book.</p></header><div className="p-5"><OfferInput text={text} setText={setText} photos={photos} setPhotos={setPhotos} busy={busy} llmOn={llm?.llm ?? null} onExtract={analyze} />{error && <p className="mt-3 text-sm text-red-700">{error}</p>}</div></section>
      {aiFallback && <Callout tone="warn" title="AI extraction unavailable">The keyword parser was used. Ask the demo administrator to check the server AI configuration.{" "}<button type="button" onClick={() => setAiFailureDismissed(true)} className="font-semibold underline">Dismiss</button></Callout>}
      {processingNotes.length > 0 && <Callout tone="warn" title="Submission processing notes"><ul className="list-disc pl-4">{processingNotes.map((warning) => <li key={warning}>{warning}</li>)}</ul></Callout>}
      {riskSummary && response && submissionId && <>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3"><div><div className="text-xs uppercase text-slate-500">Submission {submissionId}</div><div className="text-sm font-semibold">{riskSummary.properties} properties · {fmtKes(riskSummary.totalTiv)} · {riskSummary.areas.join(", ")}</div></div><button type="button" onClick={generateSummary} className="bg-river px-4 py-2 text-sm font-semibold text-white hover:bg-lake">Generate Risk Summary</button></div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">{RPS.map((period) => <button key={period} type="button" onClick={() => setRp(period)} className={`border px-2.5 py-1 text-xs ${rp === period ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-slate-700"}`}>{rpLabel(period)}</button>)}</div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Kpi label="Submission insured value" value={fmtKes(riskSummary.totalTiv)} sub={`${riskSummary.properties} modeled structures`} /><Kpi label="Overall risk classification" value={riskSummary.risk} sub="based on 1-in-100 ground-up loss / value" /><Kpi accent label={`${rpLabel(rp)} modeled loss`} value={fmtKes(riskSummary.byRp.find((row) => row.rp === rp)?.loss ?? 0)} sub="ground-up; before policy terms" /><Kpi label="Flood-prone exposure" value={fmtKes(riskSummary.floodProneTiv)} sub="value at locations with mapped flood depth" /></div>
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]"><section className="overflow-hidden border border-slate-200"><header className="border-b border-slate-200 p-3"><h2 className="text-sm font-semibold">Your submission · {rpLabel(rp)}</h2><p className="text-xs text-slate-500">Only this browser submission is shown.</p></header><MapView buildings={riskSummary.riskPoints} overlay="depth" rp={rp} colorBy="loss" classColors={riskSummary.classColors} classLabels={riskSummary.classLabels} maxTiv={Math.max(...riskSummary.riskPoints.map((point) => point.b.tiv), 1)} height={360} showDetails={false} /></section><section className="border border-slate-200"><header className="border-b border-slate-200 p-3"><h2 className="text-sm font-semibold">Scenario loss summary</h2><p className="text-xs text-slate-500">Ground-up modeled damage only; no insurer terms or reinsurance layers.</p></header><table className="w-full"><thead><tr><th className="p-3 text-left text-xs">Scenario</th><th className="p-3 text-right text-xs">Annual chance</th><th className="p-3 text-right text-xs">Loss estimate</th></tr></thead><tbody className="divide-y divide-slate-100">{riskSummary.byRp.map((row) => <tr key={row.rp}><td className="p-3 text-sm">{rpLabel(row.rp)}</td><td className="p-3 text-right text-sm">{fmtPct(1 / row.rp, 2)}</td><td className="p-3 text-right text-sm font-semibold">{fmtKes(row.loss)}</td></tr>)}</tbody></table><div className="border-t border-slate-200 p-3 text-xs text-slate-600"><b>High-level drivers:</b> {riskSummary.drivers.join(" ")}</div></section></div>
      </>}
    </div>
  );
}