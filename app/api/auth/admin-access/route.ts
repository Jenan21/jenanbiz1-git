import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

const noStore = { "cache-control": "no-store" };

/** Whether the signed-in account may open /admin. Anonymous visitors get a plain `false`, not an error. */
export async function GET() {
  const user = await getCurrentUser();
  const admin = user?.systemRole === "ADMIN" || user?.systemRole === "SUPER_ADMIN";
  return NextResponse.json({ admin }, { headers: noStore });
}
