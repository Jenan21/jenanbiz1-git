import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const users = await db.user.findMany({
      include: { profile: true, memberships: { include: { organization: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

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
