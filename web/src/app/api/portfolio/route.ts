import { NextResponse } from "next/server";
import { portfolioDbPath, readIngestedBuildings, replaceIngestedBuildings } from "@/lib/server/portfolio-db";
import { HOUSING_CLASSES, type Building } from "@/lib/types";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const finiteArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 6 && value.every(finite);

function isIngestedBuilding(value: unknown): value is Building {
  if (!value || typeof value !== "object") return false;
  const b = value as Partial<Building>;
  return (
    typeof b.id === "string" &&
    b.id.length > 0 &&
    typeof b.batchId === "string" &&
    b.batchId.length > 0 &&
    b.origin === "ai_ingested" &&
    b.synthetic === true &&
    typeof b.cls === "string" &&
    HOUSING_CLASSES.includes(b.cls as Building["cls"]) &&
    finite(b.lat) &&
    finite(b.lon) &&
    finite(b.floorArea) &&
    finite(b.costPerM2) &&
    finite(b.tiv) &&
    finite(b.quality) &&
    finite(b.plinthExtra) &&
    finiteArray(b.dPoint) &&
    finiteArray(b.dBilinear) &&
    finite(b.distRp100Km) &&
    typeof b.area === "string" &&
    (b.note == null || typeof b.note === "string")
  );
}

export async function GET() {
  try {
    return NextResponse.json({
      buildings: readIngestedBuildings(),
      storage: "sqlite",
      file: portfolioDbPath(),
    });
  } catch (error) {
    console.error("Could not read SQLite portfolio", error);
    return NextResponse.json({ error: "Could not read the portfolio database." }, { status: 500 });
  }
}

/** Replaces only AI-ingested rows. The immutable starter portfolio is never written to this database. */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { buildings?: unknown };
    if (!Array.isArray(body.buildings) || !body.buildings.every(isIngestedBuilding)) {
      return NextResponse.json({ error: "Invalid AI-ingested building data." }, { status: 400 });
    }
    replaceIngestedBuildings(body.buildings);
    return NextResponse.json({ ok: true, count: body.buildings.length });
  } catch (error) {
    console.error("Could not write SQLite portfolio", error);
    return NextResponse.json({ error: "Could not update the portfolio database." }, { status: 500 });
  }
}
