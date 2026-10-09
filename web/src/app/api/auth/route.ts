import { connection } from "next/server";
import { audit } from "@/lib/server/audit";
import { authRequired, clientIp, createSessionValue, passcodeMatches, requireUser, SESSION_HOURS, sessionCookie, sessionRole, sessionUser } from "@/lib/server/auth";
import { roleForEmail } from "../../../lib/roles";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { describeIssue, loginSchema } from "@/lib/server/schemas";

export async function GET(request: Request) {
  await connection();
  return Response.json({ required: authRequired(), user: sessionUser(request), role: sessionRole(request) });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const wait = rateLimit("login", ip);
  if (wait) return tooManyRequests(wait, "sign-in");

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: describeIssue(parsed.error) }, { status: 400 });
  const { name, passcode } = parsed.data;
  const role = roleForEmail(name);
  if (!role || !passcodeMatches(passcode)) {
    audit("sign_in_failed", name, ip);
    return Response.json({ error: "That demo account or password was not recognized. Use one of the listed demo accounts." }, { status: 401 });
  }
  audit("sign_in", name, ip);
  return Response.json(
    { required: true, user: name, role },
    { headers: { "Set-Cookie": sessionCookie(request, createSessionValue(name, role), SESSION_HOURS * 3600) } },
  );
}

export async function DELETE(request: Request) {
  const guard = requireUser(request);
  const user = guard.ok ? guard.actor : null;
  if (user) audit("sign_out", user, clientIp(request));
  return Response.json({ required: authRequired(), user: null, role: null }, { headers: { "Set-Cookie": sessionCookie(request, "", 0) } });
}
