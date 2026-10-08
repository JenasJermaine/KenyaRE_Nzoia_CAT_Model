"use client";

import { fmtKes, fmtPct } from "@/lib/format";
import type { ExpandedGroup } from "@/lib/geo";
import { groupLabel } from "@/lib/offer";
import { HOUSING_CLASSES, type IngestGroup, type IngestResponse, type VulnerabilityData } from "@/lib/types";
import { Callout, cx, Td, Th } from "../ui";

type Source = "doc" | "ai" | "derived" | "default" | "none";

const SOURCE: Record<Source, { label: string; cls: string; tip: string }> = {
  doc: { label: "from document", cls: "bg-teal-50 text-real ring-teal-200", tip: "Stated in the submitted text; the AI only transcribed it" },
  ai: { label: "AI judgement", cls: "bg-river-50 text-ai ring-river-100", tip: "Inferred by the AI from the description — see its reasoning" },
  derived: { label: "calculated", cls: "bg-sky-50 text-sky-800 ring-sky-200", tip: "Calculated from another stated value using the class's cost per m²" },
  default: { label: "model default", cls: "bg-violet-50 text-assumption ring-violet-200", tip: "Not in the text; the CAT model applied a documented default" },
  none: { label: "not stated", cls: "bg-slate-50 text-slate-500 ring-slate-200", tip: "Not mentioned in the text" },
};

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function Src({ s }: { s: Source }) {
  return <span title={SOURCE[s].tip} className={cx("mt-0.5 inline-block rounded px-1.5 py-px text-[10px] font-medium ring-1 ring-inset", SOURCE[s].cls)}>{SOURCE[s].label}</span>;
}

