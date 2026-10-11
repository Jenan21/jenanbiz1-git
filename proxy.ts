import { NextRequest, NextResponse } from "next/server";

function protectionUnavailable() {
  return new NextResponse("Private access protection is not configured", {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

function authenticationRequired() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": 'Basic realm="Jenan PRO Private Preview", charset="UTF-8"',
    },
  });
}

export function proxy(request: NextRequest) {
  const username = process.env.SITE_ACCESS_USERNAME?.trim();
  const password = process.env.SITE_ACCESS_PASSWORD;

  if (!username && !password) return NextResponse.next();
  if (!username || !password) return protectionUnavailable();

  const expectedAuthorization = `Basic ${btoa(`${username}:${password}`)}`;
  return request.headers.get("authorization") === expectedAuthorization
    ? NextResponse.next()
    : authenticationRequired();
}

export const config = {
  matcher: [
    "/((?!api/health/live|api/health/ready|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
  ],
};
