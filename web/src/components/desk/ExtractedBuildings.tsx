"use client";

import { fmtKes, fmtPct } from "@/lib/format";
import type { ExpandedGroup } from "@/lib/geo";
import { groupLabel } from "@/lib/offer";
import type { PhotoItem } from "@/lib/photos";
import { CONDITIONS, HOUSING_CLASSES, type Condition, type IngestGroup, type IngestResponse, type PhotoField, type VulnerabilityData } from "@/lib/types";
import { Callout, cx, Td, Th } from "../ui";

type Source = "doc" | "photo" | "ai" | "derived" | "default" | "none";

const SOURCE: Record<Source, { label: string; cls: string; tip: string }> = {
  doc: { label: "from document", cls: "border-ink bg-white text-ink", tip: "Stated in the submitted text; the AI only transcribed it" },
  photo: { label: "from photo", cls: "border-ink bg-ink text-white", tip: "Not in the text; read by the AI from the attached building photos" },
  ai: { label: "AI judgement", cls: "border-river bg-river-50 text-ai", tip: "Inferred by the AI from the description — see its reasoning" },
  derived: { label: "calculated", cls: "border-navy-300 bg-navy-50 text-navy-500", tip: "Calculated from another stated value using the class's cost per m²" },
  default: { label: "model default", cls: "border-grey bg-paper text-grey", tip: "Not in the text; the CAT model applied a documented default" },
  none: { label: "not stated", cls: "border-slate-200 bg-white text-slate-400", tip: "Not mentioned in the text" },
};

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function Src({ s }: { s: Source }) {
  return <span title={SOURCE[s].tip} className={cx("mt-1 inline-block border-l-[3px] px-1.5 py-px text-[10px] font-medium", SOURCE[s].cls)}>{SOURCE[s].label}</span>;
}

const fromPhoto = (g: IngestGroup, f: PhotoField) => Boolean(g.photo?.fields.includes(f));
/** An underwriter edit replaces the photo reading, so that value stops being tagged "from photo". */
const editPhotoField = (g: IngestGroup, f: PhotoField): Partial<IngestGroup> =>
  g.photo ? { photo: { ...g.photo, fields: g.photo.fields.filter((x) => x !== f) } } : {};

