/**
 * Financial engine — a line-for-line port of the notebook's engine (section 4 of
 * notebooks/nzoia_flood_cat_model.ipynb). It reads the same exported lookup tables, so for the
 * same settings it reproduces the notebook's numbers (see scripts/validate-engine.ts).
 */
import {
  HOUSING_CLASSES,
  type Building,
  type HousingClass,
  type Settings,
  type VulnStat,
  type VulnerabilityData,
} from "./types";

export const RPS = [10, 20, 50, 100, 200, 500];
export const KEY_RPS = [10, 20, 50, 100, 200, 250, 500, 1000];
const LN_KNOTS = [Math.log(2), ...RPS.map(Math.log)];
const LN_MIN = Math.log(2);
const LN_MAX = Math.log(10_000);
const DURATION_INDEX: Record<number, number> = { 2: 0, 7: 1, 21: 2 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Depth at any return period: 0 at RP≤2, linear in ln(RP) between maps, RP200→500 slope beyond, capped at RP10,000. */
export function depthAtRp(d6: number[], rp: number): number {
  const lr = clamp(Math.log(rp), LN_MIN, LN_MAX);
  let k = 0;
  while (k < LN_KNOTS.length && LN_KNOTS[k] <= lr) k++;
  k = clamp(k - 1, 0, 5);
  const y0 = k === 0 ? 0 : d6[k - 1];
  const y1 = d6[k];
  const w = (lr - LN_KNOTS[k]) / (LN_KNOTS[k + 1] - LN_KNOTS[k]);
  let out = y0 * (1 - w) + y1 * w;
  if (w > 1 && !(d6[5] >= d6[4])) out = d6[5];
  return Math.max(out, 0);
}

/** Damage ratio statistic for one building at one depth. */
export function damageRatio(
  v: VulnerabilityData,
  cls: HousingClass,
  depth: number,
  quality: number,
  plinthExtra: number,
  model: Settings["vulnModel"],
  duration: Settings["duration"],
  stat: VulnStat = "mean",
): number {
  const d = Math.max(depth - plinthExtra, 0);
  const n = Math.round(v.depthMax / v.depthStep) + 1;
  const x = clamp(d, 0, v.depthMax) / v.depthStep;
  const i0 = Math.min(Math.floor(x), n - 2);
  const w = x - i0;
  if (model === "jrc") {
    const t = v.jrcAdapted[cls];
    return t[i0] * (1 - w) + t[i0 + 1] * w;
  }
  if (d <= 0) return 0;
  const M = v.ml[cls][stat][DURATION_INDEX[duration]];
  const qx = clamp(quality, 0, 1) * 2;
  const q0 = Math.min(Math.floor(qx), 1);
  const wq = qx - q0;
  const lo = M[q0][i0] * (1 - w) + M[q0][i0 + 1] * w;
  const hi = M[q0 + 1][i0] * (1 - w) + M[q0 + 1][i0 + 1] * w;
  return lo * (1 - wq) + hi * wq;
}

export const depthsOf = (b: Building, mode: Settings["hazardMode"]) => (mode === "point" ? b.dPoint : b.dBilinear);

/** Buildings that can ever take a loss (wet at the extrapolated RP10,000 depth). */
export const atRisk = (portfolio: Building[], mode: Settings["hazardMode"]) =>
  portfolio.filter((b) => depthAtRp(depthsOf(b, mode), 10_000) > 0);

export function applyPolicy(gu: number, tiv: number, s: Settings) {
  return clamp(gu - s.deductiblePct * tiv, 0, s.limitPct * tiv);
}

export function applyReinsurance(insured: number, s: Settings) {
  const qs = s.qsCession * insured;
  const afterQs = insured - qs;
  const xl = clamp(afterQs - s.xlRetention, 0, s.xlLimit);
  return { insured, qsCeded: qs, xlCeded: xl, net: afterQs - xl };
}

export interface EventLoss {
  rp: number;
  gross: number;
  insured: number;
  qsCeded: number;
  xlCeded: number;
  net: number;
  byClass: Record<HousingClass, number>;
  buildingsWithLoss: number;
}

const zeroByClass = () =>
  Object.fromEntries(HOUSING_CLASSES.map((c) => [c, 0])) as Record<HousingClass, number>;

export function buildingLossAtRp(b: Building, rp: number, v: VulnerabilityData, s: Settings) {
  const depth = depthAtRp(depthsOf(b, s.hazardMode), rp);
  const dr = depth > 0 ? damageRatio(v, b.cls, depth, b.quality, b.plinthExtra, s.vulnModel, s.duration) : 0;
  return { depth, dr, gross: dr * b.tiv };
}

export function eventLoss(portfolio: Building[], rp: number, v: VulnerabilityData, s: Settings): EventLoss {
  let gross = 0;
  let insured = 0;
  let n = 0;
  const byClass = zeroByClass();
  for (const b of portfolio) {
    const { gross: g } = buildingLossAtRp(b, rp, v, s);
    if (g <= 0) continue;
    gross += g;
    insured += applyPolicy(g, b.tiv, s);
    byClass[b.cls] += g;
    n++;
  }
  return { rp, gross, byClass, buildingsWithLoss: n, ...applyReinsurance(insured, s) };
}

export interface EpPoint {
  rp: number;
  p: number;
  gross: number;
  insured: number;
  net: number;
}

export interface EpResult {
  curve: EpPoint[];
  aalGross: number;
  aalInsured: number;
  aalNet: number;
}

/** Deterministic EP curve + AAL on 400 log-spaced exceedance probabilities in [1e-4, 0.5], as in the notebook. */
export function epCurve(portfolio: Building[], v: VulnerabilityData, s: Settings, nPoints = 400): EpResult {
  const risky = atRisk(portfolio, s.hazardMode);
  const lo = Math.log10(1e-4);
  const hi = Math.log10(0.5);
  const curve: EpPoint[] = [];
  for (let i = 0; i < nPoints; i++) {
    const p = 10 ** (lo + ((hi - lo) * i) / (nPoints - 1));
    const e = eventLoss(risky, 1 / p, v, s);
    curve.push({ rp: 1 / p, p, gross: e.gross, insured: e.insured, net: e.net });
  }
  const aal = (key: "gross" | "insured" | "net") => {
    let a = curve[0][key] * curve[0].p;
    for (let i = 1; i < curve.length; i++) a += ((curve[i][key] + curve[i - 1][key]) / 2) * (curve[i].p - curve[i - 1].p);
    return a;
  };
  return { curve, aalGross: aal("gross"), aalInsured: aal("insured"), aalNet: aal("net") };
}

// ---------------------------------------------------------------------------------------------
// Monte Carlo year-loss simulation with correlated, mean-preserving secondary uncertainty
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSampler(rand: () => number) {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    let w = 0;
    while (u === 0) u = rand();
    w = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * w);
    return r * Math.cos(2 * Math.PI * w);
  };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation, |error| < 1.5e-7). */
