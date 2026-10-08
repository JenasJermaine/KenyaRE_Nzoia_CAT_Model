export const HOUSING_CLASSES = [
  "informal_iron_sheet",
  "semi_permanent",
  "permanent_masonry",
  "concrete_rcc",
] as const;

export type HousingClass = (typeof HOUSING_CLASSES)[number];

export type VulnStat = "mean" | "q05" | "q25" | "q50" | "q75" | "q95";

export interface Building {
  id: string;
  lat: number;
  lon: number;
  cls: HousingClass;
  floorArea: number;
  costPerM2: number;
  tiv: number;
  tivFile?: number;
  quality: number;
  plinthExtra: number;
  dPoint: number[];
  dBilinear: number[];
  distRp100Km: number;
  area: string;
  synthetic: true;
  origin: "starter_kit" | "ai_ingested";
  note?: string;
  batchId?: string;
}

export interface HazardGrid {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  ncols: number;
  nrows: number;
  rps: number[];
  source: string;
  cells: number[][]; // [row, col, d10, d20, d50, d100, d200, d500]
}

export interface ClassParam {
  housing_class: HousingClass;
  plinth_m: number;
  depth_mult: number;
  max_damage: number;
  dur_k: number;
  quality_k: number;
  rationale: string;
}

export interface VulnerabilityData {
  depthStep: number;
  depthMax: number;
  qualityGrid: number[];
  durationGrid: number[];
  stats: VulnStat[];
  classes: HousingClass[];
  classLabels: Record<HousingClass, string>;
  classColors: Record<HousingClass, string>;
  /** ml[cls][stat][durationIdx][qualityIdx][depthIdx] */
  ml: Record<HousingClass, Record<VulnStat, number[][][]>>;
  jrcAdapted: Record<HousingClass, number[]>;
  jrcReference: {
    depth: number[];
    africa_residential: number[];
    global_residential: number[];
    citation: string;
  };
  classParams: ClassParam[];
  costRanges: Record<HousingClass, [number, number]>;
  training: {
    n_claims: number;
    n_train: number;
    n_test: number;
    cv_r2_mean: number;
    cv_r2_std: number;
    coverage90: number;
    coverage50: number;
    coverage90Deep: number;
    noise_ceiling_r2: number;
    metrics: {
      model: string;
      R2_vs_observed: number;
      MAE_vs_observed: number;
      MAE_vs_true_expected: number;
      mean_bias: number;
    }[];
    quantiles: { quantile: number; empirical_share_below: number; pinball_loss: number }[];
    importance: { feature: string; r2_drop_when_shuffled: number; std: number }[];
    logistic: Record<HousingClass, number[]>;
  };
}

export interface GazetteerPlace {
  name: string;
  lat: number;
  lon: number;
  inside_grid: boolean;
  km_to_nearest_RP10_flood_cell: number | null;
}

export interface NotebookResults {
  generatedBy: string;
  seed: number;
  terms: {
    deductible_pct: number;
    limit_pct: number;
    qs_cession: number;
    xl_retention: number;
    xl_limit: number;
  };
  dataQa: { tivFileTotal: number; tivModelTotal: number; tivMetadataTotal: number; tivRatioMedian: number };
  hazardStats: {
    return_period: number;
    annual_exceedance_prob: number;
    flooded_cells: number;
    flooded_pct: number;
    median_depth_m: number;
    p90_depth_m: number;
    max_depth_m: number;
  }[];
  wetBuildings: {
    return_period: number;
    buildings_wet_point: number;
    buildings_wet_bilinear: number;
    TIV_wet_point: number;
    mean_depth_wet_point_m: number;
  }[];
  scenario: {
    return_period: number;
    AEP: number;
    gross_loss_ML_KES_M: number;
    gross_loss_JRC_baseline_KES_M: number;
    ML_vs_baseline_pct: number;
    loss_pct_of_TIV_ML: number;
    buildings_with_loss: number;
  }[];
  byClass: Record<HousingClass, number[]>;
  financial: {
    return_period: number;
    interpolated: boolean;
    AEP: number;
    gross_M: number;
    insured_M: number;
    xl_recovery_M: number;
    net_retained_M: number;
  }[];
  ep: { aalGross: number; aalInsured: number; aalNet: number; aalGrossJrc: number };
  monteCarlo: { years: number; rho: number; stats: Record<"gross" | "insured" | "net", Record<string, number>> };
  sensitivity: { case: string; RP100_gross_M: number; AAL_gross_M: number; RP100_vs_base_pct: number; AAL_vs_base_pct: number }[];
  sensitivityMc: { rho: number; OEP_RP100_M: number; OEP_RP200_M: number; TVaR_1pct_M: number; AAL_M: number }[];
  assumptions: { id: string; stage: string; assumption: string; type: string }[];
}

