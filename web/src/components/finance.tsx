"use client";

import type { Waterfall } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { useModel } from "./ModelProvider";
import { cx, Field, Slider, Td, Th } from "./ui";

/** Definitions from the problem statement (Step 4 — financial engine). */
export const TERMS: Record<"groundUp" | "deductible" | "limit" | "gross" | "qs" | "xl" | "net", { label: string; def: string }> = {
  groundUp: { label: "Ground-up loss", def: "The total physical damage caused to a building before insurance rules are applied." },
  deductible: { label: "Deductible", def: "The part of the loss that the building owner must pay themselves before the insurer pays." },
  limit: { label: "Limit", def: "The maximum amount the insurer will pay for the building." },
  gross: { label: "Gross loss", def: "The amount the insurer is responsible for paying after applying the deductible and limit." },
  qs: { label: "Quota share", def: "The insurer and reinsurer share every loss by an agreed percentage — e.g. 25% means the reinsurer pays 25% of the gross loss." },
  xl: { label: "Cat excess of loss", def: "Reinsurance that starts paying once the total loss from one catastrophe passes an agreed threshold, up to an agreed maximum." },
  net: { label: "Net loss", def: "The amount of the loss that remains with the insurer after payments from reinsurers." },
};

export function TermsEditor({ columns = 5 }: { columns?: 2 | 5 }) {
  const { settings: s, updateSettings: set } = useModel();
  return (
    <div className={cx("grid gap-4", columns === 5 ? "sm:grid-cols-2 lg:grid-cols-5" : "grid-cols-1")}>
      <Field label={`${TERMS.deductible.label} (% of building value)`} hint="Paid by the building owner">
        <Slider value={s.deductiblePct} min={0} max={0.1} step={0.005} onChange={(v) => set({ deductiblePct: v })} format={(v) => fmtPct(v, 1)} />
      </Field>
      <Field label={`${TERMS.limit.label} (% of building value)`} hint="Most the insurer pays per building">
        <Slider value={s.limitPct} min={0.2} max={1} step={0.05} onChange={(v) => set({ limitPct: v })} format={(v) => fmtPct(v, 0)} />
      </Field>
      <Field label={`${TERMS.qs.label} ceded`} hint="Reinsurer's share of every loss">
        <Slider value={s.qsCession} min={0} max={0.8} step={0.05} onChange={(v) => set({ qsCession: v })} format={(v) => fmtPct(v, 0)} />
      </Field>
      <Field label="Cat XL threshold (retention)" hint="Reinsurer pays above this per event">
        <Slider value={s.xlRetention} min={0} max={60e6} step={1e6} onChange={(v) => set({ xlRetention: v })} format={(v) => fmtKes(v, 0)} />
      </Field>
      <Field label="Cat XL maximum (limit)" hint="Most the Cat XL pays per event">
        <Slider value={s.xlLimit} min={0} max={80e6} step={1e6} onChange={(v) => set({ xlLimit: v })} format={(v) => fmtKes(v, 0)} />
      </Field>
    </div>
  );
}

export const termsSummary = (s: Settings) =>
  `${fmtPct(s.deductiblePct, 1)} deductible · ${fmtPct(s.limitPct, 0)} limit · ${fmtPct(s.qsCession, 0)} quota share · Cat XL ${fmtKes(s.xlLimit, 0)} xs ${fmtKes(s.xlRetention, 0)}`;

function HeadTerm({ term, sign }: { term: keyof typeof TERMS; sign?: string }) {
  return (
    <span title={TERMS[term].def} className="cursor-help border-b border-dotted border-slate-300">
      {sign && <span className="mr-0.5 text-slate-400">{sign}</span>}
      {TERMS[term].label.replace("Cat excess of loss", "Cat XL")}
    </span>
  );
}

