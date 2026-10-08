import { fmtKes, fmtPct } from "./format";

/** Everything the briefing writer is allowed to know — built client-side from live engine results. */
export interface BriefingPayload {
  portfolio: {
    buildings: number;
    aiIngestedBuildings: number;
    totalTivKes: number;
    tivInRp100FootprintKes: number;
    buildingsWetRp100: number;
    synthetic: true;
  };
  settings: {
    vulnerabilityModel: string;
    hazardSampling: string;
    floodDurationDays: number;
    deductiblePctTiv: number;
    catXl: string;
  };
  lossByReturnPeriod: { rp: number; grossKes: number; insuredKes: number; netKes: number; pctOfTiv: number; interpolated: boolean }[];
  aal: { grossKes: number; insuredKes: number; netKes: number };
  monteCarlo: { years: number; oep100Kes: number; oep200Kes: number; tvar1Kes: number } | null;
  byClassRp100: { housingClass: string; buildings: number; wet: number; lossKes: number; lossPctOfClassTiv: number }[];
  topAreasRp100: { area: string; lossKes: number; sharePct: number; tivWetKes: number }[];
  topBuildingsRp100: { id: string; area: string; housingClass: string; depthM: number; damageRatio: number; lossKes: number }[];
  mlVsJrcRp100Pct: number;
  /** One-at-a-time sensitivities of the 1-in-100 gross loss, recomputed live on the current portfolio. */
  sensitivityRp100: { case: string; changePct: number }[];
  keyCaveats: string[];
  /** The offer currently on the underwriting desk (AI-extracted, not yet necessarily in the portfolio). */
  offer?: OfferBriefing;
}

export interface OfferBriefing {
  extractedBy: string;
  totalTivKes: number;
  terms: string;
  buildings: {
    label: string;
    housingClass: string;
    count: number;
    tivKes: number;
    location: string;
    raisedFloorM: number;
    damageRatioRp100: number;
    groundUpRp100Kes: number;
    /** Plain-English SHAP attributions of the 1-in-100 damage ratio vs. a typical flooded building. */
    shapDrivers: string[];
  }[];
  lossByReturnPeriod: { rp: number; groundUpKes: number; grossKes: number; netKes: number; groundUpPctOfTiv: number }[];
  aal: { groundUpKes: number; grossKes: number; netKes: number };
  portfolioImpact: { rp100NetBeforeKes: number; rp100NetAfterKes: number; aalGroundUpBeforeKes: number; aalGroundUpAfterKes: number };
}

export function briefingSystemPrompt() {
  return `You are a senior catastrophe-risk analyst at an African reinsurer writing a one-page flood risk briefing for an underwriter.
Write in plain English for a non-modeller, in Markdown, max ~450 words.
If the JSON contains an "offer", start with:
## This offer  (what was submitted and extracted; its 1-in-100 ground-up, gross and net loss; which buildings drive it and WHY, using their "shapDrivers"; how it changes the portfolio's 1-in-100 net loss and average annual loss; a clear recommendation: accept as is / accept with conditions such as a higher deductible or raised floors / decline)
Then always these sections:
## Headline  (2 sentences: the portfolio's 1-in-100 loss and what it means for budgeting)
## Key numbers  (bullet list: total insured value, losses at 1-in-10 / 1-in-100 / 1-in-250 / 1-in-500, AAL, reinsurance recovery at 1-in-100)
## Where the risk sits  (accumulation: which areas and housing classes drive loss, and why)
## What could move these numbers  (2-4 bullets on the main uncertainties)
## Recommended next steps  (2-3 concrete underwriting/portfolio actions)
Vocabulary (from the brief): ground-up loss = physical damage before insurance; gross loss = insurer's loss after deductible and limit; net loss = what the insurer keeps after quota share and Cat XL. In "lossByReturnPeriod" at portfolio level, "grossKes" is GROUND-UP and "insuredKes" is GROSS.
Rules: use ONLY numbers present in the JSON (format KES values in millions, e.g. "KES 31.8 M"). Do not invent data.
State clearly, once, that the portfolio and offer are SYNTHETIC test data, not a real client's holdings. Explain "1-in-100" as ~1% annual chance, not "once every 100 years".`;
}

function offerSection(o: OfferBriefing) {
  const at = (rp: number) => o.lossByReturnPeriod.find((r) => r.rp === rp);
  const r100 = at(100);
  const top = [...o.buildings].sort((a, b) => b.groundUpRp100Kes - a.groundUpRp100Kes).filter((b) => b.groundUpRp100Kes > 0);
  const dNet = o.portfolioImpact.rp100NetAfterKes - o.portfolioImpact.rp100NetBeforeKes;
  return [
    `## This offer`,
    `${o.buildings.reduce((a, b) => a + b.count, 0)} building(s) worth ${fmtKes(o.totalTivKes)} were extracted (${o.extractedBy}). Under ${o.terms}, a 1-in-100 flood would cause **${fmtKes(r100?.groundUpKes ?? 0)}** of damage, of which the insurer pays **${fmtKes(r100?.grossKes ?? 0)}** gross and keeps **${fmtKes(r100?.netKes ?? 0)}** net.`,
    ...(top.length
      ? top.slice(0, 3).map((b) => `- **${b.label}** (${b.housingClass}, ${b.location}): ${fmtPct(b.damageRatioRp100, 0)} damage, ${fmtKes(b.groundUpRp100Kes)}. ${b.shapDrivers.slice(0, 2).join(" ")}`)
      : [`- None of the extracted buildings is inside the JRC flood footprint up to the 1-in-500 level.`]),
    `- Adding it moves the portfolio's 1-in-100 net loss by ${fmtKes(dNet)} and its average annual loss from ${fmtKes(o.portfolioImpact.aalGroundUpBeforeKes)} to ${fmtKes(o.portfolioImpact.aalGroundUpAfterKes)}.`,
    `- Recommendation: ${top.length ? "accept subject to confirmed floor heights and wall materials for the flooded buildings; consider a higher deductible for those inside the 1-in-10 corridor." : "flood is not a driver for this risk at the modelled resolution — accept on flood terms, but confirm the location."}`,
    ``,
  ];
}

