import { PLACE_ALIASES } from "./ingest";
import { CONDITION_QUALITY, type Building, type GazetteerPlace, type HazardGrid, type HousingClass, type IngestGroup, type VulnerabilityData } from "./types";

const KM_PER_DEG = 111.32;

export interface HazardIndex {
  grid: HazardGrid;
  byCell: Map<number, number[]>;
  rp10Cells: { r: number; c: number }[];
  rp100Cells: { r: number; c: number }[];
}

export function buildHazardIndex(grid: HazardGrid): HazardIndex {
  const byCell = new Map<number, number[]>();
  const rp10Cells: { r: number; c: number }[] = [];
  const rp100Cells: { r: number; c: number }[] = [];
  for (const [r, c, ...d] of grid.cells) {
    byCell.set(r * grid.ncols + c, d);
    if (d[0] > 0) rp10Cells.push({ r, c });
    if (d[3] > 0) rp100Cells.push({ r, c });
  }
  return { grid, byCell, rp10Cells, rp100Cells };
}

const ZERO6 = [0, 0, 0, 0, 0, 0];

function cellDepths(h: HazardIndex, r: number, c: number) {
  if (r < 0 || c < 0 || r >= h.grid.nrows || c >= h.grid.ncols) return ZERO6;
  return h.byCell.get(r * h.grid.ncols + c) ?? ZERO6;
}

export function cellOf(h: HazardIndex, lat: number, lon: number) {
  const { x0, y0, dx, dy } = h.grid;
  return { r: Math.floor((lat - y0) / dy), c: Math.floor((lon - x0) / dx) };
}

export function cellCentre(h: HazardIndex, r: number, c: number) {
  const { x0, y0, dx, dy } = h.grid;
  return { lat: y0 + (r + 0.5) * dy, lon: x0 + (c + 0.5) * dx };
}

export function insideGrid(h: HazardIndex, lat: number, lon: number) {
  const { r, c } = cellOf(h, lat, lon);
  return r >= 0 && c >= 0 && r < h.grid.nrows && c < h.grid.ncols;
}

export function samplePoint(h: HazardIndex, lat: number, lon: number) {
  const { r, c } = cellOf(h, lat, lon);
  return [...cellDepths(h, r, c)];
}

/** Same scheme as the notebook's sample_bilinear: four nearest cell centres, dry = 0, edge-clamped. */
export function sampleBilinear(h: HazardIndex, lat: number, lon: number) {
  const { x0, y0, dx, dy, nrows, ncols } = h.grid;
  const cf = (lon - x0) / dx - 0.5;
  const rf = (lat - y0) / dy - 0.5;
  const c0 = Math.floor(cf);
  const r0 = Math.floor(rf);
  const wc = cf - c0;
  const wr = rf - r0;
  const out = [0, 0, 0, 0, 0, 0];
  const taps: [number, number, number][] = [
    [0, 0, (1 - wr) * (1 - wc)],
    [0, 1, (1 - wr) * wc],
    [1, 0, wr * (1 - wc)],
    [1, 1, wr * wc],
  ];
  for (const [ddr, ddc, w] of taps) {
    const rr = Math.min(Math.max(r0 + ddr, 0), nrows - 1);
    const cc = Math.min(Math.max(c0 + ddc, 0), ncols - 1);
    const d = cellDepths(h, rr, cc);
    for (let i = 0; i < 6; i++) out[i] += w * d[i];
  }
  return out;
}

/** Distance (km) from the building's cell to the nearest RP100-wet cell, in cell units × cell size (as the notebook's EDT). */
export function distToRp100Km(h: HazardIndex, lat: number, lon: number) {
  const { r, c } = cellOf(h, lat, lon);
  let best = Infinity;
  for (const k of h.rp100Cells) {
    const d = (k.r - r) ** 2 + (k.c - c) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best) * h.grid.dx * KM_PER_DEG;
}

