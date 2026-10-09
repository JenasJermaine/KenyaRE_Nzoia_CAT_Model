import { RPS } from "@/lib/engine";
import { requireRoles } from "@/lib/server/auth";
import { readModelJson } from "@/lib/server/model-data";
import type { NotebookResults } from "@/lib/types";

export async function GET(request: Request) {
  const guard = requireRoles(request, ["county"]);
  if (!guard.ok) return guard.response;
  const requested = Number(new URL(request.url).searchParams.get("rp") ?? 100);
  const rp = RPS.includes(requested) ? requested : 100;
  const results = await readModelJson<NotebookResults>("results");
  return Response.json({ hazard: results.hazardStats.find((row) => row.return_period === rp) ?? null, rp });
}