import { db } from "@/lib/db";
import { type PlatformMetricKey } from "./data-center-platform-metric-keys";

export type PlatformMetrics = { measuredAt: string; counts: Record<PlatformMetricKey, number> };

// Row counts read straight from the database. Nothing is estimated, rounded or derived from another figure, and a count that cannot be read fails the request instead of becoming zero.
export async function getPlatformMetrics(now: Date = new Date()): Promise<PlatformMetrics> {
  const [users, organizations, robots, tasks, sharedKnowledge, learningLog, verifiedEvidence, modelExecutions, costRecords] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.robot.count(),
    db.robotTask.count(),
    db.sharedKnowledge.count(),
    db.learningLog.count(),
    db.evidence.count({ where: { verified: true } }),
    db.modelExecution.count(),
    db.costRecord.count(),
  ]);
  return { measuredAt: now.toISOString(), counts: { users, organizations, robots, tasks, sharedKnowledge, learningLog, verifiedEvidence, modelExecutions, costRecords } };
}
