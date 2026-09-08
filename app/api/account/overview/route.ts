import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAccountOverview } from "@/services/account/account-overview-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  return NextResponse.json({ overview: await getAccountOverview(user.id) }, { headers: { "cache-control": "no-store" } });
}