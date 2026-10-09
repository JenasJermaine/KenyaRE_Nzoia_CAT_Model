"use client";

import { useEffect, useState } from "react";
import { ClassBars } from "@/components/charts";
import { MapView } from "@/components/MapView";
import { api } from "@/lib/api";
import { Badge, Callout, Card, CardBody, CardHeader, Kpi, PageHeader, Spinner, Td, Th } from "@/components/ui";
import { RPS } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import type { HousingClass } from "@/lib/types";

interface ExposureSummary {
  totalTiv: number;
  properties: number;
  risk: { high: number; medium: number; low: number };
  exposedTiv: number;
  classes: { cls: HousingClass; buildings: number; tiv: number; tivWet: number; loss: number; share: number }[];
  areas: { area: string; buildings: number; tiv: number; tivWet: number; loss: number; share: number }[];
  scenarios: { rp: number; groundUp: number; gross: number; net: number }[];
  mapPoints: { b: import("@/lib/types").Building; depth: number; dr: number; gross: number }[];
  classLabels: Record<HousingClass, string>;
  classColors: Record<HousingClass, string>;
}

export function PortfolioManagerDashboard() {
  const [rp, setRp] = useState(100);
  const [loaded, setLoaded] = useState<{ rp: number; summary: ExposureSummary } | null>(null);
  const [failure, setFailure] = useState<{ rp: number; message: string } | null>(null);
  useEffect(() => {
    let active = true;
    api<ExposureSummary>(`/api/exposure?rp=${rp}`)
      .then((summary) => active && setLoaded({ rp, summary }))
      .catch((reason: Error) => active && setFailure({ rp, message: reason.message }));
    return () => { active = false; };
  }, [rp]);
  const summary = loaded?.rp === rp ? loaded.summary : null;
  const error = failure?.rp === rp ? failure.message : null;
  if (error) return <Callout tone="warn" title="Exposure summary unavailable">{error}</Callout>;
  if (!summary) return <Spinner label="Loading aggregated exposure…" />;
  const total = summary.totalTiv;
  const highShare = total ? summary.risk.high / total : 0;
  const selectedScenario = summary.scenarios.find((scenario) => scenario.rp === rp);

  return (
    <div className="space-y-5">
      <PageHeader title="Portfolio Manager" lead="Aggregate accumulation view. Property-level underwriting decisions and audit details are not shown in this role." right={<Badge kind="synthetic">Prototype book</Badge>} />
      <div className="flex flex-wrap items-center gap-2 border-y border-slate-200 py-2">
        <span className="mr-2 text-sm font-semibold text-ink">Scenario</span>
        {RPS.map((period) => <button key={period} type="button" onClick={() => setRp(period)} className={`border px-2.5 py-1 text-xs font-medium ${period === rp ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-slate-600"}`}>{rpLabel(period)}</button>)}
        <span className="ml-auto text-xs text-slate-500">Exposure zones are based on 1-in-100 modeled depth: high ≥0.5 m, medium &gt;0 m, low = dry.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi label="Total insured value" value={fmtKes(total)} sub={`${summary.properties.toLocaleString()} properties`} />
        <Kpi label="High-risk exposure" value={fmtKes(summary.risk.high)} sub={fmtPct(highShare, 1) + " of portfolio"} />
        <Kpi label="Medium-risk exposure" value={fmtKes(summary.risk.medium)} sub="wet at 1-in-100, depth under 0.5 m" />
        <Kpi label="Low-risk exposure" value={fmtKes(summary.risk.low)} sub="dry at 1-in-100" />
        <Kpi accent label={`${rpLabel(rp)} aggregate damage`} value={fmtKes(selectedScenario?.groundUp ?? 0)} sub={`${fmtKes(summary.exposedTiv)} TIV lies in the 1-in-100 footprint`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader title={`Accumulation map · ${rpLabel(rp)}`} subtitle="Marker size represents relative insured value; colors represent modeled damage. Exact building details are disabled." />
          <MapView buildings={summary.mapPoints} overlay="depth" rp={rp} colorBy="loss" classColors={summary.classColors} classLabels={summary.classLabels} maxTiv={Math.max(...summary.mapPoints.map((point) => point.b.tiv), 1)} height={430} showDetails={false} />
        </Card>
        <Card>
          <CardHeader title="Exposure by construction class" subtitle={`${rpLabel(rp)} modeled aggregate loss`} />
          <CardBody>
            <ClassBars rows={summary.classes} labels={summary.classLabels} colors={summary.classColors} height={220} rp={rp} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead><tr><Th>Construction</Th><Th right>Properties</Th><Th right>Insured value</Th><Th right>Loss</Th><Th right>Share</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{summary.classes.map((row) => <tr key={row.cls}><Td>{summary.classLabels[row.cls]}</Td><Td right>{row.buildings}</Td><Td right>{fmtKes(row.tiv)}</Td><Td right>{fmtKes(row.loss)}</Td><Td right>{fmtPct(row.share, 1)}</Td></tr>)}</tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Accumulation by area" subtitle={`${rpLabel(rp)} modeled loss and insured value in mapped flood cells`} />
        <div className="overflow-x-auto"><table className="w-full"><thead><tr><Th>Area</Th><Th right>Insured value</Th><Th right>Flood-zone value</Th><Th right>Aggregate loss</Th><Th right>Loss share</Th></tr></thead><tbody className="divide-y divide-slate-100">{summary.areas.map((area) => <tr key={area.area}><Td>{area.area}</Td><Td right>{fmtKes(area.tiv)}</Td><Td right>{fmtKes(area.tivWet)}</Td><Td right>{fmtKes(area.loss)}</Td><Td right>{fmtPct(area.share, 1)}</Td></tr>)}</tbody></table></div>
      </Card>
      <Card>
        <CardHeader title="Scenario losses across the book" subtitle="Aggregate event losses after policy terms and reinsurance; values are illustrative prototype estimates." />
        <div className="overflow-x-auto"><table className="w-full"><thead><tr><Th>Return period</Th><Th right>Ground-up</Th><Th right>Insurer gross</Th><Th right>Net retained</Th></tr></thead><tbody className="divide-y divide-slate-100">{summary.scenarios.map((scenario) => <tr key={scenario.rp}><Td>{rpLabel(scenario.rp)}</Td><Td right>{fmtKes(scenario.groundUp)}</Td><Td right>{fmtKes(scenario.gross)}</Td><Td right className="font-semibold">{fmtKes(scenario.net)}</Td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}