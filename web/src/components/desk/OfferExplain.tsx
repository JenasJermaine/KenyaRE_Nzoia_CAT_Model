"use client";

import { useMemo, useState } from "react";
import { GlobalShap, LimeLevers, ShapWaterfall } from "@/components/explain";
import { useModel } from "@/components/ModelProvider";
import { cx } from "@/components/ui";
import { RPS } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import type { ExpandedGroup } from "@/lib/geo";
import { explainBuilding, firstWetRp, groupLabel } from "@/lib/offer";
import type { IngestGroup } from "@/lib/types";

export function OfferExplain({
  groups,
  expanded,
  selected,
  onSelect,
}: {
  groups: IngestGroup[];
  expanded: ExpandedGroup[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const { data, settings } = useModel();
  const [rp, setRp] = useState(100);
  const [showGlobal, setShowGlobal] = useState(false);
  const idx = Math.min(selected, groups.length - 1);
  const b = expanded[idx]?.buildings[0];

  const ex = useMemo(() => (data && b ? explainBuilding(b, rp, data, settings) : null), [data, b, rp, settings]);
  const wetAt = useMemo(() => (data && b ? firstWetRp(b, data, settings) : null), [data, b, settings]);
  if (!data || !b) return null;
  const v = data.vulnerability;
  const g = groups[idx];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={idx} onChange={(e) => onSelect(parseInt(e.target.value, 10))} className="border border-slate-200 px-2.5 py-1.5 text-sm">
          {groups.map((gg, i) => (
            <option key={i} value={i}>{groupLabel(gg, i)}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {RPS.map((r) => (
            <button key={r} type="button" onClick={() => setRp(r)} className={cx("border px-2 py-0.5 text-xs font-medium", r === rp ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-grey hover:border-ink hover:text-ink")}>
              {rpLabel(r)}
            </button>
          ))}
        </div>
        {g.count > 1 && <span className="text-[11px] text-slate-500">Explaining the first of {g.count} buildings in this group (they share location and construction).</span>}
      </div>

      {!ex ? (
        <div className="border-l-4 border-ink bg-navy-50 px-4 py-3 text-sm text-ink">
          <b>{groupLabel(g, idx)}</b> stays dry in a {rpLabel(rp)} flood, so its damage ratio is 0 and there is nothing to explain.{" "}
          {wetAt ? (
            <>
              It first floods at{" "}
              <button type="button" className="font-semibold underline" onClick={() => setRp(wetAt)}>
                {rpLabel(wetAt)}
              </button>
              .
            </>
          ) : (
            "It is outside the JRC flood footprint at every return period up to 1-in-500."
          )}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
          <div className="border border-slate-200 p-4">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Why {fmtPct(ex.shap.value, 0)} damage? (SHAP)</h3>
              <span className="text-xs text-slate-500">≈ {fmtKes(ex.shap.value * b.tiv)} ground-up on {fmtKes(b.tiv)}</span>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Starts from the average damage of {ex.backgroundN} flooded buildings in the Nzoia book at {rpLabel(rp)}, then adds each factor&apos;s
              contribution. Contributions add up exactly to this building&apos;s damage ratio.
            </p>
            <ShapWaterfall shap={ex.shap} x={ex.x} typical={ex.typical} tiv={b.tiv} classLabels={v.classLabels} />
            <div className="mt-4 bg-navy-50 px-3 py-2.5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ai">In plain English</div>
              <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-slate-700">
                {ex.sentences.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border border-slate-200 p-4">
            <h3 className="mb-1 text-sm font-semibold">What would change the loss? (LIME)</h3>
            <p className="mb-3 text-xs text-slate-500">Local &ldquo;what if&rdquo; effects on this building&apos;s damage ratio and ground-up loss.</p>
            <LimeLevers lime={ex.lime} tiv={b.tiv} x={ex.x} className={v.classLabels[ex.x.cls]} />
            <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
              <b className="text-slate-700">How to read this.</b> SHAP answers &ldquo;why this number&rdquo; by sharing the gap to a typical building
              fairly among the inputs. LIME answers &ldquo;what if&rdquo; by fitting a simple straight-line model to small changes around this one
              building. Both explain the same vulnerability model the losses above use — the extraction step is explained by the evidence quotes in step 2.
            </div>
          </div>
        </div>
      )}

      {data.explain && (
        <div className="border border-slate-200">
          <button type="button" onClick={() => setShowGlobal((s) => !s)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm">
            <span className="font-semibold text-ink">What drives flood damage across the whole model (global SHAP)</span>
            <span className="text-xs text-river">{showGlobal ? "hide" : "show"}</span>
          </button>
          {showGlobal && (
            <div className="border-t border-slate-200 p-4">
              <GlobalShap explain={data.explain} classColors={v.classColors} classLabels={v.classLabels} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
