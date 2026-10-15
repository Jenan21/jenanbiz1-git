import { ProjectStatus, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** Window in which a signed-in member counts as active; the same one the public activity figure uses. */
export const ACTIVE_WINDOW_MINUTES = 15;

export interface HomeStats {
  /** Members with a live session in the last 15 minutes, or null when the count could not be read. */
  activeUsers: number | null;
  /** Projects that are not archived, or null when the count could not be read. */
  projects: number | null;
}

/** The only two figures on the signed-in home that come from the platform's own records. Everything else shows "—". */
export async function getHomeStats(now = new Date()): Promise<HomeStats> {
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_MINUTES * 60 * 1000);
  try {
    const [sessions, projects] = await Promise.all([
      db.session.findMany({
        where: { expiresAt: { gt: now }, updatedAt: { gte: activeSince }, user: { status: UserStatus.ACTIVE } },
        select: { userId: true },
        distinct: ["userId"],
        take: 10_000,
      }),
      db.project.count({ where: { status: { not: ProjectStatus.ARCHIVED } } }),
    ]);
    return { activeUsers: sessions.length, projects };
  } catch (error) {
    console.error("Home statistics could not be read", error);
    return { activeUsers: null, projects: null };
  }
}
