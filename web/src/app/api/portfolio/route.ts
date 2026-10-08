import { audit } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { serverError } from "@/lib/server/errors";
import { batchExists, ingestedCount, insertBatch, readIngestedBuildings, removeAllIngested, removeBatch } from "@/lib/server/portfolio-db";
import { addBatchSchema, batchIdSchema, describeIssue, MAX_INGESTED_BUILDINGS } from "@/lib/server/schemas";

export async function GET(request: Request) {
  const guard = requireUser(request);
  if (!guard.ok) return guard.response;
  try {
    return Response.json({ buildings: readIngestedBuildings(), storage: "sqlite" });
  } catch (error) {
    return serverError("portfolio", error, "Could not read the saved portfolio. The server may be restarting; reload the page in a moment.");
  }
}

/** Adds one accepted offer as a new batch. The immutable starter portfolio is never written to this database. */
export async function POST(request: Request) {
  const guard = requireUser(request);
  if (!guard.ok) return guard.response;
  const parsed = addBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: `The offer could not be saved because its building data is invalid: ${describeIssue(parsed.error)}.` }, { status: 400 });
  }
  const { batchId, buildings, sourceHash } = parsed.data;
  try {
    if (batchExists(batchId)) {
      return Response.json({ error: `Batch ${batchId} is already in the portfolio. Run the extraction again to create a new batch.` }, { status: 409 });
    }
    const total = ingestedCount() + buildings.length;
    if (total > MAX_INGESTED_BUILDINGS) {
      return Response.json(
        { error: `The portfolio can hold at most ${MAX_INGESTED_BUILDINGS.toLocaleString()} AI-ingested buildings; this offer would bring it to ${total.toLocaleString()}. Remove older batches first.` },
        { status: 409 },
      );
    }
    insertBatch(buildings);
    audit("offer_accepted", guard.actor, guard.ip, { buildings: buildings.length, tivKes: buildings.reduce((a, b) => a + b.tiv, 0), sourceHash: sourceHash ?? null }, batchId);
    return Response.json({ ok: true, added: buildings.length });
  } catch (error) {
    return serverError("portfolio", error, "Could not save the offer to the portfolio database. Try again in a moment.");
  }
}

/** `?batch=ID` removes one batch; `?all=1` removes every AI-ingested building. */
export async function DELETE(request: Request) {
  const guard = requireUser(request);
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  try {
    if (params.get("all") === "1") {
      const removed = removeAllIngested();
      audit("portfolio_reset", guard.actor, guard.ip, { removed });
      return Response.json({ ok: true, removed });
    }
    const batch = batchIdSchema.safeParse(params.get("batch"));
    if (!batch.success) return Response.json({ error: "Say which batch to remove (?batch=ID) or use ?all=1." }, { status: 400 });
    const removed = removeBatch(batch.data);
    if (!removed) return Response.json({ error: `Batch ${batch.data} is not in the portfolio (it may already have been removed).` }, { status: 404 });
    audit("batch_removed", guard.actor, guard.ip, { removed }, batch.data);
    return Response.json({ ok: true, removed });
  } catch (error) {
    return serverError("portfolio", error, "Could not update the portfolio database. Try again in a moment.");
  }
}
