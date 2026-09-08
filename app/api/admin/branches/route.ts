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
    const [organizations, total] = await Promise.all([
      db.organization.findMany({
      include: {
        members: {
          include: { user: { include: { profile: true } } },
        },
        subscriptions: true,
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      }),
      db.organization.count(),
    ]);

    return NextResponse.json({
      success: true,
      branches: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        memberCount: organization.members.length,
        activeMembers: organization.members.filter((member) => member.status === "ACTIVE").length,
        subscriptionCount: organization.subscriptions.length,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      })),
      pagination: getAdminPageMetadata(total, limit, offset),
    });
  } catch (error) {
    console.error("admin branches route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load branch data",
      },
      { status: 500 },
    );
  }
}
