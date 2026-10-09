import { accumulation, buildingLossAtRp, classSummary, RPS, waterfallAtRp } from "@/lib/engine";
import { requireRoles } from "@/lib/server/auth";
import { readModelJson } from "@/lib/server/model-data";
import { readIngestedBuildings } from "@/lib/server/portfolio-db";
import { DEFAULT_SETTINGS, type Building, type GazetteerPlace, type VulnerabilityData } from "@/lib/types";

export async function GET(request: Request) {
  const guard = requireRoles(request, ["portfolio_manager"]);
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const parsedRp = Number(params.get("rp") ?? 100);
  const rp = RPS.includes(parsedRp) ? parsedRp : 100;
  try {
    const [starter, vulnerability, gazetteer] = await Promise.all([
      readModelJson<Building[]>("portfolio"),
      readModelJson<VulnerabilityData>("vulnerability"),
      readModelJson<GazetteerPlace[]>("gazetteer"),
    ]);
    const buildings = [...starter, ...readIngestedBuildings()];
    const classes = classSummary(buildings, vulnerability, DEFAULT_SETTINGS, rp).map((row) => ({
      cls: row.cls,
      buildings: row.buildings,
      tiv: row.tiv,
      tivWet: row.tivWet,
      loss: row.loss,
      share: buildings.reduce((total, building) => total + building.tiv, 0) ? row.tiv / buildings.reduce((total, building) => total + building.tiv, 0) : 0,
    }));
    const areas = accumulation(buildings, vulnerability, DEFAULT_SETTINGS, rp);
    const totalTiv = buildings.reduce((total, building) => total + building.tiv, 0);
    const risk = { high: 0, medium: 0, low: 0 };
    let exposedTiv = 0;
    const grouped = new Map<string, { buildings: Building[]; tiv: number; loss: number; drWeighted: number; depthWeighted: number }>();
    for (const building of buildings) {
      const rp100 = buildingLossAtRp(building, 100, vulnerability, DEFAULT_SETTINGS);
      if (rp100.depth >= 0.5) risk.high += building.tiv;
      else if (rp100.depth > 0) risk.medium += building.tiv;
      else risk.low += building.tiv;
      if (rp100.depth > 0) exposedTiv += building.tiv;
      const selected = buildingLossAtRp(building, rp, vulnerability, DEFAULT_SETTINGS);
      const item = grouped.get(building.area) ?? { buildings: [], tiv: 0, loss: 0, drWeighted: 0, depthWeighted: 0 };
      item.buildings.push(building);
      item.tiv += building.tiv;
      item.loss += selected.gross;
      item.drWeighted += selected.dr * building.tiv;
      item.depthWeighted += selected.depth * building.tiv;
      grouped.set(building.area, item);
    }
    const mapPoints = [...grouped.entries()].map(([area, item]) => {
      const place = gazetteer.find((candidate) => candidate.name === area);
      const classesByCount = new Map<string, number>();
      for (const building of item.buildings) classesByCount.set(building.cls, (classesByCount.get(building.cls) ?? 0) + 1);
      const cls = [...classesByCount.entries()].sort((a, b) => b[1] - a[1])[0][0] as Building["cls"];
      const weight = item.tiv || 1;
      return {
        b: {
          id: area,
          lat: place?.lat ?? item.buildings.reduce((sum, building) => sum + building.lat, 0) / item.buildings.length,
          lon: place?.lon ?? item.buildings.reduce((sum, building) => sum + building.lon, 0) / item.buildings.length,
          cls,
          floorArea: item.buildings.reduce((sum, building) => sum + building.floorArea, 0),
          costPerM2: 1,
          tiv: item.tiv,
          quality: 0.5,
          plinthExtra: 0,
          dPoint: [0, 0, 0, 0, 0, 0],
          dBilinear: [0, 0, 0, 0, 0, 0],
          distRp100Km: 0,
          area,
          synthetic: true,
          origin: "starter_kit" as const,
        },
        depth: item.depthWeighted / weight,
        dr: item.drWeighted / weight,
        gross: item.loss,
      };
    });
    return Response.json({
      rp,
      totalTiv,
      properties: buildings.length,
      risk,
      exposedTiv,
      classes,
      areas,
      scenarios: RPS.map((period) => ({ ...waterfallAtRp(buildings, period, vulnerability, DEFAULT_SETTINGS), rp: period })),
      mapPoints,
      classLabels: vulnerability.classLabels,
      classColors: vulnerability.classColors,
    });
  } catch (error) {
    console.error("[exposure-summary] failed:", error);
    return Response.json({ error: "The aggregated exposure summary could not be loaded." }, { status: 500 });
  }
}