export function ExtractedBuildings({
  resp,
  groups,
  expanded,
  photos,
  v,
  selected,
  onSelect,
  onChange,
}: {
  resp: IngestResponse;
  groups: IngestGroup[];
  expanded: ExpandedGroup[];
  /** Photos in the order they were sent, so photo refs index into this list. */
  photos: PhotoItem[];
  v: VulnerabilityData;
  selected: number;
  onSelect: (i: number) => void;
  onChange: (i: number, patch: Partial<IngestGroup>) => void;
}) {
  const photoGroups = groups.filter((g) => g.photo).length;
  const conflicts = groups.reduce((a, g) => a + (g.photo?.conflicts.length ?? 0), 0);
  const notes = resp.warnings.filter((warning) => !warning.startsWith("The AI extractor could not be used."));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cx("border-l-[3px] px-2 py-1 font-medium", resp.mode === "llm" ? "border-river bg-river-50 text-ai" : "border-grey bg-paper text-grey")}>
          {resp.mode === "llm" ? `Extracted by ${resp.model}` : "Keyword parser (no AI)"}
        </span>
        <span className="text-grey">
          {groups.length} building group(s) → {expanded.reduce((a, e) => a + e.buildings.length, 0)} buildings. Edit anything before pricing — every number below updates.
        </span>
        <span className="ml-auto flex flex-wrap gap-1">
          {(["doc", "photo", "ai", "derived", "default"] as Source[]).map((s) => (
            <Src key={s} s={s} />
          ))}
        </span>
      </div>

      {(resp.photos?.sent ?? 0) > 0 && (
        <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 border-l-4 px-3 py-2 text-xs", conflicts ? "border-river bg-river-50" : "border-ink bg-navy-50")}>
          <span className="font-semibold text-ink">Site photos:</span>
          {resp.photos?.read ? (
            <>
              <span className="text-ink">
                <b>{resp.photos.sent}</b> read by the AI, used for <b>{photoGroups}</b> of {groups.length} group{groups.length > 1 ? "s" : ""}
              </span>
              {conflicts > 0 ? (
                <span className="font-semibold text-ai">
                  {conflicts} disagreement{conflicts > 1 ? "s" : ""} with the document. The document&apos;s value was kept; verify before binding.
                </span>
              ) : (
                <span className="text-ink">no disagreement with the document</span>
              )}
            </>
          ) : (
            <span className="text-ai">{resp.photos?.sent} not read: the keyword parser cannot read images.</span>
          )}
        </div>
      )}

      {expanded.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-l-4 border-slate-300 bg-paper px-3 py-2 text-xs text-grey">
          <span className="font-semibold text-ink">Where the buildings were placed:</span>
          {(
            [
              ["coordinates", "on stated coordinates (exact, or within 50 m for multi-building sites)", "text-ink"],
              ["place", "around a town centre — approximate (±2–3 km), scattered or snapped to the river corridor", "text-grey"],
              ["default", "no location found — defaulted to Budalangi", "text-ai font-medium"],
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

      {notes.length > 0 && (
        <Callout tone="warn" title="Notes from the extraction">
          <ul className="list-disc pl-4">
            {notes.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-grey">No insurable buildings were found in this text.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200">
          <table className="w-full min-w-[1220px]">
            <thead className="bg-white">
              <tr>
                <Th>Building & evidence</Th>
                <Th>Construction</Th>
                <Th right>Count</Th>
                <Th right>Floor area</Th>
                <Th right>Value each</Th>
                <Th right>Raised floor</Th>
                <Th>Condition</Th>
                <Th>Latitude / longitude</Th>
                <Th>Location</Th>
                <Th right>AI confidence</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 align-top">
              {groups.map((g, i) => {
                const e = expanded[i];
                const b = e?.buildings[0];
                const areaSrc: Source = g.floor_area_m2 ? "doc" : g.tiv_kes_each ? "derived" : "default";
                const valueSrc: Source = g.tiv_kes_each ? "doc" : g.floor_area_m2 ? "derived" : "default";
                const locSrc: Source = e?.anchorKind === "coordinates" ? "doc" : e?.anchorKind === "place" ? "ai" : "default";
                const groupPhotos = (g.photo?.refs ?? []).map((r) => ({ r, p: photos[r - 1] })).filter((x) => x.p);
                return (
                  <tr
                    key={i}
                    onClick={() => onSelect(i)}
                    className={cx("cursor-pointer transition", selected === i ? "bg-navy-50 shadow-[inset_4px_0_0_#041d3b]" : "hover:bg-paper")}
                  >
                    <Td className="max-w-[340px]">
                      <div className="font-semibold text-ink">{groupLabel(g, i)}</div>
                      <div className="mt-0.5 text-[12px] italic text-grey">&ldquo;{g.evidence}&rdquo;</div>
                      {g.photo && (
                        <div className="mt-2 border-l-[3px] border-ink bg-white px-2 py-1.5">
                          <div className="flex gap-1.5">
                            {groupPhotos.map(({ r, p }) => (
                              <span key={r} className="relative block">
                                {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL thumbnail */}
                                <img src={p.url} alt={`Photo ${r}`} className="h-12 w-16 object-cover" />
                                <span className="absolute bottom-0 left-0 bg-ink px-1 text-[9px] font-semibold text-white">{r}</span>
                              </span>
                            ))}
                          </div>
                          {g.photo.observations && <p className="mt-1 text-[11px] leading-snug text-ink">{g.photo.observations}</p>}
                          {g.photo.conflicts.map((c, k) => (
                            <p key={k} className="mt-1 border-l-[3px] border-river bg-river-50 px-1.5 py-0.5 text-[11px] leading-snug text-ai">
                              <b>Conflict, document kept:</b> {c}
                            </p>
                          ))}
                        </div>
                      )}
                      {(g.assumptions.length > 0 || (e?.derived.length ?? 0) > 0) && (
                        <details className="mt-1 text-[11px]" onClick={(ev) => ev.stopPropagation()}>
                          <summary className="cursor-pointer text-river">Why the AI decided this ({g.assumptions.length + (e?.derived.length ?? 0)})</summary>
                          <ul className="mt-1 list-disc pl-4 text-grey">
                            {g.assumptions.map((a, k) => (
                              <li key={`a${k}`}>{a}</li>
                            ))}
                            {e?.derived.map((a, k) => (
                              <li key={`d${k}`} className="text-navy-500">{a}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </Td>
                    <Td>
                      <select
                        value={g.housing_class}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => onChange(i, { housing_class: ev.target.value as IngestGroup["housing_class"], ...editPhotoField(g, "housing_class") })}
                        className="border border-slate-300 bg-white px-1.5 py-1 text-xs"
                      >
                        {HOUSING_CLASSES.map((c) => (
                          <option key={c} value={c}>{v.classLabels[c]}</option>
                        ))}
                      </select>
                      <div><Src s={fromPhoto(g, "housing_class") ? "photo" : "ai"} /></div>
                    </Td>
                    <Td right>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={g.count}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => onChange(i, { count: Math.max(1, Math.min(500, parseInt(ev.target.value || "1", 10))) })}
                        className="w-16 border border-slate-300 px-1.5 py-1 text-right text-xs"
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
                        onChange={(ev) => onChange(i, { plinth_m: Math.max(0, Math.min(3, parseFloat(ev.target.value || "0"))), ...editPhotoField(g, "plinth_m") })}
                        className="w-16 border border-slate-300 px-1.5 py-1 text-right text-xs"
                      />
                      <div><Src s={fromPhoto(g, "plinth_m") ? "photo" : g.plinth_m > 0 ? "doc" : "none"} /></div>
                    </Td>
                    <Td>
                      <select
                        value={g.condition ?? ""}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => onChange(i, { condition: (ev.target.value || null) as Condition | null, ...editPhotoField(g, "condition") })}
                        className="border border-slate-300 bg-white px-1.5 py-1 text-xs"
                        title="Feeds the vulnerability model's build-quality input"
                      >
                        <option value="">from cost</option>
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div><Src s={!g.condition ? "default" : fromPhoto(g, "condition") ? "photo" : "doc"} /></div>
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
                              className="w-24 border border-slate-300 px-1.5 py-1 text-right text-xs placeholder:text-slate-300"
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
                      <div className="text-[11px] text-grey">{e?.locationMethod}</div>
                      {e && (
                        <div className={cx("mt-0.5 text-[11px]", e.anchorKind === "coordinates" ? "text-ink" : "text-grey")}>
                          {e.maxMoveM < 1
                            ? "exactly at the point shown"
                            : `placed ${fmtDist(e.meanMoveM)} on average (max ${fmtDist(e.maxMoveM)}) from the point shown`}
                        </div>
                      )}
                      <label
                        className={cx("mt-1 flex items-center gap-1 text-[11px]", e?.anchorKind === "coordinates" ? "text-slate-400" : "text-grey")}
                        onClick={(ev) => ev.stopPropagation()}
                        title={e?.anchorKind === "coordinates" ? "Ignored when coordinates are stated — the site's own flood cell decides" : "Moves buildings onto the nearest 1-in-10 flood cells within 10 km"}
                      >
                        <input type="checkbox" checked={g.near_river} onChange={(ev) => onChange(i, { near_river: ev.target.checked })} /> by the river
                      </label>
                      <Src s={locSrc} />
                    </Td>
                    <Td right className="text-xs">
                      <span className={g.confidence < 0.5 ? "font-semibold text-ai" : undefined}>{fmtPct(g.confidence, 0)}</span>
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
