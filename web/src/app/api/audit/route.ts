import { recentAuditEvents } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { serverError } from "@/lib/server/errors";

export async function GET(request: Request) {
  const guard = requireUser(request);
  if (!guard.ok) return guard.response;
  try {
    return Response.json({ events: recentAuditEvents(100) });
  } catch (error) {
    return serverError("audit", error, "Could not read the audit trail.");
  }
}
