"use client";

import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey, type Instance, type LimeResult, type ShapResult } from "@/lib/explain";
import { fmtKes, fmtPct } from "@/lib/format";
import type { ExplainData, HousingClass } from "@/lib/types";
import { cx } from "./ui";

const pp = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)} pp`;
const kes = (v: number) => `${v >= 0 ? "+" : "−"}${fmtKes(Math.abs(v))}`;

/** SHAP waterfall: from the typical flooded building's damage ratio to this building's, one feature at a time. */
export function ShapWaterfall({
  shap,
  x,
  typical,
  tiv,
  classLabels,
}: {
  shap: ShapResult;
  x: Instance;
  typical: { depth: number; quality: number };
  tiv: number;
  classLabels: Record<HousingClass, string>;
}) {
  const order = [...FEATURE_KEYS].sort((a, b) => Math.abs(shap.phi[b]) - Math.abs(shap.phi[a]));
  const steps = order.reduce<{ k: FeatureKey; start: number; end: number }[]>((acc, k) => {
    const start = acc.length ? acc[acc.length - 1].end : shap.base;
    return [...acc, { k, start, end: start + shap.phi[k] }];
  }, []);
  const hi = Math.max(shap.base, shap.value, ...steps.map((s) => Math.max(s.start, s.end)), 0.05);
  const pos = (v: number) => `${(100 * Math.max(0, v)) / hi}%`;
  const valueText: Record<FeatureKey, string> = {
    depth: `${x.depth.toFixed(2)} m (typical ${typical.depth.toFixed(2)} m)`,
    plinth: x.plinth > 0 ? `${x.plinth.toFixed(2)} m above ground` : "none stated",
    cls: classLabels[x.cls],
    quality: `${x.quality.toFixed(2)} (typical ${typical.quality.toFixed(2)})`,
  };
  return (
    <div className="space-y-2">
      <Row label="Typical flooded building in the Nzoia book" sub="SHAP baseline" value={fmtPct(shap.base, 1)} bar={{ left: "0%", width: pos(shap.base), cls: "bg-slate-400" }} />
      {steps.map((s) => {
        const up = s.end >= s.start;
        return (
          <Row
            key={s.k}
            label={FEATURE_LABELS[s.k]}
            sub={valueText[s.k]}
            value={
              <>
                <span className={up ? "text-red-700" : "text-emerald-700"}>{pp(shap.phi[s.k])}</span>
                <span className="block text-[10px] text-slate-400">{kes(shap.phi[s.k] * tiv)}</span>
              </>
            }
            bar={{ left: pos(Math.min(s.start, s.end)), width: `${(100 * Math.abs(s.end - s.start)) / hi}%`, cls: up ? "bg-red-500" : "bg-emerald-500" }}
          />
        );
      })}
      <Row label="This building" sub="model damage ratio" value={<b>{fmtPct(shap.value, 1)}</b>} bar={{ left: "0%", width: pos(shap.value), cls: "bg-river" }} strong />
    </div>
  );
}

function Row({
  label,
  sub,
  value,
  bar,
  strong,
}: {
  label: string;
  sub: string;
  value: React.ReactNode;
  bar: { left: string; width: string; cls: string };
  strong?: boolean;
}) {
  return (
    <div className={cx("grid grid-cols-[minmax(160px,230px)_1fr_80px] items-center gap-3 text-xs", strong && "border-t border-slate-100 pt-2")}>
      <div className="min-w-0">
        <div className={cx("truncate", strong ? "font-semibold text-ink" : "font-medium text-slate-700")}>{label}</div>
        <div className="truncate text-[11px] text-slate-400">{sub}</div>
      </div>
      <div className="relative h-5 rounded bg-slate-50">
        <div className={cx("absolute inset-y-0 rounded", bar.cls)} style={{ left: bar.left, width: bar.width, minWidth: 2 }} />
      </div>
      <div className="num text-right">{value}</div>
    </div>
  );
}

/** LIME-style local surrogate, presented as "what if" levers an underwriter can act on. */
export function LimeLevers({ lime, tiv, x, className }: { lime: LimeResult; tiv: number; x: Instance; className: string }) {
  const items = [
    { k: "Water 10 cm deeper", v: lime.perMetreDepth * 0.1, hint: "sensitivity to hazard uncertainty" },
    { k: "Floor raised 10 cm more", v: lime.perMetrePlinth * 0.1, hint: x.plinth > 0 ? "on top of the stated raise" : "mitigation lever" },
    { k: "Build quality +0.1", v: lime.perTenthQuality, hint: "better materials / maintenance" },
    { k: `${className} vs other classes`, v: lime.classEffect, hint: "same water, different construction" },
  ];
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.k} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="text-[11px] text-slate-500">{it.k}</div>
            <div className={cx("num text-sm font-semibold", Math.abs(it.v) < 0.001 ? "text-slate-500" : it.v > 0 ? "text-red-700" : "text-emerald-700")}>
              {pp(it.v)} <span className="text-xs font-normal text-slate-500">· {kes(it.v * tiv)}</span>
            </div>
            <div className="text-[10px] text-slate-400">{it.hint}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Local linear surrogate fitted to {lime.samples} perturbations around this building (kernel-weighted). Fidelity R² ={" "}
        <b className={lime.fidelity < 0.6 ? "text-amber-700" : "text-slate-700"}>{lime.fidelity.toFixed(2)}</b>
        {lime.fidelity < 0.6 ? " — the model is strongly non-linear here, so treat these slopes as rough." : "."}
      </p>
    </div>
  );
}

const FEATURE_ORDER_COLORS = ["#041d3b", "#d11242", "#f3a712", "#0f766e"];

/** Global SHAP: mean |SHAP| bars and a beeswarm, from notebooks/explain_shap.py. */
export function GlobalShap({ explain, classColors, classLabels }: { explain: ExplainData; classColors: Record<HousingClass, string>; classLabels: Record<HousingClass, string> }) {
  const max = Math.max(...explain.features.map((f) => f.meanAbsShap));
  const shapMax = Math.max(...explain.beeswarm.map((b) => Math.abs(b.shap)), 0.01);
  const W = 520;
  const rowH = 46;
  const H = explain.features.length * rowH + 24;
  const x = (s: number) => 150 + ((s + shapMax) / (2 * shapMax)) * (W - 165);
  const classes = Object.keys(classLabels) as HousingClass[];
  const jitter = (i: number) => (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * (rowH * 0.6);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What drives damage overall (mean |SHAP|)</div>
        <div className="space-y-2">
          {explain.features.map((f, i) => (
            <div key={f.key} className="grid grid-cols-[150px_1fr_56px] items-center gap-2 text-xs">
              <span className="text-slate-700">{f.label}</span>
              <div className="h-4 rounded bg-slate-50">
                <div className="h-4 rounded" style={{ width: `${(100 * f.meanAbsShap) / max}%`, background: FEATURE_ORDER_COLORS[i % 4] }} />
              </div>
              <span className="num text-right font-medium">{(f.meanAbsShap * 100).toFixed(1)} pp</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Average absolute change in damage ratio each feature causes, over {explain.explained.n.toLocaleString()} flooded pseudo-claims against a{" "}
          {explain.background.n}-claim background (baseline damage {fmtPct(explain.baseValue, 1)}). {explain.library}, {explain.method}; additivity error{" "}
          {explain.additivityMaxError.toExponential(1)}.
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Every dot is one claim — right = more damage</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <line x1={x(0)} x2={x(0)} y1={4} y2={H - 18} stroke="#cbd5e1" strokeDasharray="3 3" />
          {explain.features.map((f, r) => {
            const pts = explain.beeswarm.filter((b) => b.f === f.key);
            const cy = 14 + r * rowH + rowH / 2;
            return (
              <g key={f.key}>
                <text x={0} y={cy + 4} fontSize={11} fill="#334155">{f.label}</text>
                {pts.map((p, i) => (
                  <circle
                    key={i}
                    cx={x(p.shap)}
                    cy={cy + jitter(i)}
                    r={2.2}
                    fill={f.key === "cls" ? classColors[classes[Math.round(p.raw)]] : `hsl(${220 - 220 * p.v}, 75%, 50%)`}
                    opacity={0.75}
                  />
                ))}
              </g>
            );
          })}
          <text x={x(-shapMax)} y={H - 4} fontSize={10} fill="#64748b">{pp(-shapMax, 0)}</text>
          <text x={x(0) - 8} y={H - 4} fontSize={10} fill="#64748b">0</text>
          <text x={x(shapMax) - 36} y={H - 4} fontSize={10} fill="#64748b">{pp(shapMax, 0)}</text>
        </svg>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            Feature value: <span className="h-2 w-16 rounded" style={{ background: "linear-gradient(90deg,hsl(220,75%,50%),hsl(110,75%,50%),hsl(0,75%,50%))" }} /> low → high
          </span>
          {classes.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: classColors[c] }} />
              {classLabels[c]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
