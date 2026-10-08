/**
 * Local explanations of a building's damage ratio, computed in the browser against the exact function the
 * financial engine uses (engine.ts `damageRatio`).
 *
 *  - SHAP: exact interventional Shapley values. With four features every one of the 16 coalitions is evaluated,
 *    so there is no sampling error; values add up exactly to (building DR − baseline DR).
 *  - LIME-style surrogate: a weighted linear model fitted to perturbations around the building, giving local
 *    "what if" slopes (e.g. damage removed per 10 cm of raised floor) and a fidelity score.
 */
import { damageRatio, depthAtRp, depthsOf } from "./engine";
import { seededRandom } from "./geo";
import { HOUSING_CLASSES, type Building, type HousingClass, type Settings, type VulnerabilityData } from "./types";

export interface Instance {
  depth: number;
  plinth: number;
  cls: HousingClass;
  quality: number;
}

export const FEATURE_KEYS = ["depth", "plinth", "cls", "quality"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  depth: "Flood depth at site",
  plinth: "Raised floor",
  cls: "Construction class",
  quality: "Build quality",
};

type Dr = (x: Instance) => number;

export function drFunction(v: VulnerabilityData, s: Settings): Dr {
  return (x) => (x.depth > 0 ? damageRatio(v, x.cls, x.depth, x.quality, x.plinth, s.vulnModel, s.duration) : 0);
}

export function instanceAt(b: Building, rp: number, s: Settings): Instance {
  return { depth: depthAtRp(depthsOf(b, s.hazardMode), rp), plinth: b.plinthExtra, cls: b.cls, quality: b.quality };
}

/** Reference population: starter-portfolio buildings that are flooded at this return period. */
export function backgroundAt(portfolio: Building[], rp: number, s: Settings, maxN = 80): Instance[] {
  const wet = portfolio
    .filter((b) => b.origin === "starter_kit")
    .map((b) => instanceAt(b, rp, s))
    .filter((x) => x.depth > 0);
  const step = Math.max(1, Math.floor(wet.length / maxN));
  return wet.filter((_, i) => i % step === 0).slice(0, maxN);
}

export interface ShapResult {
  /** Mean damage ratio over the reference population. */
  base: number;
  value: number;
  phi: Record<FeatureKey, number>;
}

const FACT = [1, 1, 2, 6, 24];

export function shapExact(x: Instance, background: Instance[], f: Dr): ShapResult {
  const M = FEATURE_KEYS.length;
  const coalitionValue = new Array<number>(1 << M).fill(0);
  for (let mask = 0; mask < 1 << M; mask++) {
    let sum = 0;
    for (const b of background) {
      const z = { ...b };
      FEATURE_KEYS.forEach((k, i) => {
        if (mask & (1 << i)) (z as Record<FeatureKey, unknown>)[k] = x[k];
      });
      sum += f(z);
    }
    coalitionValue[mask] = sum / background.length;
  }
  const phi = {} as Record<FeatureKey, number>;
  FEATURE_KEYS.forEach((k, i) => {
    let p = 0;
    for (let mask = 0; mask < 1 << M; mask++) {
      if (mask & (1 << i)) continue;
      const size = bitCount(mask);
      const w = (FACT[size] * FACT[M - size - 1]) / FACT[M];
      p += w * (coalitionValue[mask | (1 << i)] - coalitionValue[mask]);
    }
    phi[k] = p;
  });
  return { base: coalitionValue[0], value: coalitionValue[(1 << M) - 1], phi };
}

/** Plain-English reading of a SHAP result, largest effects first. */
export function shapSentences(shap: ShapResult, x: Instance, typical: { depth: number }, classLabels: Record<HousingClass, string>) {
  const p = shap.phi;
  const pts = (v: number) => `${Math.abs(v * 100).toFixed(1)} percentage points`;
  const lines: [number, string][] = [
    [
      p.depth,
      `${x.depth > typical.depth ? "Deeper" : "Shallower"} water than the typical flooded building (${x.depth.toFixed(2)} m vs ${typical.depth.toFixed(2)} m) ${p.depth > 0 ? "adds" : "removes"} ${pts(p.depth)} of damage.`,
    ],
    [p.cls, `Being ${classLabels[x.cls].toLowerCase()} construction ${p.cls > 0 ? "adds" : "removes"} ${pts(p.cls)} compared with the book's mix of building types.`],
    [p.plinth, `The ${x.plinth.toFixed(2)} m raised floor keeps water out and removes ${pts(p.plinth)}.`],
    [p.quality, `Build quality ${p.quality < 0 ? "above" : "below"} the book average ${p.quality > 0 ? "adds" : "removes"} ${pts(p.quality)}.`],
  ];
  const out = lines
    .filter(([v]) => Math.abs(v) >= 0.005)
    .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))
    .map(([, s]) => s);
  return out.length ? out : ["This building behaves like a typical flooded building in the book — no single factor moves its damage much."];
}

