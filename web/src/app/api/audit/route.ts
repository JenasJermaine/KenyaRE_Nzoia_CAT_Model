import { recentAuditEvents } from "@/lib/server/audit";
import { requireRoles } from "@/lib/server/auth";
import { serverError } from "@/lib/server/errors";

export async function GET(request: Request) {
  const guard = requireRoles(request, ["underwriter"]);
  if (!guard.ok) return guard.response;
  try {
    return Response.json({ events: recentAuditEvents(100) });
  } catch (error) {
    return serverError("audit", error, "Could not read the audit trail.");
  }
}
