import { notFound } from "next/navigation";
import { AcademyReferenceWorkspace } from "@/components/academy/academy-reference-workspace";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findAcademyFlow } from "@/lib/academy/user-academy-routes";
import {
  academyResourceKindForRoute,
  getApprovedAcademyResources,
} from "@/services/academy/content-library-service";
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
  const [course, resources] = await Promise.all([
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
    getApprovedAcademyResources({
      category: filters.category?.trim() || undefined,
      kind: academyResourceKindForRoute(route),
      query: filters.query?.trim().slice(0, 160) || undefined,
    }),
  ]);
  const engagements = await listAcademyResourceEngagements(user.id, resources.map((resource) => resource.id));
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/academy"
      userLabel={user.profile?.displayName ?? user.email}
    >
      <AcademyReferenceWorkspace
        course={course}
        definition={definition}
        engagements={engagements}
        locale={locale}
        requestedResource={filters.resource}
        resources={resources}
      />
    </PlatformShell>
  );
}
