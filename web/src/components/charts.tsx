"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtKes, rpLabel } from "@/lib/format";
import { KRE } from "@/lib/palette";
import type { HousingClass } from "@/lib/types";

const RP_TICKS = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const mTick = (v: number) => `${(v / 1e6).toFixed(0)}M`;

export interface EpSeries {
  key: string;
  label: string;
  color: string;
  data: { rp: number; loss: number }[];
  dashed?: boolean;
  width?: number;
}

function EpTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; color: string; payload: { rp: number } }[] }) {
  if (!active || !payload?.length) return null;
  const rp = payload[0].payload.rp;
  return (
    <div className="border border-slate-200 bg-white px-3 py-2 text-xs">
      <div className="mb-1 font-semibold text-ink">
        {rpLabel(rp)} year · {(100 / rp).toFixed(rp > 100 ? 2 : 1)}% annual chance
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="num font-medium">{fmtKes(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function EpChart({
  series,
  points,
  height = 340,
  markRp,
}: {
  series: EpSeries[];
  points?: { rp: number; loss: number }[];
  height?: number;
  markRp?: number[];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart margin={{ top: 10, right: 20, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="rp"
          type="number"
          scale="log"
          domain={[2, 2000]}
          ticks={RP_TICKS}
          allowDataOverflow
          tickFormatter={(v: number) => `${v}`}
          label={{ value: "Return period (years) — rarer →", position: "insideBottom", offset: -14, fontSize: 12, fill: "#64748b" }}
          tick={{ fontSize: 11, fill: "#64748b" }}
        />
        <YAxis
          tickFormatter={mTick}
          tick={{ fontSize: 11, fill: "#64748b" }}
          width={52}
          label={{ value: "Loss (KES)", angle: -90, position: "insideLeft", fontSize: 12, fill: "#64748b" }}
        />
        <Tooltip content={<EpTooltip />} />
        <Legend verticalAlign="top" height={30} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        {markRp?.map((r) => (
          <ReferenceLine key={r} x={r} stroke="#94a3b8" strokeDasharray="2 4" label={{ value: rpLabel(r), position: "insideBottomRight", fontSize: 10, fill: "#64748b" }} />
        ))}
        {series.map((s) => (
          <Line
            key={s.key}
            data={s.data}
            dataKey="loss"
            name={s.label}
            stroke={s.color}
            strokeWidth={s.width ?? 2}
            strokeDasharray={s.dashed ? "6 4" : undefined}
            dot={false}
            isAnimationActive={false}
            type="monotone"
          />
        ))}
        {points && (
          <Scatter data={points} dataKey="loss" name="JRC map return periods" fill="#041d3b" isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ClassBars({
  rows,
  labels,
  colors,
  height = 260,
  rp = 100,
}: {
  rows: { cls: HousingClass; loss: number; tivWet: number }[];
  labels: Record<HousingClass, string>;
  colors: Record<HousingClass, string>;
  height?: number;
  rp?: number;
}) {
  const data = rows.map((r) => ({ name: labels[r.cls], loss: r.loss, tivWet: r.tivWet, color: colors[r.cls] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tickFormatter={mTick} tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: "#334155" }} />
        <Tooltip formatter={(v) => fmtKes(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="tivWet" name={`Insured value in ${rpLabel(rp)} footprint`} fill="#cbd5e1" radius={[0, 3, 3, 0]} isAnimationActive={false} />
        <Bar dataKey="loss" name={`${rpLabel(rp)} ground-up loss`} fill="#041d3b" radius={[0, 3, 3, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedClassByRp({
  rows,
  labels,
  colors,
  height = 300,
}: {
  rows: { rp: number; byClass: Record<HousingClass, number> }[];
  labels: Record<HousingClass, string>;
  colors: Record<HousingClass, string>;
  height?: number;
}) {
  const classes = Object.keys(labels) as HousingClass[];
  const data = rows.map((r) => ({ name: rpLabel(r.rp), ...r.byClass }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis tickFormatter={mTick} tick={{ fontSize: 11, fill: "#64748b" }} width={48} />
        <Tooltip formatter={(v) => fmtKes(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {classes.map((c) => (
          <Bar key={c} dataKey={c} name={labels[c]} stackId="a" fill={colors[c]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TermsWaterfall({
  rows,
  height = 300,
}: {
  rows: { rp: number; gross: number; insured: number; qsCeded: number; xlCeded: number; net: number }[];
  height?: number;
}) {
  const data = rows.map((r) => ({
    name: rpLabel(r.rp),
    net: r.net,
    xl: r.xlCeded,
    qs: r.qsCeded,
    deductible: r.gross - r.insured,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis tickFormatter={mTick} tick={{ fontSize: 11, fill: "#64748b" }} width={48} />
        <Tooltip formatter={(v) => fmtKes(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="net" name="Net retained by cedant" stackId="a" fill={KRE.red} isAnimationActive={false} />
        <Bar dataKey="xl" name="Cat XL recovery" stackId="a" fill={KRE.navy} isAnimationActive={false} />
        <Bar dataKey="qs" name="Quota-share ceded" stackId="a" fill={KRE.navy300} isAnimationActive={false} />
        <Bar dataKey="deductible" name="Retained by policyholders (deductible)" stackId="a" fill={KRE.greyLight} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VulnChart({
  data,
  color,
  height = 260,
  showLegend = false,
}: {
  data: { depth: number; mean: number; band90: [number, number]; band50: [number, number]; jrc: number; jrcRaw?: number }[];
  color: string;
  height?: number;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 10, left: -10, bottom: 14 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="depth"
          type="number"
          domain={[0, 6]}
          ticks={[0, 1, 2, 3, 4, 5, 6]}
          tick={{ fontSize: 11, fill: "#64748b" }}
          label={{ value: "Flood depth (m)", position: "insideBottom", offset: -6, fontSize: 11, fill: "#64748b" }}
        />
        <YAxis domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "#64748b" }} />
        <Tooltip
          formatter={(v, name) =>
            Array.isArray(v) ? [`${(Number(v[0]) * 100).toFixed(0)}–${(Number(v[1]) * 100).toFixed(0)}%`, name] : [`${(Number(v) * 100).toFixed(1)}%`, name]
          }
          labelFormatter={(d) => `Depth ${Number(d).toFixed(2)} m`}
        />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        <Area dataKey="band90" name="ML 5–95% range" fill={color} fillOpacity={0.12} stroke="none" isAnimationActive={false} />
        <Area dataKey="band50" name="ML 25–75% range" fill={color} fillOpacity={0.28} stroke="none" isAnimationActive={false} />
        <Line dataKey="mean" name="ML mean" stroke={color} strokeWidth={2.4} dot={false} isAnimationActive={false} />
        <Line dataKey="jrc" name="Adapted JRC (no ML)" stroke="#0f172a" strokeDasharray="5 4" strokeWidth={1.4} dot={false} isAnimationActive={false} />
        {data[0]?.jrcRaw !== undefined && (
          <Line dataKey="jrcRaw" name="JRC Africa residential (source)" stroke="#94a3b8" strokeWidth={1} dot={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({
  data,
  height = 260,
  color = "#041d3b",
  valueLabel,
}: {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
  valueLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tickFormatter={mTick} tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "#334155" }} />
        <Tooltip formatter={(v) => fmtKes(Number(v))} />
        <Bar dataKey="value" name={valueLabel} fill={color} radius={[0, 3, 3, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
