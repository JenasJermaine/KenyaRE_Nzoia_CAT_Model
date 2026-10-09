import "server-only";

import { z } from "zod";
import { CONDITIONS, HOUSING_CLASSES } from "@/lib/types";

/** Limits on what one accepted offer may add, and on the whole AI-ingested book. */
export const MAX_BATCH_BUILDINGS = 1000;
export const MAX_INGESTED_BUILDINGS = 5000;
const MAX_TIV_EACH_KES = 50_000_000_000;

const kes = z.number().min(-1e15).max(1e15);
const str = (max: number) => z.string().max(max);
const depths = z.array(z.number().min(0).max(100)).length(6);

export const batchIdSchema = z.string().regex(/^[A-Z0-9]{1,12}$/, "Batch IDs are 1–12 capital letters or digits.");

export const buildingSchema = z.object({
  id: z.string().regex(/^AI-[A-Z0-9]{1,12}-\d{1,4}-\d{3,4}$/),
  lat: z.number().min(-5).max(5),
  lon: z.number().min(30).max(40),
  cls: z.enum(HOUSING_CLASSES),
  floorArea: z.number().positive().max(1_000_000),
  costPerM2: z.number().positive().max(10_000_000),
  tiv: z.number().positive().max(MAX_TIV_EACH_KES),
  tivFile: z.number().positive().max(MAX_TIV_EACH_KES).optional(),
  quality: z.number().min(0).max(1),
  plinthExtra: z.number().min(0).max(10),
  dPoint: depths,
  dBilinear: depths,
  distRp100Km: z.number().min(0).max(1000),
  area: str(100),
  synthetic: z.literal(true),
  origin: z.literal("ai_ingested"),
  note: str(2000).optional(),
  batchId: batchIdSchema,
});

