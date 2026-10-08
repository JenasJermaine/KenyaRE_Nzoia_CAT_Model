"use client";

import { GlobalShap } from "@/components/explain";
import { TermsGlossary } from "@/components/finance";
import { useModel } from "@/components/ModelProvider";
import { VulnerabilitySection } from "@/components/VulnerabilitySection";
import { Badge, Callout, Card, CardBody, CardHeader, PageHeader, Td, Th, type Provenance } from "@/components/ui";
import { fmtKes, fmtPct, rpLabel } from "@/lib/format";

const STAGES: { n: string; title: string; what: string; how: string; kind: Provenance[] }[] = [
  {
    n: "1",
    title: "Hazard",
    what: "Where does it flood and how deep?",
    how: "Six JRC Global River Flood Hazard Maps (1-in-10 … 1-in-500), 30″ (~925 m) cells. Each building reads the depth of its cell; dry = no-data → 0 m. Depth between maps is interpolated in ln(return period).",
    kind: ["real", "assumption"],
  },
  {
    n: "2",
    title: "Vulnerability",
    what: "How much damage at that depth?",
    how: "JRC/Huizinga (2017) Africa residential depth-damage curve, adapted per housing class (plinth, depth multiplier, ceiling). A monotone gradient-boosted model with quantile heads, trained on 30,000 synthetic pseudo-claims, adds build quality, flood duration and uncertainty.",
    kind: ["real", "assumption", "ai"],
  },
  {
    n: "3",
    title: "Exposure",
    what: "What is there and what is it worth?",
    how: "500 synthetic buildings from the starter kit (TIV corrected to the documented floor area × cost/m²), plus any buildings the LLM extracts from plain-English descriptions — geocoded to approximate town centroids and sampled against the same hazard.",
    kind: ["synthetic", "ai"],
  },
  {
    n: "4",
    title: "Financial engine",
    what: "What does it cost, and who pays?",
    how: "Per building: damage ratio × TIV = ground-up loss → minus deductible, capped at the limit = gross loss. Summed per flood event, then quota share and Cat XL give the net loss. Deterministic EP curve + AAL by integration; 20–50k-year Monte Carlo with correlated, mean-preserving secondary uncertainty for OEP and TVaR.",
    kind: ["assumption", "derived"],
  },
];

