import { CommunitySocialPlatform } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { listPlatformSocialLinks, PlatformSocialLinkError, removePlatformSocialLink, savePlatformSocialLink } from "@/services/platform/platform-social-link-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), platform: z.nativeEnum(CommunitySocialPlatform), url: z.string().trim().min(12).max(2048), isActive: z.boolean() }),
  z.object({ action: z.literal("remove"), platform: z.nativeEnum(CommunitySocialPlatform) }),
]);

async function requireAdmin() {
  const user = await getCurrentUser();
  return user && hasPlatformAdminAccess(user.systemRole) ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Admin access required" }, { status: 403 });
  return NextResponse.json({ links: await listPlatformSocialLinks(true) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid social link command" }, { status: 400 });
  try {
    if (parsed.data.action === "save") await savePlatformSocialLink(parsed.data, user.id);
    else await removePlatformSocialLink(parsed.data.platform, user.id);
    return NextResponse.json({ links: await listPlatformSocialLinks(true) });
  } catch (error) {
    const message = error instanceof PlatformSocialLinkError ? error.message : "The social link could not be updated";
    return NextResponse.json({ message }, { status: 422 });
  }
}