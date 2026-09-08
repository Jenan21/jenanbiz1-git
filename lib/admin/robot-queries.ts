import { db } from "@/lib/db";
import { RobotStatus } from "@/generated/prisma/client";

export async function getRobotDashboardSnapshot({ limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}) {
  const createdSince = new Date(Date.now() - 86_400_000);
  const [robots, totalRobots, activeRobots, reviewRobots, hiddenRobots, dailyGeneration, averageIntelligence] = await Promise.all([
    db.robot.findMany({
      orderBy: { intelligence: "desc" },
      skip: offset,
      take: limit,
    }),
    db.robot.count(),
    db.robot.count({ where: { status: RobotStatus.ACTIVE } }),
    db.robot.count({ where: { status: RobotStatus.REVIEW } }),
    db.robot.count({ where: { status: RobotStatus.HIDDEN } }),
    db.robot.count({ where: { createdAt: { gte: createdSince } } }),
    db.robot.aggregate({ _avg: { intelligence: true } }),
  ]);

  return {
    totalRobots,
    activeRobots,
    reviewRobots,
    hiddenRobots,
    dailyGeneration,
    averageIntelligence: Math.round(Number(averageIntelligence._avg.intelligence ?? 0)),
    robots,
    pagination: { total: totalRobots, limit, offset, hasMore: offset + limit < totalRobots },
  };
}