export function ExtractedBuildings({
  resp,
  groups,
  expanded,
  v,
  selected,
  onSelect,
  onChange,
}: {
  resp: IngestResponse;
  groups: IngestGroup[];
  expanded: ExpandedGroup[];
  v: VulnerabilityData;
  selected: number;
  onSelect: (i: number) => void;
  onChange: (i: number, patch: Partial<IngestGroup>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cx("rounded-full px-2.5 py-1 font-medium ring-1 ring-inset", resp.mode === "llm" ? "bg-river-50 text-ai ring-river-100" : "bg-violet-50 text-assumption ring-violet-200")}>
          {resp.mode === "llm" ? `Extracted by ${resp.model}` : "Keyword parser (no AI)"}
        </span>
        <span className="text-slate-500">
          {groups.length} building group(s) → {expanded.reduce((a, e) => a + e.buildings.length, 0)} buildings. Edit anything before pricing — every number below updates.
        </span>
        <span className="ml-auto flex flex-wrap gap-1">
          {(["doc", "ai", "derived", "default"] as Source[]).map((s) => (
            <Src key={s} s={s} />
          ))}
        </span>
      </div>

      {expanded.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-ink">Where the buildings were placed:</span>
          {(
            [
              ["coordinates", "on stated coordinates (exact, or within 50 m for multi-building sites)", "text-real"],
              ["place", "around a town centre — approximate (±2–3 km), scattered or snapped to the river corridor", "text-amber-700"],
              ["default", "no location found — defaulted to Budalangi", "text-red-700"],
            ] as const
          ).map(([kind, label, cls]) => {
            const n = expanded.filter((e) => e.anchorKind === kind).length;
            return n ? (
              <span key={kind} className={cls}>
                <b>{n}</b> group{n > 1 ? "s" : ""} {label}
              </span>
            ) : null;
          })}
        </div>
      )}

      {resp.warnings.length > 0 && (
        <Callout tone="warn" title="Notes from the extraction">
          <ul className="list-disc pl-4">
            {resp.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">No insurable buildings were found in this text.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[1120px]">
            <thead className="bg-slate-50">
              <tr>
                <Th>Building & evidence</Th>
                <Th>Construction</Th>
                <Th right>Count</Th>
                <Th right>Floor area</Th>
                <Th right>Value each</Th>
                <Th right>Raised floor</Th>
                <Th>Latitude / longitude</Th>
                <Th>Location</Th>
                <Th right>AI confidence</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {groups.map((g, i) => {
                const e = expanded[i];
                const b = e?.buildings[0];
                const areaSrc: Source = g.floor_area_m2 ? "doc" : g.tiv_kes_each ? "derived" : "default";
                const valueSrc: Source = g.tiv_kes_each ? "doc" : g.floor_area_m2 ? "derived" : "default";
                const locSrc: Source = e?.anchorKind === "coordinates" ? "doc" : e?.anchorKind === "place" ? "ai" : "default";
                return (
                  <tr key={i} onClick={() => onSelect(i)} className={cx("cursor-pointer transition", selected === i ? "bg-river-50/70" : "hover:bg-slate-50")}>
                    <Td className="max-w-[320px]">
                      <div className="font-semibold text-ink">{groupLabel(g, i)}</div>
                      <div className="mt-0.5 text-[12px] italic text-slate-600">&ldquo;{g.evidence}&rdquo;</div>
                      {(g.assumptions.length > 0 || (e?.derived.length ?? 0) > 0) && (
                        <details className="mt-1 text-[11px]" onClick={(ev) => ev.stopPropagation()}>
                          <summary className="cursor-pointer text-ai">Why the AI decided this ({g.assumptions.length + (e?.derived.length ?? 0)})</summary>
                          <ul className="mt-1 list-disc pl-4 text-slate-600">
                            {g.assumptions.map((a, k) => (
                              <li key={`a${k}`}>{a}</li>
                            ))}
                            {e?.derived.map((a, k) => (
                              <li key={`d${k}`} className="text-assumption">{a}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </Td>
                    <Td>
                      <select
                        value={g.housing_class}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => onChange(i, { housing_class: ev.target.value as IngestGroup["housing_class"] })}
                        className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                      >
                        {HOUSING_CLASSES.map((c) => (
                          <option key={c} value={c}>{v.classLabels[c]}</option>
                        ))}
                      </select>
                      <div><Src s="ai" /></div>
                    </Td>
                    <Td right>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={g.count}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => onChange(i, { count: Math.max(1, Math.min(500, parseInt(ev.target.value || "1", 10))) })}
                        className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right text-xs"
                      />
                    </Td>
                    <Td right className="text-xs">
                      {b ? `${b.floorArea.toLocaleString()} m²` : "—"}
                      <div><Src s={areaSrc} /></div>
                    </Td>
                    <Td right className="text-xs">
                      {b ? fmtKes(b.tiv) : "—"}
                      <div><Src s={valueSrc} /></div>
                    </Td>
                    <Td right>
                      <input
                        type="number"
                        min={0}
                        max={3}
                        step={0.1}
                        value={g.plinth_m}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => onChange(i, { plinth_m: Math.max(0, Math.min(3, parseFloat(ev.target.value || "0"))) })}
                        className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right text-xs"
                      />
                      <div><Src s={g.plinth_m > 0 ? "doc" : "none"} /></div>
                    </Td>
                    <Td className="text-xs">
                      <div className="flex flex-col gap-1" onClick={(ev) => ev.stopPropagation()}>
                        {(["lat", "lon"] as const).map((k) => (
                          <label key={k} className="flex items-center gap-1">
                            <span className="w-7 text-[10px] uppercase text-slate-400">{k}</span>
                            <input
                              type="number"
                              step={0.0001}
                              value={g[k] ?? ""}
                              placeholder={e ? e.anchor[k].toFixed(4) : ""}
                              onChange={(ev) => onChange(i, { [k]: ev.target.value === "" ? null : parseFloat(ev.target.value) })}
                              className="w-24 rounded border border-slate-200 px-1.5 py-1 text-right text-xs placeholder:text-slate-300"
                            />
                          </label>
                        ))}
                        {g.lat != null || g.lon != null ? (
                          <button type="button" onClick={() => onChange(i, { lat: null, lon: null })} className="self-start text-[10px] text-river hover:underline">
                            clear → use town
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">grey = town centre</span>
                        )}
                      </div>
                    </Td>
                    <Td className="max-w-[240px] text-xs">
                      <div className="font-medium">{e?.placeUsed ?? "—"}</div>
                      <div className="text-[11px] text-slate-500">{e?.locationMethod}</div>
                      {e && (
                        <div className={cx("mt-0.5 text-[11px]", e.anchorKind === "coordinates" ? "text-real" : "text-amber-700")}>
                          {e.maxMoveM < 1
                            ? "exactly at the point shown"
                            : `placed ${fmtDist(e.meanMoveM)} on average (max ${fmtDist(e.maxMoveM)}) from the point shown`}
                        </div>
                      )}
                      <label
                        className={cx("mt-1 flex items-center gap-1 text-[11px]", e?.anchorKind === "coordinates" ? "text-slate-400" : "text-slate-600")}
                        onClick={(ev) => ev.stopPropagation()}
                        title={e?.anchorKind === "coordinates" ? "Ignored when coordinates are stated — the site's own flood cell decides" : "Moves buildings onto the nearest 1-in-10 flood cells within 10 km"}
                      >
                        <input type="checkbox" checked={g.near_river} onChange={(ev) => onChange(i, { near_river: ev.target.checked })} /> by the river
                      </label>
                      <Src s={locSrc} />
                    </Td>
                    <Td right className="text-xs">
                      <span className={g.confidence < 0.5 ? "font-semibold text-amber-700" : undefined}>{fmtPct(g.confidence, 0)}</span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
