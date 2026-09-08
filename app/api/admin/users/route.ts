import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminPageMetadata, getAdminPagination } from "@/lib/admin/pagination";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const { limit, offset } = getAdminPagination(request);
    const [users, total] = await Promise.all([
      db.user.findMany({
      include: { profile: true, memberships: { include: { organization: true } } },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      }),
      db.user.count(),
    ]);

    return NextResponse.json({
      success: true,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        status: user.status,
        systemRole: user.systemRole,
        displayName: user.profile?.displayName ?? "Unknown",
        locale: user.profile?.locale ?? "ar",
        organizationCount: user.memberships.length,
        organizations: user.memberships.map((membership) => membership.organization.name),
      })),
      pagination: getAdminPageMetadata(total, limit, offset),
    });
  } catch (error) {
    console.error("admin users route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load user data",
      },
      { status: 500 },
    );
  }
}
