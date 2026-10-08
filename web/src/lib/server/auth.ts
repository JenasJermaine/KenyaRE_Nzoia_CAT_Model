import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "nzoia_session";
export const SESSION_HOURS = 12;
export const OPEN_MODE_ACTOR = "local user (no passcode set)";

const passcode = () => process.env.APP_ACCESS_TOKEN?.trim() || null;

export const authRequired = () => passcode() != null;

/** Sessions are signed with a key derived from the passcode, so changing the passcode signs everyone out. */
function sign(value: string) {
  return createHmac("sha256", `nzoia-session:${passcode()}`).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passcodeMatches(candidate: string) {
  const expected = passcode();
  return expected != null && safeEqual(candidate, expected);
}

export function createSessionValue(name: string) {
  const payload = `${Buffer.from(name, "utf8").toString("base64url")}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function sessionCookie(request: Request, value: string, maxAgeS: number) {
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${secure ? "; Secure" : ""}`;
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** The signed-in user's name, or null when the cookie is missing, tampered with or expired. */
export function sessionUser(request: Request): string | null {
  if (!authRequired()) return null;
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const [name, issued, sig] = raw.split(".");
  if (!name || !issued || !sig || !safeEqual(sig, sign(`${name}.${issued}`))) return null;
  const age = Date.now() - Number(issued);
  if (!Number.isFinite(age) || age < 0 || age > SESSION_HOURS * 3600_000) return null;
  return Buffer.from(name, "base64url").toString("utf8");
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/** Browsers always send Origin on cross-site POST/DELETE; refusing a mismatch blocks cross-site request forgery. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type Guard = { ok: true; actor: string; ip: string } | { ok: false; response: Response };

/** Every route that reads client data, writes data or spends AI quota calls this first. */
export function requireUser(request: Request): Guard {
  const ip = clientIp(request);
  if (request.method !== "GET" && !sameOrigin(request)) {
    return { ok: false, response: Response.json({ error: "This request came from another website and was refused.", code: "bad_origin" }, { status: 403 }) };
  }
  if (!authRequired()) return { ok: true, actor: OPEN_MODE_ACTOR, ip };
  const user = sessionUser(request);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Your session has ended or you are not signed in. Sign in with the team passcode to continue.", code: "auth_required" }, { status: 401 }),
    };
  }
  return { ok: true, actor: user, ip };
}
