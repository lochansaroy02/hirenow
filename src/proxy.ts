import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

// In Next 16 this file replaces middleware.ts and runs on the Node.js runtime,
// so the same jsonwebtoken verification used in route handlers works here.

/** Reachable signed out: the sign-in screen and the endpoints it calls. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (session) {
    return NextResponse.next();
  }

  // API callers get a status they can act on; browsers get sent to sign in with
  // the page they wanted preserved.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)"],
};