/** Global SHAP explanation of the ML vulnerability model, exported by notebooks/explain_shap.py. */
export interface ExplainData {
  method: string;
  library: string;
  model: string;
  background: { n: number; source: string };
  explained: { n: number; filter: string };
  baseValue: number;
  additivityMaxError: number;
  features: { key: "cls" | "depth" | "duration" | "quality"; label: string; meanAbsShap: number }[];
  byClass: Record<HousingClass, Record<"cls" | "depth" | "duration" | "quality", number>>;
  beeswarm: { f: "cls" | "depth" | "duration" | "quality"; shap: number; v: number; raw: number }[];
  depthDependence: { depth: number; shap: number; cls: HousingClass }[];
}

export interface ModelData {
  portfolio: Building[];
  hazard: HazardGrid;
  vulnerability: VulnerabilityData;
  results: NotebookResults;
  gazetteer: GazetteerPlace[];
  /** Optional: absent until notebooks/explain_shap.py has been run. */
  explain: ExplainData | null;
}

export interface Settings {
  vulnModel: "ml" | "jrc";
  hazardMode: "point" | "bilinear";
  duration: 2 | 7 | 21;
  deductiblePct: number;
  limitPct: number;
  qsCession: number;
  xlRetention: number;
  xlLimit: number;
  rho: number;
  mcYears: number;
  includeIngested: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  vulnModel: "ml",
  hazardMode: "point",
  duration: 7,
  deductiblePct: 0.02,
  limitPct: 1,
  qsCession: 0,
  xlRetention: 20e6,
  xlLimit: 20e6,
  rho: 0.3,
  mcYears: 20000,
  includeIngested: true,
};

/** One group of buildings extracted from free text (by the LLM or the rule-based fallback). */
export interface IngestGroup {
  count: number;
  housing_class: HousingClass;
  place: string | null;
  lat: number | null;
  lon: number | null;
  near_river: boolean;
  floor_area_m2: number | null;
  cost_per_m2_kes: number | null;
  tiv_kes_each: number | null;
  plinth_m: number;
  occupancy: string | null;
  evidence: string;
  confidence: number;
  assumptions: string[];
  /** Visible state of repair (survey text or photos); overrides the cost-band quality when set. */
  condition?: Condition | null;
  /** Present when the AI used one or more of the attached building photos for this group. */
  photo?: PhotoEvidence | null;
}

export const CONDITIONS = ["good", "fair", "poor"] as const;
export type Condition = (typeof CONDITIONS)[number];
/** Quality score (0 = cheapest build, 1 = best) the vulnerability model receives for each condition. */
export const CONDITION_QUALITY: Record<Condition, number> = { good: 0.85, fair: 0.5, poor: 0.15 };

export const PHOTO_FIELDS = ["housing_class", "plinth_m", "condition"] as const;
export type PhotoField = (typeof PHOTO_FIELDS)[number];

export interface PhotoEvidence {
  /** 1-based photo numbers, in upload order. */
  refs: number[];
  /** Values that came from the photos because the document did not state them. */
  fields: PhotoField[];
  observations: string;
  /** Places where the photos disagree with the document; the document value is kept. */
  conflicts: string[];
}

/** A building photo after client-side resizing (re-encoding also drops EXIF/GPS metadata). */
export interface IngestImage {
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Base64 without the data: prefix. */
  data: string;
}

export interface IngestResponse {
  groups: IngestGroup[];
  warnings: string[];
  mode: "llm" | "rules";
  model: string | null;
  /** Number of photos sent and whether the extractor could read them. */
  photos?: { sent: number; read: boolean };
  /** SHA-256 of the submitted text and photos, recorded in the audit trail when the offer is accepted. */
  sourceHash?: string;
  /** Phrases in the submission that look like instructions aimed at the AI. */
  security?: { flags: { reason: string; excerpt: string }[] };
}

export const AUDIT_ACTIONS = ["sign_in", "sign_in_failed", "sign_out", "ingest", "offer_accepted", "batch_removed", "portfolio_reset", "briefing"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  id: number;
  /** ISO timestamp (UTC). */
  at: string;
  action: AuditAction;
  actor: string;
  batchId: string | null;
  detail: Record<string, unknown>;
}
