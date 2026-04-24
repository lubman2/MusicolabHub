import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/session";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/pricing", "/verify"];
const AUTH_PATHS = ["/login", "/signup"];
const ONBOARDING_PATH = "/onboarding";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and API routes
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Get session token
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie) {
    // No session — redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifyToken(sessionCookie.value);
  if (!session) {
    // Invalid session — redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If user is verified but not onboarded, redirect to onboarding
  if (session.status === "verified" && pathname !== ONBOARDING_PATH) {
    return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
  }

  // If user is onboarded, don't allow access to onboarding page
  if (session.status === "onboarded" && pathname === ONBOARDING_PATH) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // If user is authenticated and tries to access auth pages, redirect to dashboard
  if (AUTH_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
