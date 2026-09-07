import { NextResponse, type NextRequest } from "next/server";

const pilotModeEnabled = process.env.PILOT_MODE === "true";

function isStaticAsset(pathname: string) {
  return pathname.startsWith("/_next/") || /\.[^/]+$/.test(pathname);
}

function isAllowedPilotPath(pathname: string) {
  const allowed = [
    "/",
    "/login",
    "/register",
    "/dashboard",
    "/projects",
    "/admin",
    "/forbidden",
  ];
  return allowed.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function middleware(request: NextRequest) {
  if (!pilotModeEnabled) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (isStaticAsset(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (isAllowedPilotPath(pathname)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/dashboard";
  url.searchParams.set("pilot", "scope");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