export function templateBriefing(p: BriefingPayload): string {
  const at = (rp: number) => p.lossByReturnPeriod.find((r) => r.rp === rp);
  const r10 = at(10);
  const r100 = at(100);
  const r250 = at(250);
  const r500 = at(500);
  const topArea = p.topAreasRp100[0];
  const topClass = [...p.byClassRp100].sort((a, b) => b.lossKes - a.lossKes)[0];
  const xlRec100 = r100 ? r100.insuredKes - r100.netKes : 0;
  const lines = [
    ...(p.offer ? offerSection(p.offer) : []),
    `## Headline`,
    `A flood with roughly a **1% chance in any year** (the "1-in-100") would cost this portfolio about **${fmtKes(r100?.grossKes ?? 0)}** ground-up — ${fmtPct(r100?.pctOfTiv ?? 0, 2)} of the ${fmtKes(p.portfolio.totalTivKes)} insured. The long-run average cost is **${fmtKes(p.aal.grossKes)} per year**.`,
    ``,
    `> This briefing is based on a **synthetic** test portfolio (${p.portfolio.buildings} buildings${p.portfolio.aiIngestedBuildings ? `, ${p.portfolio.aiIngestedBuildings} added via AI ingestion` : ""}), not a real client's holdings.`,
    ``,
    `## Key numbers`,
    `- Total insured value: ${fmtKes(p.portfolio.totalTivKes)}; ${p.portfolio.buildingsWetRp100} buildings (${fmtKes(p.portfolio.tivInRp100FootprintKes)}) sit inside the 1-in-100 flood footprint`,
    `- Gross loss — 1-in-10: ${fmtKes(r10?.grossKes ?? 0)} · 1-in-100: ${fmtKes(r100?.grossKes ?? 0)} · 1-in-250: ${fmtKes(r250?.grossKes ?? 0)} (interpolated) · 1-in-500: ${fmtKes(r500?.grossKes ?? 0)}`,
    `- Average annual loss: ${fmtKes(p.aal.grossKes)} gross, ${fmtKes(p.aal.netKes)} net of deductibles and reinsurance`,
    `- Cat XL (${p.settings.catXl}) recovers ${fmtKes(xlRec100)} at the 1-in-100 level`,
    p.monteCarlo
      ? `- With damage uncertainty (Monte Carlo, ${p.monteCarlo.years.toLocaleString()} years): 1-in-100 ${fmtKes(p.monteCarlo.oep100Kes)}, 1-in-200 ${fmtKes(p.monteCarlo.oep200Kes)}`
      : "",
    ``,
    `## Where the risk sits`,
    topArea
      ? `- **${topArea.area}** drives ${fmtPct(topArea.sharePct / 100, 0)} of the 1-in-100 loss (${fmtKes(topArea.lossKes)}); ${p.topAreasRp100
          .slice(1, 3)
          .map((a) => `${a.area} ${fmtPct(a.sharePct / 100, 0)}`)
          .join(", ")} follow.`
      : "",
    topClass ? `- By construction, **${topClass.housingClass}** carries the largest loss (${fmtKes(topClass.lossKes)}).` : "",
    `- Flooding is confined to the Nzoia river corridor and its Lake Victoria mouth, so the footprint barely grows from 1-in-10 to 1-in-500 — rarer floods mainly mean *deeper* water on the same buildings.`,
    ``,
    `## What could move these numbers`,
    ...p.sensitivityRp100.map((s) => `- ${s.case}: ${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(1)}% on the 1-in-100 loss.`),
    `- Vulnerability: the ML model is ${p.mlVsJrcRp100Pct >= 0 ? "+" : ""}${p.mlVsJrcRp100Pct.toFixed(1)}% vs the plain JRC curve at 1-in-100; both are adapted from global curves, not Kenyan claims.`,
    ``,
    `## Recommended next steps`,
    `- Price risks inside the 1-in-10 corridor around ${topArea?.area ?? "Port Victoria"} separately; they generate most of the loss from frequent floods.`,
    `- Collect floor heights and wall material for the riverside buildings — raising the effective floor 0.5 m is the single biggest lever on modelled loss.`,
    `- Re-calibrate the vulnerability model on loss-adjuster records from the March 2026 Budalangi flood when available.`,
  ];
  return lines.filter((l) => l !== "").join("\n").replace(/\n## /g, "\n\n## ").replace(/^\n+/, "");
}
