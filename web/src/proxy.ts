import { NextResponse, type NextRequest } from "next/server";
import { pageAllowed, ROLE_HOME } from "@/lib/roles";
import { sessionRole } from "@/lib/server/auth";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const role = sessionRole(request);
  if (path.startsWith("/data/")) {
    return role === "underwriter" ? NextResponse.next() : NextResponse.json({ error: "Model artifacts are restricted to the underwriting role." }, { status: 403 });
  }
  if (path === "/login") return role ? NextResponse.redirect(new URL(ROLE_HOME[role], request.url)) : NextResponse.next();
  if (!role) return NextResponse.redirect(new URL("/login", request.url));
  if (path === "/") return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
  if (!pageAllowed(path, role)) return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/data/:path*", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};