const bitCount = (n: number) => {
  let c = 0;
  for (let m = n; m; m &= m - 1) c++;
  return c;
};

export interface LimeResult {
  /** Change in damage ratio per +1 m of flood depth (locally). */
  perMetreDepth: number;
  /** Change in damage ratio per +1 m of raised floor (locally). */
  perMetrePlinth: number;
  /** Change in damage ratio per +0.1 build quality (locally). */
  perTenthQuality: number;
  /** Damage-ratio difference for this construction class vs. the other classes at the same conditions. */
  classEffect: number;
  /** Weighted R² of the surrogate on its perturbation sample (how faithful the linear story is). */
  fidelity: number;
  samples: number;
}

const DEPTH_SD = 0.5;
const PLINTH_SD = 0.25;
const QUALITY_SD = 0.2;
const KERNEL_WIDTH = 0.75 * Math.sqrt(FEATURE_KEYS.length);

export function limeSurrogate(x: Instance, f: Dr, seed: string, n = 500): LimeResult {
  const rand = seededRandom(seed);
  const randn = () => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const others = HOUSING_CLASSES.filter((c) => c !== x.cls);
  const rows: number[][] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i < n; i++) {
    const depth = Math.max(0, x.depth + DEPTH_SD * randn());
    const plinth = Math.max(0, x.plinth + PLINTH_SD * randn());
    const quality = Math.min(1, Math.max(0, x.quality + QUALITY_SD * randn()));
    const same = rand() < 0.6 ? 1 : 0;
    const cls = same ? x.cls : others[Math.floor(rand() * others.length)];
    const d2 =
      ((depth - x.depth) / DEPTH_SD) ** 2 + ((plinth - x.plinth) / PLINTH_SD) ** 2 + ((quality - x.quality) / QUALITY_SD) ** 2 + (1 - same) ** 2;
    rows.push([1, depth - x.depth, plinth - x.plinth, quality - x.quality, same]);
    ys.push(f({ depth, plinth, cls, quality }));
    ws.push(Math.exp(-d2 / KERNEL_WIDTH ** 2));
  }
  const beta = weightedRidge(rows, ys, ws, 1e-4);
  const sw = ws.reduce((a, b) => a + b, 0);
  const yBar = ys.reduce((a, y, i) => a + ws[i] * y, 0) / sw;
  let ssRes = 0;
  let ssTot = 0;
  rows.forEach((r, i) => {
    const pred = r.reduce((a, xv, j) => a + xv * beta[j], 0);
    ssRes += ws[i] * (ys[i] - pred) ** 2;
    ssTot += ws[i] * (ys[i] - yBar) ** 2;
  });
  return {
    perMetreDepth: beta[1],
    perMetrePlinth: beta[2],
    perTenthQuality: beta[3] / 10,
    classEffect: beta[4],
    fidelity: ssTot > 1e-12 ? Math.max(0, 1 - ssRes / ssTot) : 1,
    samples: n,
  };
}

/** Solves (XᵀWX + λI)β = XᵀWy by Gaussian elimination; the intercept (column 0) is not penalised. */
function weightedRidge(X: number[][], y: number[], w: number[], lambda: number) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array<number>(p + 1).fill(0));
  X.forEach((r, i) => {
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) A[a][b] += w[i] * r[a] * r[b];
      A[a][p] += w[i] * r[a] * y[i];
    }
  });
  for (let a = 1; a < p; a++) A[a][a] += lambda;
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] || 1e-12;
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const k = A[r][c] / d;
      for (let j = c; j <= p; j++) A[r][j] -= k * A[c][j];
    }
  }
  return A.map((row, i) => row[p] / (row[i] || 1e-12));
}
