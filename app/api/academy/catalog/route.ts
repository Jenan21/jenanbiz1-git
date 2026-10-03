import { NextResponse } from "next/server";
import { AcademyResourceApprovalState } from "@/generated/prisma/client";
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

  const [courses, resources, enrollments, completedEnrollments, certificates] = await Promise.all([
    db.academyCourse.findMany({
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
    }),
    db.academyResource.groupBy({ by: ["kind"], where: { approvalState: AcademyResourceApprovalState.APPROVED }, _count: { _all: true } }),
    db.learnerEnrollment.count({ where: { userId: user.id } }),
    db.learnerEnrollment.count({ where: { userId: user.id, status: "COMPLETED" } }),
    db.learnerCertificate.count({ where: { userId: user.id, status: "CERTIFIED" } }),
  ]);

  return NextResponse.json({
    success: true,
    courses,
    overview: {
      certificates,
      completedEnrollments,
      enrollments,
      lessons: courses.reduce((total, course) => total + course._count.lessons, 0),
      resources: Object.fromEntries(resources.map((resource) => [resource.kind, resource._count._all])),
    },
  });
}