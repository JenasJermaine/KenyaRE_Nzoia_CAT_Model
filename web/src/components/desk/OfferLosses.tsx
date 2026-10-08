"use client";

import { useMemo, useState } from "react";
import { EpChart } from "@/components/charts";
import { TermsEditor, WaterfallBars, WaterfallTable } from "@/components/finance";
import { useModel } from "@/components/ModelProvider";
import { cx, Kpi, Td, Th } from "@/components/ui";
import { epCurve, RPS, waterfallAtRp, waterfallTable } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import type { ExpandedGroup } from "@/lib/geo";
import { groupLabel, groupRpRows } from "@/lib/offer";
import { damageTextColor, LAYER_COLORS } from "@/lib/palette";
import type { Building, IngestGroup } from "@/lib/types";
export function OfferLosses({
  groups,
  expanded,
  preview,
  selected,
  onSelect,
}: {
  groups: IngestGroup[];
  expanded: ExpandedGroup[];
  preview: Building[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const { data, settings } = useModel();
  const [rp, setRp] = useState(100);
  const [showTerms, setShowTerms] = useState(false);

  const calc = useMemo(() => {
    if (!data) return null;
    const v = data.vulnerability;
    return {
      table: waterfallTable(preview, v, settings),
      ep: epCurve(preview, v, settings, 240),
      groups: expanded.map((e) => groupRpRows(e, data, settings)),
    };
  }, [data, preview, expanded, settings]);
  const w = useMemo(() => (data ? waterfallAtRp(preview, rp, data.vulnerability, settings) : null), [data, preview, rp, settings]);
  if (!data || !calc || !w) return null;

  const tiv = preview.reduce((a, b) => a + b.tiv, 0);
  const curve = calc.ep.curve.filter((c) => c.rp <= 2000);
  const dry = calc.table.every((r) => r.groundUp === 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">Flood scenario</span>
        {RPS.map((r) => (
          <button key={r} type="button" onClick={() => setRp(r)} className={cx("border px-2.5 py-1 text-xs font-medium", r === rp ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-grey hover:border-ink hover:text-ink")}>
            {rpLabel(r)}
          </button>
        ))}
        <span className="text-xs text-slate-500">{(100 / rp).toFixed(rp > 100 ? 1 : 0)}% chance in any year</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Total insured value" value={fmtKes(tiv)} sub={`${preview.length} building(s)`} />
        <Kpi label={`${rpLabel(rp)} ground-up`} value={fmtKes(w.groundUp)} sub={`${fmtPct(tiv ? w.groundUp / tiv : 0, 1)} of value damaged`} />
        <Kpi accent label={`${rpLabel(rp)} gross (insurer)`} value={fmtKes(w.gross)} sub="after deductible & limit" />
        <Kpi label={`${rpLabel(rp)} net (kept)`} value={fmtKes(w.net)} sub="after quota share & Cat XL" />
        <Kpi label="Average annual loss" value={fmtKes(calc.ep.aalGross)} sub={`gross ${fmtKes(calc.ep.aalInsured)} · net ${fmtKes(calc.ep.aalNet)}`} />
      </div>

      {dry && (
        <div className="border-l-4 border-ink bg-navy-50 px-4 py-3 text-sm text-ink">
          None of these buildings sits inside the JRC flood footprint up to the 1-in-500 level, so the modelled flood loss is zero. Check the
          locations in step 2 — a wrong town or missing &ldquo;by the river&rdquo; flag is the most common reason.
        </div>
      )}

      <div className="border border-slate-200 bg-slate-50/60">
        <button type="button" onClick={() => setShowTerms((s) => !s)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm">
          <span className="font-semibold text-ink">Policy & reinsurance terms</span>
          <span className="text-xs text-slate-500">
            {fmtPct(settings.deductiblePct, 1)} deductible · {fmtPct(settings.limitPct, 0)} limit · {fmtPct(settings.qsCession, 0)} quota share · Cat XL{" "}
            {fmtKes(settings.xlLimit, 0)} xs {fmtKes(settings.xlRetention, 0)} <span className="ml-2 text-river">{showTerms ? "hide" : "edit"}</span>
          </span>
        </button>
        {showTerms && (
          <div className="border-t border-slate-200 px-4 py-4">
            <TermsEditor />
            <p className="mt-3 text-[11px] text-slate-500">
              Deductible and limit apply per building. Quota share and Cat XL apply to the total loss from one flood event — here, as if this offer
              were reinsured on its own. Terms are illustrative assumptions, shared with the Portfolio page.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <div className="border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold">Who pays for a {rpLabel(rp)} flood?</h3>
          <WaterfallBars w={w} />
          <p className="mt-3 text-[11px] text-slate-500">Hover a row for the definition used in the problem statement.</p>
        </div>
        <div className="border border-slate-200 p-4">
          <h3 className="mb-1 text-sm font-semibold">Loss vs. flood rarity (EP curve)</h3>
          <p className="text-xs text-slate-500">How much this offer could lose at each level of rarity. Further right = rarer, bigger floods.</p>
          <EpChart
            height={270}
            markRp={[rp]}
            points={RPS.map((r) => ({ rp: r, loss: calc.table.find((t) => t.rp === r)!.groundUp }))}
            series={[
              { key: "gu", label: "Ground-up", color: LAYER_COLORS.groundUp, width: 2.4, data: curve.map((c) => ({ rp: c.rp, loss: c.gross })) },
              { key: "gr", label: "Gross (insurer)", color: LAYER_COLORS.gross, data: curve.map((c) => ({ rp: c.rp, loss: c.insured })) },
              { key: "ne", label: "Net (kept)", color: LAYER_COLORS.net, data: curve.map((c) => ({ rp: c.rp, loss: c.net })) },
            ]}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Loss at each return period — from physical damage to what the insurer keeps</h3>
        <div className="border border-slate-200">
          <WaterfallTable rows={calc.table} tiv={tiv} highlight={rp} onSelect={setRp} />
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">Damage ratio and ground-up loss per building</h3>
        <p className="mb-2 text-xs text-slate-500">Click a row to explain it below. Depths come from the real JRC flood maps at each return period.</p>
        <div className="overflow-x-auto border border-slate-200">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50">
              <tr>
                <Th>Building</Th>
                <Th right>Value</Th>
                {RPS.map((r) => (
                  <Th key={r} right>{rpLabel(r)}</Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((g, i) => {
                const rows = calc.groups[i];
                const value = expanded[i].buildings.reduce((a, b) => a + b.tiv, 0);
                return (
                  <tr key={i} onClick={() => onSelect(i)} className={cx("cursor-pointer", selected === i ? "bg-navy-50" : "hover:bg-slate-50")}>
                    <Td>
                      <span className="mr-1.5 inline-block h-2 w-2" style={{ background: data.vulnerability.classColors[g.housing_class] }} />
                      <span className="font-medium">{groupLabel(g, i)}</span>
                      <div className="text-[11px] text-slate-500">{data.vulnerability.classLabels[g.housing_class]} · {expanded[i].placeUsed}</div>
                    </Td>
                    <Td right className="text-xs">{fmtKes(value)}</Td>
                    {rows.map((r) => (
                      <Td key={r.rp} right className="text-xs">
                        {r.dr > 0 ? (
                          <>
                            <div className="font-semibold" style={{ color: damageTextColor(r.dr) }}>{fmtPct(r.dr, 0)}</div>
                            <div className="text-slate-500">{fmtKes(r.groundUp)}</div>
                          </>
                        ) : (
                          <span className="text-slate-300">dry</span>
                        )}
                      </Td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
