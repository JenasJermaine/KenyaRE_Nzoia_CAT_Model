import type { BriefingPayload, OfferBriefing } from "./briefing";
import { eventLoss } from "./engine";
import type { ModelState } from "@/components/ModelProvider";
import type { Settings } from "./types";

export function buildBriefingPayload(m: ModelState, offer?: OfferBriefing): BriefingPayload | null {
  const { data, det, mc, portfolio, settings } = m;
  if (!data || !det) return null;
  const v = data.vulnerability;
  const labels = v.classLabels;
  const r100 = det.table.find((r) => r.rp === 100)!;
  const j100 = det.tableJrc.find((r) => r.rp === 100)!;
  const rp100With = (patch: Partial<Settings>) => eventLoss(portfolio, 100, v, { ...settings, ...patch }).gross;
  const pct = (x: number) => (r100.gross ? 100 * (x / r100.gross - 1) : 0);
  const sensitivityRp100 = [
    { case: "Bilinear hazard sampling instead of point cell (location uncertainty)", changePct: pct(rp100With({ hazardMode: settings.hazardMode === "point" ? "bilinear" : "point" })) },
    { case: "Short 2-day flood instead of the current duration", changePct: pct(rp100With({ duration: 2 })) },
    { case: "Prolonged 21-day flood instead of the current duration", changePct: pct(rp100With({ duration: 21 })) },
  ].filter((s) => Math.abs(s.changePct) > 0.05);

  return {
    portfolio: {
      buildings: portfolio.length,
      aiIngestedBuildings: portfolio.filter((b) => b.origin === "ai_ingested").length,
      totalTivKes: det.totalTiv,
      tivInRp100FootprintKes: det.classes.reduce((a, c) => a + c.tivWet, 0),
      buildingsWetRp100: det.classes.reduce((a, c) => a + c.wet, 0),
      synthetic: true,
    },
    settings: {
      vulnerabilityModel: settings.vulnModel === "ml" ? "ML monotone gradient-boosted model (trained on synthetic pseudo-claims)" : "Deterministic adapted JRC curve",
      hazardSampling: settings.hazardMode,
      floodDurationDays: settings.duration,
      deductiblePctTiv: settings.deductiblePct * 100,
      catXl: `KES ${(settings.xlLimit / 1e6).toFixed(0)} M xs KES ${(settings.xlRetention / 1e6).toFixed(0)} M`,
    },
    lossByReturnPeriod: det.table.map((r) => ({
      rp: r.rp,
      grossKes: Math.round(r.gross),
      insuredKes: Math.round(r.insured),
      netKes: Math.round(r.net),
      pctOfTiv: r.gross / det.totalTiv,
      interpolated: r.interpolated,
    })),
    aal: { grossKes: Math.round(det.ep.aalGross), insuredKes: Math.round(det.ep.aalInsured), netKes: Math.round(det.ep.aalNet) },
    monteCarlo: mc
      ? {
          years: mc.years,
          oep100Kes: Math.round(mc.stats.gross.oep.find((o) => o.rp === 100)?.loss ?? 0),
          oep200Kes: Math.round(mc.stats.gross.oep.find((o) => o.rp === 200)?.loss ?? 0),
          tvar1Kes: Math.round(mc.stats.gross.tvar1),
        }
      : null,
    byClassRp100: det.classes.map((c) => ({
      housingClass: labels[c.cls],
      buildings: c.buildings,
      wet: c.wet,
      lossKes: Math.round(c.loss),
      lossPctOfClassTiv: +(100 * c.lossPctTiv).toFixed(2),
    })),
    topAreasRp100: det.areas.slice(0, 5).map((a) => ({
      area: a.area,
      lossKes: Math.round(a.loss),
      sharePct: +(100 * a.share).toFixed(1),
      tivWetKes: Math.round(a.tivWet),
    })),
    topBuildingsRp100: det.top.slice(0, 5).map((t) => ({
      id: t.b.id,
      area: t.b.area,
      housingClass: labels[t.b.cls],
      depthM: +t.depth.toFixed(2),
      damageRatio: +t.dr.toFixed(3),
      lossKes: Math.round(t.gross),
    })),
    mlVsJrcRp100Pct: j100.gross ? 100 * (r100.gross / j100.gross - 1) : 0,
    sensitivityRp100,
    keyCaveats: [
      "Portfolio is synthetic (randomly placed buildings), not a real client portfolio",
      "Hazard cells are ~925 m; one depth per cell",
      "Vulnerability adapted from global JRC curves; ML trained on synthetic pseudo-claims, not real Kenyan claims",
      "Structure only — no contents, business interruption or agriculture",
      "Each JRC map treated as one basin-wide event; flood defences/dyke breaches not modelled",
    ],
    ...(offer ? { offer } : {}),
  };
}
