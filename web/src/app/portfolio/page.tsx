"use client";

import { useMemo, useState } from "react";
import { AuditTrail } from "@/components/AuditTrail";
import { PortfolioManagerDashboard } from "@/components/PortfolioManagerDashboard";
import { UnderwriterWhatIf } from "@/components/UnderwriterWhatIf";
import { ClassBars, EpChart } from "@/components/charts";
import { WaterfallBars, WaterfallTable } from "@/components/finance";
import { MapView } from "@/components/MapView";
import { useModel } from "@/components/ModelProvider";
import { Badge, Callout, Card, CardBody, CardHeader, cx, Kpi, PageHeader, Spinner, Td, Th } from "@/components/ui";
import { accumulation, buildingLossAtRp, classSummary, oepCurve, RPS, waterfallAtRp } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import { LAYER_COLORS } from "@/lib/palette";

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
    auth,
  } = useModel();
  const [rp, setRp] = useState(100);

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

  if (auth?.role === "portfolio_manager") return <PortfolioManagerDashboard />;
  if (!data || !det || !at) return null;
  const v = data.vulnerability;
  const { w } = at;
  const curve = det.ep.curve.filter((c) => c.rp <= 2000);
  const nAi = portfolio.filter((b) => b.origin === "ai_ingested").length;
  const wet = at.rows.filter((r) => r.depth > 0);
  const tivWet = wet.reduce((a, r) => a + r.b.tiv, 0);
  const batches = [...new Set(ingested.map((b) => b.batchId!))].map((id) => {
    const bs = ingested.filter((b) => b.batchId === id);
    return { id, n: bs.length, tiv: bs.reduce((a, b) => a + b.tiv, 0) };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        lead="The whole book in one view: what is insured, what a flood of each rarity would cost before and after policy terms and reinsurance, and where the risk is concentrated."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {auth?.role === "underwriter" && <a href="#underwriter-what-if" className="border border-river bg-river px-3 py-1.5 text-sm font-semibold text-white hover:bg-lake">What-if analysis ↓</a>}
            <Badge kind="real">Hazard: JRC</Badge>
            <Badge kind="synthetic">Buildings: synthetic</Badge>
            <Badge kind="assumption">Terms: illustrative</Badge>
          </div>
        }
      />

      {auth?.role === "underwriter" && <UnderwriterWhatIf portfolio={portfolio} rp={rp} />}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <b className="text-ink">Portfolio storage:</b>
        <span>
          Original 500 buildings: <code>public/data/portfolio.json</code> (read-only)
        </span>
        <span>·</span>
        <span>Accepted offers: {portfolioStorage ? "SQLite database on the server" : "loading…"}</span>
      </div>
      {portfolioError && <Callout tone="warn" title="The portfolio could not be updated">{portfolioError}</Callout>}

      <div className="sticky top-[calc(var(--header-h,180px)+8px)] z-[1050] -mx-2 flex flex-wrap items-center gap-3 border border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <span className="text-sm font-semibold text-ink">Flood scenario</span>
        <div className="flex flex-wrap gap-1">
          {RPS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRp(r)}
              className={cx("border px-3 py-1 text-sm font-medium transition", r === rp ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-grey hover:border-ink hover:text-ink")}
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
                { key: "gu", label: "Ground-up", color: LAYER_COLORS.groundUp, width: 2.4, data: curve.map((c) => ({ rp: c.rp, loss: c.gross })) },
                { key: "gr", label: "Gross", color: LAYER_COLORS.gross, data: curve.map((c) => ({ rp: c.rp, loss: c.insured })) },
                { key: "ne", label: "Net", color: LAYER_COLORS.net, data: curve.map((c) => ({ rp: c.rp, loss: c.net })) },
                { key: "jrc", label: "Ground-up, JRC baseline curves", color: LAYER_COLORS.baseline, data: det.tableJrc.map((r) => ({ rp: r.rp, loss: r.gross })) },
                ...(mc ? [{ key: "mc", label: "Ground-up, Monte Carlo", color: LAYER_COLORS.monteCarlo, dashed: true, data: oepCurve(mc.gross).filter((p) => p.rp <= 2000) }] : []),
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
                        <span className="h-2.5 w-2.5" style={{ background: v.classColors[c.cls] }} />
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
                          <div className="h-2 w-24 bg-navy-50">
                            <div className="h-2 bg-ink" style={{ width: `${Math.max(1, a.share * 100)}%` }} />
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

      <Card className="overflow-hidden">
        <CardHeader
          title={`Flood map — ${rpLabel(rp)}`}
          subtitle={`Real JRC depth with every building: ${wet.length} of ${at.rows.length} flooded (${fmtKes(tivWet)} of value). Click a building for details.`}
        />
        <div className="p-2">
          <MapView
            buildings={at.rows}
            overlay="depth"
            rp={rp}
            colorBy="loss"
            classColors={v.classColors}
            classLabels={v.classLabels}
            maxTiv={Math.max(...portfolio.map((b) => b.tiv))}
            height={520}
          />
        </div>
        <CardBody className="border-t border-slate-100 text-xs text-slate-500">
          Building colour = damage ratio (pale navy dry, then deepening red: &lt;10%, 10–30%, 30–60%, &gt;60%). Circle size ∝ √ insured value.
          Navy outline = AI-ingested.
        </CardBody>
      </Card>

      {batches.length > 0 && (
        <Card>
          <CardHeader
            title="Offers accepted from the Underwriting desk"
            subtitle={settings.includeIngested ? "Included in every number above" : "Currently excluded — switch on in Model settings"}
            badges={<Badge kind="ai" />}
            right={
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove all ${ingested.length} accepted AI-ingested buildings? This is recorded in the audit trail.`)) clearIngested().catch(() => {});
                }}
                className="text-xs text-ai hover:underline"
              >
                Reset to original 500
              </button>
            }
          />
          <CardBody className="flex flex-wrap gap-2">
            {batches.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-2 border border-river-100 bg-river-50 px-3 py-1.5 text-xs text-ai">
                <b>Batch {b.id}</b> · {b.n} bldgs · {fmtKes(b.tiv)}
                <button type="button" onClick={() => removeBatch(b.id).catch(() => {})} className="text-river hover:text-lake" aria-label="remove batch">
                  ✕
                </button>
              </span>
            ))}
          </CardBody>
        </Card>
      )}

      <AuditTrail />

      <Callout tone="warn" title="Why so few of the starter buildings flood">
        The 500 synthetic starter buildings were scattered at random over the whole 1.7° × 1.6° clip, while JRC flooding is confined to the Nzoia
        corridor (~9% of cells). A real Budalangi book clusters on the floodplain, so use the Underwriting desk to add realistic riverside offers.
      </Callout>
    </div>
  );
}
