import type { OfferBriefing } from "./briefing";
import { buildingLossAtRp, buildingTerms, buildingProfile, epCurve, RPS, waterfallAtRp } from "./engine";
import { backgroundAt, drFunction, instanceAt, limeSurrogate, shapExact, shapSentences } from "./explain";
import type { ExpandedGroup } from "./geo";
import type { Building, IngestGroup, ModelData, Settings } from "./types";

export function groupLabel(g: IngestGroup, i: number) {
  const base = g.occupancy ? g.occupancy.charAt(0).toUpperCase() + g.occupancy.slice(1) : `Building group ${i + 1}`;
  return g.count > 1 ? `${base} ×${g.count}` : base;
}

/** Damage ratio (mean over the group's buildings) and summed losses at each JRC return period. */
export function groupRpRows(e: ExpandedGroup, data: ModelData, s: Settings, rps = RPS) {
  return rps.map((rp) => {
    let dr = 0;
    let groundUp = 0;
    let gross = 0;
    for (const b of e.buildings) {
      const r = buildingLossAtRp(b, rp, data.vulnerability, s);
      dr += r.dr;
      groundUp += r.gross;
      gross += buildingTerms(r.gross, b.tiv, s).gross;
    }
    return { rp, dr: dr / e.buildings.length, groundUp, gross };
  });
}

/** SHAP + LIME for one building at one return period; null when the building is dry there. */
export function explainBuilding(b: Building, rp: number, data: ModelData, s: Settings) {
  const x = instanceAt(b, rp, s);
  if (x.depth <= 0) return null;
  const f = drFunction(data.vulnerability, s);
  const bg = backgroundAt(data.portfolio, rp, s);
  if (!bg.length) return null;
  const shap = shapExact(x, bg, f);
  const lime = limeSurrogate(x, f, `${b.id}|${rp}|${s.vulnModel}|${s.duration}`);
  const typical = {
    depth: bg.reduce((a, z) => a + z.depth, 0) / bg.length,
    quality: bg.reduce((a, z) => a + z.quality, 0) / bg.length,
  };
  return { x, shap, lime, typical, backgroundN: bg.length, sentences: shapSentences(shap, x, typical, data.vulnerability.classLabels) };
}

/** First JRC return period at which the building gets wet, or null if dry up to 1-in-500. */
export function firstWetRp(b: Building, data: ModelData, s: Settings) {
  return buildingProfile(b, data.vulnerability, s).find((r) => r.depth > 0)?.rp ?? null;
}

export function offerBriefing(
  groups: IngestGroup[],
  expanded: ExpandedGroup[],
  preview: Building[],
  portfolio: Building[],
  portfolioAalGroundUp: number,
  extractedBy: string,
  data: ModelData,
  s: Settings,
  terms: string,
): OfferBriefing {
  const v = data.vulnerability;
  const ep = epCurve(preview, v, s, 200);
  const before = waterfallAtRp(portfolio, 100, v, s).net;
  const after = waterfallAtRp([...portfolio, ...preview], 100, v, s).net;
  // Ground-up loss is a plain sum over buildings, so AAL is additive.
  const aalBefore = portfolioAalGroundUp;
  const totalTiv = preview.reduce((a, b) => a + b.tiv, 0);
  return {
    extractedBy,
    totalTivKes: Math.round(totalTiv),
    terms,
    buildings: groups.map((g, i) => {
      const e = expanded[i];
      const r100 = groupRpRows(e, data, s, [100])[0];
      const ex = explainBuilding(e.buildings[0], 100, data, s);
      const wet = firstWetRp(e.buildings[0], data, s);
      return {
        label: groupLabel(g, i),
        housingClass: v.classLabels[g.housing_class],
        count: e.buildings.length,
        tivKes: Math.round(e.buildings.reduce((a, b) => a + b.tiv, 0)),
        location: e.placeUsed,
        raisedFloorM: g.plinth_m,
        damageRatioRp100: +r100.dr.toFixed(3),
        groundUpRp100Kes: Math.round(r100.groundUp),
        shapDrivers: ex ? ex.sentences : [wet ? `Dry at 1-in-100; first floods at 1-in-${wet}.` : "Outside the JRC flood footprint up to 1-in-500."],
      };
    }),
    lossByReturnPeriod: [10, 50, 100, 250, 500].map((rp) => {
      const w = waterfallAtRp(preview, rp, v, s);
      return { rp, groundUpKes: Math.round(w.groundUp), grossKes: Math.round(w.gross), netKes: Math.round(w.net), groundUpPctOfTiv: totalTiv ? +(w.groundUp / totalTiv).toFixed(4) : 0 };
    }),
    aal: { groundUpKes: Math.round(ep.aalGross), grossKes: Math.round(ep.aalInsured), netKes: Math.round(ep.aalNet) },
    portfolioImpact: {
      rp100NetBeforeKes: Math.round(before),
      rp100NetAfterKes: Math.round(after),
      aalGroundUpBeforeKes: Math.round(aalBefore),
      aalGroundUpAfterKes: Math.round(aalBefore + ep.aalGross),
    },
  };
}