import { CommunitySocialPlatform } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { CommunityAccessError, getCommunityAccess, grantCommunityAccess, listCommunityPlatforms, revokeCommunityAccess } from "@/services/community/community-access-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), platform: z.nativeEnum(CommunitySocialPlatform), acknowledged: z.literal(true) }),
  z.object({ action: z.literal("revoke"), platform: z.nativeEnum(CommunitySocialPlatform) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  return NextResponse.json({ platforms: await listCommunityPlatforms(), ...(await getCommunityAccess(user.id)) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid community access command" }, { status: 400 });
  try {
    const access = parsed.data.action === "grant"
      ? await grantCommunityAccess(user.id, parsed.data.platform)
      : await revokeCommunityAccess(user.id, parsed.data.platform);
    return NextResponse.json({ platforms: await listCommunityPlatforms(), ...access });
  } catch (error) {
    const message = error instanceof CommunityAccessError ? error.message : "Community access could not be updated";
    return NextResponse.json({ message }, { status: 409 });
  }
}