export function normCdf(z: number) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

const U_KNOTS = [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1];

function sampleDamage(q: number[], mean: number, cap: number, u: number) {
  const [q05, q25, q50, q75, q95] = q;
  const V = [
    Math.max(0, q05 - 0.25 * (q25 - q05)),
    q05,
    q25,
    q50,
    q75,
    q95,
    Math.max(Math.min(cap, q95 + 0.25 * (q95 - q75)), q95),
  ];
  let qbar = 0;
  for (let i = 0; i < 6; i++) qbar += ((U_KNOTS[i + 1] - U_KNOTS[i]) * (V[i] + V[i + 1])) / 2;
  if (qbar <= 1e-9) return mean;
  let k = 0;
  while (k < 6 && U_KNOTS[k + 1] <= u) k++;
  k = Math.min(k, 5);
  const w = (u - U_KNOTS[k]) / (U_KNOTS[k + 1] - U_KNOTS[k]);
  const draw = V[k] + w * (V[k + 1] - V[k]);
  return clamp((mean * draw) / qbar, 0, 1);
}

export interface McResult {
  years: number;
  gross: Float64Array;
  insured: Float64Array;
  net: Float64Array;
  stats: Record<"gross" | "insured" | "net", McStats>;
}

export interface McStats {
  oep: { rp: number; loss: number }[];
  aal: number;
  std: number;
  tvar1: number;
}