export const addBatchSchema = z
  .object({
    batchId: batchIdSchema,
    buildings: z.array(buildingSchema).min(1).max(MAX_BATCH_BUILDINGS),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .superRefine((body, ctx) => {
    const ids = new Set<string>();
    for (const [i, b] of body.buildings.entries()) {
      if (b.batchId !== body.batchId || !b.id.startsWith(`AI-${body.batchId}-`)) {
        ctx.addIssue({ code: "custom", path: ["buildings", i], message: "Building does not belong to this batch." });
      }
      if (ids.has(b.id)) ctx.addIssue({ code: "custom", path: ["buildings", i, "id"], message: "Duplicate building ID." });
      ids.add(b.id);
    }
  });

export const ingestBodySchema = z.object({
  text: z.string().optional().default(""),
  forceRules: z.boolean().optional().default(false),
  images: z.array(z.unknown()).optional().default([]),
});

const submissionGroupSchema = z.object({
  count: z.number().int().min(1).max(500),
  housing_class: z.enum(HOUSING_CLASSES),
  place: z.string().max(120).nullable(),
  lat: z.number().min(-5).max(5).nullable(),
  lon: z.number().min(30).max(40).nullable(),
  near_river: z.boolean(),
  floor_area_m2: z.number().positive().max(1_000_000).nullable(),
  cost_per_m2_kes: z.number().positive().max(10_000_000).nullable(),
  tiv_kes_each: z.number().positive().max(MAX_TIV_EACH_KES).nullable(),
  plinth_m: z.number().min(0).max(20),
  occupancy: z.string().max(120).nullable(),
  evidence: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string().max(300)).max(20),
  condition: z.enum(CONDITIONS).nullable().optional(),
  photo: z.object({
    refs: z.array(z.number().int().min(1).max(20)).max(20),
    fields: z.array(z.enum(["housing_class", "plinth_m", "condition"])).max(5),
    observations: z.string().max(800),
    conflicts: z.array(z.string().max(300)).max(6),
  }).nullable().optional(),
});

export const cedantRiskSchema = z.object({ groups: z.array(submissionGroupSchema).min(1).max(50) });

export const imageSchema = z.object({
  name: z.string().optional(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export const loginSchema = z.object({
  name: z
    .string()
    .trim()
    .email("Choose one of the demo account email addresses.")
    .max(120),
  passcode: z.string().min(1, "Enter the demo password.").max(200),
});

const offerBuildingSchema = z.object({
  label: str(160),
  housingClass: str(80),
  count: z.number().int().min(0).max(100_000),
  tivKes: kes,
  location: str(200),
  raisedFloorM: z.number().min(0).max(20),
  damageRatioRp100: z.number().min(0).max(1),
  groundUpRp100Kes: kes,
  shapDrivers: z.array(str(300)).max(10),
  condition: z.enum(CONDITIONS).optional(),
  photoEvidence: z
    .object({
      photos: z.array(z.number().int().min(1).max(20)).max(20),
      valuesFromPhotos: z.array(str(40)).max(5),
      observations: str(400),
      conflictsWithDocument: z.array(str(300)).max(6),
    })
    .optional(),
});

export const briefingPayloadSchema = z.object({
  portfolio: z.object({
    buildings: z.number().int().min(0).max(1_000_000),
    aiIngestedBuildings: z.number().int().min(0).max(1_000_000),
    totalTivKes: kes,
    tivInRp100FootprintKes: kes,
    buildingsWetRp100: z.number().int().min(0).max(1_000_000),
    synthetic: z.literal(true),
  }),
  settings: z.object({
    vulnerabilityModel: str(80),
    hazardSampling: str(80),
    floodDurationDays: z.number().min(0).max(365),
    deductiblePctTiv: z.number().min(0).max(100),
    catXl: str(200),
  }),
  lossByReturnPeriod: z
    .array(z.object({ rp: z.number().positive().max(100_000), grossKes: kes, insuredKes: kes, netKes: kes, pctOfTiv: z.number().min(0).max(100), interpolated: z.boolean() }))
    .min(1)
    .max(20),
  aal: z.object({ grossKes: kes, insuredKes: kes, netKes: kes }),
  monteCarlo: z.object({ years: z.number().int().min(1).max(10_000_000), oep100Kes: kes, oep200Kes: kes, tvar1Kes: kes }).nullable(),
  byClassRp100: z
    .array(z.object({ housingClass: str(80), buildings: z.number().int().min(0), wet: z.number().int().min(0), lossKes: kes, lossPctOfClassTiv: z.number().min(0).max(100) }))
    .max(10),
  topAreasRp100: z.array(z.object({ area: str(100), lossKes: kes, sharePct: z.number().min(0).max(100), tivWetKes: kes })).max(20),
  topBuildingsRp100: z
    .array(z.object({ id: str(60), area: str(100), housingClass: str(80), depthM: z.number().min(0).max(100), damageRatio: z.number().min(0).max(1), lossKes: kes }))
    .max(20),
  mlVsJrcRp100Pct: z.number().min(-1000).max(1000),
  sensitivityRp100: z.array(z.object({ case: str(160), changePct: z.number().min(-1000).max(1000) })).max(20),
  keyCaveats: z.array(str(400)).max(20),
  offer: z
    .object({
      extractedBy: str(120),
      totalTivKes: kes,
      terms: str(300),
      buildings: z.array(offerBuildingSchema).max(50),
      lossByReturnPeriod: z.array(z.object({ rp: z.number().positive().max(100_000), groundUpKes: kes, grossKes: kes, netKes: kes, groundUpPctOfTiv: z.number().min(0).max(100) })).max(20),
      aal: z.object({ groundUpKes: kes, grossKes: kes, netKes: kes }),
      portfolioImpact: z.object({ rp100NetBeforeKes: kes, rp100NetAfterKes: kes, aalGroundUpBeforeKes: kes, aalGroundUpAfterKes: kes }),
    })
    .optional(),
});

/** Turns a zod failure into one readable sentence naming the first offending field. */
export function describeIssue(error: z.ZodError) {
  const issue = error.issues[0];
  const where = issue?.path.length ? ` (field "${issue.path.join(".")}")` : "";
  return `${issue?.message ?? "Invalid input"}${where}`;
}
