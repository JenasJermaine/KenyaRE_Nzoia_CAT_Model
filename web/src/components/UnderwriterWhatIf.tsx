"use client";

import { useMemo, useState } from "react";
import { useModel } from "@/components/ModelProvider";
import { Badge, Card, CardBody, CardHeader, cx } from "@/components/ui";
import { buildingLossAtRp, waterfallAtRp } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import type { Building } from "@/lib/types";

type ScenarioMode = "remove" | "reduce";

function riskLevel(loss: number, tiv: number) {
  const ratio = tiv ? loss / tiv : 0;
  return ratio >= 0.25 ? "High" : ratio >= 0.08 ? "Medium" : "Low";
}

function signedKes(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmtKes(Math.abs(value))}`;
}

function RiskValue({ level }: { level: string }) {
  return <span className={cx("inline-flex border-l-4 px-2 py-1 text-sm font-semibold", level === "High" ? "border-ai bg-river-50 text-ai" : level === "Medium" ? "border-amber-600 bg-amber-50 text-amber-900" : "border-ink bg-navy-50 text-ink")}>{level}</span>;
}

export function UnderwriterWhatIf({ portfolio, rp }: { portfolio: Building[]; rp: number }) {
  const { data, settings } = useModel();
  const [mode, setMode] = useState<ScenarioMode>("remove");
  const [reductionPct, setReductionPct] = useState(20);
  const [selectedArea, setSelectedArea] = useState("");

  const analysis = useMemo(() => {
    if (!data) return null;
    const v = data.vulnerability;
    const current = waterfallAtRp(portfolio, rp, v, settings);
    const currentTiv = portfolio.reduce((sum, building) => sum + building.tiv, 0);
    const highRiskBuildings = portfolio.filter((building) => buildingLossAtRp(building, rp, v, settings).depth >= 0.5);
    const byArea = new Map<string, { tiv: number; loss: number; buildings: Building[] }>();
    for (const building of portfolio) {
      const item = byArea.get(building.area) ?? { tiv: 0, loss: 0, buildings: [] };
      item.tiv += building.tiv;
      item.loss += buildingLossAtRp(building, rp, v, settings).gross;
      item.buildings.push(building);
      byArea.set(building.area, item);
    }
    const areas = [...byArea.entries()]
      .map(([area, item]) => ({ area, ...item, riskRatio: item.tiv ? item.loss / item.tiv : 0 }))
      .sort((a, b) => b.riskRatio - a.riskRatio || b.loss - a.loss);
    return { current, currentTiv, highRiskBuildings, areas };
  }, [data, portfolio, rp, settings]);

  const effectiveArea = selectedArea || analysis?.areas[0]?.area || "";
  const simulated = useMemo(() => {
    if (!data || !analysis) return null;
    let after: Building[];
    if (mode === "remove") {
      const ids = new Set(analysis.highRiskBuildings.map((building) => building.id));
      after = portfolio.filter((building) => !ids.has(building.id));
    } else {
      const retainedShare = 1 - reductionPct / 100;
      after = portfolio.map((building) => building.area === effectiveArea ? { ...building, tiv: building.tiv * retainedShare } : building);
    }
    const result = waterfallAtRp(after, rp, data.vulnerability, settings);
    const tiv = after.reduce((sum, building) => sum + building.tiv, 0);
    const scenarioTiv = portfolio.reduce((sum, building) => sum + building.tiv, 0);
    const reduction = scenarioTiv - tiv;
    return { result, tiv, reduction, lossReduction: analysis.current.groundUp - result.groundUp };
  }, [analysis, data, effectiveArea, mode, portfolio, reductionPct, rp, settings]);

  if (!data || !analysis || !simulated) return null;
  const area = analysis.areas.find((item) => item.area === effectiveArea);
  const options = [
    { value: "remove" as const, label: "Remove high-risk buildings" },
    { value: "reduce" as const, label: "Reduce a high-risk area" },
  ];

  return (
    <div id="underwriter-what-if" className="scroll-mt-[calc(var(--header-h,180px)+16px)]">
    <Card>
      <CardHeader
        title="What-if scenario analysis"
        badges={<Badge kind="derived">Underwriter decision support</Badge>}
      />
      <CardBody className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Choose a mitigation</h3>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button key={option.value} type="button" onClick={() => setMode(option.value)} className={cx("border px-3 py-2 text-sm font-medium", mode === option.value ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-slate-700 hover:border-ink")}>
                  {option.label}
                </button>
              ))}
            </div>
            {mode === "remove" ? (
              <div className="border-l-4 border-river bg-navy-50 px-3 py-2.5 text-sm text-slate-700">
                Remove all buildings with modeled {rpLabel(rp)} flood depth of at least <b>0.5 m</b>. This is the dashboard&apos;s high-risk depth band, not a pricing recommendation.
                <div className="mt-1 font-semibold text-ink">{analysis.highRiskBuildings.length} of {portfolio.length} buildings meet this rule.</div>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Area ranked by {rpLabel(rp)} ground-up loss as a share of its TIV</span>
                  <select value={effectiveArea} onChange={(event) => setSelectedArea(event.target.value)} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm">
                    {analysis.areas.map((item) => <option key={item.area} value={item.area}>{item.area} · {fmtPct(item.riskRatio, 1)} risk · {fmtKes(item.loss)} loss</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-xs font-medium text-slate-600"><span>Exposure reduction</span><span className="num font-semibold text-ink">{reductionPct}%</span></span>
                  <input type="range" min={5} max={50} step={5} value={reductionPct} onChange={(event) => setReductionPct(Number(event.target.value))} className="mt-2 w-full" />
                </label>
                {area && <p className="text-xs text-slate-500">This scenario proportionally reduces insured values in {area.area}; it does not delete buildings.</p>}
              </>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Current portfolio vs. after mitigation</h3>
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full min-w-[500px]">
                <thead className="bg-slate-50"><tr><th className="p-3 text-left text-xs font-semibold text-slate-500">Metric</th><th className="p-3 text-right text-xs font-semibold text-slate-500">Current</th><th className="p-3 text-right text-xs font-semibold text-slate-500">After mitigation</th><th className="p-3 text-right text-xs font-semibold text-slate-500">Change</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="p-3 text-sm font-medium">Insured exposure</td><td className="p-3 text-right text-sm">{fmtKes(analysis.currentTiv)}</td><td className="p-3 text-right text-sm">{fmtKes(simulated.tiv)}</td><td className="p-3 text-right text-sm">{signedKes(simulated.tiv - analysis.currentTiv)}</td></tr>
                  <tr><td className="p-3 text-sm font-medium">{rpLabel(rp)} ground-up loss</td><td className="p-3 text-right text-sm">{fmtKes(analysis.current.groundUp)}</td><td className="p-3 text-right text-sm">{fmtKes(simulated.result.groundUp)}</td><td className="p-3 text-right text-sm">{signedKes(simulated.result.groundUp - analysis.current.groundUp)}</td></tr>
                  <tr><td className="p-3 text-sm font-medium">Insurer gross loss</td><td className="p-3 text-right text-sm">{fmtKes(analysis.current.gross)}</td><td className="p-3 text-right text-sm">{fmtKes(simulated.result.gross)}</td><td className="p-3 text-right text-sm">{signedKes(simulated.result.gross - analysis.current.gross)}</td></tr>
                  <tr><td className="p-3 text-sm font-medium">Net retained loss</td><td className="p-3 text-right text-sm">{fmtKes(analysis.current.net)}</td><td className="p-3 text-right text-sm">{fmtKes(simulated.result.net)}</td><td className="p-3 text-right text-sm">{signedKes(simulated.result.net - analysis.current.net)}</td></tr>
                  <tr><td className="p-3 text-sm font-medium">Ground-up loss / exposure</td><td className="p-3 text-right text-sm">{fmtPct(analysis.currentTiv ? analysis.current.groundUp / analysis.currentTiv : 0, 1)}</td><td className="p-3 text-right text-sm">{fmtPct(simulated.tiv ? simulated.result.groundUp / simulated.tiv : 0, 1)}</td><td className="p-3 text-right text-sm">change in portfolio loss ratio</td></tr>
                  <tr><td className="p-3 text-sm font-medium">Risk band</td><td className="p-3 text-right"><RiskValue level={riskLevel(analysis.current.groundUp, analysis.currentTiv)} /></td><td className="p-3 text-right"><RiskValue level={riskLevel(simulated.result.groundUp, simulated.tiv)} /></td><td className="p-3 text-right text-xs text-slate-500">illustrative thresholds</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Risk band uses aggregate ground-up loss / TIV: High ≥25%, Medium ≥8%, otherwise Low. Scenario is a sensitivity test for {rpLabel(rp)}; no buildings are removed or changed in the saved portfolio.</p>
          </section>
        </div>
      </CardBody>
    </Card>
    </div>
  );
}