export function nearestPlace(gaz: GazetteerPlace[], lat: number, lon: number) {
  const cosLat = Math.cos((0.5 * Math.PI) / 180);
  let best = gaz[0];
  let bd = Infinity;
  for (const g of gaz) {
    const d = (g.lat - lat) ** 2 + ((g.lon - lon) * cosLat) ** 2;
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}

export function findPlace(gaz: GazetteerPlace[], name: string | null) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const alias = PLACE_ALIASES[n];
  return (
    gaz.find((g) => g.name.toLowerCase() === n) ??
    (alias ? gaz.find((g) => g.name === alias) : undefined) ??
    gaz.find((g) => n.includes(g.name.toLowerCase().replace(/ \(.*\)/, ""))) ??
    gaz.find((g) => g.name.toLowerCase().includes(n)) ??
    null
  );
}

/** Deterministic PRNG so the same description always yields the same building locations. */
export function seededRandom(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Typical floor areas for the Nzoia (rural/peri-urban) portfolio, from Dataset_Metadata.pdf §5. */
export const TYPICAL_FLOOR_AREA: Record<HousingClass, number> = {
  informal_iron_sheet: 14,
  semi_permanent: 38,
  permanent_masonry: 100,
  concrete_rcc: 400,
};

export type AnchorKind = "coordinates" | "place" | "default";

export interface ExpandedGroup {
  buildings: Building[];
  placeUsed: string;
  locationMethod: string;
  derived: string[];
  /** Point the group's buildings are placed around. */
  anchor: { lat: number; lon: number };
  anchorKind: AnchorKind;
  /** Largest and mean distance (m) of the group's buildings from the anchor. */
  maxMoveM: number;
  meanMoveM: number;
}

/** Spread of buildings around stated coordinates (one site, so a tight cluster; a single building sits exactly on it). */
const SITE_RADIUS_KM = 0.05;
/** Spread around an approximate town centroid. */
const TOWN_RADIUS_KM = 1.5;

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const cosLat = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(b.lat - a.lat, (b.lon - a.lon) * cosLat) * KM_PER_DEG * 1000;
}

/**
 * Turns one structured group (from the LLM or rule parser) into concrete synthetic building rows matching the
 * exposure-file shape, then attaches hazard exactly as the notebook does.
 */
