/**
 * Cross-checks the TypeScript engine against the reference results exported by the notebook.
 * Run: npm run validate
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type Building, type NotebookResults, type Settings, type VulnerabilityData } from "../src/lib/types";
import { epCurve, rpTable, simulate } from "../src/lib/engine";

const dir = join(__dirname, "..", "public", "data");
const load = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), "utf8"));
const portfolio = load<Building[]>("portfolio.json");
const vuln = load<VulnerabilityData>("vulnerability.json");
const ref = load<NotebookResults>("results.json");

let failures = 0;
function check(label: string, got: number, want: number, tolPct: number) {
  const diff = want === 0 ? Math.abs(got) : (100 * Math.abs(got - want)) / Math.abs(want);
  const ok = diff <= tolPct;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(44)} ts=${(got / 1e6).toFixed(3)}M  nb=${(want / 1e6).toFixed(3)}M  Δ=${diff.toFixed(3)}%`);
}

const base: Settings = { ...DEFAULT_SETTINGS };
const det = rpTable(portfolio, vuln, base);
for (const row of ref.financial) {
  const t = det.find((d) => d.rp === row.return_period)!;
  check(`RP${row.return_period} gross`, t.gross, row.gross_M * 1e6, 0.5);
  check(`RP${row.return_period} insured`, t.insured, row.insured_M * 1e6, 0.5);
  check(`RP${row.return_period} net retained`, t.net, row.net_retained_M * 1e6, 0.5);
}
const jrc = rpTable(portfolio, vuln, { ...base, vulnModel: "jrc" });
for (const row of ref.scenario) {
  check(`RP${row.return_period} gross (JRC baseline)`, jrc.find((d) => d.rp === row.return_period)!.gross, row.gross_loss_JRC_baseline_KES_M * 1e6, 0.5);
}
const ep = epCurve(portfolio, vuln, base);
check("AAL gross", ep.aalGross, ref.ep.aalGross, 0.5);
check("AAL insured", ep.aalInsured, ref.ep.aalInsured, 0.5);
check("AAL net", ep.aalNet, ref.ep.aalNet, 0.5);

const t0 = Date.now();
const mc = simulate(portfolio, vuln, { ...base, mcYears: 50_000 });
console.log(`\nMonte Carlo 50,000 years in ${Date.now() - t0} ms (different RNG from numpy → sampling tolerance)`);
check("MC AAL gross", mc.stats.gross.aal, ref.monteCarlo.stats.gross.AAL, 3);
for (const rp of [10, 50, 100, 200]) {
  check(`MC OEP RP${rp} gross`, mc.stats.gross.oep.find((o) => o.rp === rp)!.loss, ref.monteCarlo.stats.gross[`RP${rp}`], 4);
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