export default function Methodology() {
  const { data } = useModel();
  if (!data) return null;
  const r = data.results;
  const v = data.vulnerability;
  const typeKind = (t: string): Provenance =>
    t === "Published reference" ? "real" : t === "Synthetic" ? "synthetic" : t === "Data QA fix" ? "derived" : "assumption";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model & assumptions"
        lead="Everything an underwriter, judge or county officer needs to decide how far to trust the numbers: what is real, what is synthetic, how the AI is explained, every assumption, and what the model cannot see."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((s) => (
          <Card key={s.n} className="relative">
            <CardBody>
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center bg-ink text-sm font-semibold text-white">{s.n}</span>
                <h3 className="font-semibold">{s.title}</h3>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-700">{s.what}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.how}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.kind.map((k) => (
                  <Badge key={k} kind={k} />
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Financial terms" subtitle="As defined in the problem statement. Values are illustrative and editable in Model settings." badges={<Badge kind="assumption" />} />
        <CardBody>
          <TermsGlossary />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Explainable AI"
          subtitle="Two AI components, each with its own explanation"
          badges={<Badge kind="ai" />}
        />
        <CardBody className="space-y-5">
          <div className="grid gap-4 text-sm leading-relaxed text-slate-700 lg:grid-cols-3">
            <div className="border border-slate-200 p-3">
              <div className="mb-1 font-semibold text-ink">LLM extraction → evidence & provenance</div>
              Every extracted building carries the exact quote it came from, the AI&apos;s stated assumptions, and a tag on each value: from the
              document, AI judgement, or model default. The server validates classes, counts, coordinates and values, and a human edits before pricing.
            </div>
            <div className="border border-slate-200 p-3">
              <div className="mb-1 font-semibold text-ink">ML damage model → SHAP</div>
              Exact interventional Shapley values over four inputs (depth, raised floor, class, quality). Each building&apos;s damage ratio is split into
              contributions that add up exactly from the average flooded building in the book. Computed live in the browser for every offer; the global
              view below uses the <code>shap</code> library on {data.explain?.explained.n.toLocaleString() ?? "the"} pseudo-claims.
            </div>
            <div className="border border-slate-200 p-3">
              <div className="mb-1 font-semibold text-ink">ML damage model → LIME</div>
              A kernel-weighted linear surrogate fitted to 500 perturbations around one building gives local &ldquo;what if&rdquo; slopes — damage per
              10 cm more water or 10 cm higher floor — plus a fidelity R² that says when the straight-line story is unreliable.
            </div>
          </div>
          {data.explain ? (
            <GlobalShap explain={data.explain} classColors={v.classColors} classLabels={v.classLabels} />
          ) : (
            <Callout tone="warn">
              Global SHAP not exported yet — run <code>python notebooks/explain_shap.py</code> to create <code>web/public/data/explain.json</code>.
            </Callout>
          )}
        </CardBody>
      </Card>

      <VulnerabilitySection />

      <Card>
        <CardHeader title="Data sources — real or synthetic?" />
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>Data</Th>
              <Th>Status</Th>
              <Th>Source & use</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <Td className="font-medium">nzoia_rp&#123;10,20,50,100,200,500&#125;y.tif</Td>
              <Td><Badge kind="real" /></Td>
              <Td className="text-slate-600">European Commission JRC Global River Flood Hazard Maps (floodMapGL), clipped to 33.7–35.4°E, −0.3–1.3°N. Flood depth in metres.</Td>
            </tr>
            <tr>
              <Td className="font-medium">exposure_nzoia_synthetic.csv</Td>
              <Td><Badge kind="synthetic" /></Td>
              <Td className="text-slate-600">500 generated buildings (fixed random seed), classes in fixed proportions, values = floor area × 2025 Kenyan construction cost per m².</Td>
            </tr>
            <tr>
              <Td className="font-medium">JRC depth-damage functions</Td>
              <Td><Badge kind="real">Published reference</Badge></Td>
              <Td className="text-slate-600">{data.vulnerability.jrcReference.citation}. Africa residential (primary) and Global residential (secondary).</Td>
            </tr>
            <tr>
              <Td className="font-medium">Pseudo-claims (30,000)</Td>
              <Td><Badge kind="synthetic" /></Td>
              <Td className="text-slate-600">Generated in the notebook from the adapted curves plus documented modifiers and noise; used only to train the ML vulnerability model.</Td>
            </tr>
            <tr>
              <Td className="font-medium">Town gazetteer (24 places)</Td>
              <Td><Badge kind="assumption">Approximate</Badge></Td>
              <Td className="text-slate-600">Approximate town centroids (±2–3 km) for area labels and for geocoding AI-ingested descriptions.</Td>
            </tr>
            <tr>
              <Td className="font-medium">AI-ingested buildings</Td>
              <Td><Badge kind="synthetic" /> <Badge kind="ai" /></Td>
              <Td className="text-slate-600">Rows extracted by the LLM from user text; positions jittered around the named place (or snapped to the river corridor when the text says so).</Td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Callout tone="warn" title="Data-quality finding: the CSV's tiv_kes column is 10× too large">
        The file sums to <b>{fmtKes(r.dataQa.tivFileTotal)}</b>, but the data dictionary states a total of{" "}
        <b>{fmtKes(r.dataQa.tivMetadataTotal)}</b> and defines TIV as floor_area × cost_per_m2 rounded to KES 5,000. Recomputing from the
        file&rsquo;s own columns reproduces the documented total exactly (ratio {r.dataQa.tivRatioMedian.toFixed(2)} on every row). The model
        uses the documented value; the original is kept as <code>tivFile</code> for audit. Using the file value would multiply every
        monetary output by ten.
      </Callout>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Hazard at a glance" badges={<Badge kind="real" />} />
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Map</Th>
                <Th right>Cells flooded</Th>
                <Th right>Median depth</Th>
                <Th right>90th pct</Th>
                <Th right>Max</Th>
                <Th right>Bldgs wet</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.hazardStats.map((h, i) => (
                <tr key={h.return_period}>
                  <Td className="font-medium">{rpLabel(h.return_period)}</Td>
                  <Td right>{h.flooded_cells.toLocaleString()} ({h.flooded_pct.toFixed(1)}%)</Td>
                  <Td right>{h.median_depth_m.toFixed(2)} m</Td>
                  <Td right>{h.p90_depth_m.toFixed(2)} m</Td>
                  <Td right>{h.max_depth_m.toFixed(1)} m</Td>
                  <Td right>{r.wetBuildings[i].buildings_wet_point}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <CardBody className="border-t border-slate-100 text-xs text-slate-500">
            No cell gets shallower as the event gets rarer (checked). The footprint grows by only ~13% from 1-in-10 to 1-in-500.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Notebook sensitivity analysis" subtitle="Base portfolio, one assumption changed at a time" />
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Case</Th>
                <Th right>1-in-100 gross</Th>
                <Th right>Δ</Th>
                <Th right>AAL</Th>
                <Th right>Δ</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.sensitivity.map((s) => (
                <tr key={s.case}>
                  <Td>{s.case}</Td>
                  <Td right>{fmtKes(s.RP100_gross_M * 1e6)}</Td>
                  <Td right className="text-slate-500">{s.RP100_vs_base_pct >= 0 ? "+" : ""}{s.RP100_vs_base_pct.toFixed(1)}%</Td>
                  <Td right>{fmtKes(s.AAL_gross_M * 1e6, 2)}</Td>
                  <Td right className="text-slate-500">{s.AAL_vs_base_pct >= 0 ? "+" : ""}{s.AAL_vs_base_pct.toFixed(1)}%</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <CardBody className="border-t border-slate-100 text-xs text-slate-500">
            Damage correlation ρ leaves AAL unchanged but moves the 1-in-200 Monte Carlo loss from{" "}
            {fmtKes(r.sensitivityMc[0].OEP_RP200_M * 1e6)} (ρ = 0) to {fmtKes(r.sensitivityMc[2].OEP_RP200_M * 1e6)} (ρ = 0.6).
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Assumptions register" subtitle="Every modelling judgement, with its type" />
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>ID</Th>
              <Th>Stage</Th>
              <Th>Assumption</Th>
              <Th>Type</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.assumptions.map((a) => (
              <tr key={a.id}>
                <Td className="font-mono text-xs">{a.id}</Td>
                <Td>{a.stage}</Td>
                <Td className="text-slate-700">{a.assumption}</Td>
                <Td><Badge kind={typeKind(a.type)}>{a.type}</Badge></Td>
              </tr>
            ))}
            <tr>
              <Td className="font-mono text-xs">A-AI-1</Td>
              <Td>AI layer</Td>
              <Td className="text-slate-700">
                LLM output is never trusted blindly: classes, counts, places, coordinates and values are validated server-side, every
                judgement call is listed with the row, and a human can edit before rows enter the portfolio.
              </Td>
              <Td><Badge kind="ai">Control</Badge></Td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="What the model cannot see" />
          <CardBody>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li><b>Resolution.</b> One depth per ~925 m cell — a house on a rise and one in a hollow get the same water.</li>
              <li><b>Flood defences.</b> The Budalangi dykes, and the breaches that drove the 2020 and March 2026 losses, are not in the JRC maps.</li>
              <li><b>Event catalogue.</b> Each JRC map is treated as one basin-wide event; partial-basin floods and multiple floods per year are ignored.</li>
              <li><b>Real claims.</b> No Kenyan loss data was available; ML uncertainty reflects our assumptions and the spread between two published curves.</li>
              <li><b>Scope.</b> Structure only — contents, business interruption, crops, livestock and life losses (the bulk of the 2026 impact) are excluded.</li>
              <li><b>Exposure realism.</b> Synthetic buildings are scattered at random, so only ~{fmtPct(48 / 500, 0)} sit in the flood corridor; real Budalangi portfolios cluster there.</li>
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Reproduce it" />
          <CardBody className="space-y-3 text-sm text-slate-700">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Run <code>notebooks/nzoia_flood_cat_model.ipynb</code> top to bottom (≈1 min). It audits the data, trains the vulnerability
                model, runs the financial engine and Monte Carlo, and exports every artefact this app reads to <code>web/public</code>.
              </li>
              <li>
                <code>cd web &amp;&amp; npm install &amp;&amp; npm run validate</code> — checks this app&rsquo;s TypeScript engine against the notebook (38
                metrics).
              </li>
              <li>
                Optional: add <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code> to <code>web/.env.local</code> for the LLM features, then <code>npm run dev</code>.
              </li>
            </ol>
            <p className="text-xs text-slate-500">Notebook random seed {r.seed}. Reference terms: {fmtPct(r.terms.deductible_pct)} deductible, Cat XL {fmtKes(r.terms.xl_limit, 0)} xs {fmtKes(r.terms.xl_retention, 0)}.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
