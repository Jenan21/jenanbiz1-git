import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const [robots, activeTasks, failedExecutions, pendingRetraining] = await Promise.all([
      db.robot.count({ where: { status: "ACTIVE" } }),
      db.robotTask.count({ where: { status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
      db.modelExecution.count({ where: { success: false } }),
      db.retrainingEvent.count({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
    ]);
    const totalSignals = robots + activeTasks + failedExecutions + pendingRetraining;
    return NextResponse.json({ success: true, health: { status: failedExecutions > 0 ? "ATTENTION" : "HEALTHY", activeRobots: robots, activeTasks, failedExecutions, pendingRetraining, signals: totalSignals } });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load global health" }, { status: 500 });
  }
}
