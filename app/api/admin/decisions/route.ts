import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const tasks = await db.robotTask.findMany({
      include: { robot: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 20,
    });

    return NextResponse.json({
      success: true,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        robotName: task.robot.name,
        status: task.status,
        priority: task.priority,
        description: task.description,
      })),
    });
  } catch (error) {
    console.error("decision route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load decision queue",
      },
      { status: 500 },
    );
  }
}
