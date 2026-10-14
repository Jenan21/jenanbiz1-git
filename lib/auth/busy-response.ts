import { NextResponse } from "next/server";

/** The answer when password hashing is saturated: the client is told to wait briefly and try again. */
export function busyResponse() {
  return NextResponse.json({ error: "RATE_LIMITED", reason: "BUSY" }, { headers: { "Retry-After": "2" }, status: 503 });
}
