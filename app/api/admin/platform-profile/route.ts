import { NextRequest, NextResponse } from "next/server";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { platformProfileSchema } from "@/lib/platform/platform-profile";
import { getPlatformProfile, savePlatformProfile } from "@/services/platform/platform-profile-service";

const noStore = { "cache-control": "no-store" };

async function requireAdmin() {
  const user = await getCurrentUser();
  return user && hasPlatformAdminAccess(user.systemRole) ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Admin access required" }, { status: 403, headers: noStore });
  const stored = await getPlatformProfile();
  if (!stored) return NextResponse.json({ message: "The profile could not be loaded" }, { status: 503, headers: noStore });
  return NextResponse.json({ profile: stored.profile, updatedAt: stored.updatedAt }, { headers: noStore });
}

export async function PUT(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ message: "Admin access required" }, { status: 403, headers: noStore });
  if (!hasValidOrigin(request)) return NextResponse.json({ message: "Invalid request origin" }, { status: 403, headers: noStore });
  const parsed = platformProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Some fields are not valid", fields: parsed.error.issues.slice(0, 8).map((issue) => issue.path.join(".")) },
      { status: 400, headers: noStore },
    );
  }
  try {
    const saved = await savePlatformProfile(parsed.data, user.id);
    return NextResponse.json({ profile: saved.profile, updatedAt: saved.updatedAt }, { headers: noStore });
  } catch (error) {
    console.error("platform profile save failed", error);
    return NextResponse.json({ message: "The profile could not be saved" }, { status: 500, headers: noStore });
  }
}
