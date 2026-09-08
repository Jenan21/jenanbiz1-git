import { NextResponse } from "next/server";
import countries from "world-countries";

import { UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ACTIVITY_WINDOW_MINUTES = 15;

const countryNames = new Map(
  countries.map((country) => [
    country.cca2,
    {
      ar: country.translations.ara?.common ?? country.name.common,
      en: country.name.common,
    },
  ]),
);

export async function GET() {
  const now = new Date();
  const activeSince = new Date(
    now.getTime() - ACTIVITY_WINDOW_MINUTES * 60 * 1000,
  );

  try {
    const sessions = await db.session.findMany({
      where: {
        expiresAt: { gt: now },
        updatedAt: { gte: activeSince },
        user: { status: UserStatus.ACTIVE },
      },
      select: {
        userId: true,
        user: {
          select: {
            profile: { select: { countryCode: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10_000,
    });

    const users = new Map<string, { countryCode: string }>();
    for (const session of sessions) {
      const countryCode = session.user.profile?.countryCode?.toUpperCase();
      if (!countryCode || !countryNames.has(countryCode) || users.has(session.userId)) continue;
      users.set(session.userId, {
        countryCode,
      });
    }

    const aggregates = new Map<string, { activeUsers: number }>();
    for (const user of users.values()) {
      const aggregate = aggregates.get(user.countryCode) ?? {
        activeUsers: 0,
      };
      aggregate.activeUsers += 1;
      aggregates.set(user.countryCode, aggregate);
    }

    const locations = [...aggregates.entries()]
      .map(([countryCode, aggregate]) => ({
        countryCode,
        countryName: countryNames.get(countryCode)!,
        activeUsers: aggregate.activeUsers,
      }))
      .sort((left, right) => right.activeUsers - left.activeUsers);

    return NextResponse.json(
      {
        activeUsers: users.size,
        generatedAt: now.toISOString(),
        locations,
        windowMinutes: ACTIVITY_WINDOW_MINUTES,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("Public activity aggregation failed", error);
    return NextResponse.json(
      {
        activeUsers: 0,
        generatedAt: now.toISOString(),
        locations: [],
        windowMinutes: ACTIVITY_WINDOW_MINUTES,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
