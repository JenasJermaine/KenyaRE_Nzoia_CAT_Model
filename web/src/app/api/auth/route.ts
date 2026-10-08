import { connection } from "next/server";
import { audit } from "@/lib/server/audit";
import { authRequired, clientIp, createSessionValue, passcodeMatches, SESSION_HOURS, sessionCookie, sessionUser } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { describeIssue, loginSchema } from "@/lib/server/schemas";

export async function GET(request: Request) {
  await connection();
  return Response.json({ required: authRequired(), user: sessionUser(request) });
}

export async function POST(request: Request) {
  if (!authRequired()) return Response.json({ required: false, user: null });
  const ip = clientIp(request);
  const wait = rateLimit("login", ip);
  if (wait) return tooManyRequests(wait, "sign-in");

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: describeIssue(parsed.error) }, { status: 400 });
  const { name, passcode } = parsed.data;
  if (!passcodeMatches(passcode)) {
    audit("sign_in_failed", name, ip);
    return Response.json({ error: "That passcode is not correct. Check it with your team lead." }, { status: 401 });
  }
  audit("sign_in", name, ip);
  return Response.json(
    { required: true, user: name },
    { headers: { "Set-Cookie": sessionCookie(request, createSessionValue(name), SESSION_HOURS * 3600) } },
  );
}

export async function DELETE(request: Request) {
  const user = sessionUser(request);
  if (user) audit("sign_out", user, clientIp(request));
  return Response.json({ required: authRequired(), user: null }, { headers: { "Set-Cookie": sessionCookie(request, "", 0) } });
}
