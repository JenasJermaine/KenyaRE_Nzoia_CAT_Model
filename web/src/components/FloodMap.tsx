"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { CircleMarker, ImageOverlay, MapContainer, Popup, TileLayer, Tooltip as LTooltip } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { fmtKes } from "@/lib/format";
import type { Building, HousingClass } from "@/lib/types";

export interface MapBuilding {
  b: Building;
  depth: number;
  dr: number;
  gross: number;
}

const BOUNDS: LatLngBoundsExpression = [
  [-0.3, 33.7],
  [1.3, 35.4],
];

function lossColor(dr: number) {
  if (dr <= 0) return "#94a3b8";
  if (dr < 0.1) return "#fcd34d";
  if (dr < 0.3) return "#fb923c";
  if (dr < 0.6) return "#ef4444";
  return "#7f1d1d";
}

export default function FloodMap({
  buildings,
  overlay,
  rp,
  colorBy,
  classColors,
  classLabels,
  maxTiv,
  height = 620,
  showOnlyWet = false,
}: {
  buildings: MapBuilding[];
  overlay: "depth" | "zone" | "none";
  rp: number;
  colorBy: "class" | "loss";
  classColors: Record<HousingClass, string>;
  classLabels: Record<HousingClass, string>;
  maxTiv: number;
  height?: number;
  showOnlyWet?: boolean;
}) {
  const imgRp = [10, 20, 50, 100, 200, 500].includes(rp) ? rp : 100;
  // cacheComponents keeps hidden routes in <Activity>, which tears down the Leaflet map but keeps react-leaflet's
  // stale instance; unmount while hidden so a fresh map is built when the page is shown again.
  const [live, setLive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive(true);
    return () => setLive(false);
  }, []);
  if (!live) return <div style={{ height, width: "100%", borderRadius: 12 }} className="bg-slate-100" />;
  return (
    <MapContainer
      bounds={BOUNDS}
      style={{ height, width: "100%", borderRadius: 12 }}
      scrollWheelZoom
      maxBounds={[
        [-0.8, 33.2],
        [1.8, 35.9],
      ]}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Hazard © JRC'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        opacity={0.75}
      />
      {overlay !== "none" && (
        <ImageOverlay
          key={`${overlay}-${imgRp}`}
          url={overlay === "zone" ? "/hazard/flood_zone.png" : `/hazard/rp${imgRp}.png`}
          bounds={BOUNDS}
          opacity={0.85}
          className="pixelated"
        />
      )}
      {buildings
        .filter((m) => !showOnlyWet || m.depth > 0)
        .map((m) => {
          const r = 3 + 11 * Math.sqrt(m.b.tiv / maxTiv);
          const color = colorBy === "class" ? classColors[m.b.cls] : lossColor(m.dr);
          const ai = m.b.origin === "ai_ingested";
          return (
            <CircleMarker
              key={m.b.id}
              center={[m.b.lat, m.b.lon]}
              radius={r}
              pathOptions={{
                color: ai ? "#d11242" : "#ffffff",
                weight: ai ? 2 : 0.8,
                fillColor: color,
                fillOpacity: m.depth > 0 ? 0.92 : 0.55,
              }}
            >
              <LTooltip direction="top" offset={[0, -4]}>
                {m.b.id} · {classLabels[m.b.cls]} · {m.depth > 0 ? `${m.depth.toFixed(2)} m` : "dry"}
              </LTooltip>
              <Popup>
                <div className="min-w-[220px] text-[12px] leading-relaxed">
                  <div className="mb-1 text-[13px] font-semibold">
                    {m.b.id} {ai && <span className="ml-1 rounded bg-river-100 px-1 text-[10px] text-ai">AI-ingested</span>}
                  </div>
                  <div className="mb-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                    SYNTHETIC building — not a real property
                  </div>
                  <div>
                    <b>Class:</b> {classLabels[m.b.cls]}
                  </div>
                  <div>
                    <b>Area:</b> {m.b.area} · {m.b.floorArea} m²
                  </div>
                  <div>
                    <b>Insured value:</b> {fmtKes(m.b.tiv)}
                  </div>
                  <div>
                    <b>Depth by RP (m):</b> {m.b.dPoint.map((d) => d.toFixed(2)).join(" / ")}
                  </div>
                  <div className="mt-1 border-t pt-1">
                    <b>1-in-{rp}:</b> {m.depth.toFixed(2)} m → damage {(m.dr * 100).toFixed(1)}% → <b>{fmtKes(m.gross)}</b>
                  </div>
                  {m.b.plinthExtra > 0 && <div>Raised floor: +{m.b.plinthExtra.toFixed(2)} m</div>}
                  {m.b.note && <div className="mt-1 italic text-slate-500">“{m.b.note}”</div>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}
