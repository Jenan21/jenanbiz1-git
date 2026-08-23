import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const organizations = await db.organization.findMany({
      include: {
        members: {
          include: { user: { include: { profile: true } } },
        },
        subscriptions: true,
      },
      orderBy: { createdAt: "desc" },
    });

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
