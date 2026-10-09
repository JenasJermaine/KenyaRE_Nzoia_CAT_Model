"use client";

import { useState } from "react";
import { MapView } from "@/components/MapView";
import { useModel } from "@/components/ModelProvider";
import { Kpi, Td, Th, cx } from "@/components/ui";
import { buildingLossAtRp, buildingProfile, RPS, waterfallAtRp } from "@/lib/engine";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";
import type { ExpandedGroup } from "@/lib/geo";
import { firstWetRp, groupLabel } from "@/lib/offer";
import type { Building, IngestGroup } from "@/lib/types";

export function OfferRiskReview({
  groups,
  expanded,
  preview,
}: {
  groups: IngestGroup[];
  expanded: ExpandedGroup[];
  preview: Building[];
}) {
  const { data, settings } = useModel();
  const [groupIndex, setGroupIndex] = useState(0);
  const [buildingIndex, setBuildingIndex] = useState(0);
  const [rp, setRp] = useState(100);

  if (!data || !groups.length || !expanded.length) return null;
  const gi = Math.min(groupIndex, expanded.length - 1);
  const groupBuildings = expanded[gi].buildings;
  const bi = Math.min(buildingIndex, groupBuildings.length - 1);
  const building = groupBuildings[bi];
  const profile = buildingProfile(building, data.vulnerability, settings);
  const selectedRisk = profile.find((row) => row.rp === rp) ?? profile[0];
  const firstWet = firstWetRp(building, data, settings);
  const offerLoss = waterfallAtRp(preview, rp, data.vulnerability, settings);
  const groupTiv = groupBuildings.reduce((total, item) => total + item.tiv, 0);
  const maxTiv = Math.max(1, ...preview.map((item) => item.tiv));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Building group</span>
          <select
            value={gi}
            onChange={(event) => {
              setGroupIndex(Number(event.target.value));
              setBuildingIndex(0);
            }}
            className="mt-1 block min-w-56 border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          >
            {groups.map((group, index) => (
              <option key={index} value={index}>{groupLabel(group, index)}</option>
            ))}
          </select>
        </label>
        {groupBuildings.length > 1 && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Individual building</span>
            <select
              value={bi}
              onChange={(event) => setBuildingIndex(Number(event.target.value))}
              className="mt-1 block min-w-56 border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            >
              {groupBuildings.map((item, index) => (
                <option key={item.id} value={index}>Building {index + 1} · {item.id} · {fmtKes(item.tiv)}</option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-auto">
          <div className="mb-1 text-xs font-medium text-slate-600">Flood scenario</div>
          <div className="flex flex-wrap gap-1">
            {RPS.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setRp(period)}
                className={cx("border px-2.5 py-1 text-xs font-medium", rp === period ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-grey hover:border-ink hover:text-ink")}
              >
                {rpLabel(period)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Exposure · insured value" value={fmtKes(building.tiv)} sub={`${building.floorArea.toLocaleString()} m² · group total ${fmtKes(groupTiv)}`} />
        <Kpi label={`${rpLabel(rp)} hazard depth`} value={selectedRisk.depth > 0 ? `${selectedRisk.depth.toFixed(2)} m` : "Dry"} sub={firstWet ? `First wet at ${rpLabel(firstWet)} · JRC flood map` : "Outside mapped footprint through 1-in-500"} />
        <Kpi label="Vulnerability · damage ratio" value={fmtPct(selectedRisk.dr, 1)} sub={`${data.vulnerability.classLabels[building.cls]} · ${settings.vulnModel.toUpperCase()} · quality ${building.quality.toFixed(2)}`} />
        <Kpi accent label="Ground-up loss" value={fmtKes(selectedRisk.groundUp)} sub={`Insurer gross after policy terms: ${fmtKes(selectedRisk.gross)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden border border-slate-200">
          <MapView
            buildings={preview.map((item) => ({ b: item, ...buildingLossAtRp(item, rp, data.vulnerability, settings) }))}
            overlay="depth"
            rp={rp}
            colorBy="loss"
            classColors={data.vulnerability.classColors}
            classLabels={data.vulnerability.classLabels}
            maxTiv={maxTiv}
            height={340}
          />
          <div className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            {building.id} · {expanded[gi].placeUsed} · {building.lat.toFixed(4)}, {building.lon.toFixed(4)} · {building.floorArea.toLocaleString()} m² · raised floor {building.plinthExtra.toFixed(2)} m
            <span className="ml-1 text-slate-400">({expanded[gi].anchorKind === "coordinates" ? "stated coordinates" : "modeled location"})</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h3 className="text-sm font-semibold text-ink">Selected building · {rpLabel(rp)} loss</h3>
              <p className="text-xs text-slate-500">Vulnerability uses {settings.duration}-day flood duration and the current model settings.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[430px]">
                <thead>
                  <tr><Th>Return period</Th><Th right>Depth</Th><Th right>Damage</Th><Th right>Ground-up</Th><Th right>Insurer gross</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profile.map((row) => (
                    <tr key={row.rp} className={row.rp === rp ? "bg-navy-50" : undefined}>
                      <Td>{rpLabel(row.rp)}</Td>
                      <Td right>{row.depth > 0 ? `${row.depth.toFixed(2)} m` : "Dry"}</Td>
                      <Td right>{fmtPct(row.dr, 1)}</Td>
                      <Td right>{fmtKes(row.groundUp)}</Td>
                      <Td right>{fmtKes(row.gross)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-l-4 border-river bg-navy-50 px-3 py-2.5 text-sm">
            <div className="font-semibold text-ink">Whole offer at {rpLabel(rp)}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-slate-700">
              <span>Ground-up {fmtKes(offerLoss.groundUp)}</span>
              <span>Insurer gross {fmtKes(offerLoss.gross)}</span>
              <span>Net retained {fmtKes(offerLoss.net)}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Net is calculated across the full offer event after quota share and Cat XL; it is not allocated to one building.</p>
          </div>
        </div>
      </div>
    </div>
  );
}