export function oepStats(losses: Float64Array, rps = KEY_RPS): McStats {
  const L = Array.from(losses).sort((a, b) => b - a);
  const n = L.length;
  const mean = L.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const k = Math.max(1, Math.floor(n * 0.01));
  const tvar1 = L.slice(0, k).reduce((a, b) => a + b, 0) / k;
  return {
    oep: rps.filter((r) => n / r >= 1).map((rp) => ({ rp, loss: L[Math.floor(n / rp) - 1] })),
    aal: mean,
    std,
    tvar1,
  };
}

export function simulate(portfolio: Building[], v: VulnerabilityData, s: Settings, seed = 2026): McResult {
  const rand = mulberry32(seed);
  const randn = normalSampler(rand);
  const risky = atRisk(portfolio, s.hazardMode);
  const caps = Object.fromEntries(v.classParams.map((p) => [p.housing_class, p.max_damage])) as Record<HousingClass, number>;
  const n = s.mcYears;
  const gross = new Float64Array(n);
  const insured = new Float64Array(n);
  const net = new Float64Array(n);
  const sr = Math.sqrt(s.rho);
  const se = Math.sqrt(1 - s.rho);
  const qStats: VulnStat[] = ["q05", "q25", "q50", "q75", "q95"];
  for (let y = 0; y < n; y++) {
    const p = rand();
    if (p >= 0.5) continue;
    const rp = 1 / Math.max(p, 1e-12);
    const Z = randn();
    let g = 0;
    let ins = 0;
    for (const b of risky) {
      const depth = depthAtRp(depthsOf(b, s.hazardMode), rp);
      const eps = randn();
      if (depth <= 0) continue;
      let dr: number;
      if (s.vulnModel === "jrc") {
        dr = damageRatio(v, b.cls, depth, b.quality, b.plinthExtra, "jrc", s.duration);
      } else {
        const mean = damageRatio(v, b.cls, depth, b.quality, b.plinthExtra, "ml", s.duration, "mean");
        const q = qStats.map((st) => damageRatio(v, b.cls, depth, b.quality, b.plinthExtra, "ml", s.duration, st));
        dr = sampleDamage(q, mean, caps[b.cls], normCdf(sr * Z + se * eps));
      }
      const gu = dr * b.tiv;
      g += gu;
      ins += applyPolicy(gu, b.tiv, s);
    }
    gross[y] = g;
    insured[y] = ins;
    net[y] = applyReinsurance(ins, s).net;
  }
  return {
    years: n,
    gross,
    insured,
    net,
    stats: { gross: oepStats(gross), insured: oepStats(insured), net: oepStats(net) },
  };
}

/** Empirical OEP curve points for charting (thinned). */
export function oepCurve(losses: Float64Array, maxPoints = 160) {
  const L = Array.from(losses).sort((a, b) => b - a);
  const n = L.length;
  const pts: { rp: number; loss: number }[] = [];
  const lo = Math.log(2);
  const hi = Math.log(n);
  for (let i = 0; i < maxPoints; i++) {
    const rp = Math.exp(lo + ((hi - lo) * i) / (maxPoints - 1));
    const idx = Math.min(n - 1, Math.max(0, Math.floor(n / rp) - 1));
    pts.push({ rp, loss: L[idx] });
  }
  return pts;
}

// ---------------------------------------------------------------------------------------------
// Portfolio summaries
// ---------------------------------------------------------------------------------------------

export function rpTable(portfolio: Building[], v: VulnerabilityData, s: Settings, rps = KEY_RPS) {
  const risky = atRisk(portfolio, s.hazardMode);
  return rps.map((rp) => ({ ...eventLoss(risky, rp, v, s), interpolated: !RPS.includes(rp) }));
}

export function classSummary(portfolio: Building[], v: VulnerabilityData, s: Settings, rp = 100) {
  return HOUSING_CLASSES.map((cls) => {
    const bs = portfolio.filter((b) => b.cls === cls);
    let tiv = 0;
    let wet = 0;
    let tivWet = 0;
    let loss = 0;
    let drSum = 0;
    for (const b of bs) {
      tiv += b.tiv;
      const r = buildingLossAtRp(b, rp, v, s);
      if (r.depth > 0) {
        wet++;
        tivWet += b.tiv;
        drSum += r.dr;
      }
      loss += r.gross;
    }
    return { cls, buildings: bs.length, tiv, wet, tivWet, loss, lossPctTiv: tiv ? loss / tiv : 0, meanDrWet: wet ? drSum / wet : 0 };
  });
}

