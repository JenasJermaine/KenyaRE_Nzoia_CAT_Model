"use client";

import { TermsEditor } from "./finance";
import { useModel } from "./ModelProvider";
import { Badge, Field, Segmented, Slider } from "./ui";

export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const { settings: s, updateSettings: set, resetSettings, ingested } = useModel();
  return (
    <div className={compact ? "space-y-4" : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"}>
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Physical model <Badge kind="assumption" />
        </h3>
        <Field label="Vulnerability model" hint="ML = trained gradient-boosted model; JRC = plain adapted curve (no AI)">
          <Segmented
            value={s.vulnModel}
            onChange={(v) => set({ vulnModel: v })}
            options={[
              { value: "ml", label: "ML (trained)" },
              { value: "jrc", label: "JRC baseline" },
            ]}
          />
        </Field>
        <Field label="Hazard sampling" hint="Point = containing 925 m cell; bilinear = blend of 4 nearest cells">
          <Segmented
            value={s.hazardMode}
            onChange={(v) => set({ hazardMode: v })}
            options={[
              { value: "point", label: "Point cell" },
              { value: "bilinear", label: "Bilinear" },
            ]}
          />
        </Field>
        <Field label="Flood duration" hint="Budalangi floods typically stand for days to weeks (ML only)">
          <Segmented
            value={s.duration}
            onChange={(v) => set({ duration: v })}
            options={[
              { value: 2, label: "2 days" },
              { value: 7, label: "7 days" },
              { value: 21, label: "21 days" },
            ]}
          />
        </Field>
      </div>
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Policy & reinsurance terms <Badge kind="assumption" />
        </h3>
        <TermsEditor columns={2} />
      </div>
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Stochastic engine & portfolio
        </h3>
        <Field label="Damage correlation between buildings (ρ)" hint="Shared flood wave, duration and debris load in one event">
          <Slider value={s.rho} min={0} max={0.9} step={0.05} onChange={(v) => set({ rho: v })} format={(v) => v.toFixed(2)} />
        </Field>
        <Field label="Simulated years">
          <Segmented
            value={s.mcYears}
            onChange={(v) => set({ mcYears: v })}
            options={[
              { value: 10000, label: "10k" },
              { value: 20000, label: "20k" },
              { value: 50000, label: "50k" },
            ]}
          />
        </Field>
        <Field label={`AI-ingested buildings (${ingested.length})`} hint="Include offers accepted on the Underwriting desk">
          <Segmented
            value={s.includeIngested ? "on" : "off"}
            onChange={(v) => set({ includeIngested: v === "on" })}
            options={[
              { value: "on", label: "Included" },
              { value: "off", label: "Excluded" },
            ]}
          />
        </Field>
        <button
          type="button"
          onClick={resetSettings}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Reset to notebook defaults
        </button>
      </div>
    </div>
  );
}
