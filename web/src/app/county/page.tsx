"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MapView } from "@/components/MapView";
import { Badge, Callout, Kpi, PageHeader, Spinner } from "@/components/ui";
import { RPS } from "@/lib/engine";
import { fmtPct, rpLabel } from "@/lib/format";
import { CLASS_COLORS } from "@/lib/palette";
import type { HousingClass, NotebookResults } from "@/lib/types";

const CLASS_LABELS: Record<HousingClass, string> = {
  informal_iron_sheet: "Informal (iron sheet)",
  semi_permanent: "Semi-permanent",
  permanent_masonry: "Permanent masonry",
  concrete_rcc: "Concrete / RCC",
};

export default function CountyPage() {
  const [rp, setRp] = useState(100);
  const [hazard, setHazard] = useState<NotebookResults["hazardStats"][number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api<{ hazard: NotebookResults["hazardStats"][number] | null }>(`/api/county?rp=${rp}`)
      .then((result) => active && (setHazard(result.hazard), setError(null)))
      .catch((reason: Error) => active && setError(reason.message));
    return () => { active = false; };
  }, [rp]);
  if (error) return <Callout tone="warn" title="Public hazard summary unavailable">{error}</Callout>;
  if (!hazard) return <Spinner label="Loading public flood-hazard summary…" />;
  return (
    <div className="space-y-5">
      <PageHeader title="Disaster Manager" lead="Public-interest view of modeled river-flood extent and depth. It contains no insurer portfolio, property values, cedant submissions or underwriting decisions." right={<Badge kind="real">JRC hazard maps</Badge>} />
      <div className="flex flex-wrap gap-2 border-y border-slate-200 py-3">{RPS.map((period) => <button key={period} type="button" onClick={() => setRp(period)} className={`border px-3 py-1.5 text-sm ${rp === period ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-slate-700"}`}>{rpLabel(period)}</button>)}<span className="self-center text-xs text-slate-500">{fmtPct(1 / rp, 2)} annual exceedance probability</span></div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Kpi label="Modeled flooded cells" value={hazard.flooded_cells.toLocaleString()} sub={`${hazard.flooded_pct.toFixed(1)}% of mapped grid`} /><Kpi accent label={`${rpLabel(rp)} median flood depth`} value={`${hazard.median_depth_m.toFixed(2)} m`} sub="JRC flood-depth grid" /><Kpi label="90th percentile depth" value={`${hazard.p90_depth_m.toFixed(2)} m`} sub="among mapped cells" /><Kpi label="Maximum modeled depth" value={`${hazard.max_depth_m.toFixed(1)} m`} sub="scenario grid maximum" /></div>
      <section className="overflow-hidden border border-slate-200"><header className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold">Flood extent and depth · {rpLabel(rp)}</h2><p className="text-xs text-slate-500">Flood hazard only. Map does not overlay insured buildings or private property information.</p></header><MapView buildings={[]} overlay="depth" rp={rp} colorBy="class" classColors={CLASS_COLORS} classLabels={CLASS_LABELS} maxTiv={1} height={560} /></section>
      <aside className="border-l-4 border-ink bg-navy-50 px-4 py-3 text-sm leading-relaxed text-slate-700">Areas inside the flood footprint may experience water at the depths shown for this scenario. Higher return periods describe rarer, more severe modeled events. This map is a planning aid, not a local warning or parcel-level forecast.</aside>
    </div>
  );
}