export function fmtKes(v: number, digits = 1) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `KES ${(v / 1e9).toFixed(2)} bn`;
  if (a >= 1e6) return `KES ${(v / 1e6).toFixed(digits)} M`;
  if (a >= 1e3) return `KES ${(v / 1e3).toFixed(0)} k`;
  return `KES ${v.toFixed(0)}`;
}

export const fmtM = (v: number, digits = 1) => (v / 1e6).toFixed(digits);

export function fmtPct(v: number, digits = 1) {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export const fmtNum = (v: number, digits = 0) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const rpLabel = (rp: number) => `1-in-${rp.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