/** Ground-up → deductible → limit → gross → quota share → Cat XL → net, for each return period. */
export function WaterfallTable({
  rows,
  tiv,
  highlight = 100,
  onSelect,
}: {
  rows: (Waterfall & { interpolated?: boolean })[];
  tiv: number;
  highlight?: number;
  /** Called with the row's return period; interpolated rows are not selectable. */
  onSelect?: (rp: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px]">
        <thead className="bg-slate-50">
          <tr>
            <Th>Flood event</Th>
            <Th right>Annual chance</Th>
            <Th right><HeadTerm term="groundUp" /></Th>
            <Th right><HeadTerm term="deductible" sign="−" /></Th>
            <Th right><span title="Ground-up loss above the policy limit — stays with the building owner" className="cursor-help border-b border-dotted border-slate-300"><span className="mr-0.5 text-slate-400">−</span>Above limit</span></Th>
            <Th right><HeadTerm term="gross" sign="=" /></Th>
            <Th right><HeadTerm term="qs" sign="−" /></Th>
            <Th right><HeadTerm term="xl" sign="−" /></Th>
            <Th right><HeadTerm term="net" sign="=" /></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={r.rp}
              onClick={onSelect && !r.interpolated ? () => onSelect(r.rp) : undefined}
              className={cx(r.rp === highlight && "bg-river-50/70", onSelect && !r.interpolated && "cursor-pointer hover:bg-slate-50")}
            >
              <Td>
                <span className="font-medium">{rpLabel(r.rp)}</span>
                {r.interpolated && <span className="ml-1.5 text-[10px] text-slate-400">interpolated</span>}
              </Td>
              <Td right className="text-slate-500">{(100 / r.rp).toFixed(r.rp > 100 ? 2 : 0)}%</Td>
              <Td right>
                {fmtKes(r.groundUp)}
                <div className="text-[10px] text-slate-400">{tiv ? fmtPct(r.groundUp / tiv, 1) : "—"} of value</div>
              </Td>
              <Td right className="text-slate-500">{fmtKes(r.deductible)}</Td>
              <Td right className="text-slate-500">{fmtKes(r.aboveLimit)}</Td>
              <Td right className="font-semibold">{fmtKes(r.gross)}</Td>
              <Td right className="text-slate-500">{fmtKes(r.qsCeded)}</Td>
              <Td right className="text-slate-500">{fmtKes(r.xlCeded)}</Td>
              <Td right className="font-semibold text-red-700">{fmtKes(r.net)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One event, drawn as floating bars: who ends up paying for the flood. */
export function WaterfallBars({ w }: { w: Waterfall }) {
  const total = Math.max(w.groundUp, 1);
  const steps: { label: string; term?: keyof typeof TERMS; value: number; start: number; kind: "total" | "minus" | "sub" }[] = [];
  let level = w.groundUp;
  steps.push({ label: TERMS.groundUp.label, term: "groundUp", value: w.groundUp, start: 0, kind: "total" });
  level -= w.deductible;
  steps.push({ label: "Deductible — paid by owners", term: "deductible", value: w.deductible, start: level, kind: "minus" });
  level -= w.aboveLimit;
  steps.push({ label: "Above limit — paid by owners", term: "limit", value: w.aboveLimit, start: level, kind: "minus" });
  steps.push({ label: TERMS.gross.label + " (insurer)", term: "gross", value: w.gross, start: 0, kind: "sub" });
  level = w.gross - w.qsCeded;
  steps.push({ label: "Quota share — paid by reinsurer", term: "qs", value: w.qsCeded, start: level, kind: "minus" });
  level -= w.xlCeded;
  steps.push({ label: "Cat XL — paid by reinsurer", term: "xl", value: w.xlCeded, start: level, kind: "minus" });
  steps.push({ label: TERMS.net.label + " (insurer keeps)", term: "net", value: w.net, start: 0, kind: "sub" });
  return (
    <div className="space-y-1.5">
      {steps.map((st) => (
        <div key={st.label} className="grid grid-cols-[minmax(150px,210px)_1fr_90px] items-center gap-3 text-xs" title={st.term ? TERMS[st.term].def : undefined}>
          <span className={cx("truncate", st.kind === "minus" ? "pl-3 text-slate-500" : "font-semibold text-ink")}>{st.label}</span>
          <div className="relative h-5 rounded bg-slate-50">
            <div
              className={cx(
                "absolute inset-y-0 rounded",
                st.kind === "total" ? "bg-river" : st.kind === "sub" ? (st.term === "net" ? "bg-red-600" : "bg-lake") : "bg-slate-300",
              )}
              style={{ left: `${(100 * st.start) / total}%`, width: `${Math.max((100 * st.value) / total, st.value > 0 ? 0.6 : 0)}%` }}
            />
          </div>
          <span className={cx("num text-right", st.kind === "minus" ? "text-slate-500" : "font-semibold")}>
            {st.kind === "minus" && st.value > 0 ? "−" : ""}
            {fmtKes(st.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TermsGlossary() {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {Object.values(TERMS).map((t) => (
        <div key={t.label}>
          <dt className="font-semibold text-ink">{t.label}</dt>
          <dd className="text-slate-600">{t.def}</dd>
        </div>
      ))}
    </dl>
  );
}