export function expandGroup(
  g: IngestGroup,
  idx: number,
  batchId: string,
  h: HazardIndex,
  gaz: GazetteerPlace[],
  v: VulnerabilityData,
): ExpandedGroup {
  // Seeded on the content only (not the batch id), so the same document always gives the same locations.
  const rand = seededRandom(`${idx}|${g.evidence}|${g.place ?? ""}|${g.lat ?? ""}|${g.lon ?? ""}`);
  const derived: string[] = [];
  const [lo, hi] = v.costRanges[g.housing_class];
  let cost = g.cost_per_m2_kes && g.cost_per_m2_kes > 0 ? g.cost_per_m2_kes : null;
  let area = g.floor_area_m2 && g.floor_area_m2 > 0 ? g.floor_area_m2 : null;
  if (g.tiv_kes_each && g.tiv_kes_each > 0) {
    if (!cost && !area) {
      cost = (lo + hi) / 2;
      area = g.tiv_kes_each / cost;
      derived.push(`floor area derived from stated value at mid-band cost KES ${cost.toLocaleString()}/m²`);
    } else if (!cost && area) {
      cost = g.tiv_kes_each / area;
    } else if (cost && !area) {
      area = g.tiv_kes_each / cost;
    }
  }
  if (!cost) {
    cost = (lo + hi) / 2;
    derived.push(`cost per m² defaulted to class mid-band (KES ${cost.toLocaleString()})`);
  }
  if (!area) {
    area = TYPICAL_FLOOR_AREA[g.housing_class];
    derived.push(`floor area defaulted to typical ${area} m² for the class`);
  }
  const tivEach = g.tiv_kes_each && g.tiv_kes_each > 0 ? g.tiv_kes_each : Math.round((area * cost) / 5000) * 5000;
  let quality = Math.min(1, Math.max(0, (cost - lo) / (hi - lo)));
  if (g.condition) {
    quality = CONDITION_QUALITY[g.condition];
    derived.push(
      `build quality set to ${quality} from the "${g.condition}" condition (${g.photo?.fields.includes("condition") ? "read from the photo" : "document or underwriter"})`,
    );
  }
  const count = Math.max(1, Math.min(500, Math.round(g.count)));

  let anchor: { lat: number; lon: number };
  let anchorKind: AnchorKind;
  let placeUsed: string;
  let locationMethod: string;
  const place = findPlace(gaz, g.place);
  const hasCoords = g.lat != null && g.lon != null;
  const coordsUsable = hasCoords && insideGrid(h, g.lat!, g.lon!);
  const coordsNote = hasCoords && !coordsUsable ? "stated coordinates are outside the hazard grid and were ignored; " : "";
  if (coordsUsable) {
    anchor = { lat: g.lat!, lon: g.lon! };
    anchorKind = "coordinates";
    placeUsed = nearestPlace(gaz, g.lat!, g.lon!).name;
    locationMethod =
      count === 1 ? "placed exactly on the stated coordinates" : `stated coordinates; ${count} buildings within ${SITE_RADIUS_KM * 1000} m of the point`;
    if (g.near_river) locationMethod += '; "near the river" noted but not used — the site\'s own flood cell decides';
  } else if (place) {
    anchor = { lat: place.lat, lon: place.lon };
    anchorKind = "place";
    placeUsed = place.name;
    locationMethod = `${coordsNote}approximate centroid of ${place.name} (±2–3 km)`;
  } else {
    const b = gaz.find((x) => x.name === "Budalangi")!;
    anchor = { lat: b.lat, lon: b.lon };
    anchorKind = "default";
    placeUsed = b.name;
    locationMethod = `${coordsNote}no recognisable place — defaulted to Budalangi`;
  }

  let riverCells: { r: number; c: number }[] = [];
  if (g.near_river && anchorKind !== "coordinates") {
    const a = cellOf(h, anchor.lat, anchor.lon);
    const maxCells = 10 / (h.grid.dx * KM_PER_DEG);
    riverCells = h.rp10Cells
      .map((k) => ({ ...k, d: Math.hypot(k.r - a.r, k.c - a.c) }))
      .filter((k) => k.d <= maxCells)
      .sort((x, y) => x.d - y.d)
      .slice(0, Math.max(3, Math.min(12, g.count)));
    locationMethod += riverCells.length
      ? `; snapped to the ${riverCells.length} nearest RP10 flood-corridor cells ("near the river")`
      : "; no flood corridor within 10 km";
  }

  const buildings: Building[] = [];
  const moves: number[] = [];
  for (let i = 0; i < count; i++) {
    let lat: number;
    let lon: number;
    if (anchorKind === "coordinates" && count === 1) {
      lat = anchor.lat;
      lon = anchor.lon;
    } else if (riverCells.length) {
      const k = riverCells[Math.floor(rand() * riverCells.length)];
      const cc = cellCentre(h, k.r, k.c);
      lat = cc.lat + (rand() - 0.5) * 0.8 * Math.abs(h.grid.dy);
      lon = cc.lon + (rand() - 0.5) * 0.8 * h.grid.dx;
    } else {
      const radiusKm = anchorKind === "coordinates" ? SITE_RADIUS_KM : TOWN_RADIUS_KM;
      const rad = (Math.sqrt(rand()) * radiusKm) / KM_PER_DEG;
      const th = rand() * 2 * Math.PI;
      lat = anchor.lat + rad * Math.sin(th);
      lon = anchor.lon + rad * Math.cos(th);
    }
    moves.push(distanceM(anchor, { lat, lon }));
    buildings.push({
      id: `AI-${batchId}-${idx}-${String(i).padStart(3, "0")}`,
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6),
      cls: g.housing_class,
      floorArea: Math.round(area),
      costPerM2: Math.round(cost),
      tiv: tivEach,
      quality,
      plinthExtra: Math.max(0, g.plinth_m || 0),
      dPoint: samplePoint(h, lat, lon),
      dBilinear: sampleBilinear(h, lat, lon),
      distRp100Km: distToRp100Km(h, lat, lon),
      area: nearestPlace(gaz, lat, lon).name,
      synthetic: true,
      origin: "ai_ingested",
      note: [g.occupancy, g.evidence, g.photo?.observations && `photo: ${g.photo.observations}`].filter(Boolean).join(" — "),
      batchId,
    });
  }
  return {
    buildings,
    placeUsed,
    locationMethod,
    derived,
    anchor,
    anchorKind,
    maxMoveM: Math.max(...moves),
    meanMoveM: moves.reduce((a, m) => a + m, 0) / moves.length,
  };
}