export function accumulation(portfolio: Building[], v: VulnerabilityData, s: Settings, rp = 100) {
  const areas = new Map<string, { area: string; buildings: number; tiv: number; wet: number; tivWet: number; tivNear: number; loss: number }>();
  let total = 0;
  for (const b of portfolio) {
    const a = areas.get(b.area) ?? { area: b.area, buildings: 0, tiv: 0, wet: 0, tivWet: 0, tivNear: 0, loss: 0 };
    const r = buildingLossAtRp(b, rp, v, s);
    a.buildings++;
    a.tiv += b.tiv;
    if (r.depth > 0) {
      a.wet++;
      a.tivWet += b.tiv;
    }
    if (b.distRp100Km <= 2) a.tivNear += b.tiv;
    a.loss += r.gross;
    total += r.gross;
    areas.set(b.area, a);
  }
  return [...areas.values()]
    .map((a) => ({ ...a, share: total ? a.loss / total : 0 }))
    .sort((x, y) => y.loss - x.loss || y.tivWet - x.tivWet);
}

// ---------------------------------------------------------------------------------------------
// Financial waterfall in the problem statement's vocabulary. Note the naming shift: what the rest of this
// file calls `gross` (damage × TIV) is the brief's GROUND-UP loss, and `insured` (after deductible and
// limit) is the brief's GROSS loss.
// ---------------------------------------------------------------------------------------------

export interface Waterfall {
  rp: number;
  /** Physical damage before any insurance terms. */
  groundUp: number;
  /** Kept by policyholders. */
  deductible: number;
  /** Ground-up loss above the policy limit, also kept by policyholders. */
  aboveLimit: number;
  /** Insurer's loss after deductible and limit. */
  gross: number;
  qsCeded: number;
  xlCeded: number;
  /** Insurer's loss after quota share and Cat XL recoveries. */
  net: number;
  buildingsWithLoss: number;
}

export function buildingTerms(groundUp: number, tiv: number, s: Settings) {
  const deductible = Math.min(groundUp, s.deductiblePct * tiv);
  const afterDeductible = groundUp - deductible;
  const gross = Math.min(afterDeductible, s.limitPct * tiv);
  return { deductible, aboveLimit: afterDeductible - gross, gross };
}

export function waterfallAtRp(portfolio: Building[], rp: number, v: VulnerabilityData, s: Settings): Waterfall {
  const w = { groundUp: 0, deductible: 0, aboveLimit: 0, gross: 0, buildingsWithLoss: 0 };
  for (const b of portfolio) {
    const { gross: gu } = buildingLossAtRp(b, rp, v, s);
    if (gu <= 0) continue;
    const t = buildingTerms(gu, b.tiv, s);
    w.groundUp += gu;
    w.deductible += t.deductible;
    w.aboveLimit += t.aboveLimit;
    w.gross += t.gross;
    w.buildingsWithLoss++;
  }
  const ri = applyReinsurance(w.gross, s);
  return { rp, ...w, qsCeded: ri.qsCeded, xlCeded: ri.xlCeded, net: ri.net };
}

export const waterfallTable = (portfolio: Building[], v: VulnerabilityData, s: Settings, rps = KEY_RPS) =>
  rps.map((rp) => ({ ...waterfallAtRp(portfolio, rp, v, s), interpolated: !RPS.includes(rp) }));

/** One building's flood depth, damage ratio and losses at each return period. */
export function buildingProfile(b: Building, v: VulnerabilityData, s: Settings, rps = RPS) {
  return rps.map((rp) => {
    const r = buildingLossAtRp(b, rp, v, s);
    return { rp, depth: r.depth, dr: r.dr, groundUp: r.gross, gross: buildingTerms(r.gross, b.tiv, s).gross };
  });
}

export function topBuildings(portfolio: Building[], v: VulnerabilityData, s: Settings, rp = 100, n = 15) {
  return portfolio
    .map((b) => ({ b, ...buildingLossAtRp(b, rp, v, s) }))
    .filter((r) => r.gross > 0)
    .sort((x, y) => y.gross - x.gross)
    .slice(0, n);
}
