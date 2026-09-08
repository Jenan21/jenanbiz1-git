import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 },
    );
  }

  const courses = await db.academyCourse.findMany({
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      field: { select: { key: true, name: true } },
      specialization: { select: { name: true } },
      _count: { select: { lessons: true, labs: true, exams: true } },
    },
    orderBy: { title: "asc" },
  });

  return NextResponse.json({ success: true, courses });
}