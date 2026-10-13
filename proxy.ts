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

// Without a private gate, a production deployment is served only once the owner has approved the public launch.
function servesPublicly() {
  return process.env.NODE_ENV !== "production" || process.env.PUBLIC_LAUNCH?.trim() === "approved";
}

export function proxy(request: NextRequest) {
  const username = process.env.SITE_ACCESS_USERNAME?.trim();
  const password = process.env.SITE_ACCESS_PASSWORD;

  if (!username && !password) return servesPublicly() ? NextResponse.next() : protectionUnavailable();
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
