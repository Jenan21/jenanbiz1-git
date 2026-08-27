import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const [users, organizations, robots, tasks, knowledge, executions, costs] = await Promise.all([
      db.user.count(),
      db.organization.count(),
      db.robot.count(),
      db.robotTask.count(),
      db.sharedKnowledge.count(),
      db.modelExecution.count(),
      db.costRecord.count(),
    ]);
    return NextResponse.json({ success: true, dataCenter: { users, organizations, robots, tasks, knowledge, executions, costs } });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load data center metrics" }, { status: 500 });
  }
}
