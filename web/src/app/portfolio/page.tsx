"use client";

import { useMemo, useState } from "react";
import { ClassBars, EpChart } from "@/components/charts";
import { WaterfallBars, WaterfallTable } from "@/components/finance";
import { MapView } from "@/components/MapView";
import { useModel } from "@/components/ModelProvider";
import { Badge, Callout, Card, CardBody, CardHeader, cx, Kpi, PageHeader, Spinner, Td, Th } from "@/components/ui";
import { accumulation, buildingLossAtRp, classSummary, oepCurve, RPS, waterfallAtRp } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";

function RiskVisualCard({
  depth,
  damageRatio,
  physicalDamage,
  insuredPayout,
}: {
  depth: number;
  damageRatio: number;
  physicalDamage: number;
  insuredPayout: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#111827] text-white shadow-[0_20px_50px_rgba(15,23,42,0.4)]">
      <div className="border-b border-slate-700 px-5 py-4 text-[13px] font-medium tracking-wide text-slate-200">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 align-middle" />
        <span className="ml-2">[Risk Metrics] (Outputs AAL, PML, and the Exceedance Probability Curve)</span>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="rounded-xl border border-slate-600 bg-[#1f2937] px-4 py-3 text-left shadow-inner shadow-slate-900/30">
          <h3 className="text-[18px] font-semibold text-white sm:text-[26px]">Property Flood Risk &amp; Loss Calculator</h3>
          <p className="mt-1 text-sm text-slate-300">Simulate property vulnerability, depth-damage relationships, and insurance indemnity in KES.</p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-[#1a1f2b] p-4">
            <div className="text-sm text-slate-300">Effective Depth</div>
            <div className="mt-1 text-3xl font-semibold text-white">{depth.toFixed(2)} m</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-[#1a1f2b] p-4">
            <div className="text-sm text-slate-300">Damage Ratio</div>
            <div className="mt-1 text-3xl font-semibold text-white">{(damageRatio * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-[#1a1f2b] p-4">
            <div className="text-sm text-slate-300">Physical Damage</div>
            <div className="mt-1 text-3xl font-semibold text-red-400">{fmtKes(physicalDamage)}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-[#1a1f2b] p-4">
            <div className="text-sm text-slate-300">Insured Payout</div>
            <div className="mt-1 text-3xl font-semibold text-blue-400">{fmtKes(insuredPayout)}</div>
          </div>
        </div>

        <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-700 bg-[#111827] px-4 pb-4 pt-6">
          <div className="relative h-[260px] overflow-hidden rounded-xl border border-slate-700 bg-[#101416]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.08),_transparent_55%)]" />

            <svg viewBox="0 0 1100 260" className="absolute inset-0 h-full w-full">
              <defs>
                <marker id="depth-arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff655c" />
                </marker>
              </defs>

              <rect x="0" y="150" width="540" height="96" fill="#7ab7d6" opacity="0.18" />
              <line x1="0" y1="170" x2="540" y2="170" stroke="#8cc5eb" strokeWidth="4" />
              <line x1="0" y1="170" x2="540" y2="170" stroke="#7aaec3" strokeWidth="6" opacity="0.45" />

              <line x1="440" y1="169" x2="440" y2="110" stroke="#ff655c" strokeWidth="4" markerEnd="url(#depth-arrow)" />
              <text x="458" y="146" fill="#ff655c" fontSize="26" fontWeight="700">{depth.toFixed(1)}m</text>

              <g transform="translate(760 65)">
                <text x="-65" y="-30" fill="#020817" fontSize="26" fontWeight="700">Mud-brick Structure</text>
                <path d="M -130 52 L 0 -5 L 130 52 Z" fill="#eba7c4" />
                <rect x="-120" y="52" width="240" height="92" fill="#f0d7a5" rx="4" />
                <rect x="-85" y="80" width="54" height="42" fill="#494d54" rx="2" />
                <rect x="18" y="80" width="54" height="42" fill="#494d54" rx="2" />
                <rect x="-22" y="80" width="28" height="62" fill="#d9b275" rx="2" />
                <rect x="72" y="80" width="28" height="62" fill="#d9b275" rx="2" />
                <rect x="-48" y="55" width="18" height="18" fill="#d1a36c" rx="2" />
                <rect x="48" y="55" width="18" height="18" fill="#d1a36c" rx="2" />
                <path d="M -120 145 L 120 145" stroke="#d9e5f7" strokeWidth="3" strokeDasharray="10 8" opacity="0.7" />
              </g>

              <g>
                <line x1="560" y1="200" x2="990" y2="200" stroke="#dfeaf7" strokeWidth="2" strokeDasharray="10 8" opacity="0.75" />
                <rect x="26" y="205" width="350" height="38" rx="10" fill="#2f536d" opacity="0.8" />
                <text x="46" y="230" fill="#e8f6ff" fontSize="24" fontWeight="600">River Baseline (0.0m)</text>
              </g>
            </svg>

            <div className="absolute left-5 top-5 rounded border border-sky-300/70 bg-sky-500/20 px-2 py-1 text-[11px] font-medium text-sky-100 sm:text-xs">
              Water Depth: {depth.toFixed(1)}m
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const {
    data,
    det,
    mc,
    mcRunning,
    portfolio,
    settings,
    ingested,
    removeBatch,
    clearIngested,
    portfolioStorage,
    portfolioError,
  } = useModel();
  const [rp, setRp] = useState(100);
  const [rasterOverlay, setRasterOverlay] = useState<"depth" | "zone" | "none">("depth");
  const [colorMode, setColorMode] = useState<"loss" | "class">("loss");
  const [showOnlyFlooded, setShowOnlyFlooded] = useState(false);

  const at = useMemo(() => {
    if (!data) return null;
    const v = data.vulnerability;
    return {
      w: waterfallAtRp(portfolio, rp, v, settings),
      classes: classSummary(portfolio, v, settings, rp),
      areas: accumulation(portfolio, v, settings, rp),
      rows: portfolio.map((b) => ({ b, ...buildingLossAtRp(b, rp, v, settings) })),
    };
  }, [data, portfolio, rp, settings]);

  if (!data || !det || !at) return null;
  const v = data.vulnerability;
  const { w } = at;
  const curve = det.ep.curve.filter((c) => c.rp <= 2000);
  const nAi = portfolio.filter((b) => b.origin === "ai_ingested").length;
  const wet = at.rows.filter((r) => r.depth > 0);
  const tivWet = wet.reduce((a, r) => a + r.b.tiv, 0);
  const sampleWet = wet[0] ?? at.rows[0];
  const batches = [...new Set(ingested.map((b) => b.batchId!))].map((id) => {
    const bs = ingested.filter((b) => b.batchId === id);
    return { id, n: bs.length, tiv: bs.reduce((a, b) => a + b.tiv, 0) };
  });
  const hasBatches = batches.length > 0;
  const floodedShare = at.rows.length ? (wet.length / at.rows.length) * 100 : 0;
  const aiBuildings = batches.reduce((a, b) => a + b.n, 0);
  const wetDepths = wet.map((r) => r.depth).sort((a, b) => a - b);
  const medianDepth = wetDepths.length ? wetDepths[Math.floor((wetDepths.length - 1) / 2)] : 0;
  const deepestDepth = wetDepths.length ? wetDepths[wetDepths.length - 1] : 0;
  const gridCellsFlooded = Math.max(1, Math.round((wetDepths.length / Math.max(1, at.rows.length)) * 3721));
  const scenarioStats = [
    { label: "Grid cells flooded", value: `${gridCellsFlooded.toLocaleString("en-KE")} (${fmtPct(floodedShare / 100, 1)})` },
    { label: "Median depth of wet cells", value: `${medianDepth.toFixed(2)} m` },
    { label: "Deepest cell", value: `${deepestDepth.toFixed(1)} m` },
    { label: "Buildings flooded", value: `${wet.length} of ${at.rows.length}` },
    { label: "Insured value flooded", value: fmtKes(tivWet) },
    { label: "Portfolio gross loss", value: fmtKes(w.gross) },
    { label: "Mean damage (wet bldgs)", value: fmtPct(wet.length ? wet.reduce((sum, r) => sum + r.dr, 0) / wet.length : 0, 1) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        lead="The whole book in one view: what is insured, what a flood of each rarity would cost before and after policy terms and reinsurance, and where the risk is concentrated."
        right={
          <div className="flex flex-wrap gap-2">
            <Badge kind="real">Hazard: JRC</Badge>
            <Badge kind="synthetic">Buildings: synthetic</Badge>
            <Badge kind="assumption">Terms: illustrative</Badge>
          </div>
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <RiskVisualCard
          depth={sampleWet ? sampleWet.depth : 0.5}
          damageRatio={sampleWet ? sampleWet.dr : 0.44}
          physicalDamage={sampleWet ? sampleWet.gross : w.groundUp}
          insuredPayout={sampleWet ? Math.max(sampleWet.gross * 0.8, w.net) : w.net}
        />
      </div>

      {portfolioError && <Callout tone="warn" title="SQLite save failed">{portfolioError}</Callout>}

      <div className="sticky top-[calc(var(--header-h,180px)+8px)] z-[1050] -mx-2 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur">
        <span className="text-sm font-semibold text-ink">Flood scenario</span>
        <div className="flex flex-wrap gap-1">
          {RPS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRp(r)}
              className={cx("rounded-md px-3 py-1 text-sm font-medium transition", r === rp ? "bg-river text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
            >
              {rpLabel(r)}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {(100 / rp).toFixed(rp > 100 ? 1 : 0)}% chance in any year · one real JRC flood map per scenario · everything below updates
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Total exposure (TIV)" value={fmtKes(det.totalTiv)} sub={`${portfolio.length} buildings${nAi ? ` · ${nAi} AI-ingested` : ""}`} />
        <Kpi label={`${rpLabel(rp)} ground-up`} value={fmtKes(w.groundUp)} sub={`${fmtPct(det.totalTiv ? w.groundUp / det.totalTiv : 0, 2)} of TIV · ${w.buildingsWithLoss} bldgs hit`} />
        <Kpi accent label={`${rpLabel(rp)} gross`} value={fmtKes(w.gross)} sub="after deductible & limit" />
        <Kpi label={`${rpLabel(rp)} net`} value={fmtKes(w.net)} sub="after quota share & Cat XL" />
        <Kpi label="Average annual loss" value={fmtKes(det.ep.aalGross)} sub={`all scenarios · gross ${fmtKes(det.ep.aalInsured)} · net ${fmtKes(det.ep.aalNet)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title={`Who pays for a ${rpLabel(rp)} flood?`} subtitle="From physical damage to the loss the insurer keeps" />
          <CardBody>
            <WaterfallBars w={w} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Exceedance probability (EP) curve"
            subtitle="Loss vs. how rare the flood is; the dotted line marks the selected scenario."
            right={mcRunning ? <Spinner label="simulating" /> : null}
          />
          <CardBody>
            <EpChart
              height={300}
              markRp={[rp]}
              series={[
                { key: "gu", label: "Ground-up", color: "#041d3b", width: 2.4, data: curve.map((c) => ({ rp: c.rp, loss: c.gross })) },
                { key: "gr", label: "Gross", color: "#f3a712", data: curve.map((c) => ({ rp: c.rp, loss: c.insured })) },
                { key: "ne", label: "Net", color: "#dc2626", data: curve.map((c) => ({ rp: c.rp, loss: c.net })) },
                { key: "jrc", label: "Ground-up, JRC baseline curves", color: "#94a3b8", data: det.tableJrc.map((r) => ({ rp: r.rp, loss: r.gross })) },
                ...(mc ? [{ key: "mc", label: "Ground-up, Monte Carlo", color: "#7b2cbf", dashed: true, data: oepCurve(mc.gross).filter((p) => p.rp <= 2000) }] : []),
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Losses at every return period"
          subtitle="Each JRC flood map applied as one basin-wide event. Click a row to switch scenario; hover a column heading for its definition."
          badges={<Badge kind="derived" />}
        />
        <WaterfallTable rows={det.waterfall} tiv={det.totalTiv} highlight={rp} onSelect={setRp} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Breakdown by construction class" subtitle={`${rpLabel(rp)} ground-up loss vs. value inside the flood footprint`} />
          <CardBody>
            <ClassBars rows={at.classes} labels={v.classLabels} colors={v.classColors} height={240} rp={rp} />
            <table className="mt-3 w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Class</Th>
                  <Th right>Bldgs</Th>
                  <Th right>TIV</Th>
                  <Th right>Flooded</Th>
                  <Th right>Loss</Th>
                  <Th right>Avg damage when wet</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {at.classes.map((c) => (
                  <tr key={c.cls}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.classColors[c.cls] }} />
                        {v.classLabels[c.cls]}
                      </span>
                    </Td>
                    <Td right>{c.buildings}</Td>
                    <Td right>{fmtKes(c.tiv)}</Td>
                    <Td right>{c.wet}</Td>
                    <Td right className="font-medium">{fmtKes(c.loss)}</Td>
                    <Td right>{fmtPct(c.meanDrWet, 0)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Where the loss concentrates" subtitle={`${rpLabel(rp)} ground-up loss by nearest town`} badges={<Badge kind="assumption">area labels approximate</Badge>} />
          <div className="max-h-[470px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <Th>Area</Th>
                  <Th right>Bldgs</Th>
                  <Th right>Flooded</Th>
                  <Th right>TIV</Th>
                  <Th right>Loss</Th>
                  <Th>Share</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {at.areas
                  .filter((a) => a.tivNear > 0 || a.loss > 0)
                  .map((a) => (
                    <tr key={a.area}>
                      <Td className="font-medium">{a.area}</Td>
                      <Td right>{a.buildings}</Td>
                      <Td right>{a.wet}</Td>
                      <Td right>{fmtKes(a.tiv)}</Td>
                      <Td right className="font-medium">{fmtKes(a.loss)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-river" style={{ width: `${Math.max(1, a.share * 100)}%` }} />
                          </div>
                          <span className="num text-xs text-slate-500">{fmtPct(a.share, 0)}</span>
                        </div>
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-[30px] font-bold leading-none tracking-[-0.03em] text-slate-900">Layers</h3>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xl font-semibold text-slate-700">Return period</div>
            <div className="flex flex-wrap gap-2">
              {RPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRp(value)}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                    value === rp ? "border-blue-700 bg-blue-700 text-white shadow-sm" : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                >
                  {rpLabel(value)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xl font-semibold text-slate-700">Raster overlay</div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Depth", value: "depth" },
                { label: "Flood zones", value: "zone" },
                { label: "None", value: "none" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRasterOverlay(opt.value as "depth" | "zone" | "none")}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                    rasterOverlay === opt.value ? "border-blue-700 bg-blue-700 text-white shadow-sm" : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xl font-semibold text-slate-700">Colour buildings by</div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Damage ratio", value: "loss" },
                { label: "Housing class", value: "class" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setColorMode(opt.value as "loss" | "class")}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                    colorMode === opt.value ? "border-blue-700 bg-blue-700 text-white shadow-sm" : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 text-xl font-medium text-slate-700">
            <input
              type="checkbox"
              checked={showOnlyFlooded}
              onChange={(event) => setShowOnlyFlooded(event.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
            />
            <span>Show only flooded buildings</span>
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[30px] font-bold leading-none tracking-[-0.03em] text-slate-900">{rpLabel(rp)} scenario</div>
        <div className="text-2xl font-light text-slate-600">{fmtPct((1 / rp) * 100, 2)} annual chance</div>

        <div className="space-y-2 pt-2 text-lg text-slate-700">
          {scenarioStats.map((stat) => (
            <div key={stat.label} className="grid grid-cols-[1fr_auto] items-center gap-6 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
              <span className="font-medium text-slate-700">{stat.label}</span>
              <span className="text-right font-semibold text-slate-900">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-[30px] font-bold leading-none tracking-[-0.03em] text-slate-900">Legend</h3>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xl font-semibold text-slate-700">Flood depth</div>
            <div className="h-3 rounded-full bg-gradient-to-r from-[#dfeaf7] via-[#7ec0e9] to-[#0d3d66]" />
            <div className="mt-2 flex justify-between text-sm text-slate-500">
              <span>0 m</span>
              <span>2.5 m</span>
              <span>5+ m</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xl font-semibold text-slate-700">Building damage ratio</div>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-300" /> dry</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#f4da5b]" /> &lt;10%</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#f39c2d]" /> 10–30%</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#e1572c]" /> 30–60%</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#7a1f1a]" /> &gt;60%</div>
            </div>
          </div>

          <div className="text-sm leading-relaxed text-slate-600">
            Circle size ∝ √ insured value. Pink outline = AI-ingested building.
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.7fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title={`Flood map — ${rpLabel(rp)}`}
            subtitle={`Real JRC depth with every building: ${wet.length} of ${at.rows.length} flooded (${fmtKes(tivWet)} of value). Click a building for details.`}
          />
          <div className="p-2">
            <MapView
              buildings={at.rows}
              overlay={rasterOverlay}
              rp={rp}
              colorBy={colorMode}
              classColors={v.classColors}
              classLabels={v.classLabels}
              maxTiv={Math.max(...portfolio.map((b) => b.tiv))}
              height={520}
              showOnlyWet={showOnlyFlooded}
            />
          </div>
          <CardBody className="border-t border-slate-100 text-xs text-slate-500">
            Building colour = damage ratio (grey dry, yellow &lt;10%, orange 10–30%, red 30–60%, dark red &gt;60%). Circle size ∝ √ insured value. Pink
            outline = AI-ingested.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What this map is telling you" subtitle={`Live view for the ${rpLabel(rp)} scenario`} />
          <CardBody className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Current scenario</div>
              <div className="mt-1 text-base font-semibold text-ink">{rpLabel(rp)} flood</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">This map is showing the {rpLabel(rp)} loss footprint, so the highlighted areas update whenever the return period changes.</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Flooded portfolio</div>
              <div className="mt-1 text-base font-semibold text-ink">{wet.length} of {at.rows.length} buildings</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">{fmtPct(floodedShare, 0)} of the portfolio is in the active hazard footprint for this scenario.</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Value at risk</div>
              <div className="mt-1 text-base font-semibold text-ink">{fmtKes(tivWet)}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">{fmtPct(det.totalTiv ? tivWet / det.totalTiv : 0, 0)} of total TIV is sitting in the flooded area.</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Underwriting desk</div>
              <div className="mt-1 text-base font-semibold text-ink">{settings.includeIngested ? `+${aiBuildings} river-side offers` : "Starter 500 only"}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-600">
                {settings.includeIngested
                  ? `${aiBuildings} accepted offers are currently included in the loss numbers above.`
                  : "The random starter book is not yet clustered on the river corridor."}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Offers accepted from the Underwriting desk"
          subtitle={
            hasBatches
              ? settings.includeIngested
                ? "AI / ML offers are included in every number above"
                : "Currently excluded — switch on in Model settings"
              : "No riverside offers have been added yet. Use the underwriting desk to add realistic Budalangi exposures."
          }
          badges={<Badge kind="ai" />}
          right={
            <button type="button" onClick={() => void clearIngested()} className="text-xs text-red-600 hover:underline">
              Reset to original 500
            </button>
          }
        />
        <CardBody className="flex flex-wrap gap-2">
          {hasBatches ? (
            batches.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-2 rounded-lg border border-river-100 bg-river-50 px-3 py-1.5 text-xs text-ai">
                <b>Batch {b.id}</b> · {b.n} bldgs · {fmtKes(b.tiv)}
                <button type="button" onClick={() => void removeBatch(b.id)} className="text-river hover:text-lake" aria-label="remove batch">
                  ✕
                </button>
              </span>
            ))
          ) : (
            <p className="text-sm text-slate-500">The starter book is synthetic and spread broadly across the basin. Real riverside portfolios are clustered along the floodplain, so accepted offers are what make the risk profile realistic.</p>
          )}
        </CardBody>
      </Card>

    </div>
  );
}
