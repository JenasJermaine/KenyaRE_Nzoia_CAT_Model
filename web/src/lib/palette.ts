import type { HousingClass } from "./types";

/** Kenya Re brand colours plus tints of them; charts and maps use nothing else. Mirrors the tokens in globals.css. */
export const KRE = {
  navy: "#041d3b",
  navy500: "#3a5677",
  navy300: "#8fa3b8",
  navy100: "#dde4ec",
  red: "#d11242",
  redDark: "#7a0a26",
  redLight: "#e88aa1",
  redPale: "#f7c6d2",
  grey: "#696f6f",
  greyLight: "#c9cdcd",
  grid: "#e3e6e8",
  axis: "#696f6f",
} as const;

/** Red for the most flood-vulnerable construction, navy for the most resilient. */
export const CLASS_COLORS: Record<HousingClass, string> = {
  informal_iron_sheet: KRE.red,
  semi_permanent: KRE.redLight,
  permanent_masonry: KRE.navy300,
  concrete_rcc: KRE.navy,
};

/** Loss layers on every exceedance curve. */
export const LAYER_COLORS = { groundUp: KRE.navy, gross: KRE.grey, net: KRE.red, baseline: KRE.greyLight, monteCarlo: KRE.navy500 } as const;

/** Damage ratio → single-hue red ramp; dry buildings are pale navy. */
export function damageColor(dr: number) {
  if (dr <= 0) return KRE.navy300;
  if (dr < 0.1) return KRE.redPale;
  if (dr < 0.3) return KRE.redLight;
  if (dr < 0.6) return KRE.red;
  return KRE.redDark;
}

/** Text colour for a damage ratio printed on white. */
export function damageTextColor(dr: number) {
  return dr > 0.6 ? KRE.redDark : dr > 0.1 ? KRE.red : KRE.grey;
}

/** Linear blend navy → grey → red for a 0–1 feature value (SHAP beeswarm). */
export function lowHighColor(t: number) {
  const stops = [
    [58, 86, 119],
    [201, 205, 205],
    [209, 18, 66],
  ];
  const x = Math.min(1, Math.max(0, t)) * 2;
  const i = Math.min(1, Math.floor(x));
  const f = x - i;
  const [a, b] = [stops[i], stops[i + 1]];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}
