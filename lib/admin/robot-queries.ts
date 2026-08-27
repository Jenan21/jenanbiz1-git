import { db } from "@/lib/db";
import { RobotStatus } from "@/generated/prisma/client";

export async function getRobotDashboardSnapshot() {
  const robots = await db.robot.findMany({
    orderBy: { intelligence: "desc" },
    take: 10,
  });

  const totalRobots = await db.robot.count();
  const visibleRobots = await db.robot.count({ where: { status: RobotStatus.ACTIVE } });
  const hiddenRobots = await db.robot.count({ where: { status: RobotStatus.HIDDEN } });
  const averageIntelligence = await db.robot.aggregate({
    _avg: { intelligence: true },
  });

  return {
    totalRobots,
    visibleRobots,
    hiddenRobots,
    averageIntelligence: Math.round(Number(averageIntelligence._avg.intelligence ?? 0)),
    robots,
  };
}
