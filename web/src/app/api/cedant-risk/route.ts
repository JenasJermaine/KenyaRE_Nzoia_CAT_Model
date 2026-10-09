import { buildingLossAtRp, RPS } from "@/lib/engine";
import { expandGroup } from "@/lib/geo";
import { DEFAULT_SETTINGS, type Building, type GazetteerPlace, type HazardGrid, type IngestGroup, type VulnerabilityData } from "@/lib/types";
import { buildHazardIndex } from "@/lib/geo";
import { requireRoles } from "@/lib/server/auth";
import { readModelJson } from "@/lib/server/model-data";
import { cedantRiskSchema, describeIssue } from "@/lib/server/schemas";

export async function POST(request: Request) {
  const guard = requireRoles(request, ["cedant"]);
  if (!guard.ok) return guard.response;
  const parsed = cedantRiskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: `The submitted risk groups were invalid: ${describeIssue(parsed.error)}.` }, { status: 400 });
  const [hazard, gazetteer, vulnerability] = await Promise.all([
    readModelJson<HazardGrid>("hazard"),
    readModelJson<GazetteerPlace[]>("gazetteer"),
    readModelJson<VulnerabilityData>("vulnerability"),
  ]);
  const hazardIndex = buildHazardIndex(hazard);
  const groups = parsed.data.groups as IngestGroup[];
  const expanded = groups.map((group, index) => expandGroup(group, index, "CEDANT", hazardIndex, gazetteer, vulnerability));
  const buildings = expanded.flatMap((group) => group.buildings);
  const totalTiv = buildings.reduce((sum, building) => sum + building.tiv, 0);
  const byRp = RPS.map((rp) => ({
    rp,
    loss: buildings.reduce((sum, building) => sum + buildingLossAtRp(building, rp, vulnerability, DEFAULT_SETTINGS).gross, 0),
  }));
  const rp100Loss = byRp.find((row) => row.rp === 100)?.loss ?? 0;
  const riskPoints = expanded.map((group, index) => {
    const groupBuildings = group.buildings;
    const value = groupBuildings.reduce((sum, building) => sum + building.tiv, 0);
    const risk = groupBuildings.map((building) => buildingLossAtRp(building, 100, vulnerability, DEFAULT_SETTINGS));
    const depth = value ? risk.reduce((sum, row, i) => sum + row.depth * groupBuildings[i].tiv, 0) / value : 0;
    const loss = risk.reduce((sum, row) => sum + row.gross, 0);
    const sample: Building = {
      ...groupBuildings[0],
      id: `Submission group ${index + 1}`,
      lat: group.anchor.lat,
      lon: group.anchor.lon,
      tiv: value,
      floorArea: groupBuildings.reduce((sum, building) => sum + building.floorArea, 0),
      dPoint: groupBuildings[0].dPoint,
      dBilinear: groupBuildings[0].dBilinear,
    };
    return { b: sample, depth, dr: value ? loss / value : 0, gross: loss };
  });
  const classNames = [...new Set(groups.map((group) => vulnerability.classLabels[group.housing_class]))];
  const places = [...new Set(expanded.map((group) => group.placeUsed))];
  const drivers = [
    ...(classNames.length ? [`Construction classes include ${classNames.join(", ")}.`] : []),
    `${buildings.filter((building) => building.dPoint.some((depth) => depth > 0)).length} submitted properties intersect a mapped flood depth at one or more scenarios.`,
    `${places.length} general area(s) represented: ${places.join(", ")}.`,
  ];
  const floodProneTiv = buildings.filter((building) => building.dPoint.some((depth) => depth > 0)).reduce((sum, building) => sum + building.tiv, 0);
  return Response.json({
    properties: buildings.length,
    totalTiv,
    areas: places,
    risk: rp100Loss / Math.max(totalTiv, 1) >= 0.25 ? "High" : rp100Loss / Math.max(totalTiv, 1) >= 0.08 ? "Medium" : "Low",
    riskRatio: totalTiv ? rp100Loss / totalTiv : 0,
    floodProneTiv,
    byRp,
    drivers,
    riskPoints,
    classColors: vulnerability.classColors,
    classLabels: vulnerability.classLabels,
  });
}