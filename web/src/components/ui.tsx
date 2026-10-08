import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border border-slate-200 bg-white shadow-[0_5px_18px_rgba(4,29,59,0.055)]", className)}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  right,
  badges,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {badges}
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("px-5 py-4", className)}>{children}</div>;
}

export type Provenance = "real" | "synthetic" | "assumption" | "ai" | "derived";

const PROV: Record<Provenance, { label: string; cls: string; tip: string }> = {
  real: { label: "Real data", cls: "bg-teal-50 text-real ring-teal-200", tip: "Measured/modelled by an external organisation (JRC)" },
  synthetic: { label: "Synthetic", cls: "bg-amber-50 text-synthetic ring-amber-200", tip: "Generated for this hackathon — not a real portfolio" },
  assumption: { label: "Assumption", cls: "bg-violet-50 text-assumption ring-violet-200", tip: "Modelling judgement, documented in the assumptions register" },
  ai: { label: "AI / ML", cls: "bg-river-50 text-ai ring-river-100", tip: "Produced or changed by the ML model or the LLM" },
  derived: { label: "Model output", cls: "bg-sky-50 text-river ring-sky-200", tip: "Computed by the CAT model from the inputs above" },
};

export function Badge({ kind, children }: { kind: Provenance; children?: ReactNode }) {
  const p = PROV[kind];
  return (
    <span
      title={p.tip}
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", p.cls)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children ?? p.label}
    </span>
  );
}

export function Kpi({
  label,
  value,
  sub,
  badge,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex flex-col justify-between rounded-xl border p-4 shadow-[0_4px_14px_rgba(4,29,59,0.05)]",
        accent ? "border-river/30 bg-gradient-to-br from-river to-lake text-white" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cx("text-xs font-medium uppercase tracking-wide", accent ? "text-white/75" : "text-slate-500")}>
          {label}
        </span>
        {badge}
      </div>
      <div className={cx("num mt-2 text-2xl font-semibold tracking-tight", accent ? "text-white" : "text-ink")}>{value}</div>
      {sub && <div className={cx("mt-1 text-xs", accent ? "text-white/75" : "text-slate-500")}>{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-medium transition",
            size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
            o.value === value ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <span className="num w-20 shrink-0 text-right text-sm font-medium text-ink">{format(value)}</span>
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "ai";
  title?: ReactNode;
  children: ReactNode;
}) {
  const t = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    ai: "border-river-100 bg-river-50 text-ai",
  }[tone];
  return (
    <div className={cx("rounded-lg border px-4 py-3 text-sm", t)}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function PageHeader({ title, lead, right }: { title: ReactNode; lead?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <div className="mb-2 h-1 w-12 bg-river" />
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {lead && <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{lead}</p>}
      </div>
      {right}
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th className={cx("px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

export function Td({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={cx("num px-3 py-2 text-sm", right ? "whitespace-nowrap text-right" : "text-left", className)}>{children}</td>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-500">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-river" />
      {label}
    </span>
  );
}
