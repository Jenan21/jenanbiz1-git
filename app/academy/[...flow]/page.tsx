import { notFound } from "next/navigation";
import { AcademyResourceApprovalState } from "@/generated/prisma/client";
import { AcademyShell } from "@/components/academy/academy-shell";
import { AcademyReferenceWorkspace } from "@/components/academy/academy-reference-workspace";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findAcademyFlow } from "@/lib/academy/user-academy-routes";
import {
  academyResourceKindForRoute,
  getApprovedAcademyResources,
  listAcademyResources,
} from "@/services/academy/content-library-service";
import { getLearnerAcademySnapshot } from "@/services/academy/learner-portal-service";
import { listAcademyResourceEngagements } from "@/services/academy/resource-engagement-service";

export default async function AcademyFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ flow: string[] }>;
  searchParams: Promise<{ category?: string; query?: string; resource?: string }>;
}) {
  const { flow } = await params;
  const filters = await searchParams;
  const route = `/academy/${flow.join("/")}`;
  const definition = findAcademyFlow(route);
  if (!definition || route === "/academy/courses") notFound();
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser(route),
  ]);
  const [course, courses, resources, snapshot] = await Promise.all([
    definition.source === "course"
      ? db.academyCourse.findFirst({
          include: {
            lessons: { orderBy: { sequence: "asc" } },
            labs: { orderBy: { sequence: "asc" } },
            exams: { orderBy: { createdAt: "asc" } },
            skills: { include: { skill: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve(null),
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
    definition.source === "resource"
      ? getApprovedAcademyResources({
          category: filters.category?.trim() || undefined,
          kind: academyResourceKindForRoute(route),
          query: filters.query?.trim().slice(0, 160) || undefined,
        })
      : definition.source === "mixed"
        ? listAcademyResources({
            approvalState: AcademyResourceApprovalState.APPROVED,
            category: filters.category?.trim() || undefined,
            query: filters.query?.trim().slice(0, 160) || undefined,
          })
        : Promise.resolve([]),
    getLearnerAcademySnapshot(user.id),
  ]);
  const engagements = await listAcademyResourceEngagements(user.id, resources.map((resource) => resource.id));
  return (
    <AcademyShell
      locale={locale}
      activeRoute={route}
      userLabel={user.profile?.displayName ?? user.email}
    >
      <AcademyReferenceWorkspace
        course={course}
        courses={courses}
        definition={definition}
        engagements={engagements}
        learnerName={user.profile?.displayName ?? user.email}
        locale={locale}
        query={filters.query}
        requestedResource={filters.resource}
        resources={resources}
        snapshot={snapshot}
      />
    </AcademyShell>
